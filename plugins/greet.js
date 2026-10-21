import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

const eventTypes = new Map([
  ['setgreet', 'welcome'],
  ['getgreet', 'welcome'],
  ['delgreet', 'welcome'],
  ['setgoodbye', 'goodbye'],
  ['getgoodbye', 'goodbye'],
  ['delgoodbye', 'goodbye'],
]);

export default {
  name: 'greet',
  aliases: [...eventTypes.keys()],
  description: 'Configure les messages d’arrivée et de départ du groupe.',
  async execute(context) {
    const {
      socket,
      chatId,
      senderJid,
      isGroup,
      args,
      text,
      config,
      sendReply,
      storage,
    } = context;
    if (!isGroup) {
      await sendReply('Les messages d’accueil doivent être configurés dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent modifier les messages automatiques.');
      return;
    }

    const commandName = text.slice(config.prefixes.find((prefix) => text.startsWith(prefix)).length)
      .trim().split(/\s+/)[0]?.toLowerCase();
    const eventType = eventTypes.get(commandName);
    const key = `group:${chatId}:${eventType}`;
    if (commandName.startsWith('set')) {
      const message = args.join(' ').trim();
      if (!message || message.length > 1000) {
        await sendReply(`Utilisation : .${commandName} message avec {user} (maximum 1000 caractères).`);
        return;
      }
      await storage.set(key, message);
      await sendReply(`Message ${eventType === 'welcome' ? 'd’accueil' : 'de départ'} enregistré.`);
      return;
    }

    if (commandName.startsWith('del')) {
      await storage.set(key, null);
      await sendReply(`Message ${eventType === 'welcome' ? 'd’accueil' : 'de départ'} supprimé.`);
      return;
    }

    const message = await storage.get(key);
    await sendReply(message || 'Aucun message automatique configuré.');
  },
};
