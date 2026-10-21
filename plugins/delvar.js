import { deleteEnvVariable, readEnvVariables } from '../core/env.js';
import { featureSettings } from '../core/feature-settings.js';
import {
  isBlockedEnvName,
  normalizeEnvName,
  restartRequiredVariables,
} from '../core/env-command.js';

export default {
  name: 'delvar',
  aliases: [],
  description: 'Supprime une variable .env (propriétaire uniquement).',
  async execute({ isSudo, args, sendReply, lifecycle, chatId, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const name = normalizeEnvName(args.join(' '));
    if (!name) {
      await sendReply('Utilisation : .delvar NOM_VARIABLE');
      return;
    }
    if (featureSettings.has(name)) {
      await sendReply(`${name} est une option gérée ; utilisez .setvar ${name} = off.`);
      return;
    }
    if (isBlockedEnvName(name)) {
      await sendReply(`La variable ${name} ne peut pas être supprimée par cette commande.`);
      return;
    }

    const variables = await readEnvVariables(envFilePath);
    if (!Object.hasOwn(variables, name)) {
      await sendReply(`${name} est introuvable dans .env.`);
      return;
    }

    await deleteEnvVariable(name, envFilePath);
    delete process.env[name];
    await sendReply(`${name} a été supprimée de .env.`);
    if (restartRequiredVariables.has(name)) await lifecycle?.restart(chatId);
  },
};
