import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAutoUpdater } from './auto-update.js';
import { handleGroupParticipantsUpdate } from './group-events.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

export function buildOwnerWelcome({
  botName,
  sessionId,
  ownerNumber,
  prefix,
  autoStatus,
  autoStatusView,
  sendRead,
  autoUpdate,
  antiDelete,
  antiVv,
  gemini,
}) {
  return [
    `👋 Bienvenue et merci d’avoir utilisé *${botName}* !`,
    '',
    `✅ *${botName}* est en ligne !`,
    `Session : ${sessionId}`,
    `Numéro : ${ownerNumber}`,
    '',
    `Envoie *${prefix}menu* pour voir les commandes.`,
    '',
    '⚙️ *Fonctionnalités*',
    `• Statuts vers le propriétaire : ${autoStatus}`,
    `• Lecture automatique des statuts : ${autoStatusView}`,
    `• Accusés de lecture : ${sendRead}`,
    `• Mise à jour automatique : ${autoUpdate}`,
    `• Anti-suppression : ${antiDelete}`,
    `• Anti-VV : ${antiVv}`,
    `• Assistant Gemini : ${gemini}`,
  ].join('\n');
}

// Crée la session persistante, affiche un code d’association et reconnecte après une coupure.
export async function createConnection({
  config,
  onMessages,
  onMessageUpdate,
  onSocket,
  sessionId = '0',
  enableAutoUpdater = true,
  notifyOwnerOnConnect = true,
  storage,
}) {
  const authDirectory = path.resolve(projectDirectory, config.authDirectory);
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  if (config.pairingMethod === 'qr' && !state.creds.registered && state.creds.pairingCode) {
    delete state.creds.pairingCode;
    delete state.creds.me;
    await saveCreds();
  }
  const logger = pino({
    level: process.env.LOG_LEVEL || 'warn',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        hideObject: true,
        ignore: 'pid,hostname',
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss',
      },
    },
  });
  let socket;
  let reconnectTimer;
  let pairingTimer;
  let stopped = false;
  let pairingCodeRequested = false;
  let displayedQr;
  let welcomeMessageSent = false;
  let ownerNotificationAttempts = 0;
  let ownerNotificationRetryTimer;
  let connectionOpen = false;
  let autoUpdater;

  const lifecycle = {
    async shutdown(chatId) {
      if (chatId) {
        await socket.sendMessage(chatId, { text: `${config.botName} s’arrête.` });
      }
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(pairingTimer);
      clearTimeout(ownerNotificationRetryTimer);
      autoUpdater?.stop();
      await storage.close();
      socket?.end(new Error('Arrêt demandé par un administrateur.'));
      if (process.env.pm_id !== undefined) {
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        await execFileAsync('pm2', ['stop', process.env.pm_id], {
          timeout: 30_000,
          windowsHide: true,
        });
        return;
      }
      process.exit(0);
    },
    async restart(chatId) {
      if (chatId) {
        await socket.sendMessage(chatId, { text: `${config.botName} redémarre.` });
      }
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(pairingTimer);
      clearTimeout(ownerNotificationRetryTimer);
      autoUpdater?.stop();
      await storage.close();
      socket?.end(new Error('Redémarrage demandé par un administrateur.'));
      if (process.env.pm_id !== undefined) {
        process.exit(0);
      }
      const child = spawn(process.execPath, process.argv.slice(1), {
        cwd: projectDirectory,
        env: process.env,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      process.exit(0);
    },
  };

  autoUpdater = createAutoUpdater({ storage, lifecycle, logger });

  async function notifyOwner() {
    if (welcomeMessageSent) return;
    if (!config.sudoNumbers[0]) {
      welcomeMessageSent = true;
      return;
    }

    try {
      const ownerJid = `${config.sudoNumbers[0]}@s.whatsapp.net`;
      const autoStatus = await storage.get('feature:auto_status') === true ? 'activé' : 'désactivé';
      const autoStatusView = await storage.get('feature:auto_status_view') === true ? 'activée' : 'désactivée';
      const sendRead = await storage.get('feature:send_read') === true ? 'activés' : 'désactivés';
      const autoUpdate = await storage.get('feature:auto_update') === true ? 'activée' : 'désactivée';
      const antiDelete = await storage.get('feature:anti_delete') ? 'activée' : 'désactivée';
      const antiVvSettings = await storage.get('feature:anti_vv');
      const antiVv = antiVvSettings === true || antiVvSettings?.enabled === true ? 'activée' : 'désactivée';
      const prefix = config.prefixes?.[0] || '.';
      const welcome = buildOwnerWelcome({
        botName: config.botName,
        sessionId,
        ownerNumber: config.sudoNumbers[0],
        prefix,
        autoStatus,
        autoStatusView,
        sendRead,
        autoUpdate,
        antiDelete,
        antiVv,
        gemini: config.gemini.apiKey ? 'activé' : 'désactivé (clé API manquante)',
      });

      await socket.sendMessage(ownerJid, { text: welcome });
      welcomeMessageSent = true;
      ownerNotificationAttempts = 0;
      logger.info('Message de connexion envoyé au propriétaire.');
    } catch (error) {
      logger.error(
        { err: error, attempt: ownerNotificationAttempts + 1 },
        'Impossible d’envoyer le message de connexion au propriétaire.',
      );
      const retryDelays = [5000, 15000, 30000];
      const retryDelay = retryDelays[ownerNotificationAttempts];
      ownerNotificationAttempts += 1;
      if (retryDelay !== undefined && !ownerNotificationRetryTimer) {
        ownerNotificationRetryTimer = setTimeout(() => {
          ownerNotificationRetryTimer = undefined;
          if (connectionOpen && !stopped) void notifyOwner();
        }, retryDelay);
      }
    }
  }

  async function connect() {
    if (stopped) return;

    socket = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: [config.botName, 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    onSocket?.(socket);

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', (event) => onMessages(event, socket, lifecycle, sessionId));
    if (onMessageUpdate) {
      socket.ev.on('messages.update', (updates) => {
        void onMessageUpdate(updates, socket).catch((error) => {
          logger.error({ err: error }, 'Impossible de traiter les mises à jour de messages WhatsApp.');
        });
      });
    }
    socket.ev.on('group-participants.update', (update) => {
      void handleGroupParticipantsUpdate(update, { socket, storage }).catch((error) => {
        logger.error({ err: error, groupId: update.id }, 'Impossible d’envoyer le message automatique du groupe.');
      });
    });
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (connection === 'open') {
        connectionOpen = true;
        console.log(`✅ ${config.botName} est connecté à WhatsApp.`);
        if (enableAutoUpdater) autoUpdater.start();
        if (notifyOwnerOnConnect) await notifyOwner();
      } else if (connection === 'close' && !stopped) {
        connectionOpen = false;
        clearTimeout(ownerNotificationRetryTimer);
        ownerNotificationRetryTimer = undefined;
        ownerNotificationAttempts = 0;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('Session déconnectée ; supprimez les identifiants pour réassocier le bot.');
          return;
        }
        clearTimeout(reconnectTimer);
        clearTimeout(pairingTimer);
        if (!state.creds.registered) pairingCodeRequested = false;
        displayedQr = undefined;
        reconnectTimer = setTimeout(() => void connect(), 3000);
      }

      if (qr && config.pairingMethod === 'qr' && !state.creds.registered && qr !== displayedQr) {
        displayedQr = qr;
        console.log('Scannez ce QR code avec WhatsApp, dans Appareils connectés :');
        qrcode.generate(qr, { small: true });
      }

      if (!state.creds.registered
        && config.pairingMethod === 'code'
        && !pairingCodeRequested
        && config.sudoNumbers[0]
        && (connection === 'connecting' || connection === 'open')) {
        pairingCodeRequested = true;
        pairingTimer = setTimeout(async () => {
          if (stopped || state.creds.registered) return;
          try {
            const code = await socket.requestPairingCode(config.sudoNumbers[0]);
            console.log(`Code d’association WhatsApp : ${code}`);
            console.log('Saisissez ce code sur le téléphone, dans Appareils connectés.');
          } catch (error) {
            pairingCodeRequested = false;
            logger.error({ err: error }, 'Impossible de demander le code d’association.');
          }
        }, 3000);
      }
    });
  }

  await connect();
  return { lifecycle, get socket() { return socket; } };
}
