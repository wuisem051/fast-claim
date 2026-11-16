// ─── FastClaim Telegram Bot Handler ──────────────────────────
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const appUrl = (process.env.APP_URL || 'https://fastclaim.netlify.app').replace(/\/+$/, '');

if (!token) {
  console.error('\n❌ ERROR: No se encontró BOT_TOKEN en el archivo .env\n');
  process.exit(1);
}

// ─── Firebase Admin SDK (para leer settings desde Firestore) ──────────────
// Usamos la REST API de Firestore directamente (sin SDK) para evitar dependencias extra
const FIRESTORE_PROJECT = 'fastclaim-355ff';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

// Cache de configuración del bot (se recarga cada 5 minutos)
let botConfig = null;
let configLastLoaded = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function loadBotConfig() {
  const now = Date.now();
  if (botConfig && (now - configLastLoaded) < CONFIG_TTL_MS) return botConfig;

  try {
    const res = await fetch(`${FIRESTORE_BASE}/settings/global`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fields = data.fields || {};

    // Extraer campos de configuración del bot
    botConfig = {
      start_message: getFirestoreStr(fields, 'bot_start_message') || null,
      btn_text: getFirestoreStr(fields, 'bot_start_btn_text') || '🚀 Abrir FastClaim Mini App',
      btn_url: getFirestoreStr(fields, 'bot_start_btn_url') || appUrl,
      invite_text: getFirestoreStr(fields, 'bot_invite_btn_text') || '👥 Invitar Amigos',
      share_text: getFirestoreStr(fields, 'bot_share_text') || '🚀 Gana ARPA USDT gratis con FastClaim!',
    };
    configLastLoaded = now;
    console.log('[BOT] Config /start actualizada desde Firestore.');
  } catch (e) {
    console.warn('[BOT] No se pudo cargar config de Firestore, usando defaults.', e.message);
    if (!botConfig) botConfig = {
      start_message: null,
      btn_text: '🚀 Abrir FastClaim Mini App',
      btn_url: appUrl,
      invite_text: '👥 Invitar Amigos',
      share_text: '🚀 Gana ARPA USDT gratis con FastClaim!',
    };
  }
  return botConfig;
}

function getFirestoreStr(fields, key) {
  return fields[key]?.stringValue || '';
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

async function answerCallbackQuery(callbackQueryId, text = null) {
  const payload = {
    callback_query_id: callbackQueryId
  };
  if (text) payload.text = text;

  try {
    const res = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error('Error respondiendo callback_query:', err.message);
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
  // Manejo de clicks en botones interactivos (reacciones, etc.)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    let toast = '¡Gracias por tu reacción!';
    if (data.startsWith('react_')) {
      const emoji = data.replace('react_', '');
      toast = `¡Has reaccionado con ${emoji}! ✨`;
    }
    await answerCallbackQuery(cb.id, toast);
    return;
  }

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

    // Cargar config personalizada desde Firestore
    const cfg = await loadBotConfig();

    // Mensaje personalizable — {nombre} se reemplaza con el nombre del usuario
    const defaultMessage =
      `👋 ¡Hola, <b>${escapeHtml(firstName)}</b>! Bienvenido a <b>FastClaim ARPA USDT</b> ⚡\n\n` +
      `Gana criptomonedas <b>ARPA</b> gratis cada hora por solo dar un toque:\n\n` +
      `🎁 <b>Bono de Bienvenida:</b> Reclama tokens gratis cada hora.\n` +
      `👥 <b>Sistema de Referidos:</b> Gana ARPA por cada amigo que invites más comisiones de sus reclamos.\n` +
      `💳 <b>Retiros Directos:</b> Cobros a Binance Pay o BNB Smart Chain (BEP-20).\n\n` +
      `👇 <i>Toca el botón abajo para iniciar la aplicación:</i>`;

    // Usar mensaje personalizado si existe, si no el default
    const welcomeText = cfg.start_message
      ? cfg.start_message.replace(/{nombre}/g, escapeHtml(firstName))
      : defaultMessage;

    // URL del botón principal: si está configurada en admin usa esa base + ref, si no usa appUrl
    const baseBtnUrl = cfg.btn_url || appUrl;
    const finalBtnUrl = refCode
      ? `${baseBtnUrl.replace(/\/+$/, '')}?ref=${encodeURIComponent(refCode)}`
      : baseBtnUrl;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: cfg.btn_text,
            web_app: { url: finalBtnUrl }
          }
        ],
        [
          {
            text: cfg.invite_text,
            url: `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/Dolar_fastbot?start=${refCode}`)}&text=${encodeURIComponent(cfg.share_text)}`
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
  } catch (e) { }

  // Cargar config inicial
  await loadBotConfig();

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
