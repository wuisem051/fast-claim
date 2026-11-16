// ─── FastClaim Telegram Bot Handler ──────────────────────────
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL || 'https://fastclaim.netlify.app';

if (!token) {
  console.error('\n❌ ERROR: No se encontró BOT_TOKEN en el archivo .env');
  console.log('👉 Crea un archivo .env con:');
  console.log('BOT_TOKEN=tu_token_de_botfather');
  console.log('APP_URL=https://tu-sitio.netlify.app\n');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 FastClaim Bot iniciado correctamente con polling...');
console.log(`🌐 Mini App URL configurada: ${appUrl}`);

// Manejar comando /start y /start <referral_code>
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'amigo';
  const refCode = match && match[1] ? match[1].trim() : '';

  // Construir la URL con el parámetro de referido si viene de una invitación
  const targetUrl = refCode ? `${appUrl}?ref=${encodeURIComponent(refCode)}` : appUrl;

  const welcomeMessage = 
`👋 ¡Hola, *${escapeMarkdown(firstName)}*! Bienvenido a *FastClaim ARPA USDT* ⚡

Gana criptomonedas *ARPA* gratis de forma periódica por solo dar un toque:

🎁 *Bono de Bienvenida:* Reclama tokens gratis cada hora.
👥 *Sistema de Referidos:* Gana ARPA por cada amigo que invites más el % de todos sus reclamos.
💳 *Retiros Directos:* Cobros a tu wallet BSC (BEP-20) o Binance Pay.

👇 *Toca el botón abajo para abrir la aplicación:*`;

  try {
    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Abrir FastClaim Mini App',
              web_app: { url: targetUrl }
            }
          ],
          [
            {
              text: '👥 Invitar Amigos',
              url: `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${bot.options.username || 'Dolar_fastbot'}?start=${refCode}`)}&text=${encodeURIComponent('🚀 Gana ARPA USDT gratis con FastClaim!')}`
            }
          ]
        ]
      }
    });
  } catch (err) {
    console.error('Error enviando mensaje /start:', err.message);
  }
});

// Ayuda o comandos extras
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
`ℹ️ *Comandos Disponibles:*

/start - Inicia el bot y abre la Mini App
/help - Muestra este mensaje de ayuda

Para ganar ARPA y USDT, abre la Mini App tocando el botón del menú o en el mensaje de bienvenida.`, { parse_mode: 'Markdown' });
});

function escapeMarkdown(text) {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// Manejo de errores
bot.on('polling_error', (error) => {
  console.warn('Telegram Polling warning:', error.code || error.message);
});
