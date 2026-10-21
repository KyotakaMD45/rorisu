import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const environmentFilePath = path.join(projectDirectory, 'config.env');
const legacyEnvironmentFilePath = path.join(projectDirectory, '.env');
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
  if (absolutePath === environmentFilePath) {
    try {
      await fs.access(absolutePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await fs.copyFile(legacyEnvironmentFilePath, absolutePath, fsConstants.COPYFILE_EXCL);
      } catch (copyError) {
        if (copyError.code !== 'ENOENT' && copyError.code !== 'EEXIST') throw copyError;
      }
    }
  }
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

export function writeEnvVariable(name, value, filePath = environmentFilePath) {
  const result = writeQueue.then(() => updateEnvFileNow(name, value, filePath));
  writeQueue = result.catch(() => {});
  return result;
}

export function deleteEnvVariable(name, filePath = environmentFilePath) {
  const result = writeQueue.then(() => updateEnvFileNow(name, null, filePath));
  writeQueue = result.catch(() => {});
  return result;
}

export async function readEnvVariables(filePath = environmentFilePath) {
  const absolutePath = path.resolve(filePath);
  let contents;
  try {
    contents = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (absolutePath !== environmentFilePath) return {};
    try {
      contents = await fs.readFile(legacyEnvironmentFilePath, 'utf8');
    } catch (legacyError) {
      if (legacyError.code === 'ENOENT') return {};
      throw legacyError;
    }
  }
  return dotenv.parse(contents);
}
