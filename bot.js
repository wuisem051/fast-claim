// ─── FastClaim Telegram Bot Handler ──────────────────────────
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const appUrl = (process.env.APP_URL || 'https://fastclaim.netlify.app').replace(/\/+$/, '');

if (!token) {
  console.error('\n❌ ERROR: No se encontró BOT_TOKEN en el archivo .env\n');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${token}`;

console.log('🤖 FastClaim Bot (@Dolar_fastbot) inicializado...');
console.log(`🌐 Mini App URL: ${appUrl}`);

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error('Error enviando mensaje Telegram:', err.message);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'amigo';
  const text = msg.text.trim();

  // Comando /start o /start <refCode>
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const refCode = parts.length > 1 ? parts[1].trim() : '';
    const targetUrl = refCode ? `${appUrl}?ref=${encodeURIComponent(refCode)}` : appUrl;

    const welcomeText = 
`👋 ¡Hola, <b>${escapeHtml(firstName)}</b>! Bienvenido a <b>FastClaim ARPA USDT</b> ⚡\n\n` +
`Gana criptomonedas <b>ARPA</b> gratis cada hora por solo dar un toque:\n\n` +
`🎁 <b>Bono de Bienvenida:</b> Reclama tokens gratis cada hora.\n` +
`👥 <b>Sistema de Referidos:</b> Gana ARPA por cada amigo que invites más comisiones de sus reclamos.\n` +
`💳 <b>Retiros Directos:</b> Cobros a Binance Pay o BNB Smart Chain (BEP-20).\n\n` +
`👇 <i>Toca el botón abajo para iniciar la aplicación:</i>`;

    const keyboard = {
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
            url: `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/Dolar_fastbot?start=${refCode}`)}&text=${encodeURIComponent('🚀 Gana ARPA USDT gratis con FastClaim!')}`
          }
        ]
      ]
    };

    await sendTelegramMessage(chatId, welcomeText, keyboard);
    console.log(`[BOT] /start respondido para ${firstName} (${chatId})${refCode ? ' con ref: ' + refCode : ''}`);
  }

  // Comando /help
  else if (text.startsWith('/help')) {
    const helpText = 
`ℹ️ <b>FastClaim - Ayuda</b>\n\n` +
`• <b>/start</b> - Inicia la aplicación y muestra el botón de acceso.\n` +
`• <b>/help</b> - Información de ayuda y comandos.\n\n` +
`Toca el botón <b>🚀 Ganar ARPA</b> abajo a la izquierda para abrir la aplicación.`;

    await sendTelegramMessage(chatId, helpText);
  }
}

// Long Polling infinito nativo
async function startPolling() {
  console.log('✅ Polling activo. Escuchando mensajes en Telegram...');
  let offset = 0;

  // Descartar mensajes pendientes viejos al iniciar
  try {
    const initRes = await fetch(`${TELEGRAM_API}/getUpdates?offset=-1`);
    const initData = await initRes.json();
    if (initData.ok && initData.result.length > 0) {
      offset = initData.result[initData.result.length - 1].update_id + 1;
    }
  } catch(e) {}

  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=25`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          handleUpdate(update).catch(err => console.error('Handler error:', err));
        }
      } else if (!data.ok) {
        console.warn('Telegram API response not OK:', data.description);
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (err) {
      console.warn('Error de conexión polling (reintentando en 3s)...', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

startPolling();
