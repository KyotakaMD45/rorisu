import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessageHandler } from '../core/handler.js';
import rori from '../plugins/rori.js';

test('rori enregistre les commandes canoniques pour les membres du groupe', async () => {
  const values = new Map();
  const replies = [];
  const ping = { name: 'ping', async execute() {} };
  const plugins = new Map([
    ['ping', ping],
    ['p', ping],
    ['sticker', { name: 'sticker', async execute() {} }],
    ['rori', rori],
  ]);

  await rori.execute({
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net', admin: 'admin' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    isSudo: false,
    args: ['p', 'sticker', 'ping'],
    plugins,
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  });

  assert.deepEqual(values.get('group:group@g.us:allowed_commands'), ['ping', 'sticker']);
  assert.match(replies[0], /ping[\s\S]*sticker/);
});

test('rori n’autorise pas un membre non administrateur à modifier la liste', async () => {
  const values = new Map();
  const replies = [];
  await rori.execute({
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    isSudo: false,
    args: ['ping'],
    plugins: new Map([['ping', { name: 'ping' }]]),
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  });

  assert.equal(values.has('group:group@g.us:allowed_commands'), false);
  assert.match(replies[0], /administrateurs/);
});

test('rori off retire la restriction configurée par un administrateur', async () => {
  const values = new Map([['group:group@g.us:allowed_commands', ['ping']]]);
  const replies = [];
  await rori.execute({
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net', admin: 'admin' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    isSudo: false,
    args: ['off'],
    plugins: new Map(),
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  });

  assert.equal(values.get('group:group@g.us:allowed_commands'), null);
  assert.match(replies[0], /désactivée/);
});

test('la restriction rori limite les membres et laisse les administrateurs utiliser les commandes', async () => {
  const values = new Map([
    ['group:group@g.us:allowed_commands', ['ping']],
  ]);
  const executed = [];
  const sent = [];
  const plugins = new Map([
    ['ping', { name: 'ping', async execute() { executed.push('ping'); } }],
    ['sticker', { name: 'sticker', async execute() { executed.push('sticker'); } }],
  ]);
  const handler = createMessageHandler({
    plugins,
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
      async increment() {},
    },
    logger: { error() {} },
  });
  const socket = {
    async groupMetadata() {
      return { participants: [
        { id: '33687654321@s.whatsapp.net' },
        { id: '33612345678@s.whatsapp.net', admin: 'admin' },
      ] };
    },
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };
  const commandMessage = (participant, command) => ({
    key: { remoteJid: 'group@g.us', participant, id: command },
    message: { conversation: `.${command}` },
  });

  await handler({
    type: 'notify',
    messages: [
      commandMessage('33687654321@s.whatsapp.net', 'ping'),
      commandMessage('33687654321@s.whatsapp.net', 'sticker'),
      commandMessage('33612345678@s.whatsapp.net', 'sticker'),
    ],
  }, socket);

  assert.deepEqual(executed, ['ping', 'sticker']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.text, /n’est pas autorisée/);
});
