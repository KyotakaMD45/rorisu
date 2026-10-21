import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiClient, GeminiError } from '../core/gemini.js';
import geminiPlugin from '../plugins/gemini.js';
import imagePlugin from '../plugins/image.js';

test('Gemini envoie le contexte et les médias via le flux streamGenerateContent', async () => {
  let requestUrl;
  let requestBody;
  const client = createGeminiClient({
    apiKey: 'test-api-key',
    model: 'gemini-2.5-flash',
    systemPrompt: 'Réponds en français.',
    temperature: 0.5,
    maxOutputTokens: 512,
    timeoutMs: 5000,
    async fetchImpl(url, options) {
      requestUrl = new URL(url);
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { text: 'Voici la réponse.' },
              { inlineData: { mimeType: 'image/png', data: Buffer.from('generated').toString('base64') } },
              { inlineData: { mimeType: 'audio/ogg', data: Buffer.from('spoken').toString('base64') } },
            ],
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await client.generate({
    prompt: 'Analyse cette image.',
    history: [{ role: 'user', parts: [{ text: 'Question précédente' }] }],
    media: [{ mimeType: 'image/jpeg', buffer: Buffer.from('input-image') }],
  });

  assert.equal(requestUrl.pathname, '/v1beta/models/gemini-2.5-flash:streamGenerateContent');
  assert.equal(requestUrl.searchParams.get('alt'), 'sse');
  assert.equal(requestUrl.searchParams.get('key'), 'test-api-key');
  assert.deepEqual(requestBody.contents[0], { role: 'user', parts: [{ text: 'Question précédente' }] });
  assert.equal(requestBody.contents[1].parts[1].inlineData.mimeType, 'image/jpeg');
  assert.equal(
    Buffer.from(requestBody.contents[1].parts[1].inlineData.data, 'base64').toString(),
    'input-image',
  );
  assert.equal(requestBody.generationConfig.temperature, 0.5);
  assert.deepEqual(requestBody.systemInstruction, { parts: [{ text: 'Réponds en français.' }] });
  assert.equal(result.text, 'Voici la réponse.');
  assert.equal(result.images[0].buffer.toString(), 'generated');
  assert.equal(result.audios[0].buffer.toString(), 'spoken');
});

test('la commande image sélectionne le modèle d’image et demande une sortie visuelle', async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestUrl = new URL(url);
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('image-data').toString('base64') } }],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const sent = [];

  try {
    await imagePlugin.execute({
      args: ['Un', 'chat', 'astronaute', 'sur', 'la', 'lune'],
      message: { message: { conversation: '.image Un chat astronaute sur la lune' } },
      quotedMessage: null,
      config: {
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-3.8-flash',
          imageModel: 'gemini-3.1-flash-image',
          systemPrompt: 'Prompt test.',
          temperature: 0.7,
          maxOutputTokens: 1024,
          timeoutMs: 5000,
          contextTurns: 4,
          maxMediaBytes: 1024,
        },
      },
      storage: { async get() { return null; }, async set() {} },
      chatId: 'chat-1',
      senderNumber: '33612345678',
      socket: {
        async sendMessage(chatId, payload) { sent.push({ chatId, payload }); },
      },
      logger: { error(error) { throw error; } },
      async sendReply(text) { sent.push({ text }); },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requestUrl.pathname, '/v1beta/models/gemini-3.1-flash-image:streamGenerateContent');
  assert.deepEqual(requestBody.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.match(requestBody.contents[0].parts[0].text, /Un chat astronaute sur la lune/);
  assert.equal(sent[0].chatId, 'chat-1');
  assert.equal(sent[0].payload.image.toString(), 'image-data');
});

