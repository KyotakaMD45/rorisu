import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

const settingKey = (chatId) => `group:${chatId}:allowed_commands`;

export default {
  name: 'rori',
  aliases: [],
  description: 'Limite les commandes utilisables par les membres de ce groupe.',
  async execute({
    socket,
    chatId,
    senderJid,
    isGroup,
    isSudo,
    args,
    plugins,
    sendReply,
    storage,
  }) {
    if (!isGroup) {
      await sendReply('La commande .rori doit être utilisée dans un groupe.');
      return;
    }

    if (!isSudo) {
      const metadata = await socket.groupMetadata(chatId);
      if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))) {
        await sendReply('Seuls les administrateurs du groupe peuvent configurer .rori.');
        return;
      }
    }

    const key = settingKey(chatId);
    const current = await storage.get(key);
    const action = args[0]?.toLowerCase();

    if (action === 'list') {
      if (!Array.isArray(current) || current.length === 0) {
        await sendReply('Aucune restriction .rori configurée. Les commandes restent accessibles normalement.');
        return;
      }
      await sendReply(`Commandes autorisées aux membres :\n${current.map((name) => `• ${name}`).join('\n')}`);
      return;
    }

    if (action === 'off') {
      await storage.set(key, null);
      await sendReply('Restriction .rori désactivée ; les commandes sont de nouveau accessibles normalement.');
      return;
    }

    if (!args.length) {
      await sendReply([
        '🤖 *RORI • Accès aux commandes*',
        'Utilisation :',
        '• .rori ping sticker — autorise ces commandes aux membres',
        '• .rori list — affiche la liste autorisée',
        '• .rori off — retire la restriction',
        'Les administrateurs et le propriétaire ne sont pas limités.',
      ].join('\n'));
      return;
    }

    const requested = args.map((name) => name.toLowerCase());
    const unknown = requested.filter((name) => !plugins.has(name));
    if (unknown.length) {
      await sendReply(`Commande(s) inconnue(s) : ${[...new Set(unknown)].join(', ')}.`);
      return;
    }

    const allowed = [...new Set(requested
      .map((name) => plugins.get(name).name.toLowerCase())
      .filter((name) => name !== 'rori'))];
    if (!allowed.length) {
      await sendReply('Indique au moins une commande à autoriser, par exemple : .rori ping sticker');
      return;
    }

    await storage.set(key, allowed);
    await sendReply(`Commandes autorisées aux membres :\n${allowed.map((name) => `• ${name}`).join('\n')}`);
  },
};
