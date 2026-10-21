import {
  findParticipant,
  isGroupAdmin,
  normalizeJid,
} from '../core/group-utils.js';

export default {
  name: 'delete',
  aliases: ['dlt'],
  description: 'Supprime le message cité (permissions requises pour les messages des autres).',
  async execute({ socket, chatId, senderJid, isGroup, quotedMessage, sendReply }) {
    const key = quotedMessage?.key;
    if (!key) {
      await sendReply('Réponds au message que tu veux supprimer.');
      return;
    }

    const isOwnMessage = key.fromMe === true
      || (key.participant && normalizeJid(key.participant) === normalizeJid(senderJid));
    if (!isOwnMessage) {
      if (!isGroup) {
        await sendReply('Tu ne peux supprimer que tes propres messages dans une conversation privée.');
        return;
      }

      const metadata = await socket.groupMetadata(chatId);
      const participants = metadata.participants || [];
      if (!isGroupAdmin(findParticipant(participants, senderJid))
        || !isGroupAdmin(findParticipant(participants, socket.user?.id))) {
        await sendReply('Il faut être administrateur et le bot doit aussi être administrateur pour supprimer ce message.');
        return;
      }
    }

    await socket.sendMessage(chatId, { delete: key });
  },
};
