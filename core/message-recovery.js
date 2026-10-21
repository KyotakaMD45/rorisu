import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { normalizeJid } from './group-utils.js';
import { unwrapMessage } from './message-content.js';

const maxCachedMessages = 300;
const maxMediaBytes = 20 * 1024 * 1024;
const cacheLifetimeMs = 6 * 60 * 60 * 1000;
const mediaTypes = [
  ['imageMessage', 'image'],
  ['videoMessage', 'video'],
  ['audioMessage', 'audio'],
  ['documentMessage', 'document'],
  ['stickerMessage', 'sticker'],
];

export function findMessageMedia(message) {
  const content = unwrapMessage(message);
  for (const [messageType, mediaType] of mediaTypes) {
    if (content[messageType]) {
      return { content: content[messageType], mediaType };
    }
  }
  return null;
}

export function isViewOnceMessage(message) {
  let content = message?.message || message;
  for (let depth = 0; content && depth < 5; depth += 1) {
    if (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) {
      return true;
    }
    content = content.ephemeralMessage?.message
      || content.documentWithCaptionMessage?.message
      || content.editedMessage?.message;
  }
  return false;
}

export function messageCacheKey(key) {
  return key?.remoteJid && key?.id
    ? `${normalizeJid(key.remoteJid)}:${key.id}`
    : null;
}

export function cacheMessage(cache, message, now = Date.now()) {
  const cacheKey = messageCacheKey(message.key);
  if (!cacheKey || !message.message) return;

  cache.delete(cacheKey);
  cache.set(cacheKey, { message, createdAt: now });
  for (const [key, value] of cache) {
    if (now - value.createdAt > cacheLifetimeMs) cache.delete(key);
  }
  while (cache.size > maxCachedMessages) {
    cache.delete(cache.keys().next().value);
  }
}

function getText(message) {
  const content = unwrapMessage(message);
  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || '';
}

function getMediaSize(media) {
  const size = Number(media.fileLength);
  return Number.isFinite(size) ? size : 0;
}

async function getMediaBuffer(message, media, socket, logger, downloadMedia = downloadMediaMessage) {
  if (getMediaSize(media.content) > maxMediaBytes) {
    throw new Error('Le média dépasse la limite de récupération de 20 Mo.');
  }
  const buffer = await downloadMedia(message, 'buffer', {}, {
    logger,
    reuploadRequest: (key) => socket.updateMediaMessage(key),
  });
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > maxMediaBytes) {
    throw new Error('Le média téléchargé est vide ou dépasse 20 Mo.');
  }
  return buffer;
}

function getContextLabel(message) {
  const chatId = message.key.remoteJid;
  const sender = message.key.participant || chatId;
  return `Message supprimé de ${sender}${chatId.endsWith('@g.us') ? ` dans ${chatId}` : ''}`;
}

export async function sendRecoveredMessage({
  socket,
  destination,
  message,
  logger,
  quoted,
  notice,
  downloadMedia,
}) {
  const media = findMessageMedia(message);
  if (!media) {
    const text = getText(message);
    if (!text) {
      await socket.sendMessage(destination, {
        text: `${notice || getContextLabel(message)} (type de contenu non pris en charge).`,
      }, quoted ? { quoted } : {});
      return;
    }
    await socket.sendMessage(destination, {
      text: `${notice || getContextLabel(message)} :\n${text}`,
    }, quoted ? { quoted } : {});
    return;
  }

  const buffer = await getMediaBuffer(message, media, socket, logger, downloadMedia);
  const label = notice || getContextLabel(message);
  const caption = [label, media.content.caption].filter(Boolean).join('\n');
  if (['audio', 'sticker'].includes(media.mediaType) && caption) {
    await socket.sendMessage(destination, { text: caption }, quoted ? { quoted } : {});
  }
  const payload = {
    [media.mediaType]: buffer,
    ...(media.mediaType === 'audio' ? { ptt: Boolean(media.content.ptt) } : {}),
    ...(media.mediaType === 'sticker' ? {} : {
      mimetype: media.content.mimetype || 'application/octet-stream',
      ...(caption ? { caption } : {}),
    }),
    ...(media.mediaType === 'document' && media.content.fileName
      ? { fileName: media.content.fileName }
      : {}),
  };
  await socket.sendMessage(destination, payload, quoted ? { quoted } : {});
}

export async function forwardViewOnce({
  socket,
  destination,
  message,
  logger,
  downloadMedia,
}) {
  const media = findMessageMedia(message);
  if (!media || !['image', 'video', 'audio'].includes(media.mediaType)) {
    throw new Error('Ce message éphémère ne contient pas un média pris en charge.');
  }
  const buffer = await getMediaBuffer(message, media, socket, logger, downloadMedia);
  const sender = message.key.participant || message.key.remoteJid;
  const caption = `Média à vue unique reçu de ${sender}${media.content.caption ? `\n${media.content.caption}` : ''}`;
  if (media.mediaType === 'audio') {
    await socket.sendMessage(destination, { text: caption });
  }
  const payload = {
    [media.mediaType]: buffer,
    ...(media.mediaType === 'audio' ? { ptt: Boolean(media.content.ptt) } : {}),
    ...(media.mediaType !== 'audio' ? {
      mimetype: media.content.mimetype || 'application/octet-stream',
      caption,
    } : {}),
  };
  await socket.sendMessage(destination, payload);
}

export function shouldRecoverDeletedMessage(settings, chatId) {
  if (!settings || typeof settings !== 'object') return false;
  const isGroup = chatId.endsWith('@g.us');
  switch (settings.scope) {
    case 'pm': return !isGroup;
    case 'gm': return isGroup;
    case 'no-pm': return isGroup;
    case 'no-gm': return !isGroup;
    default: return true;
  }
}

export function getRecoveryDestination(settings, chatId, ownerJid) {
  if (settings.destination === 'p') return ownerJid;
  if (settings.destination === 'g') return chatId;
  return settings.destination;
}

export { maxMediaBytes };
