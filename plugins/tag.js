import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

const maximumMentions = 50;

export default {
  name: 'tag',
  aliases: ['tagall'],
  description: 'Mentionne les membres du groupe (administrateur requis).',
  async execute({ socket, chatId, senderJid, isGroup, args, sendReply }) {
    if (!isGroup) {
      await sendReply('Cette commande ne fonctionne que dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    const participants = metadata.participants || [];
    if (!isGroupAdmin(findParticipant(participants, senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent mentionner tous les membres.');
      return;
    }

    const mentions = participants
      .map(({ id }) => String(id).replace(/:\d+(?=@)/, ''))
      .filter((jid) => jid.includes('@'));
    if (mentions.length > maximumMentions) {
      await sendReply(`Le groupe dépasse la limite de ${maximumMentions} mentions par commande.`);
      return;
    }

    const memberList = mentions.map((jid) => `@${jid.split('@')[0]}`).join(' ');
    const message = args.join(' ').trim();
    await socket.sendMessage(chatId, {
      text: `${message ? `${message}\n` : ''}${memberList}`,
      mentions,
    });
  },
};
