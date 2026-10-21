// L'arrêt est strictement limité aux numéros déclarés dans SUDO.
export default {
  name: 'shutdown',
  aliases: [],
  description: 'Arrête le bot (propriétaire uniquement).',
  async execute({ isSudo, sendReply, lifecycle, chatId }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }
    await lifecycle.shutdown(chatId);
  },
};
