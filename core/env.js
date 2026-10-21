import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let writeQueue = Promise.resolve();

function validateName(name) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new TypeError('Le nom de variable .env est invalide.');
  }
}

async function updateEnvFileNow(name, value, filePath) {
  validateName(name);
  if (value !== null && (typeof value !== 'string' || /[\r\n]/.test(value))) {
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
  if (value !== null) {
    while (updatedLines.length && updatedLines.at(-1) === '') updatedLines.pop();
    updatedLines.push(`${name}=${JSON.stringify(value)}`);
  }

  const temporaryPath = `${absolutePath}.${randomUUID()}.writing`;
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const contents = updatedLines.length ? `${updatedLines.join('\n')}\n` : '';
  await fs.writeFile(temporaryPath, contents, 'utf8');

  try {
    await fs.rename(temporaryPath, absolutePath);
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    try {
      await fs.writeFile(absolutePath, contents, 'utf8');
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}

export function writeEnvVariable(name, value, filePath = path.join(projectDirectory, '.env')) {
  const result = writeQueue.then(() => updateEnvFileNow(name, value, filePath));
  writeQueue = result.catch(() => {});
  return result;
}

export function deleteEnvVariable(name, filePath = path.join(projectDirectory, '.env')) {
  const result = writeQueue.then(() => updateEnvFileNow(name, null, filePath));
  writeQueue = result.catch(() => {});
  return result;
}

export async function readEnvVariables(filePath = path.join(projectDirectory, '.env')) {
  let contents;
  try {
    contents = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  return dotenv.parse(contents);
}
