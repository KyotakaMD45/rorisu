import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { createGeminiClient } from '../core/gemini.js';
import { unwrapMessage } from '../core/handler.js';

const supportedMedia = [
  ['imageMessage', 'image/png'],
  ['audioMessage', 'audio/ogg'],
  ['videoMessage', 'video/mp4'],
  ['documentMessage', 'application/pdf'],
];
const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'audio/aac',
  'audio/flac',
  'audio/mp3',
  'audio/m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'application/pdf',
]);
const maxReplyCharacters = 3500;

function findMedia(message) {
  const content = unwrapMessage(message);
  for (const [messageType, defaultMimeType] of supportedMedia) {
    const media = content[messageType];
    if (media) {
      return {
        media,
        mimeType: media.mimetype || defaultMimeType,
        messageType,
      };
    }
  }
  return null;
}

function splitText(text) {
  const characters = Array.from(text);
  const parts = [];
  for (let offset = 0; offset < characters.length; offset += maxReplyCharacters) {
    parts.push(characters.slice(offset, offset + maxReplyCharacters).join(''));
  }
  return parts;
}

export async function executeGemini(context, { generateImage = false } = {}) {
    const { args, message, quotedMessage, config, storage, chatId, senderNumber } = context;
    const input = args.join(' ').trim();
    const historyKey = `gemini:history:${chatId}:${senderNumber}`;
    const resetRequested = /^(?:reset|clear|oublie)$/i.test(input);
    if (generateImage && (!input || resetRequested)) {
      await context.sendReply('Utilisation : .image décris l’image à générer.');
      return;
    }
    if (!generateImage && resetRequested) {
      await storage.set(historyKey, []);
      await context.sendReply('Le contexte Gemini de cette discussion a été effacé.');
      return;
    }

    const mediaSource = findMedia(message) ? message : findMedia(quotedMessage) ? quotedMessage : null;
    const foundMedia = findMedia(mediaSource);
    if (!input && !foundMedia) {
      await context.sendReply('Utilisation : .gemini votre question (ou citez/envoyez un média à analyser). .gemini reset efface le contexte.');
      return;
    }

    let media = [];
    if (foundMedia) {
      const mimeType = foundMedia.mimeType.toLowerCase().split(';')[0].trim();
      if (!allowedMimeTypes.has(mimeType)) {
        await context.sendReply('Gemini prend en charge les images, fichiers audio, vidéos MP4 et documents PDF compatibles.');
        return;
      }
      if (foundMedia.media.fileLength
        && Number(foundMedia.media.fileLength) > config.gemini.maxMediaBytes) {
        const limitMegabytes = Math.ceil(config.gemini.maxMediaBytes / 1024 / 1024);
        await context.sendReply(`Le média dépasse la limite configurée de ${limitMegabytes} Mo.`);
        return;
      }

      try {
        const buffer = await downloadMediaMessage(
          mediaSource,
          'buffer',
          {},
          {
            logger: context.logger,
            reuploadRequest: (key) => context.socket.updateMediaMessage(key),
          },
        );
        if (!Buffer.isBuffer(buffer) || buffer.length > config.gemini.maxMediaBytes) {
          await context.sendReply('Le téléchargement du média est vide ou dépasse la limite configurée.');
          return;
        }
        media = [{ mimeType, buffer }];
      } catch (error) {
        context.logger.error({ err: error }, 'Échec du téléchargement du média pour Gemini.');
        await context.sendReply('Impossible de télécharger ce média pour Gemini.');
        return;
      }
    }

    const prompt = input || 'Décris et analyse ce média.';
    const oldHistory = !generateImage && config.gemini.contextTurns > 0
      ? await storage.get(historyKey)
      : [];
    const history = !generateImage && Array.isArray(oldHistory)
      ? oldHistory.slice(-config.gemini.contextTurns * 2)
      : [];
    const client = createGeminiClient({
      ...config.gemini,
      model: generateImage ? config.gemini.imageModel : config.gemini.model,
    });

    let result;
    try {
      result = await client.generate({
        prompt: generateImage ? `Generate an image based on this prompt. ${prompt}` : prompt,
        history,
        media,
        ...(generateImage ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
      });
    } catch (error) {
      context.logger.error({ err: error }, 'Échec de la requête Gemini.');
      await context.sendReply(error.message || 'La requête Gemini a échoué.');
      return;
    }

    for (const part of splitText(result.text)) {
      await context.sendReply(part);
    }
    const outputMedia = [...result.images, ...result.audios];
    const oversizedOutput = outputMedia.some(({ buffer }) => buffer.length > config.gemini.maxMediaBytes);
    if (oversizedOutput) {
      await context.sendReply('Gemini a généré un média qui dépasse la limite configurée ; il n’a pas été envoyé.');
    }
    for (const image of result.images.filter(({ buffer }) => buffer.length <= config.gemini.maxMediaBytes)) {
      await context.socket.sendMessage(
        chatId,
        { image: image.buffer, mimetype: image.mimeType },
        { quoted: message },
      );
    }
    for (const audio of result.audios.filter(({ buffer }) => buffer.length <= config.gemini.maxMediaBytes)) {
      await context.socket.sendMessage(
        chatId,
        { audio: audio.buffer, mimetype: audio.mimeType, ptt: audio.mimeType.includes('ogg') },
        { quoted: message },
      );
    }

    if (!generateImage && config.gemini.contextTurns > 0) {
      const responseText = result.text
        || (result.images.length ? '[Image générée par Gemini]' : '[Audio généré par Gemini]');
      await storage.set(historyKey, [
        ...history,
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: responseText }] },
      ].slice(-config.gemini.contextTurns * 2));
    }
}

export default {
  name: 'gemini',
  aliases: ['ai'],
  description: 'Pose une question à Gemini ou demande l’analyse d’un média.',
  async execute(context) {
    await executeGemini(context);
  },
};
