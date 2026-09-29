# Semainier

Planning perso en vue semaine, façon cahier Seyès : des **créneaux bloqués** et des **tâches à cocher**, avec répétition quotidienne, hebdomadaire (jours au choix) ou mensuelle. Cocher une tâche récurrente ne vaut que pour ce jour-là : elle revient vierge à l'occurrence suivante.

- Site statique (HTML, CSS, JavaScript sans framework ni build) hébergé sur **GitHub Pages**
- Données et connexion via **Supabase** (Postgres + Auth), protégées par Row Level Security
- Installable sur téléphone (PWA), polices et bibliothèques auto-hébergées : aucun appel à un CDN tiers

## Structure

```
index.html              page unique
styles.css              styles (thème clair / sombre automatique)
app.js                  interface
recurrence.js           règles de récurrence (fonctions pures)
store.js                stockage : Supabase ou local
config.js               URL + clé publique Supabase
sw.js                   service worker (ouverture hors connexion)
manifest.webmanifest    installation sur l'écran d'accueil
supabase/schema.sql     table, contraintes, RLS
vendor/                 client supabase-js 2.117.2 (build UMD, licence MIT)
fonts/                  Bricolage Grotesque, Instrument Sans, IBM Plex Mono (SIL OFL)
icons/                  icône de l'app
```

## Tester tout de suite (mode local)

Avec `config.js` vide, l'app tourne en **mode local** : les données restent dans le navigateur, sans compte ni synchro. Ouvre `index.html` en double-cliquant, ou sers le dossier :

```
python -m http.server 8000
```

puis va sur http://localhost:8000.

## Mise en ligne

### 1. Supabase : créer le projet

1. Crée un compte sur [supabase.com](https://supabase.com) puis un projet (région **Paris / eu-west-3** conseillée).
2. **SQL Editor** → *New query* → colle le contenu de `supabase/schema.sql` → *Run*.

### 2. Supabase : un seul compte, le tien

1. **Authentication → Sign In / Providers** : désactive *Allow new users to sign up*. Personne d'autre ne pourra créer de compte.
2. **Authentication → Users → Add user → Create new user** : ton e-mail + un mot de passe solide, avec *Auto Confirm User* coché.

### 3. Brancher l'app

Dans **Project Settings → API Keys** (ou *Data API*), récupère :

- l'**URL du projet** (`https://xxxx.supabase.co`) ;
- la clé **publishable** (`sb_publishable_…`) ou, sur un ancien projet, la clé **anon**.

Colle-les dans `config.js`. Ces deux valeurs sont publiques par conception, donc elles peuvent aller dans un dépôt public. **Ne mets jamais la clé secrète (`sb_secret_…`) ni `service_role`** : elle contourne la RLS. L'app refuse de démarrer en mode Supabase si elle en détecte une.

### 4. GitHub Pages

1. Crée un dépôt `semainier` sur GitHub, commit et push le dossier.
2. **Settings → Pages** : *Source* = *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Au bout d'une minute, l'app est sur `https://<ton-pseudo>.github.io/semainier/`.

Sur un compte GitHub gratuit, Pages exige un dépôt public. C'est sans risque ici : le code ne contient aucun secret, et les données sont dans Supabase derrière la RLS.

### 5. Sur le téléphone

Ouvre l'URL, connecte-toi, puis ajoute la page à l'écran d'accueil : *Partager → Sur l'écran d'accueil* sur iPhone, ou *menu ⋮ → Installer l'application* sur Android.

## Sécurité

- **RLS** sur `items` : chaque utilisateur ne lit et n'écrit que ses lignes (`auth.uid() = user_id`). Le rôle `anon` n'a aucun droit.
- **Inscriptions désactivées** : le seul compte est celui que tu as créé à la main.
- **Contraintes SQL** : types, énumérations, cohérence des heures, taille des titres.
- **CSP** dans `index.html` : scripts, styles et polices uniquement depuis le site, requêtes réseau uniquement vers `*.supabase.co`.
- **Import JSON** : chaque élément est revalidé, et l'affichage échappe tout le texte.

Si tu héberges un jour Supabase toi-même sur ton domaine, ajoute ce domaine à `connect-src` dans la CSP de `index.html`.

## Sauvegarde

**Exporter (JSON)**, en bas de page, télécharge tout ton planning. **Importer** le réinjecte : les éléments sont ajoutés, jamais remplacés. C'est aussi le moyen de passer du mode local au mode Supabase.

Côté base, un `pg_dump` (chaîne de connexion dans *Project Settings → Database*) sauvegarde tout.

## À savoir

- Un projet Supabase gratuit se met en pause après une semaine sans aucune activité. Si tu utilises l'app tous les jours, ça n'arrive pas ; sinon, tu le relances en un clic depuis le tableau de bord.
- La synchro entre appareils se fait au retour sur l'onglet ou au retour du réseau, pas en temps réel.
- Quand tu ajoutes ou renommes un fichier, mets à jour la liste `SHELL` dans `sw.js` et incrémente `CACHE`.

## Pistes pour la suite

- Report automatique des tâches non faites au lendemain
- Vue mois
- Synchro temps réel (Supabase Realtime)
- Glisser-déposer des créneaux dans la grille
