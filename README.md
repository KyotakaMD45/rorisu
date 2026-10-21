# RORISU Baileys Bot

Bot WhatsApp modulaire écrit en Node.js avec Baileys. Il propose une association par QR code ou code, conserve la session localement et propose des commandes extensibles.

## Prérequis et installation

- Node.js 20 ou supérieur.
- Une base PostgreSQL facultative. Sans base, le stockage est assuré dans `data/store.json`.

### Installation rapide sur un VPS Debian/Ubuntu

Connectez-vous au VPS avec un utilisateur disposant de `sudo`, puis lancez :

```sh
curl -fsSL https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install.sh | bash
```

Le script installe Git et Node.js si nécessaire, demande le numéro WhatsApp du propriétaire, configure le bot et crée un service `systemd` pour le démarrer automatiquement. Pour afficher le QR code lors de la première association, exécutez la commande indiquée à la fin de l’installation (`sudo journalctl -u rorisu-baileys-bot -f`). Le script ne prend pas en charge les autres distributions Linux.

Le script d’installation est disponible dans [`install.sh`](./install.sh). Vérifiez-le avant de l’exécuter si vous préférez inspecter les commandes qu’il lance.

### Installation rapide dans Termux (Android)

Dans Termux, exécutez :

```sh
curl -fsSL https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install-termux.sh | bash
```

Le script installe Git et Node.js, configure le numéro du propriétaire et démarre le bot dans Termux. Scannez le QR code et gardez Termux ouvert pendant l’utilisation ; contrairement au script VPS, Termux ne configure pas de service `systemd`. Utilisez une version récente de Termux provenant de F-Droid ou GitHub.

### Déploiement Docker

Installez Docker Compose, clonez le dépôt et préparez la configuration :

```sh
git clone https://github.com/KyotakaMD45/rorisu-baileys-bot.git
cd rorisu-baileys-bot
cp config.env.example config.env
```

Renseignez `SUDO` dans `config.env`, puis démarrez le bot :

```sh
docker compose up -d --build
docker compose logs -f bot
```

Scannez le QR code affiché dans les journaux. La session et les données sont conservées dans le volume Docker `bot-state`. Pour arrêter le bot, utilisez `docker compose down` ; ne supprimez pas le volume si vous souhaitez garder la session WhatsApp. L’API HTTP est publiée uniquement sur `127.0.0.1:3000` ; placez un proxy HTTPS devant elle pour l’exposer.

### Installation rapide sur Windows

Ouvrez PowerShell et exécutez :

```powershell
irm https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install.ps1 | iex
```

Le script installe Node.js LTS si nécessaire (avec `winget`), télécharge le bot, demande le numéro WhatsApp du propriétaire et démarre le bot dans la fenêtre PowerShell. Scannez le QR code affiché et gardez cette fenêtre ouverte pendant l’utilisation. Le script Windows est disponible dans [`install.ps1`](./install.ps1).

### Installation manuelle

```sh
npm install
```

Copiez `config.env.example` en `config.env`, puis configurez au minimum `SUDO` avec le numéro WhatsApp du propriétaire, au format international sans `+` :

```env
BOT_NAME=RORISU
HANDLERS=.
SUDO=33612345678
DATABASE_URL=
AUTO_STATUS=off
AUTO_UPDATE=off
LANGUAGE=fr
TZ=Europe/Paris
```

`HANDLERS` accepte un ou plusieurs préfixes séparés par des virgules. `SUDO` contient le numéro du propriétaire du bot. En mode `code`, le premier numéro reçoit le code d’association. `DATABASE_URL` peut contenir une URL PostgreSQL complète (`postgres://...`) ; la table `bot_store` est créée automatiquement. Le fuseau horaire est appliqué au processus Node.js.

`PAIRING_METHOD` choisit la méthode d’association : `qr` (par défaut) affiche un QR code dans le terminal ; `code` affiche un code à saisir sur le téléphone.

`config.env` est le fichier de configuration principal. Les anciens déploiements qui n’ont encore que `.env` restent compatibles : RORISU lit `.env` comme solution de repli et le copie vers `config.env` lors de la première modification d’une variable.

### API HTTP

L’API peut envoyer des messages texte et transmettre les messages entrants à un webhook. Configurez une clé longue et imprévisible dans `config.env` avant de l’activer :

```env
API_MODE=true
API_KEY=remplacez-par-une-cle-secrete-longue
PORT=3000
API_WEBHOOK_URL=
API_PUBLIC_URL=https://bot.example.com
```

