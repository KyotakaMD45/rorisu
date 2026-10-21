// Le redémarrage est strictement limité aux numéros déclarés dans SUDO.
export default {
  name: 'restart',
  aliases: [],
  description: 'Redémarre le bot (propriétaire uniquement).',
  async execute({ isSudo, sendReply, lifecycle, chatId }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }
    await lifecycle.restart(chatId);
  },
};
