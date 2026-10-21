export default {
  name: 'alive',
  aliases: [],
  description: 'Affiche l’état et les fonctions activées du bot.',
  async execute({ config, storage, sendReply }) {
    const autoStatus = await storage.get('feature:auto_status') === true ? 'activé' : 'désactivé';
    const autoUpdate = await storage.get('feature:auto_update') === true ? 'activée' : 'désactivée';
    const uptimeMinutes = Math.floor(process.uptime() / 60);
    await sendReply(
      `${config.botName} est en ligne.\nTemps de fonctionnement : ${uptimeMinutes} min.\nAUTO_STATUS : ${autoStatus}\nAUTO_UPDATE : ${autoUpdate}`,
    );
  },
};