`API_MODE=true` garde les commandes WhatsApp actives ; `API_MODE=only` désactive le traitement des commandes et utilise le bot comme passerelle. Chaque appel doit envoyer la clé dans l’en-tête `x-api-key`. Pour le moment, l’API prend en charge uniquement les messages texte et une session (`0`).

```sh
curl -X POST http://localhost:3000/api/send \
  -H "x-api-key: remplacez-par-une-cle-secrete-longue" \
  -H "Content-Type: application/json" \
  -d '{"to":"33612345678","type":"text","text":"Bonjour depuis l’API"}'

curl http://localhost:3000/api/sessions \
  -H "x-api-key: remplacez-par-une-cle-secrete-longue"
```

Avec `API_WEBHOOK_URL`, les nouveaux messages entrants sont envoyés en JSON à cette URL, avec la même clé dans `x-api-key`. Les images, vidéos, fichiers audio, documents et autocollants reçus sont mis en cache pendant dix minutes (limite : 15 Mo par fichier et 50 Mo au total) et leur webhook contient un lien `media.url` protégé par la clé API. Configurez `API_PUBLIC_URL` avec l’URL HTTPS publique de votre proxy pour créer des liens accessibles depuis le service webhook.

`SESSION_ID=principal,secondaire` démarre plusieurs comptes WhatsApp dans des dossiers d’authentification séparés. Le premier identifiant réutilise le dossier d’authentification configuré ; les autres utilisent le suffixe de leur identifiant. L’endpoint `/api/sessions` les liste et accepte l’identifiant dans le champ `session` de `/api/send`. L’envoi accepte le texte et les médias image, vidéo, audio et document via une URL HTTP(S) publique sur le port 80 ou 443 ; les hôtes privés, les redirections et les fichiers dépassant 20 Mo sont refusés. N’exposez pas le port HTTP directement sur Internet : placez l’API derrière un proxy HTTPS et protégez la clé.

## Démarrer et associer WhatsApp

```sh
npm start
```

Lors de la première connexion, le QR code s’affiche dans le terminal. Sur WhatsApp, ouvrez **Appareils connectés → Connecter un appareil** et scannez-le. Pour utiliser un code à la place, définissez `PAIRING_METHOD=code` dans `config.env`, puis choisissez **Associer avec un numéro de téléphone** et saisissez le code affiché. Les identifiants sont conservés dans `auth_info_baileys/` ; ne partagez pas ce dossier. Baileys y stocke séparément les identifiants et les clés de session/synchronisation, d’où le grand nombre de petits fichiers JSON. Ne les supprimez pas manuellement : cela peut rendre la session inutilisable et nécessiter une nouvelle association.

## Commandes

Avec le préfixe `.` par défaut :

