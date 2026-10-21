const featureSettings = new Map([
  ['AUTO_STATUS', {
    key: 'feature:auto_status',
    label: 'transfert privé des statuts',
    enabled: 'activé',
    disabled: 'désactivé',
  }],
  ['AUTO_UPDATE', {
    key: 'feature:auto_update',
    label: 'mise à jour automatique',
    enabled: 'activée',
    disabled: 'désactivée',
  }],
]);

export default {
  name: 'setvar',
  aliases: [],
  description: 'Active ou désactive les fonctions du bot (propriétaire uniquement).',
  async execute({ isSudo, args, sendReply, storage }) {
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
    await storage.set(setting.key, enabled);
    await sendReply(`${setting.label} : ${enabled ? setting.enabled : setting.disabled}.`);
  },
};
