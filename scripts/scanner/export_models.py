"""Exporte les modèles du scanner CardCorpus (https://github.com/cardcorpus/pokemon-card-scanner,
poids sur https://huggingface.co/cardcorpus/pokemon-card-scanner) en ONNX pour le navigateur.

  python scripts/scanner/export_models.py OUT_DIR

  detector.onnx   QuadDet : coins des cartes dans la photo (sortie de detector.export_tensor)
  matcher.onnx    empreinte d'une carte redressée (512, normée) + tête d'orientation (4 logits)
                  + similarité au dos de carte ; poids en 8 bits, calculs en 32 bits (23,5 Mo)
  number.onnx     CRNN qui lit le numéro de collection

Environnement : pip install "cardcorpus-scanner @ git+https://github.com/cardcorpus/pokemon-card-scanner" onnx onnxruntime
"""
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from huggingface_hub import snapshot_download

from cardcorpus_scanner import detector as det, number_reader as nr, tower
from safetensors.torch import load_file

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
W = Path(snapshot_download("cardcorpus/pokemon-card-scanner"))
P = json.loads((W / "pipeline.json").read_text())


class Matcher(nn.Module):
    def __init__(self):
        super().__init__()
        self.tower = tower.load(W / "models/matcher.safetensors", P["embedder"])
        h = load_file(str(W / "models/heads.safetensors"))
        self.register_buffer("V", h["orient_hidden"].float())
        self.register_buffer("Wp", h["orient_probe"].float())
        self.register_buffer("back", h["back_prototype"].float())

    def forward(self, x):
        f = self.tower(x)
        f = f / f.norm(dim=-1, keepdim=True)
        hid = torch.relu(f @ self.V[:, :512].T + self.V[:, 512])
        orient = hid @ self.Wp[:, :256].T + self.Wp[:, 256]
        return f, orient, f @ self.back


class Detector(nn.Module):
    def __init__(self):
        super().__init__()
        self.m = det.build(P["detector"]["model"])
        self.m.load_state_dict(load_file(str(W / "models/detector.safetensors")))

    def forward(self, x):
        return det.export_tensor(*self.m(x))


def export(model, name, example, inputs, outputs, dynamic):
    path = OUT / f"{name}.onnx"
    with torch.no_grad():
        torch.onnx.export(model.eval(), example, str(path), input_names=inputs, output_names=outputs,
                          dynamic_axes=dynamic, opset_version=17, dynamo=False)
    return path


m = Matcher().eval()
x = torch.rand(4, 3, 224, 224)
with tower.clamped_attention(P["embedder"]["logit_limit"]):
    raw = export(m, "matcher-fp32", (x,), ["image"], ["embedding", "orient", "back"],
                 {"image": {0: "n"}, "embedding": {0: "n"}, "orient": {0: "n"}, "back": {0: "n"}})

d = Detector().eval()
export(d, "detector", (torch.rand(1, 3, 1280, 960),), ["image"], ["out"],
       {"image": {2: "h", 3: "w"}, "out": {2: "gh", 3: "gw"}})

settings = json.loads((W / "models/number-reader.json").read_text())
crnn = nr.build(settings["charset"])
crnn.load_state_dict(load_file(str(W / "models/number-reader.safetensors")))
export(crnn, "number", (torch.rand(2, 1, 48, 384),), ["strip"], ["logits"], {"strip": {0: "n"}, "logits": {0: "n"}})

import onnxruntime as ort

with torch.no_grad(), tower.clamped_attention(P["embedder"]["logit_limit"]):
    ref = m(x)[0].numpy()


# ── Compression du matcher : poids en 8 bits, calculs en 32 bits ─────────────────────────────
# La quantification dynamique (activations en 8 bits) dégrade trop DINOv3 (activations extrêmes) :
# 40/57 au lieu de 52/57 sur nos photos de test. Ici seuls les poids des MatMul sont stockés en
# int8 (une échelle par colonne) et redeviennent des float32 au chargement (DequantizeLinear).
def weight_only_int8(src, dst, min_size=4096):
    from onnx import helper, numpy_helper

    model = onnx.load(src)
    g = model.graph
    inits = {i.name: i for i in g.initializer}
    users = {}
    for node in g.node:
        for name in node.input:
            users.setdefault(name, []).append(node)
    done = 0
    for name, init in list(inits.items()):
        arr = numpy_helper.to_array(init)
        if arr.dtype != np.float32 or arr.ndim != 2 or arr.size < min_size:
            continue
        if not all(n.op_type in ("MatMul", "Gemm") for n in users.get(name, [])):
            continue
        scale = np.abs(arr).max(axis=0) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        g.initializer.remove(init)
        g.initializer.extend([numpy_helper.from_array(q, f"{name}_q"), numpy_helper.from_array(scale.astype(np.float32), f"{name}_s"),
                              numpy_helper.from_array(np.zeros(arr.shape[1], np.int8), f"{name}_z")])
        g.node.insert(0, helper.make_node("DequantizeLinear", [f"{name}_q", f"{name}_s", f"{name}_z"], [name], axis=1, name=f"{name}_dq"))
        done += 1
    onnx.save(model, dst)
    return done


import onnx

n = weight_only_int8(str(raw), str(OUT / "matcher.onnx"))
s = ort.InferenceSession(str(OUT / "matcher.onnx"))
e = s.run(None, {"image": x.numpy()})[0]
print("weight-only int8:", n, "matrices, cosine vs torch:", np.round((e * ref).sum(1), 4))
raw.unlink()
print("sizes MB:", {p.name: round(p.stat().st_size / 1e6, 1) for p in OUT.glob("*.onnx")})
