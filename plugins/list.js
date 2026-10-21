// Affiche les commandes disponibles et signale celles réservées au propriétaire.
export default {
  name: 'list',
  aliases: ['help', 'aide', 'menu'],
  description: 'Affiche la liste des commandes disponibles.',
  async execute({ sendReply, config }) {
    const prefix = config.prefixes[0];
    const menu = [
      `╭━━━〔 *${config.botName} • MENU* 〕━━━╮`,
      `│ Préfixe : \`${prefix}\``,
      '│',
      '│ ⚡ *GÉNÉRAL*',
      `│ • \`${prefix}ping\` — statut et latence`,
      `│ • \`${prefix}menu\` — afficher ce menu`,
      '│',
      '│ 🧰 *OUTILS*',
      `│ • \`${prefix}sticker\` — créer un autocollant depuis une image ou vidéo`,
      `│ • \`${prefix}setvar AUTO_STATUS = on|off\` — recevoir les statuts en privé`,
      `│ • \`${prefix}setvar AUTO_UPDATE = on|off\` — activer la mise à jour automatique`,
      '│',
      '│ 👥 *GROUPE* (admin requis)',
      `│ • \`${prefix}kick @membre\` — retirer un membre`,
      `│ • \`${prefix}add @membre\` — ajouter un membre`,
      `│ • \`${prefix}promote @membre\` — promouvoir un membre`,
      '│',
      '│ 👑 *PROPRIÉTAIRE*',
      `│ • \`${prefix}update\` — mettre à jour le bot`,
      `│ • \`${prefix}getvar NOM\` — lire une variable .env`,
      `│ • \`${prefix}allvar\` — lister les variables .env`,
      `│ • \`${prefix}delvar NOM\` — supprimer une variable .env`,
      `│ • \`${prefix}restart\` — redémarrer le bot`,
      `│ • \`${prefix}shutdown\` — arrêter le bot`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '_Les commandes propriétaire sont réservées au compte configuré._',
    ];
    await sendReply(menu.join('\n'));
  },
};
