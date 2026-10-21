export default {
  name: 'poll',
  aliases: [],
  description: 'Crée un sondage WhatsApp.',
  async execute({ args, socket, chatId, sendReply }) {
    const [question, ...rawOptions] = args.join(' ').split(',');
    const options = rawOptions.map((option) => option.trim()).filter(Boolean);
    const name = question?.trim();

    if (!name || options.length < 2) {
      await sendReply('Utilisation : .poll Question, option 1, option 2 (au moins deux choix).');
      return;
    }
    if (new Set(options).size !== options.length) {
      await sendReply('Les choix du sondage doivent être différents.');
      return;
    }
    if (options.length > 12 || options.some((option) => option.length > 100) || name.length > 255) {
      await sendReply('Le sondage dépasse les limites autorisées de WhatsApp.');
      return;
    }

    await socket.sendMessage(chatId, {
      poll: { name, values: options, selectableCount: 1 },
    });
  },
};
