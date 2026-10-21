import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function runGit(args) {
  return execFileAsync('git', args, {
    cwd: projectDirectory,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 120_000,
    windowsHide: true,
  });
}

export async function checkForUpdates(executeGit = runGit) {
  await executeGit(['fetch']);
  const { stdout: upstreamOutput } = await executeGit([
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const upstream = upstreamOutput.trim();
  if (!upstream) throw new Error('Aucune branche distante de suivi n’est configurée.');

  const { stdout: localOutput } = await executeGit(['rev-parse', 'HEAD']);
  const { stdout: remoteOutput } = await executeGit(['rev-parse', upstream]);
  if (localOutput.trim() === remoteOutput.trim()) {
    return { upstream, commits: [] };
  }

  const { stdout: logOutput } = await executeGit([
    'log',
    '--format=%h%x09%s',
    `HEAD..${upstream}`,
  ]);
  const commits = logOutput.trim().split(/\r?\n/).filter(Boolean);
  if (!commits.length) {
    throw new Error('Git détecte un écart, mais n’a pas pu lire les commits distants.');
  }
  return { upstream, commits };
}

export function installUpdates(executeGit = runGit) {
  return executeGit(['merge', '--ff-only', '@{upstream}']);
}
