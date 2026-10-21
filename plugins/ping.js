import { performance } from 'node:perf_hooks';

// Vérifie rapidement que le bot reçoit et traite les commandes.
export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Vérifie que le bot est en ligne et mesure la latence.',
  async execute({ sendReply, config }) {
    const startedAt = performance.now();
    await sendReply(`Pong ! 🏓\n${config.botName} est en ligne.`);
    const latency = Math.round(performance.now() - startedAt);
    await sendReply(`Latence : ${latency} ms`);
  },
};
