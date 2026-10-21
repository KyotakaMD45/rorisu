export function normalizeJid(jid) {
  return String(jid || '').replace(/:\d+(?=@)/, '');
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
