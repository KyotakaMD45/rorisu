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
import { createAutoUpdater } from '../core/auto-update.js';

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

// Vérifie que les commandes et leurs alias sont disponibles pour le gestionnaire.
test('le chargeur référence les commandes et alias intégrés', async () => {
  const plugins = await loadPlugins();
  for (const command of ['ping', 'list', 'menu', 'update', 'setvar', 'restart', 'shutdown', 'kick', 'add', 'promote', 'sticker']) {
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

test('setvar active ou désactive les options et rejette les valeurs invalides', async () => {
  const values = new Map();
  const storage = {
    async set(key, value) { values.set(key, value); },
  };
  const replies = [];
  const context = {
    isSudo: true,
    storage,
    async sendReply(text) { replies.push(text); },
  };

  await setvarPlugin.execute({ ...context, args: ['AUTO_STATUS', '=', 'on'] });
  await setvarPlugin.execute({ ...context, args: ['AUTO_UPDATE', 'off'] });
  await setvarPlugin.execute({ ...context, args: ['AUTO_STATUS', '=', 'maybe'] });

  assert.equal(values.get('feature:auto_status'), true);
  assert.equal(values.get('feature:auto_update'), false);
  assert.match(replies[0], /activé/);
  assert.match(replies[1], /désactivée/);
  assert.match(replies[2], /Utilisation/);
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
  const storage = { async increment() {} };
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
