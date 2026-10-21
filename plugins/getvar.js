import { readEnvVariables } from '../core/env.js';
import { isSensitiveEnvName, normalizeEnvName } from '../core/env-command.js';

export default {
  name: 'getvar',
  aliases: [],
  description: 'Affiche une variable config.env (propriétaire uniquement).',
  async execute({ isSudo, args, sendReply, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const name = normalizeEnvName(args.join(' '));
    if (!name) {
      await sendReply('Utilisation : .getvar NOM_VARIABLE');
      return;
    }

    const variables = await readEnvVariables(envFilePath);
    if (!Object.hasOwn(variables, name)) {
      await sendReply(`${name} est introuvable dans config.env.`);
      return;
    }

    const value = isSensitiveEnvName(name) ? '[masqué]' : variables[name];
    await sendReply(`${name} = ${value}`);
  },
};
