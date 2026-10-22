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
    const error = new Error('Des modifications locales empêchent une mise à jour sûre.');
    error.code = 'ERR_DIRTY_WORKTREE';
    throw error;
  }

  await executeRepositoryGit(executeGit, ['merge', '--ff-only', upstream]);
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm ci --omit=dev']
    : ['ci', '--omit=dev'];
  return executeNpm(command, args, {
    cwd: projectDirectory,
    env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
    timeout: 300_000,
    windowsHide: true,
  });
}
