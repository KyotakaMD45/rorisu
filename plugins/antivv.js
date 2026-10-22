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
    if (action === 'on' && args.length > 1) {
      await storage.set('feature:anti_vv', { enabled: false });
      await sendReply('Le transfert des médias à vue unique est désactivé pour respecter leur confidentialité.');
      return;
    }
    if (args.length > 1 || (action && !['on', 'off', 'info'].includes(action))) {
      await sendReply('Utilisation : .antivv [info|off]. Le transfert des médias à vue unique reste désactivé.');
      return;
    }

    if (action !== 'info') {
      await storage.set('feature:anti_vv', { enabled: false });
    }
    await sendReply(action === 'on'
      ? 'Le transfert anti-VV ne peut pas être activé : les médias à vue unique restent protégés.'
      : 'Anti-VV : désactivé. Les médias à vue unique ne sont ni enregistrés ni retransmis.');
  },
};
