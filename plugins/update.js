import { checkForUpdates, installUpdates } from '../core/git-updates.js';

export function createUpdatePlugin({
  checkUpdates = checkForUpdates,
  applyUpdates = installUpdates,
} = {}) {
  return {
    name: 'update',
    aliases: [],
    description: 'Vérifie les mises à jour ; .update now les installe (propriétaire uniquement).',
    async execute({ isSudo, args, sendReply, sendOwnerReply, lifecycle, logger }) {
      const sendUpdateReply = sendOwnerReply || sendReply;
      if (!isSudo) {
        await sendReply('Cette commande est réservée au propriétaire du bot.');
        return;
      }

      const action = args[0]?.toLowerCase();
      if (args.length > 1 || (action && action !== 'now')) {
        await sendUpdateReply('Utilisation : .update pour vérifier, .update now pour installer.');
        return;
      }

      let status;
      try {
        status = await checkUpdates();
      } catch (error) {
        logger.error({ err: error }, 'Impossible de vérifier les mises à jour Git.');
        if (error.code === 'ERR_NOT_GIT_REPOSITORY') {
          await sendUpdateReply('Cette installation vient d’une archive ZIP et ne contient pas Git. `.update` ne peut pas fonctionner ainsi : réinstalle le bot avec la dernière commande Windows du README, qui clone le dépôt Git.');
          return;
        }
        await sendUpdateReply('Impossible de vérifier les mises à jour. Vérifie la configuration Git ou les variables secrètes de déploiement puis consulte les journaux.');
        return;
      }

      if (!status.commits.length) {
        await sendUpdateReply('RORISU est déjà à jour.');
        return;
      }

      if (action !== 'now') {
        const visibleCommits = status.commits.slice(0, 10);
        const remainingCount = status.commits.length - visibleCommits.length;
        const remaining = remainingCount ? `\n… et ${remainingCount} autre(s).` : '';
        await sendUpdateReply(
          `${status.commits.length} mise(s) à jour disponible(s) :\n${visibleCommits.join('\n')}${remaining}\n\nUtilise .update now pour installer.`,
        );
        return;
      }

      await sendUpdateReply('Mise à jour de RORISU en cours…');
      try {
        const result = await applyUpdates(undefined, undefined, {
          provider: status.provider,
          targetCommit: status.latestCommit,
        });
        if (result?.provider && result.provider !== 'git') {
          await sendUpdateReply(`Déploiement demandé à ${result.provider}. La plateforme va construire la version GitHub puis redémarrer le bot.`);
          return;
        }
      } catch (error) {
        logger.error({ err: error }, 'Échec de l’installation des mises à jour Git.');
        if (error.code === 'ERR_DIRTY_WORKTREE') {
          await sendUpdateReply('Mise à jour bloquée : des changements locaux existent. Sauvegarde-les ou mets-les de côté, puis réessaie.');
          return;
        }
        if (error.userMessage) {
          await sendUpdateReply(`Mise à jour impossible : ${error.userMessage}`);
          return;
        }
        await sendUpdateReply('La mise à jour a échoué. Vérifie la configuration de déploiement et consulte les journaux.');
        return;
      }

      await sendUpdateReply('Mise à jour installée. Redémarrage de RORISU…');
      await lifecycle.restart();
    },
  };
}

export default createUpdatePlugin();
