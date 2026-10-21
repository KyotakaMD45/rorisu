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

if (!['qr', 'code'].includes(pairingMethod)) {
  throw new Error('PAIRING_METHOD doit être « qr » ou « code ».');
}

export const config = Object.freeze({
  botName: process.env.BOT_NAME?.trim() || 'RORISU',
  prefixes: configuredPrefixes.length ? configuredPrefixes : ['.'],
  sudoNumbers,
  pairingMethod,
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  language: process.env.LANGUAGE?.trim() || 'fr',
  timeZone: process.env.TZ,
  authDirectory: process.env.AUTH_DIRECTORY?.trim() || 'auth_info_baileys',
  storageFile: process.env.STORAGE_FILE?.trim() || 'data/store.json',
});

export { normalizeNumber };