| Commande | Fonction |
| --- | --- |
| `.ping` | Vérifie que le bot est en ligne. |
| `.alive` | Affiche l’état du bot et l’état des options automatiques. |
| `.list` | Affiche les commandes classées par catégories et l’état des options automatiques. |
| `.react emoji` | Réagit au message cité. |
| `.delete` / `.dlt` | Supprime son propre message ou, avec les droits admin, le message cité d’un groupe. |
| `.afk [raison]` / `.afk off` | Active ou désactive le statut d’absence et prévient les membres qui vous mentionnent. |
| `.poll question, choix 1, choix 2` | Crée un sondage WhatsApp avec un choix par vote. |
| `.antilink on` / `.antilink off` | Active ou désactive la suppression des liens dans le groupe (admin requis ; le bot doit être admin pour supprimer). |
| `.antiword on|off`, `.antiword add|remove mot`, `.antiword list` | Gère les mots interdits d’un groupe (admin requis). |
| `.warn @membre` / `.warn reset @membre` | Avertit un membre ; au troisième avertissement, le bot tente de le retirer s’il est admin et la cible ne l’est pas. |
| `.filter phrase = réponse` / `.stop phrase` | Configure ou supprime une réponse automatique de groupe (admin requis). |
| `.setgreet message` / `.setgoodbye message` | Configure les messages d’arrivée et de départ ; `{user}` mentionne les membres (admin requis). |
| `.ginfo` | Affiche le titre, le nombre de membres et les administrateurs du groupe. |
| `.tagall [message]` | Mentionne les membres d’un groupe (admin requis ; maximum 50 mentions). |
| `.sticker` | Convertit une image ou une vidéo en autocollant WebP ; utilisez la commande avec le média ou citez son message. Les médias de plus de 20 Mo sont refusés et les vidéos sont limitées à 10 secondes. |
| `.kick @membre` | Retire un membre du groupe. |
| `.add @membre` | Ajoute un membre au groupe. |
| `.promote @membre` | Nomme un membre administrateur. |
| `.demote @membre` | Rétrograde un administrateur. |
| `.invite` / `.revoke` | Affiche le lien d’invitation ou révoque le lien précédent (admin requis). |
| `.mute` / `.unmute` | Réserve l’envoi aux admins ou le réactive pour tout le groupe. |
| `.restart` | Redémarre le processus (propriétaire uniquement). |
| `.update` | Récupère la mise à jour Git en avance rapide et redémarre (propriétaire uniquement). |
| `.setvar NOM_VARIABLE = valeur` | Ajoute ou modifie une variable de `config.env` (propriétaire uniquement). Exemple : `.setvar AUTO_STATUS = on`. |
| `.getvar NOM_VARIABLE` | Affiche une variable de `config.env` (les secrets sont masqués). |
| `.allvar` | Liste les variables de `config.env` en masquant les secrets. |
| `.delvar NOM_VARIABLE` | Supprime une variable de `config.env`. Les options gérées doivent être désactivées avec `.setvar AUTO_STATUS = off` ou `.setvar AUTO_UPDATE = off`. |
| `.setvar AUTO_STATUS = on` / `off` | Active ou désactive le transfert privé des statuts reçus vers le propriétaire. |
| `.setvar AUTO_STATUS_VIEW = on` / `off` | Marque automatiquement comme lus les statuts reçus. |
| `.setvar SEND_READ = on` / `off` | Envoie automatiquement les accusés de lecture des messages entrants. |
| `.setvar AUTO_UPDATE = on` / `off` | Active ou désactive la vérification immédiate puis périodique des mises à jour GitHub (toutes les cinq minutes). |
| `.gemini question` / `.ai question` | Pose une question à Gemini. Une image, un audio, une vidéo MP4 ou un PDF envoyé/cité peut être analysé. |
| `.gemini reset` | Efface le contexte Gemini de la discussion et de l’utilisateur. |
| `.image description` / `.imagine description` | Génère une image avec le modèle Gemini image configuré. |
| `.shutdown` | Arrête le processus (propriétaire uniquement). |

Les commandes de modération sont réservées aux administrateurs du groupe et nécessitent que le bot soit également administrateur. Une mention ou un numéro international peut désigner la cible. Les commandes `update`, `setvar`, `getvar`, `allvar`, `delvar`, `restart` et `shutdown` vérifient le numéro `SUDO`. Les commandes de variables écrivent directement dans `config.env`; les secrets sont masqués dans les réponses, et les variables nécessaires au démarrage (`SUDO`, `DATABASE_URL`, `PAIRING_METHOD`, etc.) déclenchent un redémarrage après modification ou suppression. Les variables d’environnement dangereuses comme `NODE_OPTIONS` ne peuvent pas être modifiées par ces commandes. `.update` nécessite un dépôt Git avec une branche distante configurée ; elle refuse les mises à jour qui exigeraient une fusion. La mise à jour automatique est désactivée par défaut et n’installe que les mises à jour en avance rapide depuis la branche distante configurée.

À chaque connexion WhatsApp, le propriétaire reçoit en privé un message d’accueil avec l’état des fonctions et les commandes pour activer ou désactiver `AUTO_STATUS` et `AUTO_UPDATE`. En cas d’échec d’envoi temporaire, le bot réessaie jusqu’à trois fois et consigne les erreurs dans le terminal. Lorsque `AUTO_STATUS` est activé, les nouveaux statuts textuels, images et vidéos sont téléchargés puis transmis en privé au propriétaire, au maximum une fois par identifiant de message récent. `AUTO_STATUS_VIEW` marque les statuts reçus comme lus indépendamment de leur transfert. `SEND_READ` envoie les accusés de lecture des messages entrants. Ces options sont désactivées par défaut. `AUTO_UPDATE` vérifie les nouvelles versions au démarrage de la connexion puis toutes les cinq minutes ; les mises à jour sont appliquées uniquement en avance rapide depuis la branche distante suivie. Les valeurs de `config.env` sont chargées au démarrage et synchronisées avec le stockage du bot.

Les commandes envoyées depuis le compte WhatsApp lié au bot sont également traitées et ont les droits du propriétaire.

