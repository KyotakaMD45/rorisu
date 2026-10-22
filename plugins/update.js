import { checkForUpdates, installUpdates } from '../core/git-updates.js';

export function createUpdatePlugin({
  checkUpdates = checkForUpdates,
  applyUpdates = installUpdates,
} = {}) {
  return {
    name: 'update',
    aliases: [],
    description: 'Vérifie les mises à jour ; .update now les installe (propriétaire uniquement).',
    async execute({ isSudo, args, sendReply, lifecycle, logger }) {
      if (!isSudo) {
        await sendReply('Cette commande est réservée au propriétaire du bot.');
        return;
      }

      const action = args[0]?.toLowerCase();
      if (args.length > 1 || (action && action !== 'now')) {
        await sendReply('Utilisation : .update pour vérifier, .update now pour installer.');
        return;
      }

      let status;
      try {
        status = await checkUpdates();
      } catch (error) {
        logger.error({ err: error }, 'Impossible de vérifier les mises à jour Git.');
        await sendReply('Impossible de vérifier les mises à jour. Vérifie le dépôt Git et consulte les journaux.');
        return;
      }

      if (!status.commits.length) {
        await sendReply('RORISU est déjà à jour.');
        return;
      }

      if (action !== 'now') {
        const visibleCommits = status.commits.slice(0, 10);
        const remainingCount = status.commits.length - visibleCommits.length;
        const remaining = remainingCount ? `\n… et ${remainingCount} autre(s).` : '';
        await sendReply(
          `${status.commits.length} mise(s) à jour disponible(s) :\n${visibleCommits.join('\n')}${remaining}\n\nUtilise .update now pour installer.`,
        );
        return;
      }

      await sendReply('Mise à jour de RORISU en cours…');
      try {
        await applyUpdates();
      } catch (error) {
        logger.error({ err: error }, 'Échec de l’installation des mises à jour Git.');
        if (error.code === 'ERR_DIRTY_WORKTREE') {
          await sendReply('Mise à jour bloquée : des changements locaux existent. Sauvegarde-les ou mets-les de côté, puis réessaie.');
          return;
        }
        await sendReply('La mise à jour a échoué. Vérifie les changements locaux et consulte les journaux.');
        return;
      }

      await sendReply('Mise à jour installée. Redémarrage de RORISU…');
      await lifecycle.restart();
    },
  };
}

export default createUpdatePlugin();
