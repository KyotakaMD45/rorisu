import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDownloaderArguments,
  parseSupportedMediaUrl,
} from '../core/downloads.js';
import downloadPlugin from '../plugins/download.js';

test('le téléchargeur interdit les playlists sans interrompre un média unique', () => {
  const url = 'https://www.facebook.com/share/r/1K7cs4c38L/';
  const args = buildDownloaderArguments(url, 'media.%(ext)s');

  assert.ok(args.includes('--no-playlist'));
  assert.equal(args.includes('--max-downloads'), false);
  assert.equal(args.at(-1), url);
});

test('les URL publiques des plateformes prises en charge sont validées', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=video-id',
    'https://youtu.be/video-id',
    'https://www.tiktok.com/@creator/video/123',
    'https://www.instagram.com/reel/abc123/',
    'https://www.facebook.com/watch/?v=123',
    'https://fb.watch/abc123/',
  ]) {
    assert.ok(parseSupportedMediaUrl(url), `URL non reconnue : ${url}`);
  }
});

test('le téléchargeur rejette les URL non HTTPS et les domaines trompeurs', () => {
  for (const url of [
    'http://www.youtube.com/watch?v=video-id',
    'https://youtube.com.example.org/watch?v=video-id',
    'https://youtube.com@127.0.0.1/watch?v=video-id',
    'https://user:password@youtube.com/watch?v=video-id',
    'https://youtube.com:8443/watch?v=video-id',
    'https://example.org/video.mp4',
    'not a URL',
  ]) {
    assert.equal(parseSupportedMediaUrl(url), null, `URL acceptée à tort : ${url}`);
  }
});

test('download envoie un média et accepte un lien cité', async () => {
  const sent = [];
  const downloadedUrls = [];
  const message = { key: { id: 'command-id' } };
  await downloadPlugin.execute({
    args: [],
    message,
    chatId: 'chat@s.whatsapp.net',
    quotedMessage: {
      message: { conversation: 'Télécharge : https://youtu.be/video-id' },
    },
    socket: {
      async sendMessage(chatId, content, options) {
        sent.push({ chatId, content, options });
      },
    },
    async downloadExternalMedia(url) {
      downloadedUrls.push(url);
      return {
        mediaType: 'video',
        mimetype: 'video/mp4',
        buffer: Buffer.from('video'),
      };
    },
    async sendReply() {
      assert.fail('Le téléchargement du lien cité doit réussir.');
    },
    logger: { error() {} },
  });

  assert.deepEqual(downloadedUrls, ['https://youtu.be/video-id']);
  assert.deepEqual(sent, [{
    chatId: 'chat@s.whatsapp.net',
    content: { video: Buffer.from('video'), mimetype: 'video/mp4' },
    options: { quoted: message },
  }]);
});

test('download refuse les domaines non pris en charge sans lancer le téléchargement', async () => {
  const replies = [];
  let downloaded = false;
  await downloadPlugin.execute({
    args: ['https://example.org/video.mp4'],
    quotedMessage: null,
    async downloadExternalMedia() { downloaded = true; },
    async sendReply(text) { replies.push(text); },
  });
  assert.equal(downloaded, false);
  assert.match(replies[0], /YouTube, TikTok, Instagram ou Facebook/);
});

test('download signale clairement une erreur du téléchargeur', async () => {
  const replies = [];
  const logs = [];
  await downloadPlugin.execute({
    args: ['https://youtu.be/video-id'],
    message: { key: { id: 'command-id' } },
    chatId: 'chat@s.whatsapp.net',
    socket: { async sendMessage() { assert.fail('Aucun média ne doit être envoyé.'); } },
    async downloadExternalMedia() { throw new Error('yt-dlp indisponible'); },
    async sendReply(text) { replies.push(text); },
    logger: { error(details, message) { logs.push({ details, message }); } },
  });
  assert.deepEqual(replies, ['yt-dlp indisponible']);
  assert.deepEqual(logs, [{
    details: { host: 'youtu.be', errorCode: undefined },
    message: 'Échec du téléchargement externe.',
  }]);
});
