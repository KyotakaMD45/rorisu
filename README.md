# RORISU Baileys Bot

Bot WhatsApp modulaire écrit en Node.js avec Baileys. Il propose une association par QR code ou code, conserve la session localement et propose des commandes extensibles.

## Prérequis et installation

- Node.js 20 ou supérieur.
- Une base PostgreSQL facultative. Sans base, le stockage est assuré dans `data/store.json`.

```sh
npm install
```

Copiez `.env.example` en `.env`, puis configurez au minimum `SUDO` avec le numéro WhatsApp du propriétaire, au format international sans `+` :

```env
BOT_NAME=RORISU
HANDLERS=.
SUDO=33612345678
DATABASE_URL=
LANGUAGE=fr
TZ=Europe/Paris
```

`HANDLERS` accepte un ou plusieurs préfixes séparés par des virgules. `SUDO` contient le numéro du propriétaire du bot. En mode `code`, le premier numéro reçoit le code d’association. `DATABASE_URL` peut contenir une URL PostgreSQL complète (`postgres://...`) ; la table `bot_store` est créée automatiquement. Le fuseau horaire est appliqué au processus Node.js.

`PAIRING_METHOD` choisit la méthode d’association : `qr` (par défaut) affiche un QR code dans le terminal ; `code` affiche un code à saisir sur le téléphone.

## Démarrer et associer WhatsApp

```sh
npm start
```

Lors de la première connexion, le QR code s’affiche dans le terminal. Sur WhatsApp, ouvrez **Appareils connectés → Connecter un appareil** et scannez-le. Pour utiliser un code à la place, définissez `PAIRING_METHOD=code` dans `.env`, puis choisissez **Associer avec un numéro de téléphone** et saisissez le code affiché. Les identifiants sont conservés dans `auth_info_baileys/` ; ne partagez pas ce dossier. Baileys y stocke séparément les identifiants et les clés de session/synchronisation, d’où le grand nombre de petits fichiers JSON. Ne les supprimez pas manuellement : cela peut rendre la session inutilisable et nécessiter une nouvelle association.

## Commandes

Avec le préfixe `.` par défaut :

| Commande | Fonction |
| --- | --- |
| `.ping` | Vérifie que le bot est en ligne. |
| `.list` | Affiche les commandes disponibles. |
| `.sticker` | Convertit une image ou une vidéo en autocollant WebP ; utilisez la commande avec le média ou citez son message. Les médias de plus de 20 Mo sont refusés et les vidéos sont limitées à 10 secondes. |
| `.kick @membre` | Retire un membre du groupe. |
| `.add @membre` | Ajoute un membre au groupe. |
| `.promote @membre` | Nomme un membre administrateur. |
| `.restart` | Redémarre le processus (propriétaire uniquement). |
| `.update` | Récupère la mise à jour Git en avance rapide et redémarre (propriétaire uniquement). |
| `.setvar AUTO_STATUS = on` / `off` | Active ou désactive le transfert privé des statuts reçus vers le propriétaire. |
| `.setvar AUTO_UPDATE = on` / `off` | Active ou désactive la vérification des mises à jour Git toutes les cinq minutes (propriétaire uniquement). |
| `.shutdown` | Arrête le processus (propriétaire uniquement). |

Les commandes de modération sont réservées aux administrateurs du groupe et nécessitent que le bot soit également administrateur. Une mention ou un numéro international peut désigner la cible. Les commandes `update`, `setvar`, `restart` et `shutdown` vérifient le numéro `SUDO`. `.update` nécessite un dépôt Git avec une branche distante configurée ; elle refuse les mises à jour qui exigeraient une fusion. La mise à jour automatique est désactivée par défaut et n’installe que les mises à jour en avance rapide depuis la branche distante configurée.

À chaque connexion, le propriétaire reçoit en privé le message d’accueil ainsi que l’état de `AUTO_STATUS` et `AUTO_UPDATE`. Lorsque `AUTO_STATUS` est activé, les nouveaux statuts textuels, images et vidéos sont transmis au propriétaire, au maximum une fois par identifiant de message récent. Ces options sont conservées dans le stockage du bot.

Les commandes envoyées depuis le compte WhatsApp lié au bot sont également traitées et ont les droits du propriétaire.

## Configuration et stockage

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `BOT_NAME` | Nom du bot dans les réponses. | `RORISU` |
| `HANDLERS` | Préfixe(s) de commande séparés par des virgules. | `.` |
| `SUDO` | Numéros pouvant redémarrer ou arrêter le bot ; le premier sert à l’association. | aucune |
| `PAIRING_METHOD` | Méthode d’association WhatsApp : `qr` ou `code`. | `qr` |
| `DATABASE_URL` | URL PostgreSQL ; vide pour le stockage JSON local. | vide |
| `LANGUAGE` | Langue configurée. | `fr` |
| `TZ` | Fuseau horaire du processus. | `Europe/Paris` |

PostgreSQL stocke les valeurs dans `bot_store`. En mode fichier, les données et compteurs sont conservés dans `data/store.json`. Les dépendances de conversion WebP embarquent ffmpeg ; aucun binaire ffmpeg externe n’est requis.

## Développement

Les commandes sont des modules ES dans `plugins/`. Chaque plugin exporte par défaut un objet `{ name, aliases, description, execute }`. Le chargeur importe les plugins au démarrage.

```sh
npm test
```
