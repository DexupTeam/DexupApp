"""Index du scanner CardCorpus pour le navigateur, relié aux cartes de Dexup.

  python scripts/scanner/build_index.py OUT_DIR

  index.json             manifeste : version, dimension, échelle, fichiers
  emb-<hash>-<k>.bin     empreintes des images de référence, int8 (× SCALE), 512 par ligne
  meta-<hash>.json       pour chaque ligne, sa carte (rows) ; pour chaque carte, son identifiant
                         Dexup, nom, extension, numéro, langue, date, réédition à éviter (prints)

Identifiants Dexup : cartes anglaises → pokemontcg.io (« sv8pt5-5 ») ; japonaises → nos extensions
« ja_… » (scripts/update-japan-sets.mjs) ; chinoises → nos extensions « cn… » par l'identifiant
Cardmarket (scripts/update-china-sets.mjs). Une carte sans équivalent garde null : le scanner
passe alors à la suivante du même nom qui en a un.
"""
import gzip
import hashlib
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from huggingface_hub import snapshot_download

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(tempfile.gettempdir()) / "dexup-scanner-cache"  # téléchargements (hors du site publié)
CACHE.mkdir(exist_ok=True)
SCALE = 400  # empreintes de norme 1 : |valeur| ≤ 0,25 → ≤ 100 en int8
CHUNK_ROWS = 50_000  # fichiers de ~25 Mo

W = Path(snapshot_download("cardcorpus/pokemon-card-scanner"))


def fetch_json(url):
    path = CACHE / hashlib.md5(url.encode()).hexdigest()
    if not path.exists():
        with urllib.request.urlopen(url) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text())


norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("&", "and").replace("é", "e"))
num = lambda s: re.sub(r"^0+(?=\w)", "", re.sub(r"/.*", "", (s or "").strip())).lower()

# ── Index CardCorpus ─────────────────────────────────────────────────────────
handles = json.loads((W / "index/rows.json").read_text())
emb = np.load(W / "index/embeddings.npy").astype(np.float32)
release = json.loads((W / "index/release.json").read_text())
cards = {}
with gzip.open(W / "index/cards.jsonl.gz", "rt") as f:
    for line in f:
        r = json.loads(line)
        cards[r["handle"]] = r
groups = json.loads((W / "index/dupe-groups.json").read_text())
first_in_group = {}
for h, r in cards.items():
    if r.get("set") and r.get("card"):
        first_in_group.setdefault(groups.get(h), r)


def row_card(h):
    r = cards.get(h) or {}
    return r if r.get("set") and r.get("card") else first_in_group.get(groups.get(h))


# ── Cartes anglaises → pokemontcg.io ─────────────────────────────────────────
PTCG = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master"
ptcg_sets = fetch_json(f"{PTCG}/sets/en.json")
by_code = {s["ptcgoCode"].upper(): s for s in ptcg_sets if s.get("ptcgoCode")}
by_name = {}
for s in ptcg_sets:
    by_name.setdefault(norm(s["name"]), s)
ALIAS = {"base set": "base", "xy base set": "xy", "scarlet & violet 151": "151", "mega evolution base set": "mega evolution",
         "pokemon go": "pokemon go", "sv black star promos": "scarlet & violet black star promos",
         "me black star promos": "mega evolution black star promos"}


def ptcg_set_for(meta):
    name = meta["name"]
    for key in (ALIAS.get(name.lower()), name, re.sub(r"^EX ", "", name), re.sub(r" Base Set$", "", name)):
        if key and norm(key) in by_name:
            return by_name[norm(key)]
    if meta.get("code") and meta["code"].upper() in by_code:
        return by_code[meta["code"].upper()]
    return None


cc_sets = {s["id"]: s for s in fetch_json("https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1/sets.json")["sets"]}
ptcg_cards = {}


def ptcg_cards_of(set_id):
    if set_id not in ptcg_cards:
        try:
            ptcg_cards[set_id] = fetch_json(f"{PTCG}/cards/en/{set_id}.json")
        except Exception:
            ptcg_cards[set_id] = []
    return ptcg_cards[set_id]


intl_map = {}  # cc set id → [(ptcg set id, {numéro normalisé: carte})]
for sid, meta in cc_sets.items():
    if meta["catalog"] != "international":
        continue
    main = ptcg_set_for(meta)
    if not main:
        continue
    # Galeries (Trainer Gallery, Shiny Vault…) : extensions à part chez pokemontcg.io
    related = [main] + [s for s in ptcg_sets if s is not main and norm(s["name"]).startswith(norm(main["name"])) and s["series"] == main["series"]]
    intl_map[sid] = [{num(c["number"]): c for c in ptcg_cards_of(s["id"])} for s in related]


def intl_id(r):
    for table in intl_map.get(r["set"], []):
        c = table.get(num(r["card"])) or table.get(num(r.get("number")))
        if c and (norm(c["name"]) == norm(r.get("name")) or norm(r.get("name")) in norm(c["name"]) or norm(c["name"]) in norm(r.get("name"))):
            return c["id"]
    return None


