# Dexup

> Application web progressive (PWA) pour suivre sa collection de cartes Pokémon — React + Vite + Supabase.

---

## Fonctionnalités

### Accueil
- Nombre de cartes possédées, sets entamés, cartes gradées et **valeur de la collection** (prix tendance Cardmarket, actualisés chaque semaine ; une carte gradée compte pour la valeur saisie)
- Statistiques détaillées (grading par société, répartition par set)
- Accès direct à « Mes cartes », aux Actualités, à l’Agenda (conventions et sorties) et aux Produits
- Extensions en cours et dernières sorties

### Extensions
- Toutes les extensions TCG, de la plus récente à la plus ancienne
- **Noms en français** (langue réglable dans « Mon compte » : FR / EN / JA) et code de set (`ME6`, `SV3PT5`…)
- Recherche en français ou en anglais, ou par code ; filtres Toutes / Entamées / Favorites
- Vue liste ou grille, barre de progression et favori ★ par extension

### Extensions chinoises et cartes perso
- **Exclusivités Chine** (onglet « Chine » des extensions) : Gem Pack, Happy Set, éditions chinoises… d'après le catalogue public de Cardmarket (`scripts/update-china-sets.mjs`, chaque lundi). Aucune base gratuite ne les publie avec leurs images : on a le nom, les attaques et le prix tendance, mais ni image ni numéro, et les variantes d'une même carte apparaissent séparément (avec leur prix pour les distinguer)
- **Cartes perso** (bouton + de « Ma collection ») : n'importe quelle carte absente de la base — nom, extension, numéro, langue, photo et prix, qui compte dans la valeur de la collection
- **Ma photo** : sur toute carte possédée, on peut ajouter sa propre photo, affichée à la place de l'image officielle (ou du dos de carte des cartes sans image). Photos réduites (~40 Ko) et synchronisées avec le compte

