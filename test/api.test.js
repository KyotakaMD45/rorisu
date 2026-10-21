import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApiServer } from '../core/api.js';
import { createMessageHandler } from '../core/handler.js';

const apiKey = 'test-api-key-with-enough-entropy';
const logger = {
  error() {},
  info() {},
};

test('l’API authentifie les appels, liste la session et envoie un message texte', async () => {
  const sent = [];
  const api = createApiServer({
    config: {
      apiKey,
      apiPort: 0,
      apiWebhookUrl: '',
      botName: 'RORISU',
    },
    logger,
  });
  const address = await api.listen({ port: 0, host: '127.0.0.1' });
  api.setSocket({
    user: { id: '33612345678:4@s.whatsapp.net' },
    async sendMessage(to, content) {
      sent.push({ to, content });
      return { key: { id: 'sent-message-id' } };
    },
  });

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const unauthorized = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(unauthorized.status, 401);

    const sessions = await fetch(`${baseUrl}/api/sessions`, {
      headers: { 'x-api-key': apiKey },
    });
    assert.deepEqual(await sessions.json(), {
      count: 1,
      sessions: [{
        id: '0',
        name: 'RORISU',
        connected: true,
        number: '33612345678',
      }],
    });

    const response = await fetch(`${baseUrl}/api/send`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: '33612345678',
        type: 'text',
        text: 'Bonjour',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 200, id: 'sent-message-id' });
    assert.deepEqual(sent, [{
      to: '33612345678@s.whatsapp.net',
      content: { text: 'Bonjour' },
    }]);
  } finally {
    await api.close();
  }
});

test('l’API rejette les destinataires invalides et les médias non pris en charge', async () => {
  const api = createApiServer({ config: { apiKey, apiPort: 0, apiWebhookUrl: '', botName: 'RORISU' }, logger });
  const address = await api.listen({ port: 0, host: '127.0.0.1' });
  api.setSocket({ user: { id: '33612345678@s.whatsapp.net' }, async sendMessage() {} });

  try {
    const request = (body) => fetch(`http://127.0.0.1:${address.port}/api/send`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    assert.equal((await request({ to: 'localhost', type: 'text', text: 'x' })).status, 400);
    assert.equal((await request({ to: '33612345678', type: 'image', text: 'x' })).status, 400);
    assert.equal((await request({ to: '33612345678', type: 'text', text: 'x', session: '1' })).status, 404);
  } finally {
    await api.close();
  }
});

test('le webhook transmet les messages entrants avec la clé API', async () => {
  let received;
  const webhook = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    response.writeHead(204).end();
  });
  await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
  const address = webhook.address();
  const api = createApiServer({
    config: {
      apiKey,
      apiPort: 0,
      apiWebhookUrl: `http://127.0.0.1:${address.port}/messages`,
      botName: 'RORISU',
    },
    logger,
  });

  try {
    await api.handleIncoming({
      message: {
        key: {
          id: 'incoming-message-id',
          remoteJid: '33612345678@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Alice',
        messageTimestamp: 1_700_000_000,
        message: { conversation: 'Bonjour' },
      },
    });
    assert.equal(received.headers['x-api-key'], apiKey);
    assert.deepEqual(received.body, {
      session: '0',
      id: 'incoming-message-id',
      from: '33612345678@s.whatsapp.net',
      sender: '33612345678@s.whatsapp.net',
      pushName: 'Alice',
      isGroup: false,
      timestamp: 1_700_000_000,
      type: 'text',
      text: 'Bonjour',
      quoted: null,
    });
  } finally {
    await api.close();
    await new Promise((resolve, reject) => {
      webhook.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('le mode API only transmet les messages mais n’exécute pas les commandes', async () => {
  let executed = false;
  let forwarded = 0;
  const handler = createMessageHandler({
    plugins: new Map([['ping', { name: 'ping', async execute() { executed = true; } }]]),
    config: { apiMode: 'only', prefixes: ['.'], sudoNumbers: [] },
    storage: { async increment() {} },
    logger,
    onIncoming() { forwarded += 1; },
  });

  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: '33612345678@s.whatsapp.net', id: 'incoming' },
      message: { conversation: '.ping' },
    }],
  }, {}, {});

  assert.equal(forwarded, 1);
  assert.equal(executed, false);
});
