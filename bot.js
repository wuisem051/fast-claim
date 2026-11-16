// ─── FastClaim Telegram Bot Handler ──────────────────────────
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const appUrl = (process.env.APP_URL || 'https://faslcaim.netlify.app').replace(/\/+$/, '');

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

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    const res = await fetch(`${TELEGRAM_API}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Error en editMessageReplyMarkup:', err.message);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Estructura en memoria para seguimiento de reacciones por mensaje
// Estructura: messageVotes[msgKey] = { [userId]: emojiIndex }
// Esto garantiza exactamente 1 voto por cuenta de Telegram (si vota otro, se cambia)
const messageVotes = new Map();

async function executeStartCommand(chatId, firstName, refCode = '') {
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
  console.log(`[BOT] /start ejecutado para ${firstName} (${chatId})${refCode ? ' con ref: ' + refCode : ''}`);
}

async function handleUpdate(update) {
  // Manejo de clicks en botones interactivos (reacciones, etc.)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const userId = cb.from?.id;

    if (data.startsWith('react_')) {
      const msg = cb.message;
      if (!msg) {
        await answerCallbackQuery(cb.id, '¡Reacción registrada!');
        return;
      }

      const chatId = msg.chat?.id;
      const messageId = msg.message_id;
      const msgKey = `${chatId}_${messageId}`;

      // Obtener el índice del botón presionado o el emoji
      // Formato esperado de data: react_<emoji> o react_idx_<index>
      const originalMarkup = msg.reply_markup?.inline_keyboard;
      if (!originalMarkup || !originalMarkup.length) {
        await answerCallbackQuery(cb.id, '¡Reacción registrada!');
        return;
      }

      if (!messageVotes.has(msgKey)) {
        messageVotes.set(msgKey, new Map());
      }
      const votesMap = messageVotes.get(msgKey);

      // Localizar la fila de reacciones (la primera fila con botones que tengan callback_data react_)
      let reactionRowIndex = -1;
      for (let r = 0; r < originalMarkup.length; r++) {
        if (originalMarkup[r].some(btn => btn.callback_data && btn.callback_data.startsWith('react_'))) {
          reactionRowIndex = r;
          break;
        }
      }

      if (reactionRowIndex === -1) {
        await answerCallbackQuery(cb.id, '¡Reacción registrada!');
        return;
      }

      const reactionRow = originalMarkup[reactionRowIndex];
      // Encontrar cuál botón fue pulsado
      const clickedBtnIndex = reactionRow.findIndex(btn => btn.callback_data === data);
      if (clickedBtnIndex === -1) {
        await answerCallbackQuery(cb.id, '¡Reacción registrada!');
        return;
      }

      const previousVote = votesMap.get(userId);
      let toastMessage = '';

      if (previousVote === clickedBtnIndex) {
        // Si vuelve a presionar la misma reacción, se la quita (des-reaccionar)
        votesMap.delete(userId);
        toastMessage = 'Reacción eliminada';
      } else {
        // 1 reacción por cuenta de Telegram: asigna la nueva
        votesMap.set(userId, clickedBtnIndex);
        const emojiClean = reactionRow[clickedBtnIndex].text.replace(/\s*\d+$/, '').trim();
        toastMessage = `¡Reaccionaste con ${emojiClean}! ✨`;
      }

      // Recontar votos por cada botón de esa fila
      const counts = new Array(reactionRow.length).fill(0);
      for (const [uId, btnIdx] of votesMap.entries()) {
        if (btnIdx >= 0 && btnIdx < counts.length) {
          counts[btnIdx]++;
        }
      }

      // Reconstruir la fila de botones con los contadores
      const newInlineKeyboard = originalMarkup.map((row, rIdx) => {
        if (rIdx !== reactionRowIndex) return row;
        return row.map((btn, bIdx) => {
          // Extraer emoji base sin número previo
          const baseEmoji = btn.text.replace(/\s*\d+$/, '').trim();
          const count = counts[bIdx];
          const newText = count > 0 ? `${baseEmoji} ${count}` : baseEmoji;
          return {
            ...btn,
            text: newText
          };
        });
      });

      // Actualizar el teclado en el mensaje de Telegram
      await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: newInlineKeyboard });
      await answerCallbackQuery(cb.id, toastMessage);
      return;
    }

    if (data === 'trigger_start_app') {
      await answerCallbackQuery(cb.id, '🚀 Iniciando FastClaim...');
      // Ejecutar la rutina completa de /start para el usuario
      const chatId = cb.message?.chat?.id || userId;
      const firstName = cb.from?.first_name || 'amigo';
      await executeStartCommand(chatId, firstName, '');
      return;
    }

    await answerCallbackQuery(cb.id, '¡Listo!');
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
    await executeStartCommand(chatId, firstName, refCode);
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
