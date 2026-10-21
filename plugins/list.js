const fallbackAliases = {
  gemini: ['ai'],
  image: ['imagine'],
  list: ['help', 'aide', 'menu'],
};

export default {
  name: 'list',
  aliases: ['help', 'aide', 'menu'],
  description: 'Affiche la liste des commandes disponibles.',
  async execute({ sendReply, config, plugins, message, senderNumber }) {
    const prefix = config.prefixes[0] || '.';
    const categories = [
      ['🔄 CONVERSION', ['sticker']],
      ['✨ IA & MÉDIAS', ['gemini', 'image', 'delete', 'vv']],
      ['👥 GROUPE', ['antilink', 'antiword', 'filter', 'ginfo', 'greet', 'group', 'tag', 'warn']],
      ['🧰 OUTILS', ['afk', 'poll', 'react', 'rori']],
      ['🤖 BOT & COMPTE', ['alive', 'list', 'ping']],
      ['🔐 PROPRIÉTAIRE', ['allvar', 'antivv', 'delvar', 'getvar', 'restart', 'setsudo', 'setvar', 'shutdown', 'update']],
    ];
    const available = plugins
      ? new Set([...plugins.values()].map((plugin) => plugin.name.toLowerCase()))
      : new Set(categories.flatMap(([, commands]) => commands));
    const aliasMap = new Map();
    if (plugins) {
      for (const plugin of plugins.values()) {
        aliasMap.set(plugin.name.toLowerCase(), plugin.aliases || []);
      }
    } else {
      for (const [name, aliases] of Object.entries(fallbackAliases)) {
        aliasMap.set(name, aliases);
      }
    }
    const displayed = new Set();
    const sections = [];

    for (const [title, commands] of categories) {
      const entries = commands.filter((command) => available.has(command) && !displayed.has(command));
      if (!entries.length) continue;
      entries.forEach((command) => displayed.add(command));
      sections.push([
        `┌─ ${title}`,
        ...entries.map((command) => {
          const aliases = aliasMap.get(command) || [];
          return `│  ▫ ${prefix}${command}${aliases.length ? ` / ${aliases.map((alias) => `${prefix}${alias}`).join(' / ')}` : ''}`;
        }),
        '└──────────────',
      ].join('\n'));
    }

    const otherCommands = [...available].filter((command) => !displayed.has(command)).sort();
    if (otherCommands.length) {
      sections.push([
        '┌─ 📂 DIVERS',
        ...otherCommands.map((command) => {
          const aliases = aliasMap.get(command) || [];
          return `│  ▫ ${prefix}${command}${aliases.length ? ` / ${aliases.map((alias) => `${prefix}${alias}`).join(' / ')}` : ''}`;
        }),
        '└──────────────',
      ].join('\n'));
    }

    const displayName = String(message?.pushName || 'ami').replace(/[\r\n]/g, ' ').trim();
    const number = String(senderNumber || '').replace(/\D/g, '') || 'inconnu';
    const count = available.size;
    const menu = [
      `╭━━━〔 ✨ *${config.botName}* 〕━━━╮`,
      `┃ 👋 Bonjour ${displayName}`,
      `┃ 👤 ${number}`,
      `┃ ⚙️ ${count} commandes • Préfixe : ${config.prefixes.join(' / ')}`,
      '╰━━━━━━━━━━━━━━━━━━━━',
      '',
      '📚 *COMMANDES*',
      '',
      ...sections.flatMap((section) => [section, '']),
      `💡 ${prefix}menu • ${prefix}help`,
    ];
    await sendReply(menu.join('\n').trimEnd());
  },
};
