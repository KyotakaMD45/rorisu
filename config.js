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
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image',
  GEMINI_SYSTEM_PROMPT: process.env.GEMINI_SYSTEM_PROMPT?.trim()
    || 'Tu es RORISU, un assistant utile. Réponds dans la langue de la question.',
  GEMINI_TEMPERATURE: Number(process.env.GEMINI_TEMPERATURE || 0.7),
  GEMINI_MAX_OUTPUT_TOKENS: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 1024),
  GEMINI_CONTEXT_TURNS: Number(process.env.GEMINI_CONTEXT_TURNS || 4),
  GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS || 45000),
  GEMINI_MAX_MEDIA_BYTES: Number(process.env.GEMINI_MAX_MEDIA_BYTES || 10485760),
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
if (!/^[a-zA-Z0-9._-]{1,128}$/.test(environmentConfig.GEMINI_MODEL)) {
  throw new Error('GEMINI_MODEL contient un nom de modèle invalide.');
}
if (!/^[a-zA-Z0-9._-]{1,128}$/.test(environmentConfig.GEMINI_IMAGE_MODEL)) {
  throw new Error('GEMINI_IMAGE_MODEL contient un nom de modèle invalide.');
}
if (!Number.isFinite(environmentConfig.GEMINI_TEMPERATURE)
  || environmentConfig.GEMINI_TEMPERATURE < 0
  || environmentConfig.GEMINI_TEMPERATURE > 2) {
  throw new Error('GEMINI_TEMPERATURE doit être compris entre 0 et 2.');
}
if (!Number.isInteger(environmentConfig.GEMINI_MAX_OUTPUT_TOKENS)
  || environmentConfig.GEMINI_MAX_OUTPUT_TOKENS < 1
  || environmentConfig.GEMINI_MAX_OUTPUT_TOKENS > 65536) {
  throw new Error('GEMINI_MAX_OUTPUT_TOKENS doit être compris entre 1 et 65536.');
}
if (!Number.isInteger(environmentConfig.GEMINI_CONTEXT_TURNS)
  || environmentConfig.GEMINI_CONTEXT_TURNS < 0
  || environmentConfig.GEMINI_CONTEXT_TURNS > 20) {
  throw new Error('GEMINI_CONTEXT_TURNS doit être compris entre 0 et 20.');
}
if (!Number.isInteger(environmentConfig.GEMINI_TIMEOUT_MS)
  || environmentConfig.GEMINI_TIMEOUT_MS < 1000
  || environmentConfig.GEMINI_TIMEOUT_MS > 120000) {
  throw new Error('GEMINI_TIMEOUT_MS doit être compris entre 1000 et 120000.');
}
if (!Number.isInteger(environmentConfig.GEMINI_MAX_MEDIA_BYTES)
  || environmentConfig.GEMINI_MAX_MEDIA_BYTES < 1024
  || environmentConfig.GEMINI_MAX_MEDIA_BYTES > 20 * 1024 * 1024) {
  throw new Error('GEMINI_MAX_MEDIA_BYTES doit être compris entre 1024 et 20971520.');
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
  gemini: Object.freeze({
    apiKey: environmentConfig.GEMINI_API_KEY,
    model: environmentConfig.GEMINI_MODEL,
    imageModel: environmentConfig.GEMINI_IMAGE_MODEL,
    systemPrompt: environmentConfig.GEMINI_SYSTEM_PROMPT,
    temperature: environmentConfig.GEMINI_TEMPERATURE,
    maxOutputTokens: environmentConfig.GEMINI_MAX_OUTPUT_TOKENS,
    contextTurns: environmentConfig.GEMINI_CONTEXT_TURNS,
    timeoutMs: environmentConfig.GEMINI_TIMEOUT_MS,
    maxMediaBytes: environmentConfig.GEMINI_MAX_MEDIA_BYTES,
  }),
});

export { normalizeNumber };
