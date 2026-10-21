export function normalizeJid(jid) {
  return String(jid || '').replace(/:\d+(?=@)/, '');
}

export function parseWhatsAppJid(value) {
  const input = String(value || '').trim();
  if (/^\+?[\d\s().-]{6,24}$/.test(input)) {
    const number = input.replace(/\D/g, '');
    return number.length >= 6 && number.length <= 15
      ? `${number}@s.whatsapp.net`
      : null;
  }
  if (/^\d{5,40}(?:-\d{5,20})?@g\.us$/i.test(input)
    || /^\d{5,20}(?::\d+)?@(?:s\.whatsapp\.net|lid)$/i.test(input)) {
    return input.toLowerCase();
  }
  return null;
}

export function findParticipant(participants, jid) {
  const normalizedJid = normalizeJid(jid);
  return participants.find((participant) => normalizeJid(participant.id) === normalizedJid);
}

export function isGroupAdmin(participant) {
  return Boolean(participant?.admin || participant?.isAdmin || participant?.isSuperAdmin);
}

export function getTargetJid({ args, mentions, quotedMessage }) {
  const candidates = [
    ...mentions,
    ...(quotedMessage?.key?.participant ? [quotedMessage.key.participant] : []),
    ...args.map((argument) => {
      const digits = argument.replace(/\D/g, '');
      return digits ? `${digits}@s.whatsapp.net` : '';
    }),
  ].filter(Boolean);
  return candidates[0];
}
