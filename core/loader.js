import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins');
const projectDirectory = path.dirname(pluginsDirectory);

async function loadPluginDirectory(directory, plugins, optional) {
  let files;
  try {
    files = await fs.readdir(directory);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return;
    throw error;
  }

  const pluginFiles = files
    .filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))
    .sort();

  for (const file of pluginFiles) {
    const moduleUrl = pathToFileURL(path.join(directory, file));
    const module = await import(moduleUrl.href);
    const plugin = module.default;

    if (!plugin?.name || typeof plugin.execute !== 'function'
      || (plugin.aliases !== undefined && !Array.isArray(plugin.aliases))) {
      throw new TypeError(`Le plugin ${file} doit exporter un nom, une fonction execute et des alias valides.`);
    }

    const commandNames = [plugin.name, ...(plugin.aliases || [])]
      .map((name) => {
        if (typeof name !== 'string' || !name.trim()) {
          throw new TypeError(`Le plugin ${file} contient un nom ou un alias invalide.`);
        }
        return name.trim().toLowerCase();
      });
    const uniqueNames = new Set(commandNames);
    if (uniqueNames.size !== commandNames.length) {
      throw new TypeError(`Le plugin ${file} déclare un nom ou un alias en double.`);
    }
    for (const name of commandNames) {
      if (plugins.has(name)) {
        throw new TypeError(`Le nom de commande « ${name} » du plugin ${file} est déjà utilisé.`);
      }
    }

    for (const name of commandNames) plugins.set(name, plugin);
  }
}

// Charge les plugins intégrés puis les extensions locales facultatives.
export async function loadPlugins({
  externalDirectory = path.resolve(projectDirectory, 'eplugins'),
} = {}) {
  const plugins = new Map();
  await loadPluginDirectory(pluginsDirectory, plugins, false);
  await loadPluginDirectory(path.resolve(externalDirectory), plugins, true);
  return plugins;
}
