const sensitiveSessionMessages = new Set([
  'Closing session:',
  'Opening session:',
]);

export function suppressSensitiveSessionLogs(consoleObject = console) {
  for (const method of ['info', 'warn']) {
    const original = consoleObject[method];
    if (typeof original !== 'function' || original.__rorisuSafe) continue;

    const filtered = function safeSessionLogger(...args) {
      if (sensitiveSessionMessages.has(args[0])) {
        return original.call(this, '[Signal] Mise à jour de session (détails masqués).');
      }
      return original.apply(this, args);
    };
    filtered.__rorisuSafe = true;
    consoleObject[method] = filtered;
  }
}
