import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createStorage } from '../storage.js';
import { loadPlugins } from '../core/loader.js';
import { createMessageHandler } from '../core/handler.js';
import pingPlugin from '../plugins/ping.js';
import listPlugin from '../plugins/list.js';
import setvarPlugin from '../plugins/setvar.js';
import getvarPlugin from '../plugins/getvar.js';
import allvarPlugin from '../plugins/allvar.js';
import delvarPlugin from '../plugins/delvar.js';
import afkPlugin from '../plugins/afk.js';
import pollPlugin from '../plugins/poll.js';
import antilinkPlugin from '../plugins/antilink.js';
import warnPlugin from '../plugins/warn.js';
import groupPlugin from '../plugins/group.js';
import filterPlugin from '../plugins/filter.js';
import greetPlugin from '../plugins/greet.js';
import { handleGroupParticipantsUpdate } from '../core/group-events.js';
import antiwordPlugin from '../plugins/antiword.js';
import tagPlugin from '../plugins/tag.js';
import ginfoPlugin from '../plugins/ginfo.js';
import reactPlugin from '../plugins/react.js';
import deletePlugin from '../plugins/delete.js';
import alivePlugin from '../plugins/alive.js';
import { createAutoUpdater } from '../core/auto-update.js';
import { readEnvVariables, writeEnvVariable } from '../core/env.js';
import { initializeFeatureSettings } from '../core/feature-settings.js';

const testStoragePath = path.resolve('data/test-store.json');

// Vérifie que le stockage local survit à une fermeture puis une nouvelle ouverture.
test('le stockage JSON conserve les valeurs et les compteurs', async () => {
  await fs.rm(testStoragePath, { force: true });
  try {
    const storage = await createStorage({ databaseUrl: '', storageFile: testStoragePath });
    assert.equal(await storage.get('absent'), null);
    await storage.set('name', 'bot');
    assert.equal(await storage.increment('commands'), 1);
    assert.equal(await storage.increment('commands'), 2);
    await storage.close();

    const reopened = await createStorage({ databaseUrl: '', storageFile: testStoragePath });
    assert.equal(await reopened.get('name'), 'bot');
    assert.equal(await reopened.get('commands'), 2);
    await reopened.close();
  } finally {
    await fs.rm(testStoragePath, { force: true });
  }
});

test('charge les options depuis .env et migre les anciennes valeurs du stockage', async () => {
  const envFilePath = path.resolve('data/test-feature-settings.env');
  const previousAutoStatus = process.env.AUTO_STATUS;
  const previousAutoUpdate = process.env.AUTO_UPDATE;
  const values = new Map([['feature:auto_status', true]]);
  const storage = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
  };

  try {
    delete process.env.AUTO_STATUS;
    delete process.env.AUTO_UPDATE;
    await initializeFeatureSettings(storage, envFilePath);

    assert.equal(values.get('feature:auto_status'), true);
    assert.equal(values.get('feature:auto_update'), false);
    assert.equal(process.env.AUTO_STATUS, 'on');
    assert.equal(process.env.AUTO_UPDATE, 'off');
    assert.equal((await readEnvVariables(envFilePath)).AUTO_STATUS, 'on');
    assert.equal((await readEnvVariables(envFilePath)).AUTO_UPDATE, 'off');
  } finally {
    if (previousAutoStatus === undefined) delete process.env.AUTO_STATUS;
    else process.env.AUTO_STATUS = previousAutoStatus;
    if (previousAutoUpdate === undefined) delete process.env.AUTO_UPDATE;
    else process.env.AUTO_UPDATE = previousAutoUpdate;
    await fs.rm(envFilePath, { force: true });
  }
});

// Vérifie que les commandes et leurs alias sont disponibles pour le gestionnaire.
test('le chargeur référence les commandes et alias intégrés', async () => {
  const plugins = await loadPlugins();
  for (const command of ['ping', 'list', 'menu', 'alive', 'react', 'delete', 'dlt', 'update', 'setvar', 'getvar', 'allvar', 'delvar', 'afk', 'poll', 'antilink', 'antiword', 'warn', 'filter', 'stop', 'greet', 'setgreet', 'getgreet', 'delgreet', 'setgoodbye', 'getgoodbye', 'delgoodbye', 'tag', 'tagall', 'ginfo', 'restart', 'shutdown', 'kick', 'add', 'promote', 'demote', 'invite', 'revoke', 'mute', 'unmute', 'sticker']) {
    assert.equal(typeof plugins.get(command)?.execute, 'function', `Commande manquante : ${command}`);
  }
});

