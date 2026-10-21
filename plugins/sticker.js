import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { unwrapMessage } from '../core/handler.js';
import pino from 'pino';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDirectory = path.join(projectDirectory, 'data', 'sticker-work');

// Repère l'image ou la vidéo du message courant, ou celle citée par la commande.
function findMedia(message) {
  const content = unwrapMessage(message?.message);
  if (content.imageMessage) return { type: 'image', media: content.imageMessage };
  if (content.videoMessage) return { type: 'video', media: content.videoMessage };
  return null;
}

// Lance ffmpeg avec des arguments explicites, une durée limitée et aucune commande shell.
function convertToWebp(inputPath, outputPath, type) {
  const filters = type === 'video'
    ? 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba'
    : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba';
  const argumentsList = [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-t', '10', '-vf', filters, '-loop', '0', '-an', '-vcodec', 'libwebp',
    '-quality', '75', '-fs', '8388608',
  ];
  if (type === 'image') argumentsList.push('-vframes', '1');
  argumentsList.push(outputPath);

  return new Promise((resolve, reject) => {
    const process = spawn(ffmpeg.path, argumentsList, { windowsHide: true });
    let errorOutput = '';
    const timeout = setTimeout(() => process.kill(), 90_000);
    process.stderr.on('data', (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-4000);
    });
    process.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorOutput || `ffmpeg s’est terminé avec le code ${code}.`));
    });
  });
}

// Télécharge le média, le convertit en WebP, l'envoie puis supprime les fichiers de travail.
export default {
  name: 'sticker',
  aliases: ['s', 'autocollant'],
  description: 'Crée un autocollant depuis une image ou vidéo.',
  async execute(context) {
    const quoted = context.quotedMessage;
    const mediaSource = findMedia(context.message) ? context.message : findMedia(quoted) ? quoted : null;
    const found = findMedia(mediaSource);
    if (!found) {
      await context.sendReply('Envoyez ou citez une image/vidéo avec la commande sticker.');
      return;
    }
    if (found.media.fileLength && Number(found.media.fileLength) > 20 * 1024 * 1024) {
      await context.sendReply('Le média dépasse la limite de 20 Mo.');
      return;
    }

    const directory = path.join(workDirectory, randomUUID());
    const inputPath = path.join(directory, found.type === 'video' ? 'input.mp4' : 'input.image');
    const outputPath = path.join(directory, 'sticker.webp');

    try {
      await fs.mkdir(directory, { recursive: true });
      const buffer = await downloadMediaMessage(
        mediaSource,
        'buffer',
        {},
        {
          logger: pino({ level: 'silent' }),
          reuploadRequest: (key) => context.socket.updateMediaMessage(key),
        },
      );
      await fs.writeFile(inputPath, buffer);
      await convertToWebp(inputPath, outputPath, found.type);
      const sticker = await fs.readFile(outputPath);
      await context.socket.sendMessage(context.chatId, { sticker }, { quoted: context.message });
    } catch (error) {
      context.logger.error({ err: error }, 'Échec de la conversion en autocollant.');
      await context.sendReply('Impossible de convertir ce média en autocollant.');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
