# RORISU Baileys Bot

Bot WhatsApp Node.js basé sur Baileys : commandes de groupe, API HTTP, extensions, suivi des statuts et assistant Gemini.

## Installation rapide

Choisissez votre plateforme et lancez la commande dans son terminal :

**VPS Debian/Ubuntu** (PM2; fonctionne avec un utilisateur `sudo` ou root) :

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

Sur un VPS, le script crée automatiquement `config.env` avec les valeurs par défaut et ne demande que le numéro WhatsApp du propriétaire. Les autres réglages (Gemini, API, options automatiques…) pourront être ajoutés après l’installation. Une autorisation système peut aussi être demandée par `sudo` si nécessaire. Le bot est géré par PM2 et redémarre avec le VPS. L’installation affiche son état sans afficher les conversations; les journaux techniques et le QR ne sont consultables que sur demande avec `pm2 logs rorisu-baileys-bot`. Les identifiants WhatsApp sont conservés localement : ne partagez pas le dossier de session. Si vous lancez le script en root avec `sudo su`, il utilise l’utilisateur d’origine (`SUDO_USER`) quand il est disponible ; autrement il installe le service sous l’utilisateur courant.

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

Les réponses textuelles sont transmises en flux dès que Gemini les génère, au lieu d’attendre la fin complète. Pour des réponses plus courtes, réglez `GEMINI_MAX_OUTPUT_TOKENS` (512 par défaut) et `GEMINI_CONTEXT_TURNS` dans `config.env`. Les modèles, le prompt, la taille maximale des médias, le délai et la mémoire se règlent avec les variables `GEMINI_*` du modèle `config.env.example`. Les médias et la génération d’images dépendent des modèles disponibles pour la clé et de leurs quotas.

### Fonctions automatiques

Les options sont désactivées par défaut et se règlent en privé avec `.setvar` :

```text
.setvar AUTO_STATUS = on
.setvar AUTO_UPDATE = on
```

`AUTO_STATUS` transfère les statuts reçus au propriétaire, sauf les médias à vue unique. `AUTO_UPDATE` vérifie les mises à jour GitHub à la connexion puis toutes les cinq minutes. Pour désactiver une option, remplacez `on` par `off`. Le propriétaire reçoit aussi un message privé à la connexion avec l’état des fonctions.

## Commandes

Le préfixe par défaut est `.`; il se règle avec `HANDLERS`. Les anciennes
configurations Levanter utilisant `PREFIX=^[.,!]` sont aussi reconnues lorsque
`HANDLERS` n’est pas défini. `BOT_LANG` et `TIMEZONE` sont acceptés comme alias
de compatibilité pour `LANGUAGE` et `TZ`; `API_MODE=both` et `API_MODE=api`
correspondent respectivement aux modes `true` et `only`. `.prefix null` ou
`.setvar HANDLERS = null` désactive les préfixes : les commandes reconnues
peuvent alors être envoyées directement (par exemple `ping`). Les symboles et
emoji sont acceptés comme préfixes; plusieurs préfixes sont séparés par des
virgules.

