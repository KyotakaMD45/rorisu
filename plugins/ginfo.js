export default {
  name: 'ginfo',
  aliases: [],
  description: 'Affiche les informations principales du groupe.',
  async execute({ socket, chatId, isGroup, sendReply }) {
    if (!isGroup) {
      await sendReply('Cette commande ne fonctionne que dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    const participants = metadata.participants || [];
    const admins = participants
      .filter((participant) => participant.admin || participant.isAdmin || participant.isSuperAdmin)
      .map((participant) => `@${participant.id.split('@')[0].split(':')[0]}`);
    await sendReply(
      `Groupe : ${metadata.subject || 'sans nom'}\nMembres : ${participants.length}\nAdministrateurs : ${admins.length ? admins.join(', ') : 'aucun'}`,
      { mentions: participants
        .filter((participant) => participant.admin || participant.isAdmin || participant.isSuperAdmin)
        .map((participant) => participant.id) },
    );
  },
};
