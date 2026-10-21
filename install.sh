#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_url="https://github.com/KyotakaMD45/rorisu-baileys-bot.git"
readonly service_name="rorisu-baileys-bot"
readonly install_dir="${RORISU_INSTALL_DIR:-$HOME/rorisu-baileys-bot}"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "ce programme d’installation est réservé aux VPS Linux Debian/Ubuntu."
fi

if [[ ! -r /etc/os-release ]] || ! grep -Eq '^ID=(debian|ubuntu)$|^ID_LIKE=.*debian' /etc/os-release; then
  fail "distribution non prise en charge ; utilisez Debian ou Ubuntu."
fi

if [[ "$(id -u)" -eq 0 ]]; then
  fail "lancez ce script avec un utilisateur normal disposant de sudo, pas en root."
fi

if [[ "$install_dir" =~ [[:space:]] ]]; then
  fail "le chemin d’installation ne doit pas contenir d’espaces : $install_dir"
fi
[[ "$install_dir" == /* ]] || fail "le chemin d’installation doit être absolu : $install_dir"

command -v sudo >/dev/null 2>&1 || fail "sudo est nécessaire."
command -v systemctl >/dev/null 2>&1 || fail "systemd est nécessaire."
sudo -v

if [[ -e "$install_dir" ]]; then
  fail "le chemin existe déjà : $install_dir. Définissez RORISU_INSTALL_DIR pour en choisir un autre."
fi

printf 'Installation des outils requis...\n'
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

node_is_supported() {
  command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'
}

if ! node_is_supported; then
  printf 'Installation de Node.js 22...\n'
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

node_is_supported || fail "Node.js 20 ou supérieur n’a pas pu être installé."

printf 'Téléchargement du projet...\n'
git clone --depth 1 --branch master "$repository_url" "$install_dir"

[[ -r /dev/tty ]] || fail "un terminal interactif est nécessaire pour saisir le numéro WhatsApp."
read -r -p "Numéro WhatsApp du propriétaire (indicatif international, sans +) : " sudo_number </dev/tty \
  || fail "impossible de lire le numéro WhatsApp depuis le terminal."
[[ "$sudo_number" =~ ^[0-9]{6,15}$ ]] || fail "le numéro doit contenir entre 6 et 15 chiffres."

cp "$install_dir/.env.example" "$install_dir/.env"
sed -i "s/^SUDO=.*/SUDO=$sudo_number/" "$install_dir/.env"

printf 'Installation des dépendances du bot...\n'
npm --prefix "$install_dir" ci --omit=dev

service_file="$(mktemp)"
trap 'rm -f "$service_file"' EXIT
cat > "$service_file" <<EOF
[Unit]
Description=RORISU WhatsApp Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$install_dir
ExecStart=$(command -v node) $install_dir/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo install -m 0644 "$service_file" "/etc/systemd/system/$service_name.service"
sudo systemctl daemon-reload
sudo systemctl enable --now "$service_name"

printf '\nInstallation terminée. Le bot démarre automatiquement avec le VPS.\n'
printf 'Pour afficher le QR code de connexion WhatsApp :\n'
printf '  sudo journalctl -u %s -f\n' "$service_name"
printf 'État du service : sudo systemctl status %s\n' "$service_name"
printf 'Configuration : %s/.env\n' "$install_dir"