| Commandes | Description |
| --- | --- |
| `.list`, `.alive`, `.ping` | Aide et état du bot. |
| `.gemini`, `.ai`, `.image`, `.imagine` | Assistant multimodal et génération d’images. |
| `.download`, `.yt`, `.youtube`, `.tiktok`, `.insta`, `.fb` | Télécharge des médias publics pris en charge (yt-dlp requis; limite 20 Mo). |
| `.sticker`, `.poll`, `.afk`, `.react`, `.jid` (`.id`, `.getjid`), `.dlt` | Outils de discussion; `.jid` affiche les identifiants de la discussion, de l’expéditeur, des mentions et du message cité; `.dlt` supprime le message cité avec les permissions nécessaires. |
| `.delete p/g/JID/off`, `.antidelete`, `.vv`, `.antivv off` | Récupération anti-suppression des messages ordinaires et information sur la protection des médias à vue unique. Limite média anti-suppression : 20 Mo. |
| `.antilink`, `.antiword`, `.warn`, `.filter`, `.tagall`, `.rori` | Modération et outils de groupe. `.rori ping sticker` limite les commandes des membres; `.rori off` retire la restriction. |
| `.ginfo`, `.greet`, `.goodbye`, `.kick`, `.add`, `.promote`, `.demote` | Gestion du groupe (droits admin requis selon la commande). |
| `.setvar`, `.getvar`, `.allvar`, `.delvar` | Gestion de `config.env` (propriétaire uniquement; les secrets sont masqués). |
| `.setsudo [list|add <numéro>|remove <numéro>]` | Gère les propriétaires du bot; le dernier propriétaire ne peut pas être retiré. |
| `.prefix [préfixe]` | Affiche ou modifie le préfixe du bot (propriétaire uniquement; redémarrage automatique). Les symboles et emoji sont acceptés; plusieurs préfixes sont séparés par des virgules; `null` désactive les préfixes. |
| `.update`, `.update now`, `.restart`, `.shutdown` | Vérifie les mises à jour ou les installe, puis redémarre (propriétaire uniquement). |

Pour les détails d’une commande, envoyez `.list` au bot. `.setvar` redémarre automatiquement le processus quand une variable nécessite une nouvelle initialisation.

Le téléchargeur utilise `yt-dlp` installé localement. Les scripts d’installation VPS Debian/Ubuntu, Termux et Windows l’installent automatiquement. Sur les autres plateformes, installez yt-dlp depuis sa documentation officielle. Utilisez uniquement des médias publics que vous êtes autorisé à télécharger; aucune session, cookie ou connexion à un compte n’est utilisé. Les playlists ne sont pas téléchargées et la limite est de 20 Mo.

Le propriétaire peut gérer les autres numéros autorisés sans redémarrer le bot : `.setsudo add 22501234567`, `.setsudo remove 22501234567` et `.setsudo list`. Les changements sont enregistrés dans `SUDO` de `config.env` et appliqués immédiatement.

Pour l’anti-suppression, le propriétaire peut utiliser `.delete p` pour recevoir les messages supprimés en privé, `.delete g` pour les renvoyer dans la discussion d’origine, ou `.delete off` pour désactiver la fonction. Les filtres facultatifs sont `pm`, `gm`, `no-pm` et `no-gm`; un numéro international ou un JID WhatsApp peut aussi être fourni à la place de `p` ou `g`. La récupération utilise un cache mémoire des 300 derniers messages, effacé au redémarrage. `.delete` sans option ou `.dlt` sur un message cité conserve la suppression manuelle.

`.vv` explique que les médias à vue unique ne sont pas enregistrés ni retransmis; demande à l’expéditeur de les renvoyer s’il est d’accord. Ces médias sont aussi exclus du cache anti-suppression, des statuts transférés et des webhooks/API. `.antivv` confirme que le transfert automatique est désactivé, y compris pour les anciens réglages.

Les détails des sessions Signal cryptographiques sont masqués dans le terminal; ne partagez jamais les journaux bruts ou les fichiers d’authentification WhatsApp.

Sur VPS, gérez le processus avec `pm2 status`, `pm2 restart rorisu-baileys-bot` ou `pm2 stop rorisu-baileys-bot`. Les mises à jour `.update now` et `AUTO_UPDATE` installent également les dépendances de production avant de redémarrer.

## API et Docker

L’API HTTP est facultative : configurez `API_MODE=true`, une clé forte dans `API_KEY`, puis `PORT`. Elle permet l’envoi de messages et les webhooks; protégez-la derrière HTTPS et ne publiez pas son port sans proxy sécurisé. Consultez [la documentation API du dépôt](https://github.com/KyotakaMD45/rorisu-baileys-bot) pour les routes et exemples.

Pour Docker, copiez `config.env.example` vers `config.env`, renseignez `SUDO`, puis lancez `docker compose up -d --build`. Suivez le QR avec `docker compose logs -f bot`.

## Développement

Node.js 20 ou supérieur est requis. Les commandes sont des plugins dans `plugins/`; n’ajoutez que des extensions de confiance dans `eplugins/`.

```sh
npm test
```
