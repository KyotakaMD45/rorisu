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
  for (const command of ['ping', 'list', 'menu', 'update', 'setvar', 'getvar', 'allvar', 'delvar', 'restart', 'shutdown', 'kick', 'add', 'promote', 'sticker']) {
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
