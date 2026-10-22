import { normalizeNumber } from '../config.js';
import { WAMessageStubType, downloadMediaMessage } from '@whiskeysockets/baileys';
import {
  findParticipant,
  getPhoneNumberJid,
  isGroupAdmin,
  normalizeJid,
} from './group-utils.js';
import { unwrapMessage } from './message-content.js';
import {
  cacheMessage,
  getRecoveryDestination,
  isViewOnceMessage,
  messageCacheKey,
  sendRecoveredMessage,
  shouldRecoverDeletedMessage,
} from './message-recovery.js';

export { unwrapMessage };

function getMessageText(message) {
  const content = unwrapMessage(message);
  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || content.buttonsResponseMessage?.selectedButtonId
    || content.listResponseMessage?.singleSelectReply?.selectedRowId
    || '';
}

function getContextInfo(message) {
  const content = unwrapMessage(message);
  return content.extendedTextMessage?.contextInfo
    || content.imageMessage?.contextInfo
    || content.videoMessage?.contextInfo
    || content.documentMessage?.contextInfo
    || {};
}

// Relie les mises à jour WhatsApp aux commandes et aux plugins chargés.
export function createMessageHandler({
  plugins,
  config,
  storage,
  logger,
  onIncoming,
}) {
  const processingStatusIds = new Set();
  const cachedMessages = new Map();
  const repeatedMessages = new Map();
  const slowModeMessages = new Map();
  const antiSpamWindowMs = 10_000;
  const antiSpamThreshold = 3;
  const slowModeIntervalMs = 5_000;

  function isRepeatedSpam(chatId, senderJid, text) {
    const normalizedText = text.toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
    if (!normalizedText) return false;

    const now = Date.now();
    const key = `${chatId}:${normalizeJid(senderJid)}:${normalizedText}`;
    const recent = (repeatedMessages.get(key) || [])
      .filter((timestamp) => now - timestamp < antiSpamWindowMs);
    recent.push(now);
    repeatedMessages.delete(key);
    repeatedMessages.set(key, recent);

    if (repeatedMessages.size > 5000) {
      repeatedMessages.delete(repeatedMessages.keys().next().value);
    }
    return recent.length >= antiSpamThreshold;
  }

  async function handleUpsert(event, socket, lifecycle) {
    // Ignore l'historique ajouté à la connexion pour éviter de rejouer d'anciennes commandes.
    if (event.type !== 'notify') return;

    for (const message of event.messages || []) {
      try {
        const chatId = message.key?.remoteJid;
        if (!chatId) continue;
        if (chatId !== 'status@broadcast' && onIncoming) {
          try {
            Promise.resolve(onIncoming({ message, socket })).catch((error) => {
              logger.error({ err: error }, 'Impossible de traiter le message entrant pour l’API.');
            });
          } catch (error) {
            logger.error({ err: error }, 'Impossible de traiter le message entrant pour l’API.');
          }
        }
        if (config.apiMode === 'only') continue;
        if (chatId === 'status@broadcast') {
          const messageId = message.key.id;
          if (message.key.fromMe || isViewOnceMessage(message)) continue;

          if (messageId && await storage.get('feature:auto_status_view') === true) {
            const viewedStatuses = await storage.get('auto_status:viewed');
            const seenStatusIds = Array.isArray(viewedStatuses) ? viewedStatuses : [];
            if (!seenStatusIds.includes(messageId)) {
              await socket.readMessages([message.key]);
              await storage.set('auto_status:viewed', [...seenStatusIds, messageId].slice(-500));
            }
          }

          if (await storage.get('feature:auto_status') !== true) continue;

          const author = message.key.participant || 'Auteur inconnu';
          const seenStatuses = await storage.get('auto_status:seen') || [];
          if (!messageId
            || seenStatuses.includes(messageId)
            || processingStatusIds.has(messageId)) continue;

          processingStatusIds.add(messageId);
          try {
            const content = unwrapMessage(message);
            const caption = `Statut de ${author}`;
            let statusMessage;
            if (content.imageMessage) {
              const image = await downloadMediaMessage(message, 'buffer', {}, {
                logger,
                reuploadRequest: socket.updateMediaMessage,
              });
              statusMessage = { image, caption };
            } else if (content.videoMessage) {
              const video = await downloadMediaMessage(message, 'buffer', {}, {
                logger,
                reuploadRequest: socket.updateMediaMessage,
              });
              statusMessage = { video, caption };
            } else {
              const text = getMessageText(message);
              if (!text) continue;
              statusMessage = { text: `${caption}\n${text}` };
            }

            const ownerJid = `${config.sudoNumbers[0]}@s.whatsapp.net`;
            await socket.sendMessage(ownerJid, statusMessage);
            await storage.set('auto_status:seen', [...seenStatuses, messageId].slice(-500));
          } finally {
            processingStatusIds.delete(messageId);
          }
          continue;
        }

        const antiDeleteSettings = await storage.get('feature:anti_delete');
        if (antiDeleteSettings && !isViewOnceMessage(message)) {
          cacheMessage(cachedMessages, message);
        }

        if (!message.key.fromMe
          && message.key.id
          && await storage.get('feature:send_read') === true) {
          await socket.readMessages([message.key]);
        }

        const senderJid = message.key.participant || chatId;
        const senderPhoneJid = await getPhoneNumberJid(
          senderJid,
          socket,
          message.key.participantAlt || message.key.remoteJidAlt,
        );
        const senderNumber = message.key.fromMe
          ? config.sudoNumbers[0] || normalizeNumber(senderJid.split('@')[0].split(':')[0])
          : normalizeNumber(senderPhoneJid?.split('@')[0].split(':')[0]);
        const isSudo = message.key.fromMe || config.sudoNumbers.includes(senderNumber);
        const text = getMessageText(message).trim();
        if (chatId.endsWith('@g.us')
          && !message.key.fromMe
          && !isSudo
          && await storage.get(`group:${chatId}:slowmode`) === true) {
          const metadata = await socket.groupMetadata(chatId);
          const participants = metadata.participants || [];
          const sender = findParticipant(participants, senderJid)
            || findParticipant(participants, message.key.participantAlt);
          if (!isGroupAdmin(sender)) {
            const bot = findParticipant(participants, socket.user?.id);
            if (!isGroupAdmin(bot)) {
              logger.error({ chatId }, 'Mode lent actif mais le bot n’est plus administrateur du groupe.');
            } else {
              const memberJid = normalizeJid(senderPhoneJid || senderJid);
              const rateLimitKey = `${chatId}:${memberJid}`;
              const now = Date.now();
              const lastAcceptedMessage = slowModeMessages.get(rateLimitKey) || 0;
              if (now - lastAcceptedMessage < slowModeIntervalMs) {
                await socket.sendMessage(chatId, { delete: message.key });
                continue;
              }
              slowModeMessages.set(rateLimitKey, now);
              if (slowModeMessages.size > 5000) {
                slowModeMessages.delete(slowModeMessages.keys().next().value);
              }
            }
          }
        }
        if (chatId.endsWith('@g.us')
          && !message.key.fromMe
          && !isSudo
          && text
          && await storage.get(`group:${chatId}:antispam`) === true) {
          const metadata = await socket.groupMetadata(chatId);
          const participants = metadata.participants || [];
          const sender = findParticipant(participants, senderJid)
            || findParticipant(participants, message.key.participantAlt);
          if (!isGroupAdmin(sender)) {
            const bot = findParticipant(participants, socket.user?.id);
            if (!isGroupAdmin(bot)) {
              logger.error({ chatId }, 'Anti-spam actif mais le bot n’est plus administrateur du groupe.');
            } else if (isRepeatedSpam(chatId, senderJid, text)) {
              await socket.sendMessage(chatId, { delete: message.key });
              continue;
            }
          }
        }
        const prefix = config.prefixes.find((candidate) => text.startsWith(candidate));
        const commandText = prefix ? text.slice(prefix.length).trim() : text;
        const firstWord = commandText.split(/\s+/)[0]?.toLowerCase();
        const commandName = prefix
          ? firstWord
          : config.prefixes.length === 0 && plugins.has(firstWord)
            ? firstWord
            : undefined;
        if (chatId.endsWith('@g.us')
          && !message.key.fromMe
          && await storage.get(`group:${chatId}:antilink`) === true
          && /(?:https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/)/i.test(text)) {
          const metadata = await socket.groupMetadata(chatId);
          const participants = metadata.participants || [];
          const sender = findParticipant(participants, senderJid);
          if (!isGroupAdmin(sender)) {
            const bot = findParticipant(participants, socket.user?.id);
            if (!isGroupAdmin(bot)) {
              logger.error({ chatId }, 'Anti-liens actif mais le bot n’est plus administrateur du groupe.');
            } else {
              await socket.sendMessage(chatId, { delete: message.key });
              await socket.sendMessage(chatId, { text: 'Les liens ne sont pas autorisés dans ce groupe.' });
              continue;
            }
          }
        }
        const antiwordSettings = chatId.endsWith('@g.us') && !message.key.fromMe
          ? await storage.get(`group:${chatId}:antiword`)
          : null;
        if (antiwordSettings?.enabled && Array.isArray(antiwordSettings.words)) {
          const metadata = await socket.groupMetadata(chatId);
          const participants = metadata.participants || [];
          if (!isGroupAdmin(findParticipant(participants, senderJid))) {
            const contentWords = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
            const blockedWord = antiwordSettings.words.find((word) => contentWords.includes(word));
            if (blockedWord) {
              const bot = findParticipant(participants, socket.user?.id);
              if (!isGroupAdmin(bot)) {
                logger.error({ chatId }, 'Anti-mots actif mais le bot n’est plus administrateur du groupe.');
              } else {
                await socket.sendMessage(chatId, { delete: message.key });
                await socket.sendMessage(chatId, { text: 'Ce message contient un mot interdit dans ce groupe.' });
                continue;
              }
            }
          }
        }
        if (chatId.endsWith('@g.us') && !message.key.fromMe && !prefix && !commandName) {
          const filters = await storage.get(`group:${chatId}:filters`) || {};
          const normalizedText = text.toLowerCase();
          const match = Object.entries(filters)
            .find(([trigger]) => normalizedText.includes(trigger));
          if (match) {
            await socket.sendMessage(chatId, { text: match[1] });
          }
        }
        const afkKey = `afk:${senderNumber}`;
        const senderAfk = senderNumber ? await storage.get(afkKey) : null;

        if (senderAfk && commandName !== 'afk') {
          await storage.set(afkKey, null);
          await socket.sendMessage(chatId, { text: 'Tu n’es plus indiqué comme absent.' });
        }

        if (!message.key.fromMe && message.message) {
          const mentions = getContextInfo(message).mentionedJid || [];
          const afkMentions = [];
          for (const jid of mentions.slice(0, 3)) {
            const number = normalizeNumber(jid.split('@')[0].split(':')[0]);
            const afk = number ? await storage.get(`afk:${number}`) : null;
            if (afk) afkMentions.push({ jid, afk });
          }
          if (afkMentions.length) {
            const lines = afkMentions.map(({ jid, afk }) => {
              const elapsedMinutes = Math.max(0, Math.floor((Date.now() - afk.since) / 60000));
              const duration = elapsedMinutes < 60
                ? `${elapsedMinutes} min`
                : `${Math.floor(elapsedMinutes / 60)} h`;
              const reason = afk.reason ? ` — ${afk.reason}` : '';
              return `@${jid.split('@')[0].split(':')[0]} est absent depuis ${duration}${reason}.`;
            });
            await socket.sendMessage(chatId, {
              text: lines.join('\n'),
              mentions: afkMentions.map(({ jid }) => jid),
            });
          }
        }

        if (!commandName) continue;

        const [, ...args] = commandText.split(/\s+/);
        const plugin = plugins.get(commandName);
        if (!plugin) continue;

        if (chatId.endsWith('@g.us') && !isSudo && plugin.name !== 'rori') {
          const allowedCommands = await storage.get(`group:${chatId}:allowed_commands`);
          if (Array.isArray(allowedCommands)) {
            const metadata = await socket.groupMetadata(chatId);
            if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))
              && !allowedCommands.includes(plugin.name.toLowerCase())) {
              await socket.sendMessage(chatId, {
                text: 'Cette commande n’est pas autorisée aux membres. Utilise .rori list pour voir les commandes disponibles.',
              }, { quoted: message });
              continue;
            }
          }
        }

        const contextInfo = getContextInfo(message);
        const quotedParticipant = contextInfo.participant;
        const quotedFromMe = Boolean(quotedParticipant
          && socket.user?.id
          && normalizeJid(quotedParticipant) === normalizeJid(socket.user.id));
        const quotedMessage = contextInfo.quotedMessage
          ? {
            key: {
              remoteJid: chatId,
              id: contextInfo.stanzaId,
              participant: quotedParticipant,
              ...(contextInfo.participantPn ? { participantAlt: contextInfo.participantPn } : {}),
              fromMe: quotedFromMe,
            },
            message: contextInfo.quotedMessage,
          }
          : null;
        const mentions = contextInfo.mentionedJid || [];

        await plugin.execute({
          socket,
          message,
          chatId,
          senderJid,
          senderNumber,
          isGroup: chatId.endsWith('@g.us'),
          isSudo,
          args,
          mentions,
          quotedMessage,
          text,
          config,
          storage,
          plugins,
          lifecycle,
          logger,
          sendReply: (reply, extra = {}) => socket.sendMessage(
            chatId,
            { text: reply, ...extra },
            { quoted: message },
          ),
          sendOwnerReply: config.sudoNumbers[0]
            ? (reply) => socket.sendMessage(`${config.sudoNumbers[0]}@s.whatsapp.net`, { text: reply })
            : undefined,
        });

        await storage.increment(`command:${plugin.name}`);
      } catch (error) {
        logger.error({ err: error }, 'Échec du traitement d’un message');
        const chatId = message.key?.remoteJid;
        if (chatId && chatId !== 'status@broadcast') {
          try {
            await socket.sendMessage(chatId, { text: 'Une erreur est survenue pendant cette commande.' });
          } catch (sendError) {
            logger.error({ err: sendError }, 'Impossible d’envoyer le message d’erreur.');
          }
        }
      }
    }
  };

  handleUpsert.handleMessageUpdate = async (updates, socket) => {
    for (const update of updates || []) {
      if (update.update?.messageStubType !== WAMessageStubType.REVOKE) continue;
      const settings = await storage.get('feature:anti_delete');
      if (!settings) continue;

      const originalKey = update.update.key || update.key;
      const chatId = originalKey?.remoteJid || update.key?.remoteJid;
      if (!chatId || !shouldRecoverDeletedMessage(settings, chatId)) continue;
      const cached = cachedMessages.get(messageCacheKey(update.key));
      if (!cached) continue;
      cachedMessages.delete(messageCacheKey(update.key));

      const ownerJid = config.sudoNumbers[0]
        ? `${config.sudoNumbers[0]}@s.whatsapp.net`
        : '';
      if ((settings.destination === 'p' || settings.destination === 'owner') && !ownerJid) {
        logger.error('ANTI-DELETE est configuré vers le propriétaire mais SUDO est vide.');
        continue;
      }
      const destination = getRecoveryDestination(
        { ...settings, destination: settings.destination === 'owner' ? 'p' : settings.destination },
        chatId,
        ownerJid,
      );
      try {
        await sendRecoveredMessage({
          socket,
          destination,
          message: cached.message,
          logger,
        });
      } catch (error) {
        logger.error({ err: error, chatId, messageId: update.key?.id }, 'Impossible de récupérer un message supprimé.');
      }
    }
  };
  return handleUpsert;
}

export { getMessageText };
