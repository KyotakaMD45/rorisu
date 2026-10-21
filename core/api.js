import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMessageText, unwrapMessage } from './handler.js';

const maximumBodySize = 1024 * 1024;
const maximumTextLength = 65_536;
const maximumCachedMediaSize = 15 * 1024 * 1024;
const maximumOutboundMediaSize = 20 * 1024 * 1024;
const maximumCacheSize = 50 * 1024 * 1024;
const maximumCacheEntries = 100;
const mediaCacheLifetime = 10 * 60 * 1000;

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function isAuthorized(request, apiKey) {
  const provided = request.headers['x-api-key'];
  if (typeof provided !== 'string') return false;

  const expectedBytes = Buffer.from(apiKey);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodySize) {
      throw new ApiError(413, 'Le corps de la requête est trop volumineux.');
    }
    chunks.push(chunk);
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('La requête doit contenir un objet JSON.');
    }
    return parsed;
  } catch (error) {
    throw new ApiError(400, `JSON invalide : ${error.message}`);
  }
}

function normalizeTarget(target) {
  if (typeof target !== 'string') return null;
  const trimmed = target.trim();
  if (/^\d{6,15}$/.test(trimmed)) return `${trimmed}@s.whatsapp.net`;
  if (/^\d{6,15}(?::\d+)?@s\.whatsapp\.net$/.test(trimmed)) return trimmed;
  if (/^\d{1,20}-\d{1,20}@g\.us$/.test(trimmed)) return trimmed;
  return null;
}

function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    const [first, second, third] = address.split('.').map(Number);
    return first !== 0
      && first !== 10
      && first !== 127
      && !(first === 100 && second >= 64 && second <= 127)
      && !(first === 169 && second === 254)
      && !(first === 172 && second >= 16 && second <= 31)
      && !(first === 192 && second === 0 && third === 0)
      && !(first === 192 && second === 0 && third === 2)
      && !(first === 192 && second === 168)
      && !(first === 198 && (second === 18 || second === 19))
      && !(first === 198 && second === 51 && third === 100)
      && !(first === 203 && second === 0 && third === 113)
      && first < 224;
  }
  if (!net.isIPv6(address)) return false;

  const firstHextet = Number.parseInt(address.split(':')[0] || '0', 16);
  if (firstHextet < 0x2000 || firstHextet >= 0x4000) return false;
  return !/^2001:(?:0|2|10|db8)(?::|$)/i.test(address);
}

async function fetchPublicMedia(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    throw new ApiError(400, 'URL du média invalide.');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'URL du média invalide.');
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || (url.port && !['80', '443'].includes(url.port))) {
    throw new ApiError(400, 'Seules les URL HTTP(S) publiques sur les ports 80 et 443 sont acceptées.');
  }

  let addresses;
  try {
    addresses = net.isIP(url.hostname)
      ? [{ address: url.hostname, family: net.isIP(url.hostname) }]
      : await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new ApiError(400, 'Le nom de domaine du média ne peut pas être résolu.');
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ApiError(400, 'Les adresses privées et réservées ne sont pas autorisées.');
  }

  const address = addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'GET',
      agent: false,
      lookup(hostname, options, callback) {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        if (options?.all) {
          callback(null, [{ address: address.address, family: address.family }]);
        } else {
          callback(null, address.address, address.family);
        }
      },
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      headers: { accept: 'image/*,video/*,audio/*,application/*' },
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new ApiError(400, 'Le serveur du média a refusé le téléchargement.'));
        return;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maximumOutboundMediaSize) {
        response.destroy();
        reject(new ApiError(413, 'Le média dépasse la limite de 20 Mo.'));
        return;
      }

      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maximumOutboundMediaSize) {
          response.destroy(new ApiError(413, 'Le média dépasse la limite de 20 Mo.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          mimetype: String(response.headers['content-type'] || 'application/octet-stream')
            .split(';', 1)[0]
            .trim(),
        });
      });
      response.on('error', reject);
    });
    request.setTimeout(15_000, () => request.destroy(new Error('Délai de téléchargement du média dépassé.')));
    request.on('error', reject);
    request.end();
  });
}

function messageType(message) {
  const content = unwrapMessage(message);
  for (const [key, type] of [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
    ['stickerMessage', 'sticker'],
  ]) {
    if (content[key]) return type;
  }
  if (getMessageText(message)) return 'text';
  return 'unknown';
}

function mediaDetails(message) {
  const content = unwrapMessage(message);
  for (const [key, type] of [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
    ['stickerMessage', 'sticker'],
  ]) {
    const media = content[key];
    if (media) {
      return {
        type,
        mimetype: media.mimetype || 'application/octet-stream',
        fileName: typeof media.fileName === 'string' ? media.fileName : undefined,
      };
    }
  }
  return null;
}

