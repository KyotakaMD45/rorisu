import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { getMessageText, unwrapMessage } from './handler.js';

const maximumBodySize = 1024 * 1024;
const maximumTextLength = 65_536;

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

export function createApiServer({ config, logger }) {
  if (!config.apiKey) {
    throw new Error('API_KEY est obligatoire lorsque API_MODE est activé.');
  }

  let socket;
  const server = createServer(async (request, response) => {
    if (!isAuthorized(request, config.apiKey)) {
      sendJson(response, 401, { error: 'Authentification requise.' });
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      const jid = socket?.user?.id || null;
      sendJson(response, 200, {
        count: 1,
        sessions: [{
          id: '0',
          name: config.botName,
          connected: Boolean(socket?.user),
          number: jid ? jid.split('@')[0].split(':')[0] : null,
        }],
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
        if ((body.session ?? '0') !== '0') {
          throw new ApiError(404, 'Session inconnue.');
        }
        if (body.type !== 'text' || typeof body.text !== 'string' || !body.text.trim()) {
          throw new ApiError(400, 'Seuls les messages texte non vides sont pris en charge.');
        }
        if (body.text.length > maximumTextLength) {
          throw new ApiError(413, 'Le texte dépasse la limite autorisée.');
        }
        if (!socket?.user) {
          throw new ApiError(503, 'La session WhatsApp n’est pas connectée.');
        }

        const sent = await socket.sendMessage(target, { text: body.text });
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
    setSocket(value) {
      socket = value;
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
    async handleIncoming({ message }) {
      if (!config.apiWebhookUrl || message.key?.fromMe || !message.key?.id) return;
      const chatId = message.key.remoteJid;
      const from = message.key.participant || chatId;
      if (!chatId || !from || chatId === 'status@broadcast') return;
      const content = unwrapMessage(message);
      const contextInfo = content.extendedTextMessage?.contextInfo
        || content.imageMessage?.contextInfo
        || content.videoMessage?.contextInfo
        || content.documentMessage?.contextInfo
        || {};

      const payload = {
        session: '0',
        id: message.key.id,
        from: chatId,
        sender: from,
        pushName: message.pushName || '',
        isGroup: chatId.endsWith('@g.us'),
        timestamp: Number(message.messageTimestamp) || Math.floor(Date.now() / 1000),
        type: messageType(message),
        text: getMessageText(message),
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
