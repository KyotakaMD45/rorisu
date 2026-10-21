import { writeEnvVariable } from '../core/env.js';
import { featureSettings } from '../core/feature-settings.js';
import {
  isBlockedEnvName,
  normalizeEnvName,
  restartRequiredVariables,
} from '../core/env-command.js';

export default {
  name: 'setvar',
  aliases: [],
  description: 'Ajoute ou modifie une variable config.env (propriétaire uniquement).',
  async execute({ isSudo, args, sendReply, storage, lifecycle, chatId, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const input = args.join(' ').trim();
    const assignment = input.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
    const [legacyName, legacyValue] = args;
    const name = normalizeEnvName(assignment?.[1] || legacyName);
    const setting = featureSettings.get(name);
    const value = assignment ? assignment[2].trim() : legacyValue?.trim();

    if (!name || value === undefined || (!assignment && !setting)) {
      await sendReply('Utilisation : .setvar NOM_VARIABLE = valeur (ex. .setvar AUTO_STATUS = on)');
      return;
    }

    if (isBlockedEnvName(name)) {
      await sendReply(`La variable ${name} ne peut pas être modifiée par cette commande.`);
      return;
    }

    let response;
    if (setting) {
      const normalizedValue = value.toLowerCase();
      if (!['on', 'off'].includes(normalizedValue)) {
        await sendReply(`${name} accepte uniquement on ou off.`);
        return;
      }

      const enabled = normalizedValue === 'on';
      await writeEnvVariable(name, normalizedValue, envFilePath);
      await storage.set(setting.storageKey, enabled);
      process.env[name] = normalizedValue;
      response = `${setting.label} : ${enabled ? setting.enabled : setting.disabled} (enregistré dans config.env).`;
    } else {
      await writeEnvVariable(name, value, envFilePath);
      process.env[name] = value;
      response = `${name} a été enregistré dans config.env.`;
      if (restartRequiredVariables.has(name)) {
        response += ' Redémarrage requis pour appliquer la configuration.';
      } else {
        response += ' La variable est disponible dans le processus actuel.';
      }
    }

    await sendReply(response);
    if (restartRequiredVariables.has(name)) await lifecycle?.restart(chatId);
  },
};
