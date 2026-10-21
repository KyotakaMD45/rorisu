import assert from 'node:assert/strict';
import test from 'node:test';
import { WAMessageStubType } from '@whiskeysockets/baileys';
import { createMessageHandler } from '../core/handler.js';
import {
  forwardViewOnce,
  isViewOnceMessage,
  shouldRecoverDeletedMessage,
} from '../core/message-recovery.js';
import deletePlugin from '../plugins/delete.js';
import antiVvPlugin from '../plugins/antivv.js';
import vvPlugin from '../plugins/vv.js';
import { parseWhatsAppJid } from '../core/group-utils.js';

test('valide les numéros et JID WhatsApp comme destinations', () => {
  assert.equal(parseWhatsAppJid('+33 6 12 34 56 78'), '33612345678@s.whatsapp.net');
  assert.equal(parseWhatsAppJid('123456789-123456@g.us'), '123456789-123456@g.us');
  assert.equal(parseWhatsAppJid('123456789:4@lid'), '123456789:4@lid');
  assert.equal(parseWhatsAppJid('not-a-jid'), null);
});

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

test('anti-suppression accepte un JID personnalisé', async () => {
  const values = new Map();
  await deletePlugin.execute({
    args: ['123456789@g.us'],
    text: '.delete 123456789@g.us',
    config: { prefixes: ['.'] },
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply() {},
  });

  assert.deepEqual(values.get('feature:anti_delete'), {
    destination: '123456789@g.us',
    scope: null,
  });
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
  assert.deepEqual(values.get('feature:anti_vv'), {
    enabled: true,
    destination: 'p',
  });
  await antiVvPlugin.execute({ ...context, args: ['off'] });
  assert.deepEqual(values.get('feature:anti_vv'), {
    enabled: false,
    destination: 'p',
  });
  assert.match(replies[0], /transférés vers le propriétaire/);
});

test('antivv accepte une destination personnalisée et la désactive sans la perdre', async () => {
  const values = new Map();
  const context = {
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply() {},
  };

  await antiVvPlugin.execute({ ...context, args: ['on', '123456789@g.us'] });
  assert.deepEqual(values.get('feature:anti_vv'), {
    enabled: true,
    destination: '123456789@g.us',
  });
  await antiVvPlugin.execute({ ...context, args: ['off'] });
  assert.deepEqual(values.get('feature:anti_vv'), {
    enabled: false,
    destination: '123456789@g.us',
  });
});

test('anti-VV envoie le média vers le JID configuré', async () => {
  const values = new Map([
    ['feature:anti_vv', { enabled: true, destination: '123456789@g.us' }],
  ]);
  const sent = [];
  const handler = createMessageHandler({
    plugins: new Map(),
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
      async increment() {},
    },
    logger: { error() {} },
    async forwardViewOnceMessage({ destination }) {
      sent.push({ chatId: destination });
    },
  });
  const socket = {};

  await handler({ type: 'notify', messages: [{
    key: {
      remoteJid: '987654321@s.whatsapp.net',
      participant: '987654321@s.whatsapp.net',
      id: 'view-once-to-forward',
      fromMe: false,
    },
    message: {
      viewOnceMessageV2: {
        message: { imageMessage: { mimetype: 'image/jpeg', caption: 'test' } },
      },
    },
  }] }, socket);

  assert.equal(sent[0].chatId, '123456789@g.us');
});

test('anti-VV télécharge et transfère le média éphémère reçu', async () => {
  const sent = [];
  const message = {
    key: {
      remoteJid: '987654321@s.whatsapp.net',
      participant: '987654321@s.whatsapp.net',
      id: 'view-once-image',
    },
    message: {
      ephemeralMessage: {
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: {
                mimetype: 'image/jpeg',
                caption: 'photo',
                fileLength: 5,
              },
            },
          },
        },
      },
    },
  };

  await forwardViewOnce({
    socket: {
      async sendMessage(chatId, payload) { sent.push({ chatId, payload }); },
      async updateMediaMessage() {},
    },
    destination: '33612345678@s.whatsapp.net',
    message,
    logger: {},
    async downloadMedia(source, type) {
      assert.equal(source, message);
      assert.equal(type, 'buffer');
      return Buffer.from('photo');
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, '33612345678@s.whatsapp.net');
  assert.equal(sent[0].payload.image.toString(), 'photo');
  assert.match(sent[0].payload.caption, /Média à vue unique reçu de/);
});

test('vv exige une réponse à un média à vue unique', async () => {
  const replies = [];
  await vvPlugin.execute({
    quotedMessage: { key: { id: 'regular' }, message: { conversation: 'texte ordinaire' } },
    async sendReply(text) { replies.push(text); },
  });
  assert.match(replies[0], /vue unique/);
});

test('vv extrait et renvoie le média à vue unique cité', async () => {
  const sent = [];
  const quotedMessage = {
    key: { id: 'view-once-quoted', remoteJid: 'chat-1@s.whatsapp.net' },
    message: {
      ephemeralMessage: {
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: {
                mimetype: 'image/jpeg',
                caption: 'photo privée',
                fileLength: 4,
              },
            },
          },
        },
      },
    },
  };

  await vvPlugin.execute({
    socket: {
      async sendMessage(chatId, payload, options) {
        sent.push({ chatId, payload, options });
      },
      async updateMediaMessage() {},
    },
    message: { key: { id: 'vv-command' } },
    quotedMessage,
    chatId: 'chat-1@s.whatsapp.net',
    logger: { error(error) { throw error; } },
    async downloadMedia(message, type) {
      assert.equal(message, quotedMessage);
      assert.equal(type, 'buffer');
      return Buffer.from('image');
    },
    async sendReply(text) { sent.push({ text }); },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 'chat-1@s.whatsapp.net');
  assert.equal(sent[0].payload.image.toString(), 'image');
  assert.equal(sent[0].payload.mimetype, 'image/jpeg');
  assert.match(sent[0].payload.caption, /Média à vue unique récupéré/);
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