## Configuration et stockage

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `BOT_NAME` | Nom du bot dans les réponses. | `RORISU` |
| `HANDLERS` | Préfixe(s) de commande séparés par des virgules. | `.` |
| `SUDO` | Numéros pouvant redémarrer ou arrêter le bot ; le premier sert à l’association. | aucune |
| `PAIRING_METHOD` | Méthode d’association WhatsApp : `qr` ou `code`. | `qr` |
| `AUTO_STATUS` | Transfert en privé des nouveaux statuts : `on` ou `off`. | `off` |
| `AUTO_STATUS_VIEW` | Lecture automatique des statuts reçus : `on` ou `off`. | `off` |
| `SEND_READ` | Envoi automatique des accusés de lecture : `on` ou `off`. | `off` |
| `AUTO_UPDATE` | Vérification automatique des mises à jour Git : `on` ou `off`. | `off` |
| `API_MODE` | API HTTP : `false`, `true` ou `only`. | `false` |
| `API_KEY` | Clé d’authentification de l’API HTTP. Obligatoire si l’API est activée. | vide |
| `PORT` | Port HTTP de l’API. | `3000` |
| `API_WEBHOOK_URL` | URL recevant les messages entrants en JSON. | vide |
| `API_PUBLIC_URL` | URL publique de l’API utilisée dans les liens de médias des webhooks. | vide |
| `SESSION_ID` | Identifiants de comptes WhatsApp séparés par des virgules. | `0` |
| `EXTERNAL_PLUGINS_DIRECTORY` | Dossier des extensions locales `.js` / `.mjs`. | `eplugins` |
| `WARN_LIMIT` | Nombre d’avertissements avant tentative de retrait d’un membre. | `3` |
| `DATABASE_URL` | URL PostgreSQL ; vide pour le stockage JSON local. | vide |
| `LANGUAGE` | Langue configurée. | `fr` |
| `TZ` | Fuseau horaire du processus. | `Europe/Paris` |
| `GEMINI_API_KEY` | Clé API Google AI Studio ; nécessaire à la commande Gemini. | vide |
| `GEMINI_MODEL` | Nom du modèle Gemini utilisé pour les questions et médias. | `gemini-3.8-flash` |
| `GEMINI_IMAGE_MODEL` | Modèle Gemini qui prend en charge la génération d’images. | `gemini-3.1-flash-image` |
| `GEMINI_SYSTEM_PROMPT` | Consigne système envoyée avec chaque requête. | assistant RORISU multilingue |
| `GEMINI_TEMPERATURE` | Créativité de la réponse, de `0` à `2`. | `0.7` |
| `GEMINI_MAX_OUTPUT_TOKENS` | Limite de génération. | `1024` |
| `GEMINI_CONTEXT_TURNS` | Nombre de tours précédents conservés par discussion ; `0` désactive la mémoire. | `4` |
| `GEMINI_TIMEOUT_MS` | Délai maximal d’une requête, de `1000` à `120000` ms. | `45000` |
| `GEMINI_MAX_MEDIA_BYTES` | Taille maximale d’un média envoyé à Gemini, de 1 Ko à 20 Mo. | `10485760` |

PostgreSQL stocke les valeurs dans `bot_store`. En mode fichier, les données et compteurs sont conservés dans `data/store.json`. Les dépendances de conversion WebP embarquent ffmpeg ; aucun binaire ffmpeg externe n’est requis.

Pour activer Gemini, créez une clé sur [Google AI Studio](https://aistudio.google.com/apikey), renseignez `GEMINI_API_KEY` dans `config.env`, puis redémarrez le bot. La clé reste locale et ne doit pas être publiée. Les autres paramètres Gemini peuvent être modifiés via `.setvar`; leur changement redémarre le bot. Le contexte est conservé dans le stockage RORISU par discussion et numéro d’utilisateur ; `.gemini reset` le supprime. `.gemini question` analyse le texte, les images, fichiers audio, vidéos MP4 et PDF compatibles envoyés ou cités. `.image description` demande au modèle d’images configuré de générer une image. La disponibilité dépend des modèles activés pour votre clé et de leurs quotas Google.

## Développement

Les commandes sont des modules ES dans `plugins/`. Chaque plugin exporte par défaut un objet `{ name, aliases, description, execute }`. Les extensions locales `.js` ou `.mjs` peuvent être placées dans `eplugins/` (ou dans le dossier défini par `EXTERNAL_PLUGINS_DIRECTORY`) et sont chargées au démarrage. Seuls les plugins de confiance doivent être ajoutés : ils s’exécutent avec les mêmes droits que le bot. Les noms et alias doivent rester uniques.

```sh
npm test
```
