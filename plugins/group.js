// Les actions de groupe exigent un groupe, un expéditeur administrateur et un bot administrateur.
export default {
  name: 'kick',
  aliases: ['add', 'promote', 'demote', 'invite', 'revoke', 'mute', 'unmute'],
  description: 'Gère les membres, les invitations et le mode de discussion du groupe.',
  async execute(context) {
    const { socket, chatId, senderJid, isGroup, args, mentions, quotedMessage, sendReply } = context;
    const sameJid = (left, right) => String(left || '').replace(/:\d+(?=@)/, '') === String(right || '').replace(/:\d+(?=@)/, '');
    if (!isGroup) {
      await sendReply('Cette commande ne fonctionne que dans un groupe.');
      return;
    }

    const action = context.text.slice(context.config.prefixes.find((prefix) => context.text.startsWith(prefix)).length)
      .trim().split(/\s+/)[0].toLowerCase();
    const group = await socket.groupMetadata(chatId);
    const participants = group.participants || [];
    const sender = participants.find((participant) => sameJid(participant.id, senderJid));
    const self = socket.user?.id;
    const bot = participants.find((participant) => sameJid(participant.id, self));

    if (!sender?.admin && !sender?.isAdmin && !sender?.isSuperAdmin) {
      await sendReply('Seuls les administrateurs du groupe peuvent utiliser cette commande.');
      return;
    }
    if (!bot?.admin && !bot?.isAdmin && !bot?.isSuperAdmin) {
      await sendReply('Le bot doit être administrateur du groupe pour effectuer cette action.');
      return;
    }

    if (action === 'invite') {
      const code = await socket.groupInviteCode(chatId);
      if (!code) {
        await sendReply('WhatsApp n’a pas fourni de lien d’invitation pour ce groupe.');
        return;
      }
      await sendReply(`Lien d’invitation du groupe : https://chat.whatsapp.com/${code}`);
      return;
    }

    if (action === 'revoke') {
      const code = await socket.groupRevokeInvite(chatId);
      if (!code) {
        await sendReply('WhatsApp n’a pas fourni de nouveau lien d’invitation.');
        return;
      }
      await sendReply(`Le lien précédent est révoqué. Nouveau lien : https://chat.whatsapp.com/${code}`);
      return;
    }

    if (action === 'mute' || action === 'unmute') {
      await socket.groupSettingUpdate(chatId, action === 'mute' ? 'announcement' : 'not_announcement');
      await sendReply(action === 'mute'
        ? 'Le groupe est maintenant réservé aux administrateurs.'
        : 'Tous les membres peuvent à nouveau envoyer des messages.');
      return;
    }

    const operations = {
      kick: ['remove', 'retiré'],
      add: ['add', 'ajouté'],
      promote: ['promote', 'promu administrateur'],
      demote: ['demote', 'rétrogradé'],
    };
    const operation = operations[action];
    if (!operation) {
      await sendReply('Commande de groupe inconnue.');
      return;
    }

    const candidates = [
      ...mentions,
      ...(quotedMessage?.key?.participant ? [quotedMessage.key.participant] : []),
      ...args.map((argument) => {
        const digits = argument.replace(/\D/g, '');
        return digits ? `${digits}@s.whatsapp.net` : '';
      }),
    ].filter(Boolean);
    const target = candidates.find((candidate) => !sameJid(candidate, self));
    if (!target) {
      await sendReply('Indiquez un membre en le mentionnant ou en fournissant son numéro après la commande.');
      return;
    }

    const result = await socket.groupParticipantsUpdate(chatId, [target], operation[0]);
    const outcome = result?.[0]?.status;
    if (outcome && !['200', 200].includes(outcome)) {
      await sendReply(`WhatsApp n’a pas pu effectuer l’action demandée (code ${outcome}).`);
      return;
    }

    await sendReply(`Membre ${operation[1]} avec succès.`);
  },
};