test('ping répond Pong puis affiche la latence en millisecondes', async () => {
  const replies = [];
  await pingPlugin.execute({
    config: { botName: 'RORISU' },
    async sendReply(text) {
      replies.push(text);
    },
  });

  assert.equal(replies[0], 'Pong ! 🏓\nRORISU est en ligne.');
  assert.match(replies[1], /^Latence : \d+ ms$/);
});

test('le menu présente les commandes et le préfixe configuré', async () => {
  let reply;
  await listPlugin.execute({
    config: { botName: 'RORISU', prefixes: ['!'] },
    async sendReply(text) {
      reply = text;
    },
  });

  assert.match(reply, /RORISU • MENU/);
  assert.match(reply, /!ping/);
  assert.match(reply, /!sticker/);
  assert.match(reply, /!update/);
  assert.match(reply, /!setvar AUTO_STATUS/);
  assert.match(reply, /!shutdown/);
});

test('alive affiche l’état des options persistantes', async () => {
  let reply;
  await alivePlugin.execute({
    config: { botName: 'RORISU' },
    storage: { async get(key) { return key === 'feature:auto_status'; } },
    async sendReply(text) { reply = text; },
  });
  assert.match(reply, /RORISU est en ligne/);
  assert.match(reply, /AUTO_STATUS : activé/);
  assert.match(reply, /AUTO_UPDATE : désactivée/);
});

test('react réagit uniquement à un message cité', async () => {
  const sent = [];
  const context = {
    socket: { async sendMessage(chatId, content) { sent.push({ chatId, content }); } },
    chatId: 'group@g.us',
    quotedMessage: { key: { id: 'quoted', remoteJid: 'group@g.us' } },
    args: ['👍'],
    async sendReply() {},
  };
  await reactPlugin.execute(context);
  assert.deepEqual(sent[0].content.react, { text: '👍', key: context.quotedMessage.key });
});

test('delete refuse les messages d’autrui sans privilèges de groupe', async () => {
  const replies = [];
  await deletePlugin.execute({
    socket: {
      user: { id: '999@s.whatsapp.net' },
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net' }, { id: '999@s.whatsapp.net' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    quotedMessage: {
      key: {
        id: 'other-message',
        remoteJid: 'group@g.us',
        participant: '33687654321@s.whatsapp.net',
      },
    },
    async sendReply(text) { replies.push(text); },
  });
  assert.match(replies[0], /administrateur/);
});

test('le sondage valide les choix et utilise le format poll de Baileys', async () => {
  const sent = [];
  const replies = [];
  const context = {
    args: ['Meilleur', 'fruit, Pomme, Poire'],
    chatId: 'group@g.us',
    socket: { async sendMessage(chatId, content) { sent.push({ chatId, content }); } },
    async sendReply(text) { replies.push(text); },
  };

  await pollPlugin.execute(context);
  assert.deepEqual(sent, [{
    chatId: 'group@g.us',
    content: { poll: { name: 'Meilleur fruit', values: ['Pomme', 'Poire'], selectableCount: 1 } },
  }]);
  await pollPlugin.execute({ ...context, args: ['Question, seul'] });
  assert.match(replies[0], /au moins deux choix/);
});

test('AFK se conserve et se désactive sur demande', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    senderNumber: '33612345678',
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await afkPlugin.execute({ ...context, args: ['En', 'réunion'] });
  assert.deepEqual(values.get('afk:33612345678').reason, 'En réunion');
  await afkPlugin.execute({ ...context, args: ['off'] });
  assert.equal(values.get('afk:33612345678'), null);
  assert.match(replies[1], /plus indiqué comme absent/);
});

test('le gestionnaire signale les mentions AFK et efface le statut au retour', async () => {
  const values = new Map([
    ['afk:33612345678', { reason: 'En réunion', since: Date.now() - 120_000 }],
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

  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: 'group@g.us', participant: '33687654321@s.whatsapp.net' },
      message: {
        extendedTextMessage: {
          text: 'Tu es là ?',
          contextInfo: { mentionedJid: ['33612345678@s.whatsapp.net'] },
        },
      },
    }],
  }, socket);
  assert.match(sent[0].content.text, /@33612345678 est absent.*En réunion/);
  assert.deepEqual(sent[0].content.mentions, ['33612345678@s.whatsapp.net']);

  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: '33612345678@s.whatsapp.net', participant: '33612345678@s.whatsapp.net' },
      message: { conversation: 'Je suis de retour' },
    }],
  }, socket);
  assert.equal(values.get('afk:33612345678'), null);
  assert.match(sent[1].content.text, /plus indiqué comme absent/);
});