export function createApiServer({
  config,
  logger,
  downloadMedia = downloadMediaMessage,
  fetchMedia = fetchPublicMedia,
}) {
  if (!config.apiKey) {
    throw new Error('API_KEY est obligatoire lorsque API_MODE est activé.');
  }

  const sockets = new Map();
  const mediaCache = new Map();
  const receivedMessages = new Map();
  let cachedMediaBytes = 0;

  function removeCachedMedia(key) {
    const entry = mediaCache.get(key);
    if (!entry) return;
    cachedMediaBytes -= entry.buffer.length;
    mediaCache.delete(key);
  }

  function pruneReceivedMessages() {
    const now = Date.now();
    for (const [key, entry] of receivedMessages) {
      if (entry.expiresAt <= now) receivedMessages.delete(key);
    }
    while (receivedMessages.size > maximumCacheEntries) {
      receivedMessages.delete(receivedMessages.keys().next().value);
    }
  }

  function pruneMediaCache() {
    const now = Date.now();
    for (const [key, entry] of mediaCache) {
      if (entry.expiresAt <= now) removeCachedMedia(key);
    }
  }

  const server = createServer(async (request, response) => {
    if (!isAuthorized(request, config.apiKey)) {
      sendJson(response, 401, { error: 'Authentification requise.' });
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');
    const mediaRoute = /^\/api\/media\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (request.method === 'GET' && mediaRoute) {
      let sessionId;
      let messageId;
      try {
        sessionId = decodeURIComponent(mediaRoute[1]);
        messageId = decodeURIComponent(mediaRoute[2]);
      } catch {
        sendJson(response, 400, { error: 'Identifiant de média invalide.' });
        return;
      }
      if (!config.sessionIds.includes(sessionId) || !messageId || messageId.length > 200) {
        sendJson(response, 404, { error: 'Média introuvable.' });
        return;
      }
      pruneMediaCache();
      const cached = mediaCache.get(`${sessionId}:${messageId}`);
      if (!cached) {
        sendJson(response, 404, { error: 'Média introuvable ou expiré.' });
        return;
      }
      response.writeHead(200, {
        'content-type': cached.mimetype,
        'content-length': cached.buffer.length,
        'content-disposition': 'attachment',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(cached.buffer);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      const sessions = config.sessionIds.map((id) => {
        const jid = sockets.get(id)?.user?.id || null;
        return {
          id,
          name: id,
          connected: Boolean(jid),
          number: jid ? jid.split('@')[0].split(':')[0] : null,
        };
      });
      sendJson(response, 200, {
        count: sessions.length,
        sessions,
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/send') {
      try {
        const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json') {
          throw new ApiError(415, 'Le type de contenu doit être application/json.');
        }
        const body = await readJson(request);
        const target = normalizeTarget(body.to);
        if (!target) throw new ApiError(400, 'Destinataire WhatsApp invalide.');
        const sessionId = body.session ?? config.sessionIds[0];
        if (typeof sessionId !== 'string' || !config.sessionIds.includes(sessionId)) {
          throw new ApiError(404, 'Session inconnue.');
        }
        const socket = sockets.get(sessionId);
        if (!socket?.user) {
          throw new ApiError(503, 'La session WhatsApp n’est pas connectée.');
        }

        if (body.text !== undefined
          && (typeof body.text !== 'string' || body.text.length > maximumTextLength)) {
          throw new ApiError(400, 'Le texte doit être une chaîne de 65 536 caractères maximum.');
        }
        let content;
        if (body.type === 'text') {
          if (typeof body.text !== 'string' || !body.text.trim()) {
            throw new ApiError(400, 'Le texte du message ne peut pas être vide.');
          }
          content = { text: body.text };
        } else if (['image', 'video', 'audio', 'document'].includes(body.type)) {
          if (typeof body.url !== 'string') {
            throw new ApiError(400, 'Le champ url est obligatoire pour envoyer un média.');
          }
          const media = await fetchMedia(body.url);
          const expectedType = body.type === 'document' ? null : `${body.type}/`;
          if (expectedType && !media.mimetype.toLowerCase().startsWith(expectedType)) {
            throw new ApiError(415, `Le type du média téléchargé ne correspond pas à ${body.type}.`);
          }
          if (body.fileName !== undefined
            && (typeof body.fileName !== 'string'
              || body.fileName.length > 255
              || /[\u0000-\u001f\u007f]/.test(body.fileName))) {
            throw new ApiError(400, 'Le nom de fichier est invalide.');
          }
          if (body.mimetype !== undefined
            && (typeof body.mimetype !== 'string'
              || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(body.mimetype))) {
            throw new ApiError(400, 'Le type MIME est invalide.');
          }
          const caption = body.text || '';
          if (typeof body.text !== 'undefined'
            && (typeof body.text !== 'string' || body.text.length > maximumTextLength)) {
            throw new ApiError(400, 'La légende doit être une chaîne de 65 536 caractères maximum.');
          }
          const mimetype = body.mimetype || media.mimetype;
          if (body.type === 'image') content = { image: media.buffer, caption, mimetype };
          else if (body.type === 'video') content = { video: media.buffer, caption, mimetype };
          else if (body.type === 'audio') {
            if (body.ptt !== undefined && typeof body.ptt !== 'boolean') {
              throw new ApiError(400, 'ptt doit être un booléen.');
            }
            content = { audio: media.buffer, mimetype, ptt: body.ptt === true };
          } else {
            content = {
              document: media.buffer,
              mimetype,
              fileName: body.fileName || 'document',
              caption,
            };
          }
        } else {
          throw new ApiError(400, 'type doit être text, image, video, audio ou document.');
        }

        let options;
        if (body.quoted !== undefined) {
          if (typeof body.quoted !== 'string' || !body.quoted || body.quoted.length > 200) {
            throw new ApiError(400, 'Identifiant de message cité invalide.');
          }
          pruneReceivedMessages();
          const quoted = receivedMessages.get(`${sessionId}:${target}:${body.quoted}`);
          if (!quoted) throw new ApiError(404, 'Message cité introuvable ou expiré.');
          options = { quoted: quoted.message };
        }

        const sent = await socket.sendMessage(target, content, options);
        sendJson(response, 200, { status: 200, id: sent?.key?.id || null });
        return;
      } catch (error) {
        if (!(error instanceof ApiError)) {
          logger.error({ err: error }, 'Échec de l’envoi d’un message via l’API.');
        }
        const statusCode = error instanceof ApiError ? error.statusCode : 502;
        const message = error instanceof ApiError
          ? error.message
          : 'Échec de l’envoi WhatsApp.';
        sendJson(response, statusCode, { error: message });
        return;
      }
    }

    sendJson(response, 404, { error: 'Route API introuvable.' });
  });

  return {
    setSocket(sessionId, value) {
      if (!config.sessionIds.includes(sessionId)) {
        throw new Error(`Session API inconnue : ${sessionId}`);
      }
      sockets.set(sessionId, value);
    },
    async listen({ port = config.apiPort, host = '0.0.0.0' } = {}) {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      logger.info({ address: server.address() }, 'API HTTP démarrée.');
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    async handleIncoming({ message, sessionId, socket }) {
      if (message.key?.fromMe || !message.key?.id) return;
      const chatId = message.key.remoteJid;
      const from = message.key.participant || chatId;
      if (!chatId || !from || chatId === 'status@broadcast') return;
      pruneReceivedMessages();
      receivedMessages.set(`${sessionId}:${chatId}:${message.key.id}`, {
        message,
        expiresAt: Date.now() + mediaCacheLifetime,
      });
      if (!config.apiWebhookUrl) return;
      const content = unwrapMessage(message);
      const contextInfo = content.extendedTextMessage?.contextInfo
        || content.imageMessage?.contextInfo
        || content.videoMessage?.contextInfo
        || content.documentMessage?.contextInfo
        || {};
      const details = mediaDetails(message);
      let cachedMedia;
      if (details && socket) {
        try {
          const buffer = await downloadMedia(message, 'buffer', {}, {
            logger,
            reuploadRequest: socket.updateMediaMessage,
          });
          if (Buffer.isBuffer(buffer) && buffer.length <= maximumCachedMediaSize) {
            pruneMediaCache();
            const key = `${sessionId}:${message.key.id}`;
            removeCachedMedia(key);
            while (mediaCache.size >= maximumCacheEntries
              || cachedMediaBytes + buffer.length > maximumCacheSize) {
              const oldestKey = mediaCache.keys().next().value;
              if (oldestKey === undefined) break;
              removeCachedMedia(oldestKey);
            }
            if (buffer.length <= maximumCacheSize) {
              mediaCache.set(key, {
                buffer,
                mimetype: details.mimetype,
                expiresAt: Date.now() + mediaCacheLifetime,
              });
              cachedMediaBytes += buffer.length;
              const publicUrl = config.apiPublicUrl || `http://localhost:${config.apiPort}`;
              cachedMedia = {
                ...details,
                url: `${publicUrl}/api/media/${encodeURIComponent(sessionId)}/${encodeURIComponent(message.key.id)}`,
              };
            }
          } else {
            logger.warn({ size: Buffer.isBuffer(buffer) ? buffer.length : null }, 'Le média entrant dépasse la limite de cache de l’API.');
          }
        } catch (error) {
          logger.error({ err: error }, 'Impossible de mettre en cache le média entrant pour l’API.');
        }
      }

      const payload = {
        session: sessionId,
        id: message.key.id,
        from: chatId,
        sender: from,
        pushName: message.pushName || '',
        isGroup: chatId.endsWith('@g.us'),
        timestamp: Number(message.messageTimestamp) || Math.floor(Date.now() / 1000),
        type: messageType(message),
        text: getMessageText(message),
        ...(cachedMedia ? { media: cachedMedia } : {}),
        quoted: contextInfo.stanzaId || null,
      };

      try {
        const response = await fetch(config.apiWebhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        });
        if (!response.ok) {
          logger.error(
            { status: response.status },
            'Le webhook configuré a répondu avec une erreur HTTP.',
          );
        }
        await response.body?.cancel();
      } catch (error) {
        logger.error({ err: error }, 'Échec de l’envoi du webhook entrant.');
      }
    },
  };
}
