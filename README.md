# 🍿 Netflix Clone - Architecture Rust (Axum & Tokio) + Mode Admin

Un clone complet, moderne et fonctionnel de **Netflix**, avec les logos officiels vectoriels, une interface fidèle à 100% à l'originale, un lecteur vidéo personnalisé avec streaming HTTP Range, et un **Espace Studio Administrateur** pour piloter le catalogue en temps réel. L'ensemble de l'architecture est propulsée par un backend haute performance en **Rust**.

---

## 🚀 Fonctionnalités Clés

### 🎨 1. Expérience Utilisateur Netflix (UI 1:1)
- **Vrais Logos Vectoriels :** Logo officiel Netflix incurvé (`netflix-logo.svg`) et favicon ruban rouge (`netflix-n.svg`).
- **Hero Billboard Dynamique :** Lecture automatique de la bande-annonce/teaser en arrière-plan, badges de recommandation (99%, 4K Ultra HD, Dolby Vision), boutons d'action "Lecture" et "Plus d'infos", toggle audio.
- **Carrousels Défilants Fluides :** Catégories ("Tendances", "Netflix Originals", "Sci-Fi", "Action", "Ma Liste", etc.) avec boutons de navigation gauche/droite et zoom immersif au survol des cartes.
- **Modal de Détails :** Fiche de présentation enrichie avec visuel haute définition, synopsis, casting d'acteurs, réalisateur et badges techniques.
- **Recherche Instantanée :** Filtrage réactif par titre, genre ou description.
- **"Ma Liste" (Watchlist) :** Sauvegarde locale et gestion des favoris en un clic.

### 🎥 2. Lecteur Vidéo Netflix Custom & Streaming HTTP Range
- **Moteur de Streaming Rust (HTTP 206 Partial Content) :** Prise en charge des en-têtes `Range: bytes=start-end` pour un scrubbing (avance/retour rapide) instantané et une mise en mémoire tampon optimisée sans latence.
- **Contrôles Vidéo Complets :** Play/Pause, recul de 10s, avance de 10s, curseur de volume avec mute, scrubber avec prévisualisation temporelle, mode plein écran, et raccourcis clavier (`Espace`, `Flèches`, `F`, `Échap`).

### ⚙️ 3. Mode Administrateur Dédié ("Admin Studio")
- **Bascule Immédiate :** Accessible depuis le menu profil en haut à droite.
- **Tableau de Bord de Métriques :** Nombre total de titres, répartition films/séries, statut du serveur Rust, uptime en direct.
- **Gestionnaire de Catalogue (CRUD) :**
  - **Ajouter un titre :** Titre, titre original, affiche verticale, fond 16:9, URL/flux vidéo, genre, année, note, durée, casting, réalisateur.
  - **Mettre en vedette (Hero) :** Désigner en 1 clic le média qui prend la place d'honneur sur le Hero Billboard de la page d'accueil.
  - **Modifier :** Mettre à jour les métadonnées de n'importe quel média.
  - **Supprimer :** Retirer un titre du catalogue avec mise à jour immédiate.

---

## 🛠️ Structure du Projet

```
netflix-clone-rust/
├── Cargo.toml                  # Dépendances Rust (Axum, Tokio, Tower-HTTP, Serde)
├── run.bat                     # Lanceur automatique Windows en 1 clic
├── server.js                   # Serveur de prévisualisation immédiat (Node.js)
├── README.md                   # Documentation complète
├── src/
│   ├── main.rs                 # Serveur Axum, routage et distribution statique
│   ├── models.rs               # Structures Movie, Category, AdminStats, ApiResponse
│   ├── db.rs                   # Gestionnaire persistant du catalogue (data/catalog.json)
│   └── handlers/
│       ├── mod.rs              # Export des modules handlers
│       ├── catalog.rs          # API Catalogue, Hero, Recherche et Catégories
│       ├── stream.rs           # Moteur de streaming vidéo HTTP Range (206) en Rust
│       └── admin.rs            # Endpoints d'administration (CRUD & Stats)
├── static/
│   ├── index.html              # Interface utilisateur (Netflix + Admin Studio + Player)
│   ├── css/
│   │   ├── netflix.css         # Styles officiels Netflix (Hero, Sliders, Modals, Player)
│   │   └── admin.css           # Thème studio d'administration
│   ├── js/
│   │   ├── app.js              # Contrôleur frontend principal
│   │   ├── player.js           # Contrôleur du lecteur vidéo personnalisé
│   │   └── admin.js            # Contrôleur du panneau admin et formulaires
│   └── assets/
│       └── logos/              # Logos vectoriels Netflix officiels (SVG)
└── data/
    └── catalog.json            # Base de données persistante du catalogue
```

---

## 🚀 Lancement Rapide

### Option A : Avec Rust (Natif haute performance)
1. Si Rust n'est pas encore installé sur votre PC, installez-le en une commande :
   ```powershell
   winget install Rustlang.Rustup
   ```
   *(Ou téléchargez l'installateur officiel sur [rustup.rs](https://rustup.rs/))*
2. Lancez le serveur Rust :
   ```bash
   cargo run
   ```
3. Ouvrez votre navigateur sur : **[http://127.0.0.1:8080](http://127.0.0.1:8080)**

---

### Option B : Lancement instantané (Node.js)
Si vous souhaitez prévisualiser et utiliser l'application immédiatement :
```bash
node server.js
```
Puis accédez à : **[http://127.0.0.1:8080](http://127.0.0.1:8080)**

---

## 📡 API REST Fournie par le Backend Rust

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/catalog` | Récupère le Hero et les rangées de catégories |
| `GET` | `/api/movies` | Liste tous les films et séries |
| `GET` | `/api/movies/:id` | Détails complets d'un média |
| `GET` | `/api/movies/hero` | Média actuellement sur le Hero Billboard |
| `GET` | `/api/categories` | Liste des catégories de contenu |
| `GET` | `/api/search?q=...` | Recherche en direct par mot-clé |
| `GET` | `/api/stream/:id` | Flux vidéo avec support HTTP Range (`206`) |
| `GET` | `/api/admin/stats` | Métriques du serveur et du catalogue |
| `GET` | `/api/admin/movies` | Liste pour la table d'administration |
| `POST` | `/api/admin/movies` | Ajoute un nouveau média au catalogue |
| `PUT` | `/api/admin/movies/:id` | Met à jour les informations d'un média |
| `DELETE`| `/api/admin/movies/:id` | Supprime un média du catalogue |
| `POST` | `/api/admin/movies/:id/hero` | Promeut un média en vedette (Hero) |
