import {
  findParticipant,
  getTargetJid,
  isGroupAdmin,
  normalizeJid,
} from '../core/group-utils.js';

const warningLimit = 3;

export default {
  name: 'warn',
  aliases: [],
  description: 'Avertit un membre ou réinitialise ses avertissements.',
  async execute({
    socket,
    chatId,
    senderJid,
    isGroup,
    args,
    mentions,
    quotedMessage,
    sendReply,
    storage,
    config,
  }) {
    if (!isGroup) {
      await sendReply('Cette commande ne fonctionne que dans un groupe.');
      return;
    }

    const metadata = await socket.groupMetadata(chatId);
    const participants = metadata.participants || [];
    if (!isGroupAdmin(findParticipant(participants, senderJid))) {
      await sendReply('Seuls les administrateurs du groupe peuvent avertir un membre.');
      return;
    }

    const reset = args[0]?.toLowerCase() === 'reset';
    const target = getTargetJid({
      args: reset ? args.slice(1) : args,
      mentions,
      quotedMessage,
    });
    if (!target) {
      await sendReply('Mentionne un membre ou réponds à son message. Utilisation : .warn [reset] @membre');
      return;
    }

    const targetParticipant = findParticipant(participants, target);
    if (!targetParticipant) {
      await sendReply('Ce membre ne figure pas dans le groupe.');
      return;
    }

    const normalizedTarget = normalizeJid(target);
    const key = `group:${chatId}:warn:${normalizedTarget}`;
    if (reset) {
      await storage.set(key, 0);
      await sendReply(`Les avertissements de @${normalizedTarget.split('@')[0]} ont été réinitialisés.`, {
        mentions: [target],
      });
      return;
    }

    const count = Number(await storage.get(key) || 0) + 1;
    await storage.set(key, count);
    const limit = config?.warnLimit || warningLimit;
    const remaining = Math.max(0, limit - count);
    await sendReply(
      `Avertissement ${count}/${limit} pour @${normalizedTarget.split('@')[0]}.${remaining ? ` Il en reste ${remaining}.` : ''}`,
      { mentions: [target] },
    );

    if (count < limit) return;
    if (!isGroupAdmin(findParticipant(participants, socket.user?.id))) {
      await sendReply('Le bot doit être administrateur pour retirer un membre après le dernier avertissement.');
      return;
    }
    if (isGroupAdmin(targetParticipant)) {
      await sendReply('Les avertissements ont atteint la limite, mais un administrateur ne sera pas retiré.');
      return;
    }

    const result = await socket.groupParticipantsUpdate(chatId, [target], 'remove');
    const outcome = result?.[0]?.status;
    if (outcome && !['200', 200].includes(outcome)) {
      await sendReply(`Le retrait du membre a échoué (code ${outcome}).`);
      return;
    }
    await storage.set(key, 0);
  },
};
