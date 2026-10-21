import { normalizeNumber } from '../config.js';
import { writeEnvVariable } from '../core/env.js';

function parseNumber(value) {
  const input = value?.trim();
  if (!input || !/^\+?[\d\s().-]+$/.test(input)) return null;
  const number = normalizeNumber(input);
  return /^\d{6,15}$/.test(number) ? number : null;
}

function formatNumbers(numbers) {
  return numbers.length ? numbers.join(', ') : 'aucun numéro';
}

export default {
  name: 'setsudo',
  aliases: [],
  description: 'Ajoute ou retire un propriétaire du bot.',
  async execute({ isSudo, args = [], config, sendReply, envFilePath }) {
    if (!isSudo) {
      await sendReply('Cette commande est réservée au propriétaire du bot.');
      return;
    }

    const [rawAction] = args;
    const action = rawAction?.toLowerCase();
    const numbers = config.sudoNumbers;

    if (!rawAction || action === 'list') {
      if (action === 'list' && args.length > 1) {
        await sendReply('Utilisation : .setsudo [list|add <numéro>|remove <numéro>].');
        return;
      }
      await sendReply(`Propriétaires du bot : ${formatNumbers(numbers)}.`);
      return;
    }

    const operation = ['add', 'remove'].includes(action) ? action : 'add';
    const rawTarget = operation === action ? args.slice(1).join(' ') : args.join(' ');
    if (!rawTarget) {
      await sendReply('Utilisation : .setsudo [list|add <numéro>|remove <numéro>].');
      return;
    }

    const number = parseNumber(rawTarget);
    if (!number) {
      await sendReply('Le numéro doit contenir entre 6 et 15 chiffres, avec indicatif international.');
      return;
    }

    if (operation === 'add') {
      if (numbers.includes(number)) {
        await sendReply(`${number} est déjà propriétaire du bot.`);
        return;
      }
      const updatedNumbers = [...numbers, number];
      await writeEnvVariable('SUDO', updatedNumbers.join(','), envFilePath);
      numbers.push(number);
      await sendReply(`${number} peut maintenant utiliser les commandes propriétaire.`);
      return;
    }

    if (!numbers.includes(number)) {
      await sendReply(`${number} n’est pas dans la liste des propriétaires.`);
      return;
    }
    if (numbers.length === 1) {
      await sendReply('Impossible de retirer le dernier propriétaire du bot.');
      return;
    }

    const updatedNumbers = numbers.filter((owner) => owner !== number);
    await writeEnvVariable('SUDO', updatedNumbers.join(','), envFilePath);
    numbers.splice(0, numbers.length, ...updatedNumbers);
    await sendReply(`${number} a été retiré des propriétaires du bot.`);
  },
};
