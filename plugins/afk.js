export default {
  name: 'afk',
  aliases: [],
  description: 'Signale votre absence et prévient les personnes qui vous mentionnent.',
  async execute({ senderNumber, args, sendReply, storage }) {
    const key = `afk:${senderNumber}`;
    const current = await storage.get(key);

    if (args[0]?.toLowerCase() === 'off') {
      if (!current) {
        await sendReply('Tu n’étais pas indiqué comme absent.');
        return;
      }
      await storage.set(key, null);
      await sendReply('Tu n’es plus indiqué comme absent.');
      return;
    }

    const reason = args.join(' ').trim();
    await storage.set(key, { reason, since: Date.now() });
    await sendReply(reason ? `Absence activée : ${reason}` : 'Absence activée.');
  },
};
