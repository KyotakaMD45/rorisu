import 'dotenv/config';

// Configure le fuseau horaire avant toute création de date ou de connexion.
process.env.TZ = process.env.TZ || 'Europe/Paris';

const splitList = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// Ne conserve que les chiffres pour comparer les numéros aux identifiants WhatsApp.
const normalizeNumber = (value) => String(value || '').replace(/\D/g, '');

const sudoNumbers = splitList(process.env.SUDO).map(normalizeNumber).filter(Boolean);
const configuredPrefixes = splitList(process.env.HANDLERS || '.');
const pairingMethod = process.env.PAIRING_METHOD?.trim().toLowerCase() || 'qr';
const warnLimit = Number(process.env.WARN_LIMIT || 3);
const apiMode = process.env.API_MODE?.trim().toLowerCase() || 'false';
const apiPort = Number(process.env.PORT || 3000);

if (!['qr', 'code'].includes(pairingMethod)) {
  throw new Error('PAIRING_METHOD doit être « qr » ou « code ».');
}
if (!Number.isInteger(warnLimit) || warnLimit < 1 || warnLimit > 10) {
  throw new Error('WARN_LIMIT doit être un nombre entier compris entre 1 et 10.');
}
if (!['false', 'true', 'only'].includes(apiMode)) {
  throw new Error('API_MODE doit être « false », « true » ou « only ».');
}
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error('PORT doit être un nombre entier compris entre 1 et 65535.');
}
if (apiMode !== 'false' && !process.env.API_KEY?.trim()) {
  throw new Error('API_KEY est obligatoire lorsque API_MODE est activé.');
}
if (apiMode !== 'false' && process.env.API_WEBHOOK_URL?.trim()) {
  let webhookUrl;
  try {
    webhookUrl = new URL(process.env.API_WEBHOOK_URL.trim());
  } catch {
    throw new Error('API_WEBHOOK_URL doit être une URL HTTP ou HTTPS valide.');
  }
  if (!['http:', 'https:'].includes(webhookUrl.protocol)) {
    throw new Error('API_WEBHOOK_URL doit utiliser HTTP ou HTTPS.');
  }
}

export const config = Object.freeze({
  botName: process.env.BOT_NAME?.trim() || 'RORISU',
  prefixes: configuredPrefixes.length ? configuredPrefixes : ['.'],
  sudoNumbers,
  pairingMethod,
  warnLimit,
  apiMode,
  apiKey: process.env.API_KEY?.trim() || '',
  apiPort,
  apiWebhookUrl: process.env.API_WEBHOOK_URL?.trim() || '',
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  language: process.env.LANGUAGE?.trim() || 'fr',
  timeZone: process.env.TZ,
  authDirectory: process.env.AUTH_DIRECTORY?.trim() || 'auth_info_baileys',
  storageFile: process.env.STORAGE_FILE?.trim() || 'data/store.json',
  externalPluginsDirectory: process.env.EXTERNAL_PLUGINS_DIRECTORY?.trim() || 'eplugins',
});

export { normalizeNumber };
