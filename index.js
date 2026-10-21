import pino from 'pino';
import { config } from './config.js';
import { createStorage } from './storage.js';
import { createConnection } from './core/connection.js';
import { createMessageHandler } from './core/handler.js';
import { loadPlugins } from './core/loader.js';
import { initializeFeatureSettings } from './core/feature-settings.js';

// Point d'entrée : initialise le stockage, charge les commandes puis démarre Baileys.
async function start() {
  if (!config.sudoNumbers.length) {
    throw new Error('Configurez SUDO avec le numéro WhatsApp du propriétaire dans le fichier .env.');
  }

  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  const storage = await createStorage(config);
  await initializeFeatureSettings(storage);
  const plugins = await loadPlugins();
  const handleUpsert = createMessageHandler({ plugins, config, storage, logger });

  logger.info(`${config.botName} démarre avec ${plugins.size} commandes et alias.`);
  const connection = await createConnection({
    config,
    storage,
    onMessages: handleUpsert,
  });

  process.once('SIGINT', () => void connection.lifecycle.shutdown());
  process.once('SIGTERM', () => void connection.lifecycle.shutdown());
}

start().catch((error) => {
  console.error('Erreur au démarrage du bot :', error);
  process.exitCode = 1;
});
