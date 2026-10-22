import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkForUpdates, installUpdates } from '../core/git-updates.js';
import { createUpdatePlugin } from '../plugins/update.js';

test('installUpdates fusionne en avance rapide puis installe les dépendances', async () => {
  const calls = [];
  await installUpdates(
    async (args) => {
      calls.push(['git', args]);
      return { stdout: '' };
    },
    async (command, args) => {
      calls.push(['npm', command, args]);
      return {};
    },
  );

  assert.deepEqual(calls[0], ['git', ['status', '--porcelain']]);
  assert.deepEqual(calls[1], ['git', ['merge', '--ff-only', 'origin/master']]);
  assert.equal(calls[2][0], 'npm');
  assert.match(calls[2][2].join(' '), /ci --omit=dev/);
});

test('installUpdates refuse de fusionner quand le dépôt contient des changements locaux', async () => {
  const calls = [];
  await assert.rejects(
    installUpdates(
      async (args) => {
        calls.push(args);
        return { stdout: ' M core/connection.js\n' };
      },
      async () => assert.fail('npm ne doit pas être lancé si le dépôt est modifié.'),
    ),
    { code: 'ERR_DIRTY_WORKTREE' },
  );
  assert.deepEqual(calls, [['status', '--porcelain']]);
});

test('update explique les installations Windows téléchargées en ZIP', async () => {
  const checkUpdates = () => checkForUpdates(async () => {
    throw new Error('Command failed: git fetch\nfatal: not a git repository');
  });
  const plugin = createUpdatePlugin({
    checkUpdates,
  });
  const context = createContext();

  await plugin.execute(context);

  assert.match(context.replies[0], /archive ZIP/);
  assert.match(context.replies[0], /dernière commande Windows du README/);
});

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

test('les fichiers de logs PM2 sont ignorés par Git', async () => {
  const ignoreRules = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignoreRules, /^logs\/$/m);
});
