import {
  findParticipant,
  isGroupAdmin,
  normalizeJid,
  parseWhatsAppJid,
} from '../core/group-utils.js';

export default {
  name: 'delete',
  aliases: ['dlt', 'antidelete'],
  description: 'Supprime un message cité ou configure sa récupération après suppression.',
  async execute({
    socket,
    chatId,
    senderJid,
    isGroup,
    isSudo,
    quotedMessage,
    args = [],
    text,
    config,
    storage,
    sendReply,
  }) {
    if (args.length) {
      if (!isSudo) {
        await sendReply('La configuration anti-suppression est réservée au propriétaire.');
        return;
      }

      const [rawDestination, rawScope, ...extra] = args;
      const commandName = text
        ?.slice(config.prefixes.find((prefix) => text.startsWith(prefix))?.length || 0)
        .trim().split(/\s+/)[0]?.toLowerCase();
      const destination = rawDestination.toLowerCase() === 'on' && commandName === 'antidelete'
        ? 'p'
        : rawDestination.toLowerCase();
      const scope = rawScope?.toLowerCase();
      const validScopes = ['pm', 'gm', 'no-pm', 'no-gm'];
      const normalizedDestination = parseWhatsAppJid(rawDestination);

      if (extra.length || (scope && !validScopes.includes(scope))) {
        await sendReply('Utilisation : .delete p|g|<JID> [pm|gm|no-pm|no-gm] ou .delete off.');
        return;
      }
      if (['off', 'false'].includes(destination)) {
        await storage.set('feature:anti_delete', null);
        await sendReply('Anti-suppression désactivée.');
        return;
      }
      if (!['p', 'g'].includes(destination) && !normalizedDestination) {
        await sendReply('Utilisation : .delete p|g|<JID> [pm|gm|no-pm|no-gm] ou .delete off.');
        return;
      }

      await storage.set('feature:anti_delete', {
        destination: ['p', 'g'].includes(destination) ? destination : normalizedDestination,
        scope: scope || null,
      });
      const destinationLabel = destination === 'p'
        ? 'le propriétaire en privé'
        : destination === 'g'
          ? 'la discussion d’origine'
          : normalizedDestination;
      const scopeLabel = scope ? ` (filtre : ${scope})` : '';
      await sendReply(`Anti-suppression activée : les messages supprimés seront envoyés vers ${destinationLabel}${scopeLabel}.`);
      return;
    }

    const commandName = text
      ?.slice(config.prefixes.find((prefix) => text.startsWith(prefix))?.length || 0)
      .trim().split(/\s+/)[0]?.toLowerCase();
    if (commandName === 'antidelete') {
      await sendReply('Utilisation : .antidelete p|g|<JID> [pm|gm|no-pm|no-gm] ou .antidelete off.');
      return;
    }

    if (!quotedMessage?.key) {
      await sendReply('Réponds à un message avec .delete pour le supprimer, ou utilise .delete p|g pour activer l’anti-suppression.');
      return;
    }

    const key = quotedMessage?.key;
    const isOwnMessage = key.fromMe === true
      || (key.participant && normalizeJid(key.participant) === normalizeJid(senderJid));
    if (!isOwnMessage) {
      if (!isGroup) {
        await sendReply('Tu ne peux supprimer que tes propres messages dans une conversation privée.');
        return;
      }

      const metadata = await socket.groupMetadata(chatId);
      const participants = metadata.participants || [];
      if (!isGroupAdmin(findParticipant(participants, senderJid))
        || !isGroupAdmin(findParticipant(participants, socket.user?.id))) {
        await sendReply('Il faut être administrateur et le bot doit aussi être administrateur pour supprimer ce message.');
        return;
      }
    }

    await socket.sendMessage(chatId, { delete: key });
  },
};
