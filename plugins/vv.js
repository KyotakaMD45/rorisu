import { isViewOnceMessage, sendRecoveredMessage } from '../core/message-recovery.js';

export default {
  name: 'vv',
  aliases: [],
  description: 'Récupère un média à vue unique cité.',
  async execute({ socket, message, quotedMessage, chatId, logger, sendReply, downloadMedia }) {
    if (!quotedMessage || !isViewOnceMessage(quotedMessage)) {
      await sendReply('Réponds à une photo ou vidéo à vue unique avec .vv.');
      return;
    }

    try {
      await sendRecoveredMessage({
        socket,
        destination: chatId,
        message: quotedMessage,
        logger,
        quoted: message,
        notice: 'Média à vue unique récupéré',
        downloadMedia,
      });
    } catch (error) {
      logger.error({ err: error, messageId: quotedMessage.key?.id }, 'Échec de la récupération du média à vue unique.');
      await sendReply(error.message || 'Impossible de récupérer ce média à vue unique.');
    }
  },
};
