import assert from 'node:assert/strict';
import test from 'node:test';
import { createUpdatePlugin } from '../plugins/update.js';

function createContext({ args = [], isSudo = true, lifecycle = {}, logger } = {}) {
  const replies = [];
  return {
    args,
    isSudo,
    lifecycle,
    logger: logger || { error() {} },
    replies,
    async sendReply(text) { replies.push(text); },
  };
}

test('update affiche les commits disponibles et attend la confirmation pour les installer', async () => {
  let applied = false;
  const plugin = createUpdatePlugin({
    async checkUpdates() {
      return { commits: ['abc123\tCorrection', 'def456\tNouvelle fonction'] };
    },
    async applyUpdates() { applied = true; },
  });
  const context = createContext();

  await plugin.execute(context);

  assert.match(context.replies[0], /2 mise\(s\) à jour disponible\(s\)/);
  assert.match(context.replies[0], /abc123\tCorrection/);
  assert.match(context.replies[0], /\.update now/);
  assert.equal(applied, false);
});

test('update now installe les commits puis redémarre le bot', async () => {
  const events = [];
  const plugin = createUpdatePlugin({
    async checkUpdates() { return { commits: ['abc123\tCorrection'] }; },
    async applyUpdates() { events.push('installed'); },
  });
  const context = createContext({
    args: ['now'],
    lifecycle: { async restart() { events.push('restarted'); } },
  });

  await plugin.execute(context);

  assert.deepEqual(events, ['installed', 'restarted']);
  assert.match(context.replies[0], /en cours/);
  assert.match(context.replies[1], /Redémarrage/);
});

test('update confirme quand il n’y a rien à installer', async () => {
  let applied = false;
  const plugin = createUpdatePlugin({
    async checkUpdates() { return { commits: [] }; },
    async applyUpdates() { applied = true; },
  });
  const context = createContext();

  await plugin.execute(context);

  assert.equal(context.replies[0], 'RORISU est déjà à jour.');
  assert.equal(applied, false);
});

test('update reste réservé au propriétaire', async () => {
  let checked = false;
  const plugin = createUpdatePlugin({
    async checkUpdates() { checked = true; return { commits: [] }; },
  });
  const context = createContext({ isSudo: false });

  await plugin.execute(context);

  assert.equal(checked, false);
  assert.match(context.replies[0], /réservée au propriétaire/);
});
