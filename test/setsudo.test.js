import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readEnvVariables } from '../core/env.js';
import setSudoPlugin from '../plugins/setsudo.js';

test('setsudo ajoute, liste et retire des propriétaires immédiatement et dans config.env', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rorisu-setsudo-'));
  const envFilePath = path.join(directory, 'config.env');
  const sudoNumbers = ['33612345678'];
  const replies = [];
  const context = {
    isSudo: true,
    config: { sudoNumbers },
    envFilePath,
    async sendReply(text) { replies.push(text); },
  };

  try {
    await setSudoPlugin.execute({
      ...context,
      args: ['add', '+225', '01', '23', '45', '67', '89'],
    });
    assert.deepEqual(sudoNumbers, ['33612345678', '2250123456789']);
    assert.equal((await readEnvVariables(envFilePath)).SUDO, '33612345678,2250123456789');
    assert.match(replies[0], /peut maintenant utiliser/);

    await setSudoPlugin.execute({ ...context, args: ['list'] });
    assert.match(replies[1], /33612345678, 2250123456789/);

    await setSudoPlugin.execute({
      ...context,
      args: ['remove', '2250123456789'],
    });
    assert.deepEqual(sudoNumbers, ['33612345678']);
    assert.equal((await readEnvVariables(envFilePath)).SUDO, '33612345678');
    assert.match(replies[2], /a été retiré/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('setsudo est réservé au propriétaire et protège le dernier propriétaire', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rorisu-setsudo-'));
  const envFilePath = path.join(directory, 'config.env');
  const sudoNumbers = ['33612345678'];
  const replies = [];
  const context = {
    isSudo: true,
    config: { sudoNumbers },
    envFilePath,
    async sendReply(text) { replies.push(text); },
  };

  try {
    await setSudoPlugin.execute({ ...context, isSudo: false, args: ['add', '22501234567'] });
    assert.deepEqual(sudoNumbers, ['33612345678']);
    assert.deepEqual(await readEnvVariables(envFilePath), {});
    assert.match(replies[0], /réservée au propriétaire/);

    await setSudoPlugin.execute({ ...context, args: ['remove', '33612345678'] });
    assert.deepEqual(sudoNumbers, ['33612345678']);
    assert.deepEqual(await readEnvVariables(envFilePath), {});
    assert.match(replies[1], /dernier propriétaire/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('setsudo refuse les numéros invalides et les ajouts en double', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rorisu-setsudo-'));
  const envFilePath = path.join(directory, 'config.env');
  const sudoNumbers = ['33612345678'];
  const replies = [];
  const context = {
    isSudo: true,
    config: { sudoNumbers },
    envFilePath,
    async sendReply(text) { replies.push(text); },
  };

  try {
    await setSudoPlugin.execute({ ...context, args: ['add', 'not-a-number'] });
    await setSudoPlugin.execute({ ...context, args: ['33612345678'] });
    assert.deepEqual(sudoNumbers, ['33612345678']);
    assert.deepEqual(await readEnvVariables(envFilePath), {});
    assert.match(replies[0], /numéro doit contenir/);
    assert.match(replies[1], /déjà propriétaire/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
