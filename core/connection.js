import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAutoUpdater } from './auto-update.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Crée la session persistante, affiche un code d’association et reconnecte après une coupure.
export async function createConnection({ config, onMessages, storage }) {
  const authDirectory = path.resolve(projectDirectory, config.authDirectory);
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  if (config.pairingMethod === 'qr' && !state.creds.registered && state.creds.pairingCode) {
    delete state.creds.pairingCode;
    delete state.creds.me;
    await saveCreds();
  }
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  let socket;
  let reconnectTimer;
  let pairingTimer;
  let stopped = false;
  let pairingCodeRequested = false;
  let displayedQr;
  let welcomeMessageSent = false;
  let autoUpdater;

  const lifecycle = {
    async shutdown(chatId) {
      if (chatId) {
        await socket.sendMessage(chatId, { text: `${config.botName} s’arrête.` });
      }
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(pairingTimer);
      autoUpdater?.stop();
      await storage.close();
      socket?.end(new Error('Arrêt demandé par un administrateur.'));
      process.exit(0);
    },
    async restart(chatId) {
      if (chatId) {
        await socket.sendMessage(chatId, { text: `${config.botName} redémarre.` });
      }
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(pairingTimer);
      autoUpdater?.stop();
      await storage.close();
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

    const ownerJid = `${config.sudoNumbers[0]}@s.whatsapp.net`;
    const autoStatus = await storage.get('feature:auto_status') === true ? 'activé' : 'désactivé';
    const autoUpdate = await storage.get('feature:auto_update') === true ? 'activée' : 'désactivée';
    const welcome = `Welcome to our awesome community! Come hang out with us for fun chats, cool ideas, and lots of love. Remember the rules: no sharing links, spamming, spreading hate, or being mean. We're all about respect and kindness here.
Telegram Group https://t.me/+TYpRg-AoN4gzNzNl
Must Read Rules!!!

Check out https://levanter.site for some awesome add-ons to make things even more awesome. Got questions? Just ask our Telegram bot @levanter_group_bot for instant help, or read up on our FAQ at https://levanter.site

Dive into exciting talks, unleash your inner creativity, and make new friends. Let's explore, inspire each other, and grow as a group! Can't wait to see you there! 🔥

https://whatsapp.com/channel/0029Va92msU59PwYuplVMH2L

Fonctions activées/désactivées :
- AUTO_STATUS : ${autoStatus}
- AUTO_UPDATE : ${autoUpdate}`;

    await socket.sendMessage(ownerJid, { text: welcome });
    welcomeMessageSent = true;
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

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', (event) => onMessages(event, socket, lifecycle));
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (connection === 'open') {
        logger.info('Connexion WhatsApp établie.');
        autoUpdater.start();
        try {
          await notifyOwner();
        } catch (error) {
          logger.error({ err: error }, 'Impossible d’envoyer le message de connexion au propriétaire.');
        }
      } else if (connection === 'close' && !stopped) {
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
