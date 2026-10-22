export default {
  name: 'vv',
  aliases: [],
  description: 'Explique la protection des médias à vue unique.',
  async execute({ sendReply }) {
    await sendReply('Les médias à vue unique sont protégés : ce bot ne les ouvre, n’enregistre ni ne retransmet. Demande à la personne de te le renvoyer si elle est d’accord.');
  },
};
