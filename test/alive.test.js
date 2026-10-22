import assert from 'node:assert/strict';
import test from 'node:test';
import alive, { formatUptime } from '../plugins/alive.js';

test('formatUptime affiche les jours, heures, minutes et secondes', () => {
  assert.equal(formatUptime(93784), '1 j 2 h 3 min 4 s');
  assert.equal(formatUptime(65), '1 min 5 s');
  assert.equal(formatUptime(-1), '0 s');
});

test('alive affiche le temps en ligne, les ressources et les fonctions', async () => {
  const replies = [];
  await alive.execute({
    config: { botName: 'RORISU', gemini: { apiKey: '' } },
    storage: { async get() { return false; } },
    async sendReply(text) { replies.push(text); },
  });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /RORISU est en ligne/);
  assert.match(replies[0], /Temps en ligne :/);
  assert.match(replies[0], /Mémoire utilisée : \d+ Mo/);
  assert.match(replies[0], new RegExp(`Node\\.js : ${process.version.replaceAll('.', '\\.')}`));
  assert.match(replies[0], /AUTO_UPDATE : désactivée/);
});
