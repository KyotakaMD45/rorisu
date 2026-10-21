#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_url="https://github.com/KyotakaMD45/rorisu-baileys-bot.git"
readonly install_dir="${RORISU_INSTALL_DIR:-$HOME/rorisu-baileys-bot}"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

[[ -n "${PREFIX:-}" && "$PREFIX" == /data/data/com.termux/* ]] \
  || fail "ce script est réservé à Termux sur Android."
command -v pkg >/dev/null 2>&1 || fail "la commande pkg de Termux est introuvable."

if [[ "$install_dir" =~ [[:space:]] ]]; then
  fail "le chemin d’installation ne doit pas contenir d’espaces : $install_dir"
fi
[[ "$install_dir" == /* ]] || fail "le chemin d’installation doit être absolu : $install_dir"
[[ "$install_dir" == "$HOME"/* ]] || fail "installez le bot dans votre dossier personnel Termux."
[[ ! -e "$install_dir" ]] || fail "le chemin existe déjà : $install_dir. Définissez RORISU_INSTALL_DIR pour en choisir un autre."
[[ -r /dev/tty ]] || fail "ouvrez Termux dans un terminal interactif pour saisir le numéro WhatsApp."

printf 'Installation de Git et Node.js...\n'
pkg update -y
pkg install -y git nodejs-lts yt-dlp
command -v node >/dev/null 2>&1 || fail "Node.js n’a pas pu être installé."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
  || fail "Node.js 20 ou supérieur est requis."

printf 'Téléchargement du bot...\n'
git clone --depth 1 --branch master "$repository_url" "$install_dir"

read -r -p "Numéro WhatsApp du propriétaire (indicatif international, sans +) : " sudo_number </dev/tty \
  || fail "impossible de lire le numéro WhatsApp depuis le terminal."
[[ "$sudo_number" =~ ^[0-9]{6,15}$ ]] || fail "le numéro doit contenir entre 6 et 15 chiffres."

cp "$install_dir/config.env.example" "$install_dir/config.env"
sed -i "s/^SUDO=.*/SUDO=$sudo_number/" "$install_dir/config.env"

printf 'Installation des dépendances du bot...\n'
npm --prefix "$install_dir" ci --omit=dev

printf '\nInstallation terminée. Le bot démarre dans cette session Termux.\n'
printf 'Scannez le QR code WhatsApp, puis gardez Termux ouvert.\n'
printf 'Configuration : %s/config.env\n\n' "$install_dir"
cd "$install_dir"
npm start
