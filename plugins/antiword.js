import {
  findParticipant,
  isGroupAdmin,
} from '../core/group-utils.js';

export default {
  name: 'antiword',
  aliases: [],
  description: 'Bloque les mots configurés dans un groupe.',
  async execute({ socket, chatId, senderJid, isGroup, args, sendReply, storage }) {
    if (!isGroup) {
      await sendReply('Cette commande ne fonctionne que dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    if (!isGroupAdmin(findParticipant(metadata.participants || [], senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent gérer les mots bloqués.');
      return;
    }

    const key = `group:${chatId}:antiword`;
    const current = await storage.get(key) || { enabled: false, words: [] };
    const [action, ...rawWord] = args;
    const value = rawWord.join(' ').trim().toLowerCase();

    if (action === 'on' || action === 'off') {
      current.enabled = action === 'on';
      await storage.set(key, current);
      await sendReply(`Anti-mots ${current.enabled ? 'activé' : 'désactivé'}.`);
      return;
    }
    if (action === 'list') {
      await sendReply(current.words.length
        ? `Mots bloqués : ${current.words.join(', ')}`
        : 'Aucun mot bloqué configuré.');
      return;
    }
    if (!['add', 'remove'].includes(action)
      || !/^[\p{L}\p{N}_-]{1,50}$/u.test(value)) {
      await sendReply('Utilisation : .antiword on|off, .antiword add|remove mot, .antiword list');
      return;
    }

    if (action === 'add') {
      if (!current.words.includes(value)) current.words.push(value);
    } else {
      current.words = current.words.filter((word) => word !== value);
    }
    await storage.set(key, current);
    await sendReply(`Mot « ${value} » ${action === 'add' ? 'ajouté à' : 'retiré de'} la liste.`);
  },
};
