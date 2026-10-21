import { normalizeNumber } from '../config.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

// Retire les enveloppes ajoutées par WhatsApp avant de lire le texte ou les médias.
export function unwrapMessage(message) {
  let current = message?.message || message;
  while (current?.ephemeralMessage?.message
    || current?.viewOnceMessage?.message
    || current?.viewOnceMessageV2?.message
    || current?.documentWithCaptionMessage?.message) {
    current = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.documentWithCaptionMessage?.message;
  }
  return current || {};
}

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
export function createMessageHandler({ plugins, config, storage, logger }) {
  const processingStatusIds = new Set();

  return async function handleUpsert(event, socket, lifecycle) {
    // Ignore l'historique ajouté à la connexion pour éviter de rejouer d'anciennes commandes.
    if (event.type !== 'notify') return;

    for (const message of event.messages || []) {
      try {
        const chatId = message.key?.remoteJid;
        if (!chatId) continue;
        if (chatId === 'status@broadcast') {
          if (await storage.get('feature:auto_status') !== true || message.key.fromMe) continue;

          const messageId = message.key.id;
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

        const senderJid = message.key.participant || chatId;
        const senderNumber = message.key.fromMe
          ? config.sudoNumbers[0] || normalizeNumber(senderJid.split('@')[0].split(':')[0])
          : normalizeNumber(senderJid.split('@')[0].split(':')[0]);
        const isSudo = message.key.fromMe || config.sudoNumbers.includes(senderNumber);
        const text = getMessageText(message).trim();
        const prefix = config.prefixes.find((candidate) => text.startsWith(candidate));

        if (!prefix || prefix.length === 0 || text.length === prefix.length) continue;

        const [commandName, ...args] = text.slice(prefix.length).trim().split(/\s+/);
        const plugin = plugins.get(commandName?.toLowerCase());
        if (!plugin) continue;

        const contextInfo = getContextInfo(message);
        const quotedMessage = contextInfo.quotedMessage
          ? {
            key: {
              remoteJid: chatId,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
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
          lifecycle,
          logger,
          sendReply: (reply, extra = {}) => socket.sendMessage(
            chatId,
            { text: reply, ...extra },
            { quoted: message },
          ),
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
}

export { getMessageText };
