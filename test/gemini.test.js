import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiClient, GeminiError } from '../core/gemini.js';
import geminiPlugin from '../plugins/gemini.js';

test('Gemini envoie le contexte et les médias via generateContent', async () => {
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

  assert.equal(requestUrl.pathname, '/v1beta/models/gemini-2.5-flash:generateContent');
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
    /GEMINI_API_KEY/,
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
