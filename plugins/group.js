// Les actions de groupe exigent un groupe, un expéditeur administrateur et un bot administrateur.
export default {
  name: 'kick',
  aliases: ['add', 'promote'],
  description: 'Retire, ajoute ou promeut un membre du groupe.',
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
      await sendReply(`Indiquez un membre en le mentionnant ou en fournissant son numéro après la commande.`);
      return;
    }

    const operation = { kick: 'remove', add: 'add', promote: 'promote' }[action];
    if (!operation) {
      await sendReply('Commande de groupe inconnue.');
      return;
    }

    const result = await socket.groupParticipantsUpdate(chatId, [target], operation);
    const outcome = result?.[0]?.status;
    if (outcome && !['200', 200].includes(outcome)) {
      await sendReply(`WhatsApp n’a pas pu effectuer l’action demandée (code ${outcome}).`);
      return;
    }

    const labels = { kick: 'retiré', add: 'ajouté', promote: 'promu administrateur' };
    await sendReply(`Membre ${labels[action]} avec succès.`);
  },
};
