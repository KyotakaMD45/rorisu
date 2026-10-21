export default {
  name: 'antivv',
  aliases: [],
  description: 'Active ou désactive l’envoi au propriétaire des médias à vue unique reçus.',
  async execute({ isSudo, args, storage, sendReply }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const action = args[0]?.toLowerCase();
    if (!['on', 'off', 'info'].includes(action) || args.length > 1) {
      const enabled = await storage.get('feature:anti_vv') === true;
      await sendReply(`Anti-VV : ${enabled ? 'activé' : 'désactivé'}. Utilisation : .antivv on|off`);
      return;
    }
    if (action === 'info') {
      const enabled = await storage.get('feature:anti_vv') === true;
      await sendReply(`Anti-VV : ${enabled ? 'activé' : 'désactivé'}.`);
      return;
    }

    const enabled = action === 'on';
    await storage.set('feature:anti_vv', enabled);
    await sendReply(`Anti-VV ${enabled ? 'activé' : 'désactivé'} : les médias à vue unique ${enabled ? 'seront transférés au propriétaire' : 'ne seront plus transférés'}.`);
  },
};
