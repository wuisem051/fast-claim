/**
 * FastClaim TON Mini App - Backend
 * Express + Node.js built-in SQLite (node:sqlite, disponible en Node v22+)
 * Sin dependencias nativas que requieran compilación.
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const fs         = require('fs');
const { DatabaseSync } = require('node:sqlite');

// ─── Config ───────────────────────────────────────────────
const PORT               = process.env.PORT               || 3000;
const BONUS_AMOUNT       = parseFloat(process.env.BONUS_AMOUNT       || '0.01');   // TON por claim
const BONUS_COOLDOWN_H   = parseFloat(process.env.BONUS_COOLDOWN_H   || '1');      // horas
const REFERRAL_REWARD    = parseFloat(process.env.REFERRAL_REWARD    || '0.05');   // TON por referido
const MIN_WITHDRAW       = parseFloat(process.env.MIN_WITHDRAW       || '0.1');    // TON mínimo retiro
const ADMIN_SECRET       = process.env.ADMIN_SECRET       || 'fastclaim_admin_2024';

// ─── Database ─────────────────────────────────────────────
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const db = new DatabaseSync(path.join(dbDir, 'app.db'));

// Pragma de rendimiento
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id      TEXT PRIMARY KEY,
    username         TEXT    DEFAULT '',
    first_name       TEXT    DEFAULT 'User',
    photo_url        TEXT    DEFAULT '',
    balance          REAL    DEFAULT 0,
    referral_code    TEXT    UNIQUE,
    referred_by      TEXT,
    last_bonus_claim TEXT    DEFAULT NULL,
    total_claimed    INTEGER DEFAULT 0,
    created_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id     TEXT    NOT NULL,
    amount          REAL    NOT NULL,
    wallet_address  TEXT    NOT NULL,
    status          TEXT    DEFAULT 'pending',
    note            TEXT    DEFAULT '',
    created_at      TEXT    DEFAULT (datetime('now')),
    processed_at    TEXT    DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Insertar configuración por defecto (si no existe)
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('bonus_amount',       String(BONUS_AMOUNT));
insertSetting.run('bonus_cooldown_h',   String(BONUS_COOLDOWN_H));
insertSetting.run('referral_reward',    String(REFERRAL_REWARD));
insertSetting.run('min_withdraw',       String(MIN_WITHDRAW));

// ─── Helpers ──────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? parseFloat(row.value) : null;
}

function generateCode(telegramId) {
  return crypto.createHash('md5')
    .update(telegramId + Date.now())
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
}

function getOrCreateUser(telegramId, username, firstName, photoUrl, refCode) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (!user) {
    const code = generateCode(telegramId);
    let referredBy = null;

    if (refCode) {
      const referrer = db.prepare('SELECT telegram_id FROM users WHERE referral_code = ?').get(refCode);
      if (referrer && referrer.telegram_id !== telegramId) {
        referredBy = referrer.telegram_id;
      }
    }

    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, photo_url, referral_code, referred_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(telegramId, username || '', firstName || 'User', photoUrl || '', code, referredBy);

    // Recompensar al referidor
    if (referredBy) {
      const reward = getSetting('referral_reward') || REFERRAL_REWARD;
      db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(reward, referredBy);
    }
  } else {
    // Actualizar datos si cambiaron
    db.prepare(`
      UPDATE users SET username = ?, first_name = ?, photo_url = ? WHERE telegram_id = ?
    `).run(
      username  || user.username,
      firstName || user.first_name,
      photoUrl  || user.photo_url,
      telegramId
    );
  }

  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

// ─── Express ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Servir index.html
app.use(express.static(__dirname));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/admin/users', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const users = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.telegram_id) as referral_count
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

app.patch('/api/admin/users/:telegram_id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { balance } = req.body;
  if (balance !== undefined) {
    db.prepare('UPDATE users SET balance = ? WHERE telegram_id = ?').run(parseFloat(balance), req.params.telegram_id);
  }
  res.json({ success: true });
});

// ─── Start ────────────────────────────────────────────────

// ── POST /api/user ─ Obtener o crear usuario ───────────────
app.post('/api/user', (req, res) => {
  try {
    const { telegram_id, username, first_name, photo_url, ref } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const user = getOrCreateUser(
      String(telegram_id),
      username   || '',
      first_name || 'User',
      photo_url  || '',
      ref        || null
    );

    const refCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE referred_by = ?').get(user.telegram_id);
    const cooldownH = getSetting('bonus_cooldown_h') || BONUS_COOLDOWN_H;

    let canClaim = true;
    let nextClaimIn = 0;

    if (user.last_bonus_claim) {
      const lastMs   = new Date(user.last_bonus_claim).getTime();
      const diffSecs = (Date.now() - lastMs) / 1000;
      const coolSecs = cooldownH * 3600;
      if (diffSecs < coolSecs) {
        canClaim     = false;
        nextClaimIn  = Math.ceil(coolSecs - diffSecs);
      }
    }

    res.json({
      telegram_id:    user.telegram_id,
      username:       user.username,
      first_name:     user.first_name,
      photo_url:      user.photo_url,
      balance:        user.balance,
      referral_code:  user.referral_code,
      referred_by:    user.referred_by,
      total_claimed:  user.total_claimed,
      referral_count: refCount.c,
      can_claim:      canClaim,
      next_claim_in:  nextClaimIn,
      bonus_amount:   getSetting('bonus_amount')    || BONUS_AMOUNT,
      referral_reward:getSetting('referral_reward') || REFERRAL_REWARD,
      min_withdraw:   getSetting('min_withdraw')    || MIN_WITHDRAW,
      created_at:     user.created_at
    });
  } catch (err) {
    console.error('[/api/user]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── POST /api/claim ─ Reclamar bonus horario ───────────────
app.post('/api/claim', (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegram_id));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const cooldownH   = getSetting('bonus_cooldown_h') || BONUS_COOLDOWN_H;
    const bonusAmount = getSetting('bonus_amount')     || BONUS_AMOUNT;
    const coolSecs    = cooldownH * 3600;

    if (user.last_bonus_claim) {
      const diffSecs = (Date.now() - new Date(user.last_bonus_claim).getTime()) / 1000;
      if (diffSecs < coolSecs) {
        return res.status(429).json({
          error:        'Cooldown activo',
          next_claim_in: Math.ceil(coolSecs - diffSecs),
          can_claim:    false
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET balance = balance + ?, last_bonus_claim = ?, total_claimed = total_claimed + 1
      WHERE telegram_id = ?
    `).run(bonusAmount, now, user.telegram_id);

    const updated = db.prepare('SELECT balance, total_claimed FROM users WHERE telegram_id = ?').get(user.telegram_id);

    res.json({
      success:       true,
      bonus_amount:  bonusAmount,
      new_balance:   updated.balance,
      total_claimed: updated.total_claimed,
      next_claim_in: coolSecs
    });
  } catch (err) {
    console.error('[/api/claim]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── POST /api/withdraw ─ Solicitar retiro ─────────────────
app.post('/api/withdraw', (req, res) => {
  try {
    const { telegram_id, amount, wallet_address } = req.body;
    if (!telegram_id || !amount || !wallet_address)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegram_id));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const minWD    = getSetting('min_withdraw') || MIN_WITHDRAW;
    const reqAmt   = parseFloat(amount);
    if (isNaN(reqAmt) || reqAmt < minWD)
      return res.status(400).json({ error: `Monto mínimo: ${minWD} TON` });
    if (user.balance < reqAmt)
      return res.status(400).json({ error: 'Balance insuficiente' });

    db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(reqAmt, user.telegram_id);
    const result = db.prepare(`
      INSERT INTO withdrawals (telegram_id, amount, wallet_address, status)
      VALUES (?, ?, ?, 'pending')
    `).run(user.telegram_id, reqAmt, wallet_address.trim());

    const newBal = db.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(user.telegram_id);
    res.json({
      success:        true,
      withdrawal_id:  result.lastInsertRowid,
      amount:         reqAmt,
      wallet_address: wallet_address.trim(),
      status:         'pending',
      new_balance:    newBal.balance,
      message:        'Retiro solicitado. Será procesado en 24-48h.'
    });
  } catch (err) {
    console.error('[/api/withdraw]', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/withdrawals/:telegram_id ─ Historial ─────────
app.get('/api/withdrawals/:telegram_id', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, amount, wallet_address, status, note, created_at, processed_at
      FROM withdrawals WHERE telegram_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).all(String(req.params.telegram_id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── Admin routes ──────────────────────────────────────────
function checkAdmin(req, res) {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    res.status(403).json({ error: 'No autorizado' });
    return false;
  }
  return true;
}

app.get('/api/admin/withdrawals', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const rows = db.prepare(`
    SELECT w.*, u.first_name, u.username
    FROM withdrawals w JOIN users u ON u.telegram_id = w.telegram_id
    ORDER BY w.created_at DESC
  `).all();
  res.json(rows);
});

app.patch('/api/admin/withdrawals/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Status inválido' });

  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'No encontrado' });

  if (status === 'rejected' && w.status === 'pending') {
    db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(w.amount, w.telegram_id);
  }

  db.prepare(`UPDATE withdrawals SET status=?, note=?, processed_at=datetime('now') WHERE id=?`)
    .run(status, note || '', req.params.id);
  res.json({ success: true, status, id: req.params.id });
});

app.get('/api/admin/settings', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const rows = db.prepare('SELECT * FROM settings').all();
  const result = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

app.patch('/api/admin/settings', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const allowed = ['bonus_amount', 'bonus_cooldown_h', 'referral_reward', 'min_withdraw'];
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  Object.entries(req.body).forEach(([k, v]) => {
    if (allowed.includes(k)) stmt.run(String(v), k);
  });
  res.json({ success: true });
});

app.get('/api/admin/stats', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const totalUsers        = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalClaims       = db.prepare('SELECT SUM(total_claimed) as s FROM users').get().s || 0;
  const totalWithdrawn    = db.prepare("SELECT SUM(amount) as s FROM withdrawals WHERE status='approved'").get().s || 0;
  const pendingWithdrawals= db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE status='pending'").get().c;
  res.json({ totalUsers, totalClaims, totalWithdrawn, pendingWithdrawals });
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   ⚡  FastClaim TON Mini App          ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n🚀  http://localhost:${PORT}`);
  console.log(`📦  DB: ${path.join(__dirname, 'db', 'app.db')}`);
  console.log(`⚙️   Bonus: ${getSetting('bonus_amount')} TON / cada ${getSetting('bonus_cooldown_h')}h`);
  console.log(`💸  Min retiro: ${getSetting('min_withdraw')} TON`);
  console.log(`🔑  Admin secret: ${ADMIN_SECRET}\n`);
});
