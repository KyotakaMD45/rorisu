import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins');

// Charge chaque module de commande et signale les plugins mal formés au démarrage.
export async function loadPlugins() {
  const files = (await fs.readdir(pluginsDirectory))
    .filter((file) => file.endsWith('.js'))
    .sort();
  const plugins = new Map();

  for (const file of files) {
    const moduleUrl = pathToFileURL(path.join(pluginsDirectory, file));
    const module = await import(moduleUrl.href);
    const plugin = module.default;

    if (!plugin?.name || typeof plugin.execute !== 'function') {
      throw new TypeError(`Le plugin ${file} doit exporter un nom et une fonction execute.`);
    }

    plugins.set(plugin.name.toLowerCase(), plugin);
    for (const alias of plugin.aliases || []) plugins.set(alias.toLowerCase(), plugin);
  }

  return plugins;
}
