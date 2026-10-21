import { parseWhatsAppJid } from '../core/group-utils.js';

export default {
  name: 'antivv',
  aliases: [],
  description: 'Configure le transfert des médias à vue unique reçus vers un JID choisi.',
  async execute({ isSudo, args, storage, sendReply }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const current = await storage.get('feature:anti_vv');
    const currentSettings = typeof current === 'object' && current ? current : {};
    const action = args[0]?.toLowerCase();
    if (!action || action === 'info') {
      const enabled = current === true || currentSettings.enabled === true;
      const destination = currentSettings.destination || 'p';
      await sendReply(`Anti-VV : ${enabled ? 'activé' : 'désactivé'}; destination : ${destination}. Utilisation : .antivv on [JID|p|g], .antivv JID ou .antivv off`);
      return;
    }

    if (action === 'off' && args.length === 1) {
      await storage.set('feature:anti_vv', { enabled: false, destination: currentSettings.destination || 'p' });
      await sendReply('Anti-VV désactivé.');
      return;
    }

    const rawDestination = action === 'on' ? args[1] : args[0];
    if ((action === 'on' && args.length > 2) || (action !== 'on' && args.length > 1)) {
      await sendReply('Utilisation : .antivv on [JID|p|g], .antivv JID ou .antivv off.');
      return;
    }
    const destination = rawDestination
      ? ['p', 'g'].includes(rawDestination.toLowerCase())
        ? rawDestination.toLowerCase()
        : parseWhatsAppJid(rawDestination)
      : 'p';
    if (!destination) {
      await sendReply('JID invalide. Utilisation : .antivv on [JID|p|g] ou .antivv JID.');
      return;
    }

    await storage.set('feature:anti_vv', { enabled: true, destination });
    const destinationLabel = destination === 'p'
      ? 'le propriétaire'
      : destination === 'g'
        ? 'la discussion d’origine'
        : destination;
    await sendReply(`Anti-VV activé : les médias à vue unique seront transférés vers ${destinationLabel}.`);
  },
};
