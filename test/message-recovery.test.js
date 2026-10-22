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
import { parseWhatsAppJid } from '../core/group-utils.js';

test('valide les numéros et JID WhatsApp comme destinations', () => {
  assert.equal(parseWhatsAppJid('+33 6 12 34 56 78'), '33612345678@s.whatsapp.net');
  assert.equal(parseWhatsAppJid('123456789-123456@g.us'), '123456789-123456@g.us');
  assert.equal(parseWhatsAppJid('123456789:4@lid'), '123456789:4@lid');
  assert.equal(parseWhatsAppJid('123456789@hosted.lid'), '123456789@hosted.lid');
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

test('antidelete on/off active et désactive la destination privée par défaut', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    args: ['on'],
    text: '.antidelete on',
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
    scope: null,
  });

  await deletePlugin.execute({ ...context, args: ['off'], text: '.antidelete off' });
  assert.equal(values.get('feature:anti_delete'), null);
  assert.match(replies[0], /propriétaire en privé/);
  assert.match(replies[1], /désactivée/);
});

test('antivv refuse l’activation et reste désactivé pour protéger les médias à vue unique', async () => {
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
  assert.deepEqual(values.get('feature:anti_vv'), { enabled: false });
  await antiVvPlugin.execute({ ...context, args: ['off'] });
  assert.deepEqual(values.get('feature:anti_vv'), { enabled: false });
  assert.match(replies[0], /ne peut pas être activé/);
  assert.match(replies[1], /désactivé/);
});

test('antivv désactive un ancien réglage de transfert', async () => {
  const values = new Map([
    ['feature:anti_vv', { enabled: true, destination: '123456789@g.us' }],
  ]);
  const replies = [];
  const context = {
    isSudo: true,
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await antiVvPlugin.execute({ ...context, args: ['on', '123456789@g.us'] });
  assert.deepEqual(values.get('feature:anti_vv'), { enabled: false });
  assert.match(replies[0], /respecter leur confidentialité/);
});

test('un ancien réglage anti-VV ne retransmet pas le média reçu', async () => {
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
  });
  const socket = {
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };

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

  assert.deepEqual(sent, []);
});

test('l’anti-suppression ne met pas en cache un média à vue unique', async () => {
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
  const message = {
    key: {
      remoteJid: '12345@s.whatsapp.net',
      participant: '12345@s.whatsapp.net',
      id: 'view-once-not-cached',
      fromMe: false,
    },
    message: {
      viewOnceMessageV2: {
        message: { imageMessage: { mimetype: 'image/jpeg', fileLength: 10 } },
      },
    },
  };
  const socket = {
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };

  await handler({ type: 'notify', messages: [message] }, socket);
  await handler.handleMessageUpdate([{
    key: message.key,
    update: {
      messageStubType: WAMessageStubType.REVOKE,
      key: { remoteJid: message.key.remoteJid, id: 'view-once-revoke' },
    },
  }], socket);

  assert.deepEqual(sent, []);
});

test('vv répond clairement sans tenter d’ouvrir un média à vue unique', async () => {
  const replies = [];
  await vvPlugin.execute({
    async sendReply(text) { replies.push(text); },
  });
  assert.match(replies[0], /ne les ouvre/);
  assert.match(replies[0], /renvoyer si elle est d’accord/);
});

test('vv ne réenvoie pas un média à vue unique cité', async () => {
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

  const replies = [];
  await vvPlugin.execute({
    quotedMessage,
    async sendReply(text) { replies.push(text); },
  });

  assert.match(replies[0], /ne les ouvre, n’enregistre ni ne retransmet/);
});

test('delete reconnaît le message cité envoyé par le bot en privé', async () => {
  const sent = [];
  const ownerJid = '33612345678@s.whatsapp.net';
  const handler = createMessageHandler({
    plugins: new Map([['delete', deletePlugin]]),
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: {
      async get() { return null; },
      async set() {},
      async increment() {},
    },
    logger: { error() {} },
  });
  const socket = {
    user: { id: `${ownerJid.split('@')[0]}:4@s.whatsapp.net` },
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };

  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: ownerJid, participant: ownerJid, id: 'delete-command' },
      message: {
        extendedTextMessage: {
          text: '.delete',
          contextInfo: {
            stanzaId: 'bot-message',
            participant: ownerJid,
            quotedMessage: { conversation: 'Message à supprimer' },
          },
        },
      },
    }],
  }, socket);

  assert.deepEqual(sent, [{
    chatId: ownerJid,
    content: {
      delete: {
        remoteJid: ownerJid,
        id: 'bot-message',
        participant: ownerJid,
        fromMe: true,
      },
    },
  }]);
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
