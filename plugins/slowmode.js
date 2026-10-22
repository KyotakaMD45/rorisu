import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

export default {
  name: 'slowmode',
  aliases: [],
  description: 'Limite un message par membre toutes les cinq secondes dans ce groupe.',
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

    const key = `group:${chatId}:slowmode`;
    const mode = args[0]?.toLowerCase();
    if (!['on', 'off', 'info'].includes(mode)) {
      const enabled = await storage.get(key) === true;
      await sendReply(`Mode lent : ${enabled ? 'activé' : 'désactivé'} (5 secondes). Utilisation : .slowmode on|off`);
      return;
    }

    if (mode === 'info') {
      const enabled = await storage.get(key) === true;
      await sendReply(`Mode lent : ${enabled ? 'activé' : 'désactivé'} (5 secondes).`);
      return;
    }

    const enabled = mode === 'on';
    if (enabled && !isGroupAdmin(findParticipant(metadata.participants || [], socket.user?.id))) {
      await sendReply('Le bot doit être administrateur pour supprimer les messages ; option laissée désactivée.');
      return;
    }

    await storage.set(key, enabled);
    await sendReply(`Mode lent ${enabled ? 'activé' : 'désactivé'} pour ce groupe.`);
  },
};
