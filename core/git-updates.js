import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPlatformUpdates,
  getUpdateProvider,
  requestPlatformDeployment,
} from './platform-updates.js';

const execFileAsync = promisify(execFile);
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryUrl = 'https://github.com/KyotakaMD45/rorisu.git';
const upstream = 'origin/master';

export function runGit(args) {
  return execFileAsync('git', args, {
    cwd: projectDirectory,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 120_000,
    windowsHide: true,
  });
}

function throwGitRepositoryError(error) {
  const detail = `${error.stderr || ''} ${error.message || ''}`.toLowerCase();
  if (detail.includes('not a git repository') || error.code === 'ENOTDIR') {
    const repositoryError = new Error(
      'Cette installation ne contient pas de dépôt Git. Réinstalle le bot depuis un clone Git.',
    );
    repositoryError.code = 'ERR_NOT_GIT_REPOSITORY';
    throw repositoryError;
  }
  throw error;
}

async function executeRepositoryGit(executeGit, args) {
  try {
    return await executeGit(args);
  } catch (error) {
    throwGitRepositoryError(error);
  }
}

export async function checkForUpdates(executeGit = runGit, options = {}) {
  const provider = options.provider || getUpdateProvider(options.environment);
  if (provider !== 'git') {
    return checkPlatformUpdates({
      provider,
      environment: options.environment,
      fetchImpl: options.fetchImpl,
    });
  }

  await executeRepositoryGit(executeGit, ['remote', 'set-url', 'origin', repositoryUrl]);
  await executeRepositoryGit(executeGit, ['fetch', '--prune', 'origin']);

  const { stdout: localOutput } = await executeRepositoryGit(executeGit, ['rev-parse', 'HEAD']);
  const { stdout: remoteOutput } = await executeRepositoryGit(executeGit, [
    'rev-parse',
    '--verify',
    `refs/remotes/${upstream}`,
  ]);
  if (localOutput.trim() === remoteOutput.trim()) {
    return { provider, upstream, commits: [], latestCommit: remoteOutput.trim() };
  }

  const { stdout: logOutput } = await executeRepositoryGit(executeGit, [
    'log',
    '--format=%h%x09%s',
    `HEAD..${upstream}`,
  ]);
  const commits = logOutput.trim().split(/\r?\n/).filter(Boolean);
  if (!commits.length) {
    throw new Error('Git détecte un écart, mais n’a pas pu lire les commits distants.');
  }
  return { provider, upstream, commits, latestCommit: remoteOutput.trim() };
}

export async function installUpdates(executeGit = runGit, executeNpm = execFileAsync, options = {}) {
  const provider = options.provider || getUpdateProvider(options.environment);
  if (provider !== 'git') {
    return requestPlatformDeployment({
      provider,
      targetCommit: options.targetCommit,
      environment: options.environment,
      fetchImpl: options.fetchImpl,
    });
  }

  const { stdout: statusOutput } = await executeRepositoryGit(executeGit, ['status', '--porcelain']);
  if (statusOutput?.trim()) {
    const changedFiles = statusOutput
      .trim()
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const visibleFiles = changedFiles.slice(0, 5);
    const extraFiles = changedFiles.length - visibleFiles.length;
    const fileList = visibleFiles.length
      ? ` Fichiers concernés : ${visibleFiles.join(', ')}${extraFiles > 0 ? ` et ${extraFiles} autre(s)` : ''}.`
      : '';
    const error = new Error(`Des modifications locales empêchent une mise à jour sûre.${fileList}`);
    error.code = 'ERR_DIRTY_WORKTREE';
    error.userMessage = `${error.message} Depuis le dossier du bot, vérifie \`git status --short\`; sauvegarde les changements avant de réessayer.`;
    throw error;
  }

  await executeRepositoryGit(executeGit, ['fetch', '--prune', 'origin']);
  const targetCommit = options.targetCommit || upstream;
  if (options.targetCommit && !/^[a-f\d]{40,64}$/i.test(options.targetCommit)) {
    const error = new Error('Le commit cible de la mise à jour est invalide.');
    error.code = 'ERR_UPDATE_REVISION_UNKNOWN';
    error.userMessage = error.message;
    throw error;
  }
  await executeRepositoryGit(executeGit, ['merge', '--ff-only', targetCommit]);
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm ci --omit=dev']
    : ['ci', '--omit=dev'];
  try {
    return await executeNpm(command, args, {
      cwd: projectDirectory,
      env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
      timeout: 300_000,
      windowsHide: true,
    });
  } catch (cause) {
    const error = new Error('Le code a été mis à jour, mais npm ci n’a pas pu installer les dépendances.', { cause });
    error.code = 'ERR_UPDATE_DEPENDENCIES';
    error.userMessage = 'Le code a été récupéré, mais l’installation des dépendances (npm ci) a échoué. Consulte les journaux PM2/du terminal, corrige l’erreur npm puis relance npm ci --omit=dev avant de redémarrer le bot.';
    throw error;
  }
}
