import { readEnvVariables } from '../core/env.js';
import { isSensitiveEnvName } from '../core/env-command.js';

export default {
  name: 'allvar',
  aliases: [],
  description: 'Affiche les variables .env (propriétaire uniquement).',
  async execute({ isSudo, sendReply, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const variables = await readEnvVariables(envFilePath);
    const entries = Object.entries(variables).sort(([first], [second]) => first.localeCompare(second));
    if (!entries.length) {
      await sendReply('Aucune variable trouvée dans .env.');
      return;
    }

    const lines = entries.map(([name, value]) => (
      `${name} = ${isSensitiveEnvName(name) ? '[masqué]' : value}`
    ));
    const output = lines.join('\n');
    await sendReply(output.length > 4000 ? `${output.slice(0, 3980)}\n… (liste tronquée)` : output);
  },
};
