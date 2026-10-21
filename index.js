import pino from 'pino';
import { config } from './config.js';
import { createStorage } from './storage.js';
import { createConnection } from './core/connection.js';
import { createMessageHandler } from './core/handler.js';
import { loadPlugins } from './core/loader.js';
import { initializeFeatureSettings } from './core/feature-settings.js';
import { createApiServer } from './core/api.js';

// Point d'entrée : initialise le stockage, charge les commandes puis démarre Baileys.
async function start() {
  if (!config.sudoNumbers.length
    && (config.apiMode !== 'only' || config.pairingMethod === 'code')) {
    throw new Error('Configurez SUDO avec le numéro WhatsApp du propriétaire dans le fichier .env.');
  }

  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  const storage = await createStorage(config);
  await initializeFeatureSettings(storage);
  const plugins = await loadPlugins({ externalDirectory: config.externalPluginsDirectory });
  const apiServer = config.apiMode === 'false' ? null : createApiServer({ config, logger });

  try {
    await apiServer?.listen();
    const handleUpsert = createMessageHandler({
      plugins,
      config,
      storage,
      logger,
      onIncoming: apiServer?.handleIncoming,
    });

    logger.info(`${config.botName} démarre avec ${plugins.size} commandes et alias.`);
    const connection = await createConnection({
      config,
      storage,
      onMessages: handleUpsert,
      onSocket: (socket) => apiServer?.setSocket(socket),
    });

    const shutdown = async () => {
      try {
        await apiServer?.close();
      } catch (error) {
        logger.error({ err: error }, 'Impossible d’arrêter proprement l’API HTTP.');
      }
      await connection.lifecycle.shutdown();
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
  } catch (error) {
    try {
      await apiServer?.close();
    } catch (closeError) {
      logger.error({ err: closeError }, 'Impossible de fermer l’API après une erreur de démarrage.');
    }
    throw error;
  }
}

start().catch((error) => {
  console.error('Erreur au démarrage du bot :', error);
  process.exitCode = 1;
});
