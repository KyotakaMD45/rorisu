export default {
  name: 'alive',
  aliases: [],
  description: 'Affiche l’état et les fonctions activées du bot.',
  async execute({ config, storage, sendReply }) {
    const autoStatus = await storage.get('feature:auto_status') === true ? 'activé' : 'désactivé';
    const autoStatusView = await storage.get('feature:auto_status_view') === true ? 'activée' : 'désactivée';
    const sendRead = await storage.get('feature:send_read') === true ? 'activés' : 'désactivés';
    const autoUpdate = await storage.get('feature:auto_update') === true ? 'activée' : 'désactivée';
    const uptimeMinutes = Math.floor(process.uptime() / 60);
    await sendReply(
      `${config.botName} est en ligne.\nTemps de fonctionnement : ${uptimeMinutes} min.\nAUTO_STATUS : ${autoStatus}\nAUTO_STATUS_VIEW : ${autoStatusView}\nSEND_READ : ${sendRead}\nAUTO_UPDATE : ${autoUpdate}`,
    );
  },
};
