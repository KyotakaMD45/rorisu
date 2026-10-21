import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

export default {
  name: 'antilink',
  aliases: [],
  description: 'Active ou désactive la suppression des liens dans ce groupe.',
  async execute({ socket, chatId, senderJid, isGroup, args, sendReply, storage }) {
    if (!isGroup) {
      await sendReply('Cette commande est réservée aux groupes.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent modifier cette option.');
      return;
    }

    const mode = args[0]?.toLowerCase();
    const key = `group:${chatId}:antilink`;
    if (!['on', 'off', 'info'].includes(mode)) {
      const enabled = await storage.get(key) === true;
      await sendReply(`Anti-liens : ${enabled ? 'activé' : 'désactivé'}. Utilisation : .antilink on|off`);
      return;
    }

    if (mode === 'info') {
      const enabled = await storage.get(key) === true;
      await sendReply(`Anti-liens : ${enabled ? 'activé' : 'désactivé'}.`);
      return;
    }

    const enabled = mode === 'on';
    await storage.set(key, enabled);
    if (enabled && !isGroupAdmin(findParticipant(metadata.participants || [], socket.user?.id))) {
      await storage.set(key, false);
      await sendReply('Le bot doit être administrateur pour supprimer les liens ; option laissée désactivée.');
      return;
    }
    await sendReply(`Anti-liens ${enabled ? 'activé' : 'désactivé'} pour ce groupe.`);
  },
};