test('antilink est réservé aux administrateurs et sauvegarde son état par groupe', async () => {
  const values = new Map();
  const replies = [];
  const socket = {
    user: { id: '999@s.whatsapp.net' },
    async groupMetadata() {
      return {
        participants: [
          { id: '33612345678@s.whatsapp.net', admin: 'admin' },
          { id: '999@s.whatsapp.net', admin: 'admin' },
        ],
      };
    },
  };
  const context = {
    socket,
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: ['on'],
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    async sendReply(text) { replies.push(text); },
  };

  await antilinkPlugin.execute(context);
  assert.equal(values.get('group:group@g.us:antilink'), true);
  assert.match(replies[0], /activé pour ce groupe/);
});

test('antilink supprime les liens envoyés par les non-administrateurs', async () => {
  const sent = [];
  const handler = createMessageHandler({
    plugins: new Map(),
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: {
      async get(key) { return key === 'group:group@g.us:antilink'; },
      async set() {},
      async increment() {},
    },
    logger: { error() {} },
  });
  const message = {
    key: {
      remoteJid: 'group@g.us',
      participant: '33687654321@s.whatsapp.net',
      id: 'link-message',
    },
    message: { conversation: 'https://example.com' },
  };
  const socket = {
    user: { id: '999@s.whatsapp.net' },
    async groupMetadata() {
      return {
        participants: [
          { id: '33687654321@s.whatsapp.net' },
          { id: '999@s.whatsapp.net', admin: 'admin' },
        ],
      };
    },
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };

  await handler({ type: 'notify', messages: [message] }, socket);
  assert.deepEqual(sent, [
    { chatId: 'group@g.us', content: { delete: message.key } },
    { chatId: 'group@g.us', content: { text: 'Les liens ne sont pas autorisés dans ce groupe.' } },
  ]);
});

test('warn compte les avertissements et retire un membre à la limite', async () => {
  const values = new Map();
  const sent = [];
  const socket = {
    user: { id: '999@s.whatsapp.net' },
    async groupMetadata() {
      return {
        participants: [
          { id: '33612345678@s.whatsapp.net', admin: 'admin' },
          { id: '33687654321@s.whatsapp.net' },
          { id: '999@s.whatsapp.net', admin: 'admin' },
        ],
      };
    },
    async groupParticipantsUpdate(chatId, jids, action) {
      sent.push({ chatId, jids, action });
      return [{ status: 200 }];
    },
  };
  const context = {
    socket,
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: [],
    mentions: ['33687654321@s.whatsapp.net'],
    quotedMessage: null,
    async sendReply(text) { sent.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  };

  await warnPlugin.execute(context);
  await warnPlugin.execute(context);
  await warnPlugin.execute(context);
  assert.equal(sent.filter((item) => typeof item === 'string').length, 3);
  assert.deepEqual(sent.at(-1), {
    chatId: 'group@g.us',
    jids: ['33687654321@s.whatsapp.net'],
    action: 'remove',
  });
  assert.equal(values.get('group:group@g.us:warn:33687654321@s.whatsapp.net'), 0);
});

test('les commandes de groupe exposent mute, invite et demote via Baileys', async () => {
  const operations = [];
  const replies = [];
  const context = {
    socket: {
      user: { id: '999@s.whatsapp.net' },
      async groupMetadata() {
        return {
          participants: [
            { id: '33612345678@s.whatsapp.net', admin: 'admin' },
            { id: '999@s.whatsapp.net', admin: 'admin' },
          ],
        };
      },
      async groupInviteCode() { return 'invite-code'; },
      async groupSettingUpdate(chatId, setting) { operations.push({ chatId, setting }); },
      async groupParticipantsUpdate(chatId, jids, action) {
        operations.push({ chatId, jids, action });
        return [{ status: 200 }];
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: [],
    mentions: [],
    quotedMessage: null,
    config: { prefixes: ['.'] },
    async sendReply(text) { replies.push(text); },
  };

  await groupPlugin.execute({ ...context, text: '.invite' });
  await groupPlugin.execute({ ...context, text: '.mute' });
  await groupPlugin.execute({ ...context, text: '.demote', args: ['33687654321'] });
  assert.match(replies[0], /https:\/\/chat\.whatsapp\.com\/invite-code/);
  assert.deepEqual(operations, [
    { chatId: 'group@g.us', setting: 'announcement' },
    { chatId: 'group@g.us', jids: ['33687654321@s.whatsapp.net'], action: 'demote' },
  ]);
});

test('les filtres de groupe enregistrent et suppriment des réponses', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net', admin: 'admin' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: ['bonjour', '=', 'Salut à tous'],
    text: '.filter bonjour = Salut à tous',
    config: { prefixes: ['.'] },
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  };

  await filterPlugin.execute(context);
  assert.deepEqual(values.get('group:group@g.us:filters'), { bonjour: 'Salut à tous' });
  await filterPlugin.execute({ ...context, args: ['bonjour'], text: '.stop bonjour' });
  assert.deepEqual(values.get('group:group@g.us:filters'), {});
  assert.match(replies[1], /supprimée/);
});

test('les messages de bienvenue sont configurables par les administrateurs et mentionnent les nouveaux membres', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net', admin: 'admin' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: ['Bienvenue', '{user}'],
    text: '.setgreet Bienvenue {user}',
    config: { prefixes: ['.'] },
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  };
  await greetPlugin.execute(context);
  assert.equal(values.get('group:group@g.us:welcome'), 'Bienvenue {user}');

  const sent = [];
  await handleGroupParticipantsUpdate({
    id: 'group@g.us',
    action: 'add',
    participants: ['33687654321:2@s.whatsapp.net'],
  }, {
    socket: { async sendMessage(chatId, message) { sent.push({ chatId, message }); } },
    storage: context.storage,
  });
  assert.deepEqual(sent, [{
    chatId: 'group@g.us',
    message: {
      text: 'Bienvenue @33687654321',
      mentions: ['33687654321@s.whatsapp.net'],
    },
  }]);
  assert.match(replies[0], /Message d’accueil enregistré/);
});

