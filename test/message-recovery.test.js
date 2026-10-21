import assert from 'node:assert/strict';
import test from 'node:test';
import { WAMessageStubType } from '@whiskeysockets/baileys';
import { createMessageHandler } from '../core/handler.js';
import {
  isViewOnceMessage,
  shouldRecoverDeletedMessage,
} from '../core/message-recovery.js';
import deletePlugin from '../plugins/delete.js';
import antiVvPlugin from '../plugins/antivv.js';
import vvPlugin from '../plugins/vv.js';

test('delete configure la récupération des messages supprimés et accepte les filtres Levanter', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    args: ['p', 'no-gm'],
    text: '.delete p no-gm',
    config: { prefixes: ['.'] },
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await deletePlugin.execute(context);

  assert.deepEqual(values.get('feature:anti_delete'), {
    destination: 'p',
    scope: 'no-gm',
  });
  assert.match(replies[0], /propriétaire en privé/);
});

test('la configuration anti-suppression est réservée au propriétaire et peut être désactivée', async () => {
  const values = new Map([['feature:anti_delete', { destination: 'g', scope: null }]]);
  const replies = [];
  const context = {
    args: ['off'],
    text: '.antidelete off',
    config: { prefixes: ['.'] },
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await deletePlugin.execute(context);
  assert.equal(values.get('feature:anti_delete'), null);

  let changed = false;
  await deletePlugin.execute({
    ...context,
    args: ['g'],
    isSudo: false,
    storage: { async set() { changed = true; } },
  });
  assert.equal(changed, false);
  assert.match(replies[1], /réservée au propriétaire/);
});

test('antivv active et désactive le transfert automatique vers le propriétaire', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    args: ['on'],
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await antiVvPlugin.execute(context);
  assert.equal(values.get('feature:anti_vv'), true);
  await antiVvPlugin.execute({ ...context, args: ['off'] });
  assert.equal(values.get('feature:anti_vv'), false);
  assert.match(replies[0], /transférés au propriétaire/);
});

test('vv exige une réponse à un média à vue unique', async () => {
  const replies = [];
  await vvPlugin.execute({
    quotedMessage: { key: { id: 'regular' }, message: { conversation: 'texte ordinaire' } },
    async sendReply(text) { replies.push(text); },
  });
  assert.match(replies[0], /vue unique/);
});

test('la détection de vue unique et les filtres de destination fonctionnent', () => {
  assert.equal(isViewOnceMessage({
    message: { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: {} } } } } },
  }), true);
  assert.equal(isViewOnceMessage({ message: { imageMessage: {} } }), false);
  assert.equal(shouldRecoverDeletedMessage({ scope: 'gm' }, 'g-1@g.us'), true);
  assert.equal(shouldRecoverDeletedMessage({ scope: 'gm' }, '12345@s.whatsapp.net'), false);
  assert.equal(shouldRecoverDeletedMessage({ scope: 'no-pm' }, '12345@s.whatsapp.net'), false);
});

test('anti-suppression retransmet le texte reçu avant sa révocation vers le propriétaire', async () => {
  const values = new Map([
    ['feature:anti_delete', { destination: 'p', scope: null }],
  ]);
  const sent = [];
  const handler = createMessageHandler({
    plugins: new Map(),
    config: { prefixes: ['.'], sudoNumbers: ['33612345678'] },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
      async increment() {},
    },
    logger: { error() {} },
  });
  const socket = {
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };
  const original = {
    key: {
      remoteJid: '12345@s.whatsapp.net',
      participant: '12345@s.whatsapp.net',
      id: 'message-to-revoke',
      fromMe: false,
    },
    message: { conversation: 'Message récupérable' },
  };

  await handler({ type: 'notify', messages: [original] }, socket);
  await handler.handleMessageUpdate([{
    key: original.key,
    update: {
      messageStubType: WAMessageStubType.REVOKE,
      key: { remoteJid: original.key.remoteJid, id: 'revoke-event' },
    },
  }], socket);

  assert.equal(sent[0].chatId, '33612345678@s.whatsapp.net');
  assert.match(sent[0].content.text, /Message supprimé/);
  assert.match(sent[0].content.text, /Message récupérable/);
});
