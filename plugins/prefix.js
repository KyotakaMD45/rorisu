import { writeEnvVariable } from '../core/env.js';

function parsePrefixes(input) {
  const normalized = input.toLowerCase();
  if (['null', 'none', 'off'].includes(normalized)) return [];

  const prefixes = input === ',' ? [','] : input.split(',');
  if (prefixes.length > 5
    || prefixes.some((prefix) => !prefix
      || /\s/u.test(prefix)
      || Array.from(prefix).length > 8)
    || new Set(prefixes).size !== prefixes.length) {
    return null;
  }
  return prefixes;
}

export default {
  name: 'prefix',
  aliases: [],
  description: 'Affiche ou modifie le préfixe du bot (propriétaire uniquement).',
  async execute({ isSudo, args = [], config, sendReply, envFilePath, lifecycle, chatId }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const input = args.join(' ').trim();
    if (!input) {
      if (!config.prefixes.length) {
        await sendReply('Aucun préfixe : les commandes connues peuvent être envoyées directement.');
        return;
      }
      await sendReply(`Préfixe${config.prefixes.length > 1 ? 's' : ''} actuel${config.prefixes.length > 1 ? 's' : ''} : ${config.prefixes.join(' / ')}`);
      return;
    }

    const prefixes = parsePrefixes(input);
    if (!prefixes) {
      await sendReply('Utilisation : .prefix <préfixe> (1 à 8 caractères, ou plusieurs séparés par une virgule).');
      return;
    }

    const value = prefixes.length ? prefixes.join(',') : 'null';
    await writeEnvVariable('HANDLERS', value, envFilePath);
    process.env.HANDLERS = value;
    const response = prefixes.length
      ? `Préfixe${prefixes.length > 1 ? 's' : ''} enregistré${prefixes.length > 1 ? 's' : ''} : ${prefixes.join(' / ')}.`
      : 'Préfixe désactivé : les commandes connues pourront être envoyées directement.';
    await sendReply(`${response} Redémarrage du bot pour appliquer le changement.`);
    await lifecycle?.restart(chatId);
  },
};
