export const restartRequiredVariables = new Set([
  'API_KEY',
  'API_MODE',
  'API_PUBLIC_URL',
  'API_WEBHOOK_URL',
  'AUTH_DIRECTORY',
  'BOT_NAME',
  'DATABASE_URL',
  'EXTERNAL_PLUGINS_DIRECTORY',
  'GEMINI_API_KEY',
  'GEMINI_CONTEXT_TURNS',
  'GEMINI_IMAGE_MODEL',
  'GEMINI_MAX_MEDIA_BYTES',
  'GEMINI_MAX_OUTPUT_TOKENS',
  'GEMINI_MODEL',
  'GEMINI_SYSTEM_PROMPT',
  'GEMINI_TEMPERATURE',
  'GEMINI_TIMEOUT_MS',
  'HANDLERS',
  'LANGUAGE',
  'PAIRING_METHOD',
  'PORT',
  'SESSION_ID',
  'SUDO',
  'STORAGE_FILE',
  'TZ',
  'UPDATE_CURRENT_COMMIT',
  'UPDATE_PROVIDER',
  'WARN_LIMIT',
]);

const blockedVariables = new Set([
  'BASH_ENV',
  'COMSPEC',
  'DYLD_INSERT_LIBRARIES',
  'ENV',
  'HOME',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'SHELL',
  'USERPROFILE',
]);

export function normalizeEnvName(value) {
  const name = value?.trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name || '')) return null;
  return name;
}

export function isBlockedEnvName(name) {
  return blockedVariables.has(name);
}

export function isSensitiveEnvName(name) {
  return /(?:API_?KEY|AUTH|COOKIE|DATABASE_URL|PASSWORD|SECRET|SESSION|SUDO|TOKEN)/i.test(name);
}
