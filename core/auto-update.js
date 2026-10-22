import { checkForUpdates, installUpdates } from './git-updates.js';
const checkIntervalMs = 5 * 60 * 1000;

export function createAutoUpdater({ storage, lifecycle, logger, executeGit, executeNpm }) {
  let timer;
  let checking = false;
  let deploymentRequestedCommit;

  async function checkNow() {
    if (checking) return;
    checking = true;

    try {
      if (await storage.get('feature:auto_update') !== true) return;

      const status = await checkForUpdates(executeGit);
      const { commits } = status;
      if (!commits.length) return;

      if (status.provider !== 'git' && deploymentRequestedCommit === status.latestCommit) return;
      const deployment = await installUpdates(executeGit, executeNpm, {
        provider: status.provider,
        targetCommit: status.latestCommit,
      });
      if (deployment?.provider && deployment.provider !== 'git') {
        deploymentRequestedCommit = status.latestCommit;
        logger.info({ provider: deployment.provider, deploymentId: deployment.deploymentId }, 'Déploiement automatique demandé à la plateforme.');
        return;
      }
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
      void checkNow();
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
