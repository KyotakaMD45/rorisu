export function formatUptime(totalSeconds) {
  let remainingSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(remainingSeconds / 86400);
  remainingSeconds %= 86400;
  const hours = Math.floor(remainingSeconds / 3600);
  remainingSeconds %= 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const parts = [];

  if (days) parts.push(`${days} j`);
  if (hours || days) parts.push(`${hours} h`);
  if (minutes || hours || days) parts.push(`${minutes} min`);
  parts.push(`${seconds} s`);
  return parts.join(' ');
}

export default {
  name: 'alive',
  aliases: [],
  description: 'Affiche l’état, le temps en ligne et les ressources du bot.',
  async execute({ config, storage, sendReply }) {
    const autoStatus = await storage.get('feature:auto_status') === true ? 'activé' : 'désactivé';
    const autoStatusView = await storage.get('feature:auto_status_view') === true ? 'activée' : 'désactivée';
    const sendRead = await storage.get('feature:send_read') === true ? 'activés' : 'désactivés';
    const autoUpdate = await storage.get('feature:auto_update') === true ? 'activée' : 'désactivée';
    const antiDelete = await storage.get('feature:anti_delete') ? 'activée' : 'désactivée';
    const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    await sendReply(
      `✅ *${config.botName} est en ligne*\nTemps en ligne : ${formatUptime(process.uptime())}\nMémoire utilisée : ${memoryMb} Mo\nNode.js : ${process.version}\n\n⚙️ *Fonctions*\nAUTO_STATUS : ${autoStatus}\nAUTO_STATUS_VIEW : ${autoStatusView}\nSEND_READ : ${sendRead}\nAUTO_UPDATE : ${autoUpdate}\nANTI_DELETE : ${antiDelete}\nANTI_VV : désactivé (confidentialité)\nGEMINI : ${config.gemini?.apiKey ? 'activé' : 'désactivé (clé API manquante)'}`,
    );
  },
};
