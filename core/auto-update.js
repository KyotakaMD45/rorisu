import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkIntervalMs = 5 * 60 * 1000;

async function runGit(args) {
  return execFileAsync('git', args, {
    cwd: projectDirectory,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 120_000,
    windowsHide: true,
  });
}

export function createAutoUpdater({ storage, lifecycle, logger, executeGit = runGit }) {
  let timer;
  let checking = false;

  async function checkNow() {
    if (checking) return;
    checking = true;

    try {
      if (await storage.get('feature:auto_update') !== true) return;

      await executeGit(['fetch']);
      const { stdout: upstreamOutput } = await executeGit([
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{upstream}',
      ]);
      const upstream = upstreamOutput.trim();
      const { stdout: localOutput } = await executeGit(['rev-parse', 'HEAD']);
      const { stdout: remoteOutput } = await executeGit(['rev-parse', upstream]);

      if (localOutput.trim() === remoteOutput.trim()) return;

      await executeGit(['merge', '--ff-only', upstream]);
      logger.info('Mise à jour automatique installée ; redémarrage du bot.');
      await lifecycle.restart();
    } catch (error) {
      logger.error({ err: error }, 'Échec de la mise à jour automatique Git.');
    } finally {
      checking = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void checkNow(), checkIntervalMs);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
    checkNow,
  };
}
