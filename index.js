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
    throw new Error('Configurez SUDO avec le numéro WhatsApp du propriétaire dans le fichier config.env.');
  }

  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  const storage = await createStorage(config);
  await initializeFeatureSettings(storage);
  const plugins = await loadPlugins({ externalDirectory: config.externalPluginsDirectory });
  const apiServer = config.apiMode === 'false' ? null : createApiServer({ config, logger });

  try {
    await apiServer?.listen();
    logger.info(`${config.botName} démarre avec ${plugins.size} commandes et alias.`);
    const connections = [];
    for (const sessionId of config.sessionIds) {
      const sessionConfig = {
        ...config,
        authDirectory: config.sessionIds.length === 1
          ? config.authDirectory
          : sessionId === config.sessionIds[0]
            ? config.authDirectory
            : `${config.authDirectory}-${sessionId}`,
      };
      const handleUpsert = createMessageHandler({
        plugins,
        config: sessionConfig,
        storage,
        logger,
        onIncoming: apiServer
          ? ({ message, socket }) => apiServer.handleIncoming({ message, socket, sessionId })
          : undefined,
      });
      connections.push(await createConnection({
        config: sessionConfig,
        storage,
        sessionId,
        enableAutoUpdater: sessionId === config.sessionIds[0],
        notifyOwnerOnConnect: sessionId === config.sessionIds[0],
        onMessages: handleUpsert,
        onSocket: (socket) => apiServer?.setSocket(sessionId, socket),
      }));
    }

    const shutdown = async () => {
      try {
        await apiServer?.close();
      } catch (error) {
        logger.error({ err: error }, 'Impossible d’arrêter proprement l’API HTTP.');
      }
      await connections[0].lifecycle.shutdown();
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
