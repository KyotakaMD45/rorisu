export default {
  name: 'list',
  aliases: ['help', 'aide', 'menu'],
  description: 'Affiche la liste des commandes disponibles.',
  async execute({ sendReply, config }) {
    const prefix = config.prefixes[0];
    const prefixes = config.prefixes.join(' / ');
    const menu = [
      `╭─ *${config.botName}* ─────────`,
      `│ Préfixe : ${prefixes}`,
      '├─ *Essentiel*',
      `│ ${prefix}alive  ${prefix}ping  ${prefix}list`,
      '├─ *IA & outils*',
      `│ ${prefix}ai  ${prefix}image  ${prefix}sticker`,
      `│ ${prefix}poll  ${prefix}afk  ${prefix}react`,
      '├─ *Groupes*',
      `│ ${prefix}ginfo  ${prefix}tagall  ${prefix}rori`,
      `│ ${prefix}antilink  ${prefix}antiword  ${prefix}warn`,
      `│ ${prefix}filter  ${prefix}greet  ${prefix}kick`,
      `│ ${prefix}promote  ${prefix}mute  ${prefix}invite`,
      `├─ *Propriétaire*`,
      `│ ${prefix}setvar  ${prefix}update  ${prefix}restart  ${prefix}shutdown`,
      '╰────────────────────',
      `Astuce : ${prefix}rori configure les commandes accessibles aux membres.`,
    ];
    await sendReply(menu.join('\n'));
  },
};
