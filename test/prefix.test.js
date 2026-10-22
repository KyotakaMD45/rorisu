import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { normalizeApiMode, parseHandlerPrefixes } from '../config.js';
import { readEnvVariables } from '../core/env.js';
import prefixPlugin from '../plugins/prefix.js';

const envFilePath = path.resolve('data/test-prefix.env');

test('HANDLERS accepte les emoji, la ponctuation et le mode sans préfixe', () => {
  assert.deepEqual(parseHandlerPrefixes('null'), []);
  assert.deepEqual(parseHandlerPrefixes('🎉,!,?'), ['🎉', '!', '?']);
  assert.deepEqual(parseHandlerPrefixes('^[.,!]'), ['.', ',', '!']);
  assert.equal(normalizeApiMode('both'), 'true');
  assert.equal(normalizeApiMode('api'), 'only');
});

test('prefix affiche les préfixes actifs au propriétaire', async () => {
  const replies = [];
  await prefixPlugin.execute({
    isSudo: true,
    args: [],
    config: { prefixes: ['!', '.'] },
    async sendReply(text) { replies.push(text); },
  });
  assert.deepEqual(replies, ['Préfixes actuels : ! / .']);
});

test('prefix désactive les préfixes avec null et redémarre le bot', async () => {
  const previousHandlers = process.env.HANDLERS;
  const replies = [];
  const restarts = [];
  try {
    await fs.rm(envFilePath, { force: true });
    await prefixPlugin.execute({
      isSudo: true,
      args: ['null'],
      config: { prefixes: ['.'] },
      envFilePath,
      chatId: 'owner@s.whatsapp.net',
      lifecycle: { async restart(chatId) { restarts.push(chatId); } },
      async sendReply(text) { replies.push(text); },
    });
    assert.deepEqual(await readEnvVariables(envFilePath), { HANDLERS: 'null' });
    assert.equal(process.env.HANDLERS, 'null');
    assert.deepEqual(restarts, ['owner@s.whatsapp.net']);
    assert.match(replies[0], /commandes connues.*directement/);
  } finally {
    if (previousHandlers === undefined) delete process.env.HANDLERS;
    else process.env.HANDLERS = previousHandlers;
    await fs.rm(envFilePath, { force: true });
  }
});

test('prefix enregistre un ou plusieurs préfixes et redémarre le bot', async () => {
  const previousHandlers = process.env.HANDLERS;
  const replies = [];
  const restarts = [];
  try {
    await fs.rm(envFilePath, { force: true });
    await prefixPlugin.execute({
      isSudo: true,
      args: ['!,.'],
      config: { prefixes: ['.'] },
      envFilePath,
      chatId: 'owner@s.whatsapp.net',
      lifecycle: { async restart(chatId) { restarts.push(chatId); } },
      async sendReply(text) { replies.push(text); },
    });
    assert.deepEqual(await readEnvVariables(envFilePath), { HANDLERS: '!,.' });
    assert.equal(process.env.HANDLERS, '!,.');
    assert.deepEqual(restarts, ['owner@s.whatsapp.net']);
    assert.match(replies[0], /! \/ \./);
    assert.match(replies[0], /Redémarrage/);
  } finally {
    if (previousHandlers === undefined) delete process.env.HANDLERS;
    else process.env.HANDLERS = previousHandlers;
    await fs.rm(envFilePath, { force: true });
  }
});

test('prefix est réservé au propriétaire et rejette les valeurs invalides', async () => {
  const replies = [];
  const context = {
    isSudo: false,
    args: ['!'],
    config: { prefixes: ['.'] },
    async sendReply(text) { replies.push(text); },
  };
  await prefixPlugin.execute(context);
  assert.match(replies[0], /réservée au propriétaire/);

  await prefixPlugin.execute({ ...context, isSudo: true, args: ['bad prefix'] });
  assert.match(replies[1], /Utilisation/);
});