test('antiword enregistre une liste de mots par groupe', async () => {
  const values = new Map();
  const replies = [];
  const context = {
    socket: {
      async groupMetadata() {
        return { participants: [{ id: '33612345678@s.whatsapp.net', admin: 'admin' }] };
      },
    },
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: ['add', 'spam'],
    async sendReply(text) { replies.push(text); },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
  };

  await antiwordPlugin.execute(context);
  await antiwordPlugin.execute({ ...context, args: ['on'] });
  assert.deepEqual(values.get('group:group@g.us:antiword'), { enabled: true, words: ['spam'] });
  assert.match(replies[1], /activé/);
});

test('antiword supprime un mot interdit envoyé par un membre non-admin', async () => {
  const sent = [];
  const handler = createMessageHandler({
    plugins: new Map(),
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: {
      async get(key) {
        if (key === 'group:group@g.us:antiword') return { enabled: true, words: ['spam'] };
        return null;
      },
      async set() {},
      async increment() {},
    },
    logger: { error() {} },
  });
  const message = {
    key: {
      remoteJid: 'group@g.us',
      participant: '33687654321@s.whatsapp.net',
      id: 'blocked-word-message',
    },
    message: { conversation: 'ceci est un SPAM interdit' },
  };
  const socket = {
    user: { id: '999@s.whatsapp.net' },
    async groupMetadata() {
      return {
        participants: [
          { id: '33687654321@s.whatsapp.net' },
          { id: '999@s.whatsapp.net', admin: 'admin' },
        ],
      };
    },
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };

  await handler({ type: 'notify', messages: [message] }, socket);
  assert.deepEqual(sent, [
    { chatId: 'group@g.us', content: { delete: message.key } },
    { chatId: 'group@g.us', content: { text: 'Ce message contient un mot interdit dans ce groupe.' } },
  ]);
});

test('tagall est limité aux administrateurs et aux petits groupes', async () => {
  const sent = [];
  const socket = {
    async groupMetadata() {
      return {
        participants: [
          { id: '33612345678@s.whatsapp.net', admin: 'admin' },
          { id: '33687654321@s.whatsapp.net' },
        ],
      };
    },
    async sendMessage(chatId, content) { sent.push({ chatId, content }); },
  };
  await tagPlugin.execute({
    socket,
    chatId: 'group@g.us',
    senderJid: '33612345678@s.whatsapp.net',
    isGroup: true,
    args: ['Réunion', 'à', '14h'],
    async sendReply() {},
  });
  assert.equal(sent[0].content.text, 'Réunion à 14h\n@33612345678 @33687654321');
  assert.equal(sent[0].content.mentions.length, 2);
});

