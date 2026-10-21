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

function apiConfig(overrides = {}) {
  return {
    apiKey,
    apiPort: 0,
    apiWebhookUrl: '',
    apiPublicUrl: '',
    botName: 'RORISU',
    sessionIds: ['0'],
    ...overrides,
  };
}

test('l’API authentifie les appels, liste la session et envoie un message texte', async () => {
  const sent = [];
  const api = createApiServer({
    config: apiConfig(),
    logger,
  });
  const address = await api.listen({ port: 0, host: '127.0.0.1' });
  api.setSocket('0', {
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
        name: '0',
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
  const api = createApiServer({ config: apiConfig(), logger });
  const address = await api.listen({ port: 0, host: '127.0.0.1' });
  api.setSocket('0', { user: { id: '33612345678@s.whatsapp.net' }, async sendMessage() {} });

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

test('l’API envoie des médias avec URL publique validée et refuse les URL locales', async () => {
  const sent = [];
  const api = createApiServer({
    config: apiConfig(),
    logger,
    async fetchMedia(url) {
      assert.equal(url, 'https://media.example/image.jpg');
      return { buffer: Buffer.from('image-bytes'), mimetype: 'image/jpeg' };
    },
  });
  const address = await api.listen({ port: 0, host: '127.0.0.1' });
  api.setSocket('0', {
    user: { id: '33612345678@s.whatsapp.net' },
    async sendMessage(to, content) {
      sent.push({ to, content });
      return { key: { id: 'image-message-id' } };
    },
  });

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const headers = {
      'x-api-key': apiKey,
      'content-type': 'application/json',
    };
    const mediaResponse = await fetch(`${baseUrl}/api/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: '33612345678',
        type: 'image',
        url: 'https://media.example/image.jpg',
        text: 'Légende',
      }),
    });
    assert.equal(mediaResponse.status, 200);
    assert.deepEqual(sent[0], {
      to: '33612345678@s.whatsapp.net',
      content: {
        image: Buffer.from('image-bytes'),
        caption: 'Légende',
        mimetype: 'image/jpeg',
      },
    });

    assert.equal(sent.length, 1);
  } finally {
    await api.close();
  }

  const guardedApi = createApiServer({ config: apiConfig(), logger });
  const guardedAddress = await guardedApi.listen({ port: 0, host: '127.0.0.1' });
  guardedApi.setSocket('0', {
    user: { id: '33612345678@s.whatsapp.net' },
    async sendMessage() {
      throw new Error('A private network URL must never be fetched.');
    },
  });
  try {
    const localUrl = await fetch(`http://127.0.0.1:${guardedAddress.port}/api/send`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: '33612345678',
        type: 'image',
        url: 'http://127.0.0.1/private.png',
      }),
    });
    assert.equal(localUrl.status, 400);
  } finally {
    await guardedApi.close();
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
    config: apiConfig({ apiWebhookUrl: `http://127.0.0.1:${address.port}/messages` }),
    logger,
  });

  try {
    await api.handleIncoming({
      sessionId: '0',
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

    test('le webhook expose les médias reçus en cache et conserve le contexte cité', async () => {
      const received = [];
      const webhook = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        received.push({
          headers: request.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
        response.writeHead(204).end();
      });
      await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
      const webhookAddress = webhook.address();
      const mediaBytes = Buffer.from('received image data');
      const sent = [];
      const api = createApiServer({
        config: apiConfig({
          apiPublicUrl: 'https://bot.example.com',
          apiWebhookUrl: `http://127.0.0.1:${webhookAddress.port}/messages`,
        }),
        logger,
        async downloadMedia(message, format, options, socketOptions) {
          assert.equal(format, 'buffer');
          assert.equal(message.key.id, 'incoming-image-id');
          assert.ok(socketOptions.logger);
          return mediaBytes;
        },
      });

      try {
        const address = await api.listen({ port: 0, host: '127.0.0.1' });
        api.setSocket('0', {
          user: { id: '33612345678@s.whatsapp.net' },
          async sendMessage(to, content, options) {
            sent.push({ to, content, options });
            return { key: { id: 'quoted-reply-id' } };
          },
        });
        const incomingMessage = {
          key: {
            id: 'incoming-image-id',
            remoteJid: '33612345678@s.whatsapp.net',
            fromMe: false,
          },
          pushName: 'Alice',
          message: {
            imageMessage: {
              mimetype: 'image/jpeg',
              contextInfo: { stanzaId: 'quoted-message-id' },
            },
          },
        };
        await api.handleIncoming({
          message: incomingMessage,
          sessionId: '0',
          socket: { updateMediaMessage() {} },
        });

        assert.deepEqual(received[0].body.media, {
          type: 'image',
          mimetype: 'image/jpeg',
          url: 'https://bot.example.com/api/media/0/incoming-image-id',
        });
        assert.equal(received[0].body.quoted, 'quoted-message-id');
        assert.equal(received[0].headers['x-api-key'], apiKey);

        const mediaResponse = await fetch(
          `http://127.0.0.1:${address.port}/api/media/0/incoming-image-id`,
          { headers: { 'x-api-key': apiKey } },
        );
        assert.equal(mediaResponse.status, 200);
        assert.equal(mediaResponse.headers.get('content-type'), 'image/jpeg');
        assert.deepEqual(Buffer.from(await mediaResponse.arrayBuffer()), mediaBytes);

        const quotedResponse = await fetch(`http://127.0.0.1:${address.port}/api/send`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            to: '33612345678',
            type: 'text',
            text: 'Réponse',
            quoted: 'incoming-image-id',
          }),
        });
        assert.equal(quotedResponse.status, 200);
        assert.equal(sent[0].options.quoted, incomingMessage);
      } finally {
        await api.close();
        await new Promise((resolve, reject) => {
          webhook.close((error) => (error ? reject(error) : resolve()));
        });
      }
    });

    test('l’API route les envois vers la session choisie', async () => {
      const sent = [];
      const api = createApiServer({
        config: apiConfig({ sessionIds: ['primary', 'secondary'] }),
        logger,
      });
      const address = await api.listen({ port: 0, host: '127.0.0.1' });
      api.setSocket('primary', {
        user: { id: '33612345678@s.whatsapp.net' },
        async sendMessage() {
          throw new Error('L’envoi doit être routé vers la session demandée.');
        },
      });
      api.setSocket('secondary', {
        user: { id: '33687654321@s.whatsapp.net' },
        async sendMessage(to, content) {
          sent.push({ to, content });
          return { key: { id: 'secondary-message-id' } };
        },
      });

      try {
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const sessionList = await fetch(`${baseUrl}/api/sessions`, {
          headers: { 'x-api-key': apiKey },
        });
        assert.deepEqual((await sessionList.json()).sessions.map(({ id, number }) => [id, number]), [
          ['primary', '33612345678'],
          ['secondary', '33687654321'],
        ]);

        const response = await fetch(`${baseUrl}/api/send`, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            session: 'secondary',
            to: '33600000000',
            type: 'text',
            text: 'Bonjour',
          }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 200, id: 'secondary-message-id' });
        assert.deepEqual(sent, [{
          to: '33600000000@s.whatsapp.net',
          content: { text: 'Bonjour' },
        }]);
      } finally {
        await api.close();
      }
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

test('l’API ne met pas en cache et ne transmet pas les médias à vue unique', async () => {
  let webhookCalls = 0;
  let downloaded = false;
  const webhook = createServer((_request, response) => {
    webhookCalls += 1;
    response.writeHead(204).end();
  });
  await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
  const webhookAddress = webhook.address();
  const api = createApiServer({
    config: apiConfig({
      apiPublicUrl: 'https://bot.example.com',
      apiWebhookUrl: `http://127.0.0.1:${webhookAddress.port}/messages`,
    }),
    logger,
    async downloadMedia() {
      downloaded = true;
      return Buffer.from('private media');
    },
  });

  try {
    const address = await api.listen({ port: 0, host: '127.0.0.1' });
    api.setSocket('0', {
      user: { id: '33612345678@s.whatsapp.net' },
      async sendMessage() { return { key: { id: 'sent' } }; },
    });
    await api.handleIncoming({
      sessionId: '0',
      socket: { updateMediaMessage() {} },
      message: {
        key: {
          id: 'view-once-image',
          remoteJid: '33687654321@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          viewOnceMessageV2: {
            message: { imageMessage: { mimetype: 'image/jpeg' } },
          },
        },
      },
    });

    assert.equal(webhookCalls, 0);
    assert.equal(downloaded, false);

    const mediaResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/media/0/view-once-image`,
      { headers: { 'x-api-key': apiKey } },
    );
    assert.equal(mediaResponse.status, 404);

    const quotedResponse = await fetch(`http://127.0.0.1:${address.port}/api/send`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: '33687654321',
        type: 'text',
        text: 'Réponse',
        quoted: 'view-once-image',
      }),
    });
    assert.equal(quotedResponse.status, 404);
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
