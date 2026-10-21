export default {
  name: 'react',
  aliases: [],
  description: 'Réagit au message cité.',
  async execute({ socket, chatId, quotedMessage, args, sendReply }) {
    const emoji = args.join(' ').trim();
    if (!quotedMessage?.key) {
      await sendReply('Réponds au message auquel tu veux réagir.');
      return;
    }
    if (!emoji || [...emoji].length > 8) {
      await sendReply('Utilisation : .react emoji (8 caractères maximum).');
      return;
    }

    await socket.sendMessage(chatId, {
      react: { text: emoji, key: quotedMessage.key },
    });
  },
};
