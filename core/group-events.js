export async function handleGroupParticipantsUpdate(update, { socket, storage }) {
  const eventType = update.action === 'add'
    ? 'welcome'
    : update.action === 'remove'
      ? 'goodbye'
      : null;
  if (!eventType || !update.id) return;

  const template = await storage.get(`group:${update.id}:${eventType}`);
  if (typeof template !== 'string' || !template.trim()) return;

  const participants = update.participants || [];
  const mentions = participants
    .map((jid) => String(jid).replace(/:\d+(?=@)/, ''))
    .filter((jid) => jid.includes('@'));
  if (!mentions.length) return;

  const memberNames = mentions.map((jid) => `@${jid.split('@')[0]}`).join(', ');
  const text = template
    .replaceAll('{user}', memberNames)
    .replaceAll('{group}', update.id);

  await socket.sendMessage(update.id, { text, mentions });
}
