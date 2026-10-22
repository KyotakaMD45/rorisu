import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

export default {
  name: 'antispam',
  aliases: [],
  description: 'Active ou désactive la suppression des messages répétés dans ce groupe.',
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
    const key = `group:${chatId}:antispam`;
    if (!['on', 'off', 'info'].includes(mode)) {
      const enabled = await storage.get(key) === true;
      await sendReply(`Anti-spam : ${enabled ? 'activé' : 'désactivé'}. Utilisation : .antispam on|off`);
      return;
    }

    if (mode === 'info') {
      const enabled = await storage.get(key) === true;
      await sendReply(`Anti-spam : ${enabled ? 'activé' : 'désactivé'}.`);
      return;
    }

    const enabled = mode === 'on';
    if (enabled && !isGroupAdmin(findParticipant(metadata.participants || [], socket.user?.id))) {
      await sendReply('Le bot doit être administrateur pour supprimer les messages ; option laissée désactivée.');
      return;
    }

    await storage.set(key, enabled);
    await sendReply(`Anti-spam ${enabled ? 'activé' : 'désactivé'} pour ce groupe.`);
  },
};
