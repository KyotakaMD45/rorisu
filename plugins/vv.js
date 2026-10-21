import { isViewOnceMessage } from '../core/message-recovery.js';

export default {
  name: 'vv',
  aliases: [],
  description: 'Explique la protection des médias à vue unique.',
  async execute({ quotedMessage, sendReply }) {
    if (!quotedMessage || !isViewOnceMessage(quotedMessage)) {
      await sendReply('Réponds à une photo ou vidéo à vue unique avec .vv.');
      return;
    }

    await sendReply('Les médias à vue unique ne sont pas enregistrés ni retransmis. Demande à la personne de te le renvoyer si elle est d’accord.');
  },
};
