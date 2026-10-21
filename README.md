# RORISU Baileys Bot

Bot WhatsApp Node.js basé sur Baileys : commandes de groupe, API HTTP, extensions, suivi des statuts et assistant Gemini.

## Installation rapide

Choisissez votre plateforme et lancez la commande dans son terminal :

**VPS Debian/Ubuntu** (service systemd; fonctionne avec un utilisateur `sudo` ou root) :

```sh
curl -fsSL https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install.sh | bash
```

**Android Termux** (gardez Termux ouvert) :

```sh
curl -fsSL https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install-termux.sh | bash
```

**Windows PowerShell** :

```powershell
irm https://raw.githubusercontent.com/KyotakaMD45/rorisu-baileys-bot/master/install.ps1 | iex
```

Les installateurs demandent le numéro WhatsApp du propriétaire. Scannez le QR code affiché pour associer le bot. Les identifiants WhatsApp sont conservés localement : ne partagez pas le dossier de session. Sur un VPS, si vous lancez le script en root avec `sudo su`, il utilise l’utilisateur d’origine (`SUDO_USER`) quand il est disponible ; autrement il installe le service sous l’utilisateur courant.

## Configuration

Le fichier principal est `config.env`. Pour une installation manuelle :

```sh
npm ci
cp config.env.example config.env
npm start
```

Ouvrez `config.env` et définissez `SUDO` avec le numéro du propriétaire, indicatif international inclus et sans `+`. `.env` est encore accepté pour les anciennes installations. Sans PostgreSQL, le bot stocke ses données dans `data/store.json`.

### Gemini

Créez une clé dans [Google AI Studio](https://aistudio.google.com/apikey), puis configurez-la dans `config.env` ou en privé avec `.setvar GEMINI_API_KEY = VOTRE_CLE`. Ne publiez jamais cette clé.

- `.gemini question` ou `.ai question` : réponse Gemini; peut aussi analyser une image, un audio, une vidéo MP4 ou un PDF envoyé/cité.
- `.image description` ou `.imagine description` : génération d’image avec le modèle configuré.
- `.gemini reset` : efface le contexte mémorisé de la discussion.

Les modèles, le prompt, la taille maximale des médias, le délai et la mémoire se règlent avec les variables `GEMINI_*` du modèle `config.env.example`. Les médias et la génération d’images dépendent des modèles disponibles pour la clé et de leurs quotas.

### Fonctions automatiques

Les options sont désactivées par défaut et se règlent en privé avec `.setvar` :

```text
.setvar AUTO_STATUS = on
.setvar AUTO_UPDATE = on
```

`AUTO_STATUS` transfère les statuts reçus au propriétaire. `AUTO_UPDATE` vérifie les mises à jour GitHub à la connexion puis toutes les cinq minutes. Pour désactiver une option, remplacez `on` par `off`. Le propriétaire reçoit aussi un message privé à la connexion avec l’état des fonctions.

## Commandes

Le préfixe par défaut est `.`; il se règle avec `HANDLERS`.

| Commandes | Description |
| --- | --- |
| `.list`, `.alive`, `.ping` | Aide et état du bot. |
| `.gemini`, `.ai`, `.image`, `.imagine` | Assistant multimodal et génération d’images. |
| `.sticker`, `.poll`, `.afk`, `.react`, `.delete` | Outils de discussion. |
| `.antilink`, `.antiword`, `.warn`, `.filter`, `.tagall` | Modération et outils de groupe. |
| `.ginfo`, `.greet`, `.goodbye`, `.kick`, `.add`, `.promote`, `.demote` | Gestion du groupe (droits admin requis selon la commande). |
| `.setvar`, `.getvar`, `.allvar`, `.delvar` | Gestion de `config.env` (propriétaire uniquement; les secrets sont masqués). |
| `.update`, `.restart`, `.shutdown` | Maintenance (propriétaire uniquement). |

Pour les détails d’une commande, envoyez `.list` au bot. `.setvar` redémarre automatiquement le processus quand une variable nécessite une nouvelle initialisation.

## API et Docker

L’API HTTP est facultative : configurez `API_MODE=true`, une clé forte dans `API_KEY`, puis `PORT`. Elle permet l’envoi de messages et les webhooks; protégez-la derrière HTTPS et ne publiez pas son port sans proxy sécurisé. Consultez [la documentation API du dépôt](https://github.com/KyotakaMD45/rorisu-baileys-bot) pour les routes et exemples.

Pour Docker, copiez `config.env.example` vers `config.env`, renseignez `SUDO`, puis lancez `docker compose up -d --build`. Suivez le QR avec `docker compose logs -f bot`.

## Développement

Node.js 20 ou supérieur est requis. Les commandes sont des plugins dans `plugins/`; n’ajoutez que des extensions de confiance dans `eplugins/`.

```sh
npm test
```
