import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkForUpdates, installUpdates } from '../core/git-updates.js';
import {
  checkPlatformUpdates,
  getUpdateProvider,
  requestPlatformDeployment,
} from '../core/platform-updates.js';
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
  assert.deepEqual(calls[1], ['git', ['fetch', '--prune', 'origin']]);
  assert.deepEqual(calls[2], ['git', ['merge', '--ff-only', 'origin/master']]);
  assert.equal(calls[3][0], 'npm');
  assert.match(calls[3][2].join(' '), /ci --omit=dev/);
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

test('installUpdates fusionne exactement le commit vérifié', async () => {
  const calls = [];
  const targetCommit = 'a'.repeat(40);
  await installUpdates(
    async (args) => {
      calls.push(['git', args]);
      return { stdout: '' };
    },
    async () => ({}),
    { targetCommit },
  );

  assert.deepEqual(calls[2], ['git', ['merge', '--ff-only', targetCommit]]);
});

test('installUpdates refuse un commit cible invalide avant le merge', async () => {
  const calls = [];
  await assert.rejects(
    installUpdates(
      async (args) => {
        calls.push(args);
        return { stdout: '' };
      },
      async () => assert.fail('npm ne doit pas être lancé pour un commit invalide.'),
      { targetCommit: '--upload-pack=malformed' },
    ),
    { code: 'ERR_UPDATE_REVISION_UNKNOWN' },
  );
  assert.deepEqual(calls, [['status', '--porcelain'], ['fetch', '--prune', 'origin']]);
});

test('installUpdates explique l’échec de npm ci après le fast-forward', async () => {
  const targetCommit = 'b'.repeat(40);
  await assert.rejects(
    installUpdates(
      async () => ({ stdout: '' }),
      async () => { throw new Error('npm registry unavailable'); },
      { targetCommit },
    ),
    {
      code: 'ERR_UPDATE_DEPENDENCIES',
      userMessage: /npm ci.*échoué/,
    },
  );
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

  assert.match(context.replies[0], /migrer sans supprimer tes sessions/);
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

test('Render compare la révision déployée et demande un déploiement du commit GitHub', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/compare/')) {
      return new Response(JSON.stringify({
        status: 'ahead',
        commits: [{
          sha: 'a'.repeat(40),
          commit: { message: 'Correction Render\nDétails' },
        }],
      }));
    }
    return new Response(null, { status: 202 });
  };
  const environment = {
    RENDER_GIT_COMMIT: 'b'.repeat(40),
    RENDER_API_KEY: 'private-token',
    RENDER_SERVICE_ID: 'srv-123',
  };
  const status = await checkPlatformUpdates({ provider: 'render', environment, fetchImpl });
  assert.equal(status.commits[0], `${'a'.repeat(7)}\tCorrection Render`);
  assert.equal(status.latestCommit, 'a'.repeat(40));

  const result = await requestPlatformDeployment({
    provider: 'render',
    targetCommit: status.latestCommit,
    environment,
    fetchImpl,
  });
  assert.deepEqual(result, { provider: 'render', deploymentId: undefined });
  assert.equal(requests[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[1].options.body), { commitId: 'a'.repeat(40) });
  assert.equal(requests[1].options.headers.authorization, 'Bearer private-token');
});

test('Koyeb lit le commit actif et redéploie le commit demandé', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/services/service-123')) {
      return new Response(JSON.stringify({ service: { active_deployment_id: 'deployment-1' } }));
    }
    if (url.endsWith('/v1/deployments/deployment-1')) {
      return new Response(JSON.stringify({
        deployment: { metadata: { git: { git_env: { sha: 'b'.repeat(40) } } } },
      }));
    }
    if (url.includes('/compare/')) {
      return new Response(JSON.stringify({
        status: 'ahead',
        commits: [{
          sha: 'a'.repeat(40),
          commit: { message: 'Correction Koyeb' },
        }],
      }));
    }
    return new Response(JSON.stringify({ deployment: { id: 'deployment-2' } }));
  };
  const environment = {
    KOYEB_API_TOKEN: 'private-token',
    KOYEB_SERVICE_ID: 'service-123',
  };
  const status = await checkPlatformUpdates({ provider: 'koyeb', environment, fetchImpl });
  assert.equal(status.latestCommit, 'a'.repeat(40));

  const result = await requestPlatformDeployment({
    provider: 'koyeb',
    targetCommit: status.latestCommit,
    environment,
    fetchImpl,
  });
  assert.deepEqual(result, { provider: 'koyeb', deploymentId: 'deployment-2' });
  assert.equal(requests.at(-1).url, 'https://app.koyeb.com/v1/services/service-123/redeploy');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { sha: 'a'.repeat(40) });
});

test('Heroku crée un build depuis l’archive du commit GitHub', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'build-123' }));
  };
  const result = await requestPlatformDeployment({
    provider: 'heroku',
    targetCommit: 'a'.repeat(40),
    environment: { HEROKU_API_KEY: 'private-token', HEROKU_APP_NAME: 'rorisu-app' },
    fetchImpl,
  });

  assert.deepEqual(result, { provider: 'heroku', deploymentId: 'build-123' });
  assert.equal(request.url, 'https://api.heroku.com/apps/rorisu-app/builds');
  assert.equal(
    JSON.parse(request.options.body).source_blob.url,
    `https://github.com/KyotakaMD45/rorisu/archive/${'a'.repeat(40)}.tar.gz`,
  );
});

test('un hébergeur géré sans API key reçoit un diagnostic explicite', async () => {
  await assert.rejects(
    requestPlatformDeployment({
      provider: 'render',
      targetCommit: 'a'.repeat(40),
      environment: { RENDER_SERVICE_ID: 'srv-123' },
    }),
    { code: 'ERR_UPDATE_CONFIG', userMessage: 'RENDER_API_KEY est obligatoire pour utiliser les mises à jour render.' },
  );
});

test('le fournisseur est détecté sur Render, Koyeb et Heroku', () => {
  assert.equal(getUpdateProvider({ RENDER: 'true' }), 'render');
  assert.equal(getUpdateProvider({ KOYEB_SERVICE_ID: 'service-123' }), 'koyeb');
  assert.equal(getUpdateProvider({ DYNO: 'web.1' }), 'heroku');
  assert.equal(getUpdateProvider({}), 'git');
});

test('le déploiement géré exige une version distante non divergente', async () => {
  await assert.rejects(
    checkPlatformUpdates({
      provider: 'render',
      environment: { RENDER_GIT_COMMIT: 'b'.repeat(40) },
      async fetchImpl() {
        return new Response(JSON.stringify({ status: 'diverged', commits: [] }));
      },
    }),
    { code: 'ERR_UPDATE_DIVERGED' },
  );
});

test('update indique que le déploiement géré est lancé sans redémarrer le processus lui-même', async () => {
  let restarted = false;
  const replies = [];
  const plugin = createUpdatePlugin({
    async checkUpdates() {
      return { provider: 'koyeb', latestCommit: 'a'.repeat(40), commits: ['abcdef0\tCorrection'] };
    },
    async applyUpdates() { return { provider: 'koyeb', deploymentId: 'deployment-2' }; },
  });
  const context = createContext({
    args: ['now'],
    lifecycle: { async restart() { restarted = true; } },
  });
  context.sendOwnerReply = async (text) => replies.push(text);

  await plugin.execute(context);

  assert.match(replies.at(-1), /Déploiement demandé à koyeb/);
  assert.equal(context.replies.length, 0);
  assert.equal(restarted, false);
});
