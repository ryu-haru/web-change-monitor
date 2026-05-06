require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { initScheduler } = require('./scheduler');
const urlsRouter = require('./routes/urls');
const keysRouter = require('./routes/keys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/urls', urlsRouter);
app.use('/api/keys', keysRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 管理者APIキーの初期生成
function ensureAdminKey() {
  const crypto = require('crypto');
  const { v4: uuidv4 } = require('uuid');
  const existing = db.prepare("SELECT * FROM api_keys WHERE email = 'admin'").get();
  if (existing) return;

  const key = process.env.ADMIN_API_KEY || ('wcm_admin_' + crypto.randomBytes(16).toString('hex'));
  db.prepare("INSERT INTO api_keys (id, key, email, plan) VALUES (?, ?, 'admin', 'pro')").run(uuidv4(), key);
  console.log('\n========================================');
  console.log('管理者APIキーを生成しました:');
  console.log(key);
  console.log('========================================\n');
}

app.listen(PORT, () => {
  console.log(`Web Change Monitor 起動中 → http://localhost:${PORT}`);
  ensureAdminKey();
  initScheduler();
});
