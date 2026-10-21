import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let writeQueue = Promise.resolve();

async function writeEnvVariableNow(name, value, filePath) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new TypeError('Le nom de variable .env est invalide.');
  }
  if (typeof value !== 'string' || /[\r\n]/.test(value)) {
    throw new TypeError('La valeur de variable .env est invalide.');
  }

  const absolutePath = path.resolve(filePath);
  let existing;
  try {
    existing = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    existing = '';
  }

  const lines = existing.split(/\r?\n/);
  const variableLine = new RegExp(`^\\s*${name}\\s*=`);
  const updatedLines = lines.filter((line) => !variableLine.test(line));
  while (updatedLines.length && updatedLines.at(-1) === '') updatedLines.pop();
  updatedLines.push(`${name}=${value}`);

  const temporaryPath = `${absolutePath}.${randomUUID()}.writing`;
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(temporaryPath, `${updatedLines.join('\n')}\n`, 'utf8');

  try {
    await fs.rename(temporaryPath, absolutePath);
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    try {
      await fs.writeFile(absolutePath, `${updatedLines.join('\n')}\n`, 'utf8');
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}

export function writeEnvVariable(name, value, filePath = path.join(projectDirectory, '.env')) {
  const result = writeQueue.then(() => writeEnvVariableNow(name, value, filePath));
  writeQueue = result.catch(() => {});
  return result;
}
