import assert from 'node:assert/strict';
import test from 'node:test';
import restart from '../plugins/restart.js';
import shutdown from '../plugins/shutdown.js';
import update from '../plugins/update.js';
import { createMessageHandler } from '../core/handler.js';
import setvar from '../plugins/setvar.js';
import getvar from '../plugins/getvar.js';
import allvar from '../plugins/allvar.js';
import delvar from '../plugins/delvar.js';

// S'assure que les commandes sensibles refusent tout utilisateur qui n'est pas dans SUDO.
test('redémarrage et arrêt sont réservés à SUDO', async () => {
  for (const plugin of [restart, shutdown, update, setvar, getvar, allvar, delvar]) {
    let actionCalled = false;
    let reply = '';
    await plugin.execute({
      isSudo: false,
      chatId: 'chat@s.whatsapp.net',
      lifecycle: {
        async restart() { actionCalled = true; },
        async shutdown() { actionCalled = true; },
      },
      args: ['AUTO_STATUS', 'on'],
      storage: { async set() { actionCalled = true; } },
      async sendReply(text) { reply = text; },
    });
    assert.equal(actionCalled, false);
    assert.match(reply, /réservée au propriétaire/);
  }
});

// Vérifie qu'un message historique ne peut pas rejouer une commande de gestion.
test('le gestionnaire ignore les messages historiques', async () => {
  let executed = false;
  const handler = createMessageHandler({
    plugins: new Map([['shutdown', { name: 'shutdown', async execute() { executed = true; } }]]),
    config: { prefixes: ['.'], sudoNumbers: [] },
    storage: { async increment() {} },
    logger: { error() {} },
  });
  await handler(
    {
      type: 'append',
      messages: [{
        key: { remoteJid: '123@s.whatsapp.net' },
        message: { conversation: '.shutdown' },
      }],
    },
    { async sendMessage() {} },
    {},
  );
  assert.equal(executed, false);
});
