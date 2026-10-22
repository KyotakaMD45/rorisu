export function normalizeJid(jid) {
  return String(jid || '').replace(/:\d+(?=@)/, '');
}

export async function getPhoneNumberJid(jid, socket, alternateJid) {
  const mapping = socket?.signalRepository?.lidMapping;
  for (const value of [alternateJid, jid]) {
    if (!value) continue;
    const candidate = normalizeJid(value);
    if (candidate.endsWith('@s.whatsapp.net')) return candidate;
    if (candidate.endsWith('@hosted')) {
      return `${candidate.slice(0, -'@hosted'.length)}@s.whatsapp.net`;
    }
    if (!candidate.endsWith('@lid') && !candidate.endsWith('@hosted.lid')) continue;
    if (typeof mapping?.getPNForLID !== 'function') continue;
    const phoneJid = await mapping.getPNForLID(candidate);
    if (phoneJid) return phoneJid;
  }
  return null;
}

export async function getLinkedLidJid(jid, socket) {
  const candidate = normalizeJid(jid);
  if (!candidate.endsWith('@s.whatsapp.net')) return null;

  const lookup = socket?.signalRepository?.lidMapping?.getLIDForPN;
  if (typeof lookup !== 'function') return null;
  return lookup.call(socket.signalRepository.lidMapping, candidate);
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
    || /^\d{5,20}(?::\d+)?@(?:s\.whatsapp\.net|lid|hosted|hosted\.lid)$/i.test(input)) {
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
