import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createConnection } from '../core/connection.js';

test('la connexion envoie le message de bienvenue en privé au propriétaire', async () => {
  const socket = {
    ev: new EventEmitter(),
    user: { id: '33612345678:4@s.whatsapp.net' },
    sent: [],
    async sendMessage(chatId, content) {
      this.sent.push({ chatId, content });
    },
    end() {},
  };
  const connection = await createConnection({
    config: {
      authDirectory: 'unused-test-auth',
      pairingMethod: 'qr',
      botName: 'RORISU',
      sudoNumbers: ['33612345678'],
      prefixes: [],
      sessionIds: ['0'],
      gemini: { apiKey: '' },
    },
    storage: {
      async get() { return null; },
      async close() {},
    },
    enableAutoUpdater: false,
    createSocket() { return socket; },
    async loadAuthState() {
      return {
        state: { creds: { registered: true } },
        async saveCreds() {},
      };
    },
    async onMessages() {},
  });

  const onConnectionUpdate = socket.ev.listeners('connection.update')[0];
  await onConnectionUpdate({ connection: 'open' });

  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].chatId, '33612345678@s.whatsapp.net');
  assert.match(socket.sent[0].content.text, /Envoie \*menu\* \(sans préfixe\)/);
  assert.equal(connection.socket, socket);
});
