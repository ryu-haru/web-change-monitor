const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

function generateApiKey() {
  return 'wcm_' + crypto.randomBytes(24).toString('hex');
}

// 新規APIキー発行（無料登録）
router.post('/register', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email は必須です' });

  const existing = db.prepare('SELECT * FROM api_keys WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'このメールアドレスはすでに登録済みです', key: existing.key });

  const key = generateApiKey();
  const id = uuidv4();
  db.prepare('INSERT INTO api_keys (id, key, email) VALUES (?, ?, ?)').run(id, key, email);

  res.status(201).json({ api_key: key, email, plan: 'free' });
});

// APIキー情報確認
router.get('/me', (req, res) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API keyが必要です' });

  const apiKey = db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key);
  if (!apiKey) return res.status(401).json({ error: '無効なAPI keyです' });

  const urlCount = db.prepare('SELECT COUNT(*) as count FROM monitored_urls WHERE api_key = ?').get(key);
  res.json({ email: apiKey.email, plan: apiKey.plan, url_count: urlCount.count });
});

module.exports = router;
