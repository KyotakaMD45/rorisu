export default {
  name: 'antivv',
  aliases: [],
  description: 'Affiche et désactive le traitement automatique des médias à vue unique.',
  async execute({ isSudo, args, storage, sendReply }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const action = args[0]?.toLowerCase();
    if (args.length > 1 || (action && !['off', 'info'].includes(action))) {
      await storage.set('feature:anti_vv', { enabled: false });
      await sendReply('Le transfert des médias à vue unique est désactivé pour respecter leur confidentialité.');
      return;
    }

    await storage.set('feature:anti_vv', { enabled: false });
    await sendReply('Anti-VV : désactivé. Les médias à vue unique ne sont ni enregistrés ni retransmis.');
  },
};
