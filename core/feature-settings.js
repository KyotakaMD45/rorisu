import { writeEnvVariable } from './env.js';

export const featureSettings = new Map([
  ['AUTO_STATUS', {
    envName: 'AUTO_STATUS',
    storageKey: 'feature:auto_status',
    label: 'transfert privé des statuts',
    enabled: 'activé',
    disabled: 'désactivé',
  }],
  ['AUTO_UPDATE', {
    envName: 'AUTO_UPDATE',
    storageKey: 'feature:auto_update',
    label: 'mise à jour automatique',
    enabled: 'activée',
    disabled: 'désactivée',
  }],
]);

export function parseFeatureValue(value, name) {
  switch (String(value).trim().toLowerCase()) {
    case 'on':
    case 'true':
    case '1':
      return true;
    case 'off':
    case 'false':
    case '0':
      return false;
    default:
      throw new Error(`${name} doit être réglé sur on ou off dans le fichier .env.`);
  }
}

export async function initializeFeatureSettings(storage, envFilePath) {
  for (const setting of featureSettings.values()) {
    let value = process.env[setting.envName];
    if (value === undefined) {
      const storedValue = await storage.get(setting.storageKey);
      const enabled = typeof storedValue === 'boolean' ? storedValue : false;
      value = enabled ? 'on' : 'off';
      await writeEnvVariable(setting.envName, value, envFilePath);
      process.env[setting.envName] = value;
    }

    await storage.set(
      setting.storageKey,
      parseFeatureValue(value, setting.envName),
    );
  }
}
