import { unwrapMessage } from '../core/message-content.js';
import { downloadSupportedMedia, parseSupportedMediaUrl } from '../core/downloads.js';

function findLink(context) {
  const quotedContent = unwrapMessage(context.quotedMessage);
  const quotedText = quotedContent.conversation
    || quotedContent.extendedTextMessage?.text
    || '';
  const input = context.args.join(' ').trim() || quotedText.trim();
  const match = input.match(/https:\/\/[^\s<>]+/i);
  return match?.[0].replace(/[),.!?]+$/, '') || '';
}

export default {
  name: 'download',
  aliases: ['tiktok', 'insta', 'fb', 'youtube', 'yt'],
  description: 'Télécharge un média public compatible depuis YouTube, TikTok, Instagram ou Facebook.',
  async execute(context) {
    const url = findLink(context);
    if (!parseSupportedMediaUrl(url)) {
      await context.sendReply('Envoie un lien HTTPS public YouTube, TikTok, Instagram ou Facebook avec .download (ou .yt/.tiktok/.insta/.fb).');
      return;
    }

    try {
      const media = await (context.downloadExternalMedia || downloadSupportedMedia)(url);
      await context.socket.sendMessage(
        context.chatId,
        { [media.mediaType]: media.buffer, mimetype: media.mimetype },
        { quoted: context.message },
      );
    } catch (error) {
      context.logger.error(
        { host: new URL(url).hostname, errorCode: error.code },
        'Échec du téléchargement externe.',
      );
      await context.sendReply(error.message || 'Impossible de télécharger ce média.');
    }
  },
};