test('Gemini transmet les morceaux de texte dès leur arrivée', async () => {
  const received = [];
  const events = [
    { candidates: [{ content: { parts: [{ text: 'Réponse ' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'en direct.' }] } }] },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const client = createGeminiClient({
    apiKey: 'test-api-key',
    model: 'gemini-2.5-flash',
    temperature: 0.5,
    maxOutputTokens: 512,
    timeoutMs: 5000,
    async fetchImpl() {
      return new Response(`${events}data: [DONE]\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const result = await client.generate({
    prompt: 'Bonjour',
    onText(chunk) { received.push(chunk); },
  });

  assert.deepEqual(received, ['Réponse ', 'en direct.']);
  assert.equal(result.text, 'Réponse en direct.');
});

test('la commande Gemini envoie les réponses au fur et à mesure du flux', async () => {
  const previousFetch = globalThis.fetch;
  const replies = [];
  const firstChunk = `${'Cette première partie arrive sans attendre. '.repeat(4)}.`;
  const events = [firstChunk, 'Dernière phrase.']
    .map((text) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`)
    .join('');
  globalThis.fetch = async () => new Response(`${events}data: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

  try {
    await geminiPlugin.execute({
      args: ['Réponds'],
      message: { message: { conversation: '.gemini Réponds' } },
      quotedMessage: null,
      config: {
        gemini: {
          apiKey: 'test-key',
          model: 'gemini-2.5-flash',
          systemPrompt: '',
          temperature: 0.7,
          maxOutputTokens: 512,
          timeoutMs: 5000,
          contextTurns: 0,
          maxMediaBytes: 1024,
        },
        prefixes: ['.'],
      },
      storage: { async get() { return null; }, async set() {} },
      chatId: 'chat-1',
      senderNumber: '33612345678',
      socket: { async sendMessage() {} },
      logger: { error(error) { throw error; } },
      async sendReply(text) { replies.push(text); },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(replies.length, 2);
  assert.match(replies[0], /Cette première partie arrive/);
  assert.equal(replies[1], 'Dernière phrase.');
});

test('Gemini signale une clé absente et les limites API sans exposer la clé', async () => {
  const missingKey = createGeminiClient({
    apiKey: '',
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 1024,
    timeoutMs: 5000,
  });
  await assert.rejects(
    missingKey.generate({ prompt: 'Bonjour' }),
    (error) => error instanceof GeminiError
      && /GEMINI_API_KEY/.test(error.message)
      && error.message.includes('https://aistudio.google.com/apikey'),
  );

  const rateLimited = createGeminiClient({
    apiKey: 'secret-key',
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 1024,
    timeoutMs: 5000,
    async fetchImpl() {
      return new Response('', { status: 429 });
    },
  });
  await assert.rejects(
    rateLimited.generate({ prompt: 'Bonjour' }),
    (error) => error instanceof GeminiError
      && /Quota Gemini atteint/.test(error.message)
      && !error.message.includes('secret-key'),
  );
});

test('la commande Gemini garde un contexte par discussion et permet de l’effacer', async () => {
  const previousFetch = globalThis.fetch;
  const histories = new Map();
  const requests = [];
  const replies = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: `Réponse ${requests.length}` }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const context = {
    args: ['Bonjour'],
    message: { message: { conversation: '.gemini Bonjour' } },
    quotedMessage: null,
    config: {
      gemini: {
        apiKey: 'test-key',
        model: 'gemini-2.5-flash',
        systemPrompt: '',
        temperature: 0.7,
        maxOutputTokens: 1024,
        timeoutMs: 5000,
        contextTurns: 2,
        maxMediaBytes: 1024,
      },
    },
    storage: {
      async get(key) { return histories.get(key) ?? null; },
      async set(key, value) { histories.set(key, value); },
    },
    chatId: 'chat-1',
    senderNumber: '33612345678',
    socket: { async sendMessage() {} },
    logger: { error(error) { throw error; } },
    async sendReply(text) { replies.push(text); },
  };

  try {
    await geminiPlugin.execute(context);
    context.args = ['Et', 'toi', '?'];
    await geminiPlugin.execute(context);

    assert.equal(requests[1].contents.length, 3);
    assert.deepEqual(requests[1].contents[0], { role: 'user', parts: [{ text: 'Bonjour' }] });
    assert.deepEqual(requests[1].contents[1], { role: 'model', parts: [{ text: 'Réponse 1' }] });
    assert.deepEqual(replies, ['Réponse 1', 'Réponse 2']);

    context.args = ['reset'];
    await geminiPlugin.execute(context);
    assert.deepEqual(histories.get('gemini:history:chat-1:33612345678'), []);
    assert.match(replies[2], /effacé/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('la commande Gemini refuse un média qui dépasse sa limite configurée', async () => {
  const replies = [];
  await geminiPlugin.execute({
    args: ['Analyse'],
    message: {
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          fileLength: 2048,
        },
      },
    },
    quotedMessage: null,
    config: { gemini: { maxMediaBytes: 1024 } },
    storage: { async get() { return null; } },
    chatId: 'chat-1',
    senderNumber: '33612345678',
    socket: {},
    logger: { error() {} },
    async sendReply(text) { replies.push(text); },
  });

  assert.deepEqual(replies, ['Le média dépasse la limite configurée de 1 Mo.']);
});
