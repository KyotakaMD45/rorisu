import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDirectory, 'config.env') });
dotenv.config({ path: path.join(projectDirectory, '.env') });

// Configure le fuseau horaire avant toute création de date ou de connexion.
process.env.TZ = process.env.TZ || 'Europe/Paris';

const splitList = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// Ne conserve que les chiffres pour comparer les numéros aux identifiants WhatsApp.
const normalizeNumber = (value) => String(value || '').replace(/\D/g, '');

const environmentConfig = Object.freeze({
  BOT_NAME: process.env.BOT_NAME?.trim() || 'RORISU',
  HANDLERS: splitList(process.env.HANDLERS || '.'),
  SUDO: splitList(process.env.SUDO).map(normalizeNumber).filter(Boolean),
  PAIRING_METHOD: process.env.PAIRING_METHOD?.trim().toLowerCase() || 'qr',
  SESSION_ID: splitList(process.env.SESSION_ID || '0'),
  AUTH_DIRECTORY: process.env.AUTH_DIRECTORY?.trim() || 'auth_info_baileys',
  DATABASE_URL: process.env.DATABASE_URL?.trim() || '',
  STORAGE_FILE: process.env.STORAGE_FILE?.trim() || 'data/store.json',
  LANGUAGE: process.env.LANGUAGE?.trim() || 'fr',
  TZ: process.env.TZ,
  WARN_LIMIT: Number(process.env.WARN_LIMIT || 3),
  API_MODE: process.env.API_MODE?.trim().toLowerCase() || 'false',
  API_KEY: process.env.API_KEY?.trim() || '',
  PORT: Number(process.env.PORT || 3000),
  API_WEBHOOK_URL: process.env.API_WEBHOOK_URL?.trim() || '',
  API_PUBLIC_URL: process.env.API_PUBLIC_URL?.trim() || '',
  EXTERNAL_PLUGINS_DIRECTORY: process.env.EXTERNAL_PLUGINS_DIRECTORY?.trim() || 'eplugins',
});

if (!['qr', 'code'].includes(environmentConfig.PAIRING_METHOD)) {
  throw new Error('PAIRING_METHOD doit être « qr » ou « code ».');
}
if (!Number.isInteger(environmentConfig.WARN_LIMIT)
  || environmentConfig.WARN_LIMIT < 1
  || environmentConfig.WARN_LIMIT > 10) {
  throw new Error('WARN_LIMIT doit être un nombre entier compris entre 1 et 10.');
}
if (!['false', 'true', 'only'].includes(environmentConfig.API_MODE)) {
  throw new Error('API_MODE doit être « false », « true » ou « only ».');
}
if (!Number.isInteger(environmentConfig.PORT)
  || environmentConfig.PORT < 1
  || environmentConfig.PORT > 65535) {
  throw new Error('PORT doit être un nombre entier compris entre 1 et 65535.');
}
if (!environmentConfig.SESSION_ID.length
  || environmentConfig.SESSION_ID.some((id) => !/^[a-zA-Z0-9_-]{1,32}$/.test(id))
  || new Set(environmentConfig.SESSION_ID).size !== environmentConfig.SESSION_ID.length) {
  throw new Error('SESSION_ID doit contenir des identifiants uniques de 1 à 32 caractères (lettres, chiffres, tirets ou soulignements).');
}
if (environmentConfig.API_MODE !== 'false' && !environmentConfig.API_KEY) {
  throw new Error('API_KEY est obligatoire lorsque API_MODE est activé.');
}
if (environmentConfig.API_MODE !== 'false' && environmentConfig.API_WEBHOOK_URL) {
  let webhookUrl;
  try {
    webhookUrl = new URL(environmentConfig.API_WEBHOOK_URL);
  } catch {
    throw new Error('API_WEBHOOK_URL doit être une URL HTTP ou HTTPS valide.');
  }
  if (!['http:', 'https:'].includes(webhookUrl.protocol)) {
    throw new Error('API_WEBHOOK_URL doit utiliser HTTP ou HTTPS.');
  }
}
if (environmentConfig.API_MODE !== 'false' && environmentConfig.API_PUBLIC_URL) {
  let publicUrl;
  try {
    publicUrl = new URL(environmentConfig.API_PUBLIC_URL);
  } catch {
    throw new Error('API_PUBLIC_URL doit être une URL HTTP ou HTTPS valide.');
  }
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password) {
    throw new Error('API_PUBLIC_URL doit utiliser HTTP ou HTTPS sans identifiants intégrés.');
  }
}

export const config = Object.freeze({
  botName: environmentConfig.BOT_NAME,
  prefixes: environmentConfig.HANDLERS.length ? environmentConfig.HANDLERS : ['.'],
  sudoNumbers: environmentConfig.SUDO,
  pairingMethod: environmentConfig.PAIRING_METHOD,
  warnLimit: environmentConfig.WARN_LIMIT,
  apiMode: environmentConfig.API_MODE,
  apiKey: environmentConfig.API_KEY,
  apiPort: environmentConfig.PORT,
  apiWebhookUrl: environmentConfig.API_WEBHOOK_URL,
  apiPublicUrl: environmentConfig.API_PUBLIC_URL.replace(/\/+$/, ''),
  sessionIds: environmentConfig.SESSION_ID,
  databaseUrl: environmentConfig.DATABASE_URL,
  language: environmentConfig.LANGUAGE,
  timeZone: environmentConfig.TZ,
  authDirectory: environmentConfig.AUTH_DIRECTORY,
  storageFile: environmentConfig.STORAGE_FILE,
  externalPluginsDirectory: environmentConfig.EXTERNAL_PLUGINS_DIRECTORY,
});

export { normalizeNumber };
