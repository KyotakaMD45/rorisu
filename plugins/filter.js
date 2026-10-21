import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

export default {
  name: 'filter',
  aliases: ['stop'],
  description: 'Enregistre ou supprime une réponse automatique dans un groupe.',
  async execute(context) {
    const { socket, chatId, senderJid, isGroup, args, text, config, sendReply, storage } = context;
    if (!isGroup) {
      await sendReply('Les réponses automatiques doivent être configurées dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent gérer les réponses automatiques.');
      return;
    }

    const commandName = text.slice(config.prefixes.find((prefix) => text.startsWith(prefix)).length)
      .trim().split(/\s+/)[0]?.toLowerCase();
    const key = `group:${chatId}:filters`;
    const filters = await storage.get(key) || {};
    const trigger = args.join(' ').trim();

    if (commandName === 'stop') {
      if (!trigger) {
        await sendReply('Utilisation : .stop phrase');
        return;
      }
      const normalizedTrigger = trigger.toLowerCase();
      if (!Object.hasOwn(filters, normalizedTrigger)) {
        await sendReply('Cette réponse automatique est introuvable.');
        return;
      }
      delete filters[normalizedTrigger];
      await storage.set(key, filters);
      await sendReply('Réponse automatique supprimée.');
      return;
    }

    const separator = trigger.indexOf('=');
    if (separator < 0) {
      await sendReply('Utilisation : .filter phrase = réponse automatique');
      return;
    }

    const filterText = trigger.slice(0, separator).trim();
    const response = trigger.slice(separator + 1).trim();
    if (filterText.length < 2 || filterText.length > 64 || !response || response.length > 1000) {
      await sendReply('La phrase doit faire 2 à 64 caractères et la réponse 1 à 1000 caractères.');
      return;
    }

    filters[filterText.toLowerCase()] = response;
    await storage.set(key, filters);
    await sendReply(`Réponse automatique enregistrée pour « ${filterText} ».`);
  },
};