### Cartes d'une extension
- Grille de cartes : **un tap sur le « + » ajoute la carte à la collection**, un tap sur l'image ouvre sa fiche
- Filtres Toutes / Possédées / Manquantes, vue grille ou liste
- Sets de plus de 250 cartes chargés en entier (pagination de l'API)

### Fiche carte
- Image, rareté, numéro, artiste, extension
- **Prix Cardmarket** du jour (tendance, moyennes 7 j / 30 j, prix bas, tendance reverse / holo) via TCGdex ; le lien Cardmarket reste disponible même sans cotation
- Ajout à la collection, favori ★, ajout à une liste
- **Grading** : PSA / PCA / CA / CollectAura / CCC / CGC / Beckett ou société libre, avec une **valeur estimée** saisie à la main
- Se ferme toute seule quand on change de page

### Recherche
- Par nom en **français ou en anglais** (`Salamèche` → Charmander, insensible aux accents)
- Filtre par rareté, résultats paginés (« Voir plus »)

### Scanner
- **Reconnaissance par l'image**, dans le navigateur, sans serveur (méthode et modèle de [pokeum](https://github.com/TBLgGamin/pokeum), MIT) :
  1. la carte est cherchée dans toute l'image (bords détectés avec OpenCV.js, sur la luminosité et la saturation des couleurs) — pas de cadre à viser au pixel près, carte penchée, décentrée ou à l'envers acceptée ;
  2. elle est redressée, puis réduite à son empreinte visuelle par un modèle DINOv2 affiné pour ignorer reflets, flou et lumière (24 Mo, quantifié en 8 bits, ONNX Runtime Web) ;
  3. cette empreinte est comparée à celles de toutes les cartes connues ; une correspondance nette ouvre la fiche, sinon les cartes possibles sont proposées (rééditions d'une même illustration, image moyenne)
- **Scan automatique** : la reconnaissance se déclenche dès que l'image est nette, immobile et bien éclairée (conseils « Ne bouge plus », « Plus de lumière », « Trop de reflets »), puis attend que la carte change
- **Reconnaître une photo** déjà prise (galerie, capture d'écran), y compris sans accès à la caméra
- Calcul dans un fil de travail séparé : la caméra reste fluide. Le moteur (≈ 45 Mo) se télécharge à la première ouverture du scanner puis reste en cache, sans alourdir le reste de l'app
- **Index** : `scripts/update-scan-index.mjs` calcule l'empreinte de chaque carte (un fichier par extension dans `scan-index/`), relancé chaque lundi par le workflow pour les nouvelles extensions ; `scripts/pack-scan-index.mjs` les assemble avant chaque build
- **BarcodeDetector** natif (Chrome / Safari) pour détecter QR codes et codes-barres automatiquement
- Recherche manuelle par numéro de carte (ex : `025`, `163/193`) ou par nom

### Classeur
- **Listes** : « Ma collection » (cartes possédées, groupées par extension) et « Cartes gradées » (par société) toujours présentes, plus autant de listes personnelles que souhaité
- Chaque liste a son icône : Poké, Super, Hyper, Master, Honor, Soin, Sombre ou Chrono Ball
- Renommer, changer l'icône, retirer des cartes, supprimer — depuis le menu « ⋯ »
- **Favoris** : cartes, extensions et produits

### Produits
- Catalogue de produits scellés (boosters, displays, ETB, tins, coffrets, decks) avec prix indicatifs Cardmarket
- Marquer un produit comme **possédé**, filtre « Possédés », favoris ★
- Lien Cardmarket et accès aux cartes de l'extension

### Actualités et conventions
- **Actualités TCG** : flux RSS de pokemonblog.com (catégorie TCG) relayé par une fonction Netlify
- **Sorties** (onglet de l’Agenda) : calendrier des sorties de produits FR / US et des extensions japonaises, depuis le calendrier iCal public de PokéCardex relayé par une fonction Netlify
- **Conventions** (onglet de l’Agenda) : salons et conventions pour collectionneurs en France et en Europe (pas les tournois compétitifs)
- Cache partagé 24 h dans Supabase

### Profil et communauté
- **Onglet Profil** : photo de profil, bannière, nom affiché, pseudo, bio, 3 cartes mises en avant (avec ta photo perso si la carte en a une), visibilité, et les paramètres (langue des extensions, synchronisation, déconnexion, version)
- **Communauté** : liste des profils publics (recherche par pseudo ou nom), et pour chacun ses 3 cartes, ses cartes possédées, ses listes et ses favoris, selon ce qu'il choisit de montrer ; « N cartes en commun avec toi »
- Le profil publie un **instantané** de la collection (identifiants des cartes, listes, favoris, statistiques), republié automatiquement quand la collection change ; les données privées de `pokecollect_data` ne sont jamais exposées
- Table `pokecollect_profiles` : à créer une fois avec [`docs/supabase-profiles.sql`](docs/supabase-profiles.sql). Sans elle, l'app affiche « Communauté bientôt disponible ». En mode invité (développement), une communauté de démonstration locale la remplace

### Compte et synchronisation
- Inscription / connexion par email + mot de passe (Supabase Auth) ; l'app est privée
- Collection, favoris, listes et produits possédés **synchronisés sur Supabase**, lisibles hors ligne grâce à la base locale
- « Forcer la synchronisation » dans « Mon compte »

### Interface
- Thème clair monochrome : grille de points, titres en serif fin, libellés en monospace, une seule couleur d'accent (le violet du logo)
- Navigation à 5 entrées : Accueil · Extensions · Scanner · Recherche · Classeur (barre flottante sur mobile, barre latérale sur ordinateur)
- Animations légères : entrées en cascade, feuilles qui glissent, compteurs ; désactivées si le système demande moins d'animations

---

## Architecture

```
src/
├── App.jsx                 # Session, routes, barre d'onglets / barre latérale
├── main.jsx
├── styles.css              # Design system (tokens, composants, animations)
├── screens/
│   ├── Home.jsx            # Accueil : chiffres clés, raccourcis, extensions en cours
│   ├── Sets.jsx            # Liste des extensions
│   ├── SetDetail.jsx       # Cartes d'une extension
│   ├── Search.jsx          # Recherche par nom + rareté
│   ├── Scan.jsx            # Scanner plein écran
│   ├── Binder.jsx          # Classeur : listes + favoris
│   ├── Collection.jsx      # « Ma collection » et « Cartes gradées »
│   ├── ListDetail.jsx      # Détail d'une liste personnelle
│   └── Products.jsx        # Catalogue de produits scellés
├── components/
│   ├── ui.jsx              # Feuilles, champs, pastilles, états vides, page défilante
│   ├── cards.jsx           # Tuiles et lignes de cartes (grille / liste)
│   ├── CardSheet.jsx       # Fiche carte, grading, ajout à une liste
│   ├── sheets.jsx          # Statistiques, actualités, conventions, compte, édition de liste
│   ├── PokeBall.jsx        # Icônes de liste
│   ├── Logo.jsx            # Logo
│   └── Auth.jsx            # Connexion / inscription, écran de démarrage
├── store/
│   └── collection.jsx      # État partagé : cartes possédées, favoris, listes, fiche ouverte
├── lib/
│   ├── tcg.js              # Accès à l'API cartes (sets, cartes, recherche)
│   ├── prices.js           # Prix Cardmarket via TCGdex + valeur de la collection
│   ├── scan.js             # Lecture d'une carte (OCR) et classement des candidats
│   ├── quality.js          # Mesure de netteté / exposition d'une image
│   ├── useAutoCapture.js   # Déclenchement automatique du scan
│   ├── news.js             # Actualités
│   ├── releases.js         # Calendrier des sorties
│   └── events.js           # Conventions
├── utils/                  # Couche données
│   ├── supabase.js         # Client Supabase + authentification
│   ├── persist.js          # SQLite local + synchronisation Supabase
│   ├── db.js               # Base SQLite locale (sql.js + IndexedDB)
│   ├── storage.js          # Cartes et produits possédés, favoris, grading
│   ├── lists.js            # Listes personnelles
│   ├── cache.js            # Cache local de l'API
│   ├── sharedCache.js      # Cache partagé Supabase
│   ├── api.js              # URL de l'API (directe en dev, proxy en production)
│   ├── setNames.js         # Noms FR ↔ EN des extensions
│   ├── pokemonNames.js     # Noms FR → EN des Pokémon
│   └── LanguageContext.jsx # Langue des extensions
└── data/
    └── products.js         # Catalogue de produits

netlify/functions/
├── pokemon-api.js          # Proxy vers api.pokemontcg.io (avec nouvelles tentatives)
├── fetch-news.js           # Relais du flux RSS d'actualités
└── fetch-releases.js       # Relais du calendrier des sorties (PokéCardex)
```

---

## Stack technique

| Outil | Rôle |
|-------|------|
| React 19 | Interface |
| Vite 6 | Build + serveur de développement |
| React Router 7 | Navigation (HashRouter) |
| Supabase JS 2 | Authentification + base de données |
| sql.js | SQLite dans le navigateur (IndexedDB) |
| Tesseract.js | Lecture des cartes au scan (OCR) |
| Lucide React | Icônes |
| vite-plugin-pwa | Service worker + manifeste |

## APIs utilisées

| API | Usage |
|-----|-------|
| [Pokémon TCG API](https://pokemontcg.io/) v2 | Extensions, cartes, images |
| [TCGdex](https://tcgdex.dev/) | Prix Cardmarket, mis à jour chaque jour (une requête par carte) |
| [PokeAPI GraphQL](https://graphql.pokeapi.co/v1beta2) | Noms français → anglais des Pokémon |
| Flux RSS pokemonblog.com | Actualités TCG (via fonction Netlify) |

---

## Stockage des données

Architecture double couche :

1. **SQLite local** (sql.js + IndexedDB) — lecture rapide, fonctionne hors ligne
2. **Supabase cloud** (PostgreSQL) — persistance serveur, survie au vidage de cache

Seules les données utilisateur sont synchronisées. Le cache API reste local.

| Table Supabase | Rôle |
|---|---|
| `pokecollect_data` | Données par utilisateur (collection, favoris, listes, produits possédés) — RLS user-scoped |
| `pokecollect_shared` | Cache partagé global (sets, cartes, actualités, conventions) — lecture publique |
| `pokecollect_profiles` | Profils publics : pseudo, photo, bannière, bio, cartes mises en avant, instantané de la collection — lecture publique (profils publics), écriture par le propriétaire |

`pokecollect_data` : RLS activé — chaque utilisateur n'accède qu'à ses propres données.  
`pokecollect_shared` : lecture publique (anon), écriture réservée aux utilisateurs authentifiés.

---

## Installation

### Prérequis
- Node.js ≥ 18
- Un projet Supabase avec la table `pokecollect_data` créée

### Setup Supabase

```sql
create table if not exists pokecollect_data (
  user_id    text not null,
  key        text not null,
  value      text,
  updated_at bigint,
  primary key (user_id, key)
);

alter table pokecollect_data enable row level security;

create policy "own data only"
  on pokecollect_data for all
  using  (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
```

Dans **Authentication → Settings** : désactiver "Confirm email" pour une inscription immédiate.

**Table partagée** (actualités + conventions — accessible à tous) :

```sql
create table if not exists pokecollect_shared (
  key        text primary key,
  value      text,
  updated_at bigint default 0
);

alter table pokecollect_shared enable row level security;

-- Lecture publique (non authentifié)
create policy "shared_read"
  on pokecollect_shared for select
  using (true);

-- Écriture réservée aux utilisateurs connectés
create policy "shared_write"
  on pokecollect_shared for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

> Les tables gardent le préfixe `pokecollect_` (ancien nom de l'app) : les renommer orphelinerait les collections existantes.
>
> La liste des conventions vit dans `src/lib/events.js` ; elle est mise en cache dans `pokecollect_shared` sous la clé `collector_events_2027` (à faire évoluer quand la liste change).

### Prix

L'API Pokémon TCG ne fournit plus de prix exploitables (rien pour les sets sortis depuis fin 2025, valeurs figées à juillet 2026 pour les autres). Les prix viennent donc de TCGdex, qui republie Cardmarket chaque jour.

- TCGdex utilise ses propres identifiants (`sv03.5-001` pour `sv3pt5-1`) : `src/lib/prices.js` relie les sets par leur nom, puis les cartes par leur numéro. La correspondance est gardée 30 jours.
- TCGdex répond une carte à la fois : seuls les prix des cartes possédées sont chargés, en arrière-plan, et gardés dans la base locale.
- Fiche carte : prix de moins de 24 h. Valeur de la collection : chaque prix est redemandé quand il a plus de 7 jours.
- Les versions reverse / holo ne sont pas distinguées : une carte compte au prix de sa version normale.

**Langue d'une carte** : le prix tendance Cardmarket mélange toutes les langues et aucune source gratuite ne le détaille. Sur une carte possédée, on choisit sa langue (le lien Cardmarket ouvre alors les offres dans cette langue) et on peut saisir le prix constaté, qui remplace le prix tendance dans la valeur de la collection.

**Produits scellés** : prix tendance issus du relevé public de Cardmarket, régénérés à chaque build par `scripts/update-product-prices.mjs` (`npm run prices` pour voir le détail des correspondances). Un produit absent du catalogue Cardmarket s'affiche « Prix indisponible ».

**Photos des produits** : `scripts/update-product-images.mjs` associe chaque produit à sa photo du catalogue public tcgcsv.com (TCGplayer) ; sans photo, le logo de l'extension est affiché.

### Mises à jour automatiques

| Donnée | Source | Fréquence |
|---|---|---|
| Extensions et cartes | api.pokemontcg.io | liste des extensions relue chaque jour ; cartes d'une extension de moins de 60 jours relues chaque jour, 30 jours sinon |
| Prix des cartes | TCGdex (Cardmarket) | 1 jour sur la fiche, 7 jours pour la valeur de la collection |
| Actualités | flux RSS | 24 h |
| Sorties | calendrier iCal PokéCardex | 6 h |
| Noms français des extensions | TCGdex | chaque lundi (workflow) |
| Produits des nouvelles extensions (booster, display, ETB) | Cardmarket | chaque lundi (workflow) |
| Prix et photos des produits | Cardmarket, tcgcsv.com | chaque lundi (workflow) et à chaque build pour les prix |
| Extensions chinoises (cartes et prix) | catalogue Cardmarket | chaque lundi (workflow) |
| Index du scanner (empreinte de chaque carte) | images api.pokemontcg.io | chaque lundi (workflow), extensions nouvelles ou complétées seulement |
| Conventions | `src/lib/events.js` | **à la main** : aucune source publique fiable |

Le workflow GitHub `.github/workflows/refresh-data.yml` lance les scripts de `scripts/` chaque lundi, pousse les fichiers de `src/data/` qui ont changé, et Netlify redéploie. Il se lance aussi à la main depuis l'onglet Actions. Les produits spéciaux (tins, coffrets, decks) restent ajoutés à la main dans `src/data/products.js`.

### Variables d'environnement

Créer un fichier `.env` à la racine :

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Sans ces variables, l'app tourne en mode local sans compte.

### Commandes

```bash
npm install

# Développement (les fonctions Netlify sont servies aussi)
npm run dev

# Build de production dans dist/
npm run build
```

En développement, ajouter `?guest=1` à l'adresse (avant le `#`) ouvre l'app sans connexion, avec des données locales.

Le déploiement se fait par Netlify à chaque push sur `main` (commande `npm run build`, dossier `dist`).

---

## Pistes

- [ ] Rappels pour les conventions à venir
- [ ] Prix à jour pour les produits scellés (aujourd'hui saisis à la main)
- [ ] Historique de prix par carte
- [ ] Noms et visuels français des cartes

---

## Auteur

Fait avec ❤️ par **Paul Guttin**

---

## Licences tierces

Le scanner reprend et adapte du code de [pokeum](https://github.com/TBLgGamin/pokeum) (© 2026 TBLgGamin, licence MIT) — voir [`third_party/pokeum`](third_party/pokeum).
