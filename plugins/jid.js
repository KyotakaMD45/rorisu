import {
  getLinkedLidJid,
  getPhoneNumberJid,
  normalizeJid,
} from '../core/group-utils.js';

export default {
  name: 'jid',
  aliases: ['id', 'getjid'],
  description: 'Affiche les identifiants JID de la discussion, de l’expéditeur et du message cité.',
  async execute({ chatId, senderJid, quotedMessage, mentions = [], socket, sendReply }) {
    const entries = [
      ['Discussion', chatId],
      ['Expéditeur', senderJid],
      ...mentions.map((jid, index) => [`Mention ${index + 1}`, jid]),
    ];
    if (quotedMessage?.key) {
      entries.push(
        [
          'Message cité',
          quotedMessage.key.participant
            || quotedMessage.key.participantAlt
            || (quotedMessage.key.fromMe ? socket?.user?.id : undefined)
            || quotedMessage.key.remoteJid,
        ],
      );
    }

    const uniqueEntries = [];
    const seen = new Set();
    for (const [label, jid] of entries) {
      if (!jid) continue;
      const normalizedJid = normalizeJid(jid);
      if (seen.has(`${label}:${normalizedJid}`)) continue;
      seen.add(`${label}:${normalizedJid}`);
      uniqueEntries.push(`${label} : ${jid}`);

      const phoneJid = await getPhoneNumberJid(jid, socket);
      if (phoneJid) {
        const phoneLabel = `${label} (numéro)`;
        if (!seen.has(`${phoneLabel}:${phoneJid}`)) {
          seen.add(`${phoneLabel}:${phoneJid}`);
          uniqueEntries.push(`${phoneLabel} : ${phoneJid}`);
        }
      }

      const lidJid = await getLinkedLidJid(phoneJid || jid, socket);
      if (lidJid) {
        const lidLabel = `${label} (LID)`;
        if (!seen.has(`${lidLabel}:${normalizeJid(lidJid)}`)) {
          seen.add(`${lidLabel}:${normalizeJid(lidJid)}`);
          uniqueEntries.push(`${lidLabel} : ${lidJid}`);
        }
      }
    }

    await sendReply(`🆔 *Identifiants JID*\n${uniqueEntries.join('\n')}`);
  },
};
