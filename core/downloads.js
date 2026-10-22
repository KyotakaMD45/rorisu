import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const maximumDownloadBytes = 20 * 1024 * 1024;
const downloadTimeoutMs = 120_000;
const supportedDomains = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
];
const mediaTypes = new Map([
  ['mp4', { mediaType: 'video', mimetype: 'video/mp4' }],
  ['webm', { mediaType: 'video', mimetype: 'video/webm' }],
  ['mp3', { mediaType: 'audio', mimetype: 'audio/mpeg' }],
  ['m4a', { mediaType: 'audio', mimetype: 'audio/mp4' }],
  ['jpg', { mediaType: 'image', mimetype: 'image/jpeg' }],
  ['jpeg', { mediaType: 'image', mimetype: 'image/jpeg' }],
  ['png', { mediaType: 'image', mimetype: 'image/png' }],
  ['webp', { mediaType: 'image', mimetype: 'image/webp' }],
]);

export function parseSupportedMediaUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !supportedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return null;
  }
  return url;
}

function sanitizedDownloaderError(stderr) {
  return stderr
    .trim()
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[lien masqué]')
    .slice(-500);
}

export function buildDownloaderArguments(url, outputTemplate) {
  return [
    '--ignore-config',
    '--no-cache-dir',
    '--no-playlist',
    '--no-progress',
    '--max-filesize', '20M',
    '--format', 'best[ext=mp4]/best',
    '--output', outputTemplate,
    '--',
    url,
  ];
}

function runDownloader(url, outputDirectory) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const outputTemplate = path.join(outputDirectory, 'media.%(ext)s');
    const child = spawn(executable, buildDownloaderArguments(url.href, outputTemplate), {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    let timedOut = false;
    let oversized = false;
    let settled = false;
    let monitorBusy = false;
    let monitorError;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(monitor);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, downloadTimeoutMs);
    const monitor = setInterval(async () => {
      if (monitorBusy || settled) return;
      monitorBusy = true;
      try {
        const files = await fs.readdir(outputDirectory);
        for (const file of files) {
          const { size } = await fs.stat(path.join(outputDirectory, file));
          if (size > maximumDownloadBytes) {
            oversized = true;
            child.kill();
            break;
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          monitorError = error;
          child.kill();
        }
      } finally {
        monitorBusy = false;
      }
    }, 500);
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    child.once('error', (error) => {
      finish(new Error(`yt-dlp n’est pas disponible (${error.code || error.message}).`));
    });
    child.once('close', (code) => {
      if (oversized) {
        finish(new Error('Le média dépasse la limite de 20 Mo.'));
      } else if (timedOut) {
        finish(new Error('Le téléchargement a dépassé le délai de 2 minutes.'));
      } else if (monitorError) {
        finish(new Error('Impossible de contrôler la taille du média téléchargé.'));
      } else if (code !== 0) {
        finish(new Error(sanitizedDownloaderError(stderr)
          || `yt-dlp s’est terminé avec le code ${code}.`));
      } else {
        finish();
      }
    });
  });
}

export async function downloadSupportedMedia(input) {
  const url = parseSupportedMediaUrl(input);
  if (!url) {
    throw new Error('Utilise un lien HTTPS public de YouTube, TikTok, Instagram ou Facebook.');
  }

  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'rorisu-download-'));
  try {
    await runDownloader(url, outputDirectory);
    const files = (await fs.readdir(outputDirectory))
      .filter((file) => !file.endsWith('.part'));
    if (files.length !== 1) {
      throw new Error('Aucun média compatible n’a été téléchargé.');
    }

    const filePath = path.join(outputDirectory, files[0]);
    const extension = path.extname(files[0]).slice(1).toLowerCase();
    const type = mediaTypes.get(extension);
    if (!type) throw new Error('Le format téléchargé n’est pas pris en charge.');

    const { size } = await fs.stat(filePath);
    if (size <= 0 || size > maximumDownloadBytes) {
      throw new Error('Le média est vide ou dépasse la limite de 20 Mo.');
    }
    return { ...type, buffer: await fs.readFile(filePath) };
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

export { supportedDomains };