test('ginfo affiche le titre et les rôles sans exposer le lien du groupe', async () => {
  let reply;
  await ginfoPlugin.execute({
    socket: {
      async groupMetadata() {
        return {
          subject: 'Groupe test',
          participants: [
            { id: '33612345678@s.whatsapp.net', admin: 'admin' },
            { id: '33687654321@s.whatsapp.net' },
          ],
        };
      },
    },
    chatId: 'group@g.us',
    isGroup: true,
    async sendReply(text) { reply = text; },
  });
  assert.match(reply, /Groupe : Groupe test/);
  assert.match(reply, /Membres : 2/);
  assert.match(reply, /Administrateurs : @33612345678/);
});

test('setvar active ou désactive les options et rejette les valeurs invalides', async () => {
  const values = new Map();
  const envFilePath = path.resolve('data/test-bot.env');
  const previousAutoStatus = process.env.AUTO_STATUS;
  const previousAutoUpdate = process.env.AUTO_UPDATE;
  const previousWelcomeText = process.env.WELCOME_TEXT;
  const previousApiToken = process.env.API_TOKEN;
  const storage = {
    async set(key, value) { values.set(key, value); },
  };
  const replies = [];
  const context = {
    isSudo: true,
    storage,
    envFilePath,
    async sendReply(text) { replies.push(text); },
  };

  delete process.env.AUTO_STATUS;
  delete process.env.AUTO_UPDATE;
  try {
    await fs.writeFile(envFilePath, '# bot settings\nBOT_NAME=RORISU\n', 'utf8');
    await setvarPlugin.execute({ ...context, args: ['AUTO_STATUS', '=', 'on'] });
    await setvarPlugin.execute({ ...context, args: ['AUTO_UPDATE', 'off'] });
    await setvarPlugin.execute({ ...context, args: ['AUTO_STATUS', '=', 'maybe'] });

    assert.equal(values.get('feature:auto_status'), true);
    assert.equal(values.get('feature:auto_update'), false);
    assert.match(replies[0], /activé.*\.env/);
    assert.match(replies[1], /désactivée.*\.env/);
    assert.match(replies[2], /accepte uniquement on ou off/);
    assert.equal(process.env.AUTO_STATUS, 'on');
    assert.equal(process.env.AUTO_UPDATE, 'off');
    assert.equal((await readEnvVariables(envFilePath)).AUTO_STATUS, 'on');
    assert.equal((await readEnvVariables(envFilePath)).AUTO_UPDATE, 'off');
    assert.equal((await readEnvVariables(envFilePath)).BOT_NAME, 'RORISU');

    await setvarPlugin.execute({ ...context, args: ['WELCOME_TEXT', '=', 'hello world #welcome'] });
    assert.equal(process.env.WELCOME_TEXT, 'hello world #welcome');
    await getvarPlugin.execute({ ...context, args: ['WELCOME_TEXT'] });
    assert.equal(replies[4], 'WELCOME_TEXT = hello world #welcome');

    await fs.appendFile(envFilePath, 'API_TOKEN=keep-this-private\n');
    await getvarPlugin.execute({ ...context, args: ['API_TOKEN'] });
    assert.equal(replies[5], 'API_TOKEN = [masqué]');
    await allvarPlugin.execute(context);
    assert.match(replies[6], /WELCOME_TEXT = hello world #welcome/);
    assert.match(replies[6], /API_TOKEN = \[masqué\]/);

    await delvarPlugin.execute({ ...context, args: ['WELCOME_TEXT'] });
    assert.match(replies[7], /WELCOME_TEXT a été supprimée/);
    assert.equal((await readEnvVariables(envFilePath)).WELCOME_TEXT, undefined);
    await delvarPlugin.execute({ ...context, args: ['AUTO_STATUS'] });
    assert.match(replies[8], /option gérée/);
  } finally {
    if (previousAutoStatus === undefined) delete process.env.AUTO_STATUS;
    else process.env.AUTO_STATUS = previousAutoStatus;
    if (previousAutoUpdate === undefined) delete process.env.AUTO_UPDATE;
    else process.env.AUTO_UPDATE = previousAutoUpdate;
    if (previousWelcomeText === undefined) delete process.env.WELCOME_TEXT;
    else process.env.WELCOME_TEXT = previousWelcomeText;
    if (previousApiToken === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = previousApiToken;
    await fs.rm(envFilePath, { force: true });
  }
});

test('écrit les variables .env sans conserver les doublons', async () => {
  const envFilePath = path.resolve('data/test-env.env');
  try {
    await fs.writeFile(envFilePath, 'AUTO_STATUS=off\n# conservé\nAUTO_STATUS=on\n', 'utf8');
    await writeEnvVariable('AUTO_STATUS', 'off', envFilePath);

    const contents = await fs.readFile(envFilePath, 'utf8');
    assert.equal((contents.match(/^AUTO_STATUS=/gm) || []).length, 1);
    assert.equal((await readEnvVariables(envFilePath)).AUTO_STATUS, 'off');
    assert.match(contents, /^# conservé$/m);
  } finally {
    await fs.rm(envFilePath, { force: true });
  }
});

test('le vérificateur automatique ne récupère et installe les mises à jour qu’après activation', async () => {
  const values = new Map([['feature:auto_update', false]]);
  const calls = [];
  let restarted = false;
  const updater = createAutoUpdater({
    storage: { async get(key) { return values.get(key) ?? null; } },
    lifecycle: { async restart() { restarted = true; } },
    logger: { info() {}, error(error, message) { throw new Error(message, { cause: error }); } },
    async executeGit(args) {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { stdout: 'origin/main\n' };
      if (args[1] === 'HEAD') return { stdout: 'old\n' };
      if (args[1] === 'origin/main') return { stdout: 'new\n' };
      return { stdout: '' };
    },
  });

  await updater.checkNow();
  assert.deepEqual(calls, []);

  values.set('feature:auto_update', true);
  await updater.checkNow();
  assert.deepEqual(calls, [
    ['fetch'],
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    ['rev-parse', 'HEAD'],
    ['rev-parse', 'origin/main'],
    ['merge', '--ff-only', 'origin/main'],
  ]);
  assert.equal(restarted, true);
  updater.stop();
});

test('le gestionnaire traite les commandes du compte lié et des autres comptes', async () => {
  const executed = [];
  const sent = [];
  const errors = [];
  const plugins = new Map([['ping', {
    name: 'ping',
    async execute(context) {
      executed.push({ senderNumber: context.senderNumber, isSudo: context.isSudo });
      await context.sendReply('Pong !');
    },
  }]]);
  const config = { prefixes: ['.'], sudoNumbers: ['33612345678'] };
  const storage = {
    async get() { return null; },
    async set() {},
    async increment() {},
  };
  const logger = { error(error) { errors.push(error); } };
  const socket = {
    async sendMessage(chatId, content, options) {
      sent.push({ chatId, content, options });
    },
  };
  const handler = createMessageHandler({ plugins, config, storage, logger });

  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: '33612345678@s.whatsapp.net', fromMe: true, id: 'self-command' },
      message: { conversation: '.ping' },
    }],
  }, socket);
  await handler({
    type: 'notify',
    messages: [{
      key: { remoteJid: '33687654321@s.whatsapp.net', fromMe: false, id: 'other-command' },
      message: { conversation: '.ping' },
    }],
  }, socket);

  assert.deepEqual(executed, [
    { senderNumber: '33612345678', isSudo: true },
    { senderNumber: '33687654321', isSudo: false },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(sent.map(({ chatId }) => chatId), [
    '33612345678@s.whatsapp.net',
    '33687654321@s.whatsapp.net',
  ]);
});

test('AUTO_STATUS transfère une seule fois le texte au propriétaire en privé', async () => {
  const values = new Map([
    ['feature:auto_status', true],
    ['auto_status:seen', []],
  ]);
  const sent = [];
  const errors = [];
  const handler = createMessageHandler({
    plugins: new Map(),
    config: { prefixes: ['.'], sudoNumbers: ['33612345678'] },
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
    },
    logger: { error(error) { errors.push(error); } },
  });
  const socket = {
    async sendMessage(chatId, content) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      sent.push({ chatId, content });
    },
  };
  const status = {
    key: {
      remoteJid: 'status@broadcast',
      participant: '33687654321@s.whatsapp.net',
      id: 'status-message-1',
    },
    message: { conversation: 'Un statut texte' },
  };

  await Promise.all([
    handler({ type: 'notify', messages: [status] }, socket),
    handler({ type: 'notify', messages: [status] }, socket),
  ]);

  assert.deepEqual(sent, [{
    chatId: '33612345678@s.whatsapp.net',
    content: { text: 'Statut de 33687654321@s.whatsapp.net\nUn statut texte' },
  }]);
  assert.deepEqual(errors, []);
});