# ── Cartes japonaises → nos extensions « ja_ » ───────────────────────────────
ja_ids = set()
for p in (ROOT / "public/extra/ja").glob("*.json"):
    ja_ids.update(c["id"] for c in json.loads(p.read_text())["cards"])


def ja_id(r):
    i = f"ja_{r['set'].removeprefix('japanese/').replace('-', '_')}-{re.sub(r'[-\s/]', '_', r['card'])}"
    return i if i in ja_ids else None


# ── Cartes chinoises → nos extensions « cn » par l'identifiant Cardmarket ─────
cn_by_product = {}
for p in (ROOT / "public/extra/cn").glob("*.json"):
    for c in json.loads(p.read_text())["cards"]:
        cn_by_product[c["idProduct"]] = c["id"]
cn_map = {}
for sid, meta in cc_sets.items():
    if meta["catalog"] != "zh-hans":
        continue
    try:
        market = fetch_json(f"https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1/marketplaces/{sid}.json")
    except Exception:
        continue
    for card, e in market.get("cards", {}).items():
        products = list(e.get("cardmarket") or []) + [v["cardmarket"]["product"] for v in (e.get("variants") or {}).values() if (v.get("cardmarket") or {}).get("product")]
        for p in products:
            if p in cn_by_product:
                cn_map[f"{sid}/{card}"] = cn_by_product[p]
                break

# ── Cartes sans équivalent direct : leur version dans une autre langue ───────
# (30th Celebration chinois → anglais ou japonais : même illustration, même numéro.)
set_files = {}


def cc_set(sid):
    if sid not in set_files:
        try:
            set_files[sid] = {c["id"]: c for c in fetch_json(f"https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1/sets/{sid}.json")["cards"]}
        except Exception:
            set_files[sid] = {}
    return set_files[sid]


def direct_id(family, r):
    return intl_id(r) if family == "international" else ja_id(r) if family == "japanese" else cn_map.get(f"{r['set']}/{r['card']}")


def counterpart_id(r):
    card = cc_set(r["set"]).get(r["card"]) or {}
    links = card.get("links") or {}
    for family in ("international", "japanese"):
        for c in sorted(links.get("counterparts", {}).get(family, []), key=lambda c: not c.get("preferred")):
            cand = {"set": c["set"], "card": c["card"], "name": r.get("name"), "number": None}
            dex = direct_id(family, cand)
            if dex:
                return dex
    reprint = links.get("reprintOf")
    if reprint and reprint.get("set"):
        fam = reprint["set"].split("/")[0]
        return direct_id(fam, {"set": reprint["set"], "card": reprint["card"], "name": r.get("name"), "number": None})
    return None


# ── Tables du navigateur ─────────────────────────────────────────────────────
prints, print_index, rows = [], {}, []
mapped = {"international": [0, 0], "japanese": [0, 0], "zh-hans": [0, 0]}
for h in handles:
    r = row_card(h)
    if not r:
        rows.append(-1)
        continue
    key = f"{r['set']}/{r['card']}"
    if key not in print_index:
        family = r["set"].split("/")[0]
        dex = direct_id(family, r) or counterpart_id(r)
        mapped.setdefault(family, [0, 0])
        mapped[family][0] += dex is not None
        mapped[family][1] += 1
        print_index[key] = len(prints)
        prints.append([dex, r.get("name") or "", r.get("set_name") or "", r.get("number") or "", r.get("language") or "",
                       r.get("release_date") or "", 1 if r.get("scan_prior") else 0])
    rows.append(print_index[key])

q = np.clip(np.round(emb * SCALE), -127, 127).astype(np.int8)
digest = hashlib.sha1(q.tobytes()).hexdigest()[:10]
for old in list(OUT.glob("emb-*.bin")) + list(OUT.glob("meta-*.json")):
    old.unlink()
files = []
for k in range(0, len(q), CHUNK_ROWS):
    name = f"emb-{digest}-{k // CHUNK_ROWS}.bin"
    (OUT / name).write_bytes(q[k:k + CHUNK_ROWS].tobytes())
    files.append(name)
meta_name = f"meta-{digest}.json"
(OUT / meta_name).write_text(json.dumps({"rows": rows, "prints": prints}, ensure_ascii=False, separators=(",", ":")))
number = json.loads((W / "models/number-reader.json").read_text())
pipeline = json.loads((W / "pipeline.json").read_text())
(OUT / "index.json").write_text(json.dumps({
    "version": digest, "source": release, "dim": emb.shape[1], "scale": SCALE, "rows": len(q),
    "chunkRows": CHUNK_ROWS, "embeddings": files, "meta": meta_name,
    "number": {"charset": number["charset"], "slots": [{k: s[k] for k in ("cx", "cy", "w", "h")} for s in number["slots"]],
               "denominators": number["denominators"]},
    "fusion": pipeline["fusion"],
}, indent=1))
print("rows", len(q), "prints", len(prints), "mapped to Dexup:", {k: f"{a}/{b}" for k, (a, b) in mapped.items()})
