import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default {
  name: 'update',
  aliases: [],
  description: 'Met à jour le bot depuis Git (propriétaire uniquement).',
  async execute({ isSudo, sendReply, lifecycle, chatId, logger }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    try {
      await execFileAsync('git', ['pull', '--ff-only'], {
        cwd: projectDirectory,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: 120_000,
        windowsHide: true,
      });
    } catch (error) {
      logger.error({ err: error }, 'Échec de la mise à jour Git.');
      await sendReply(
        'La mise à jour a échoué. Vérifiez que ce dépôt Git a une branche distante configurée et consultez les journaux.',
      );
      return;
    }

    await lifecycle.restart(chatId);
  },
};
