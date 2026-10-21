import { writeEnvVariable } from '../core/env.js';
import { featureSettings } from '../core/feature-settings.js';

export default {
  name: 'setvar',
  aliases: [],
  description: 'Active ou désactive les fonctions du bot (propriétaire uniquement).',
  async execute({ isSudo, args, sendReply, storage, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const [name, separatorOrValue, possibleValue] = args;
    const setting = featureSettings.get(name?.toUpperCase());
    const value = (possibleValue ?? separatorOrValue)?.toLowerCase();
    const hasInvalidSeparator = possibleValue !== undefined && separatorOrValue !== '=';

    if (!setting || hasInvalidSeparator || !['on', 'off'].includes(value)) {
      await sendReply('Utilisation : .setvar AUTO_STATUS = on|off ou .setvar AUTO_UPDATE = on|off');
      return;
    }

    const enabled = value === 'on';
    const envValue = enabled ? 'on' : 'off';
    await writeEnvVariable(setting.envName, envValue, envFilePath);
    await storage.set(setting.storageKey, enabled);
    process.env[setting.envName] = envValue;
    await sendReply(
      `${setting.label} : ${enabled ? setting.enabled : setting.disabled} (enregistré dans .env).`,
    );
  },
};
