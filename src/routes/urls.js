const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { scheduleUrl, unscheduleUrl, runCheck } = require('../scheduler');

const router = express.Router();

// 認証ミドルウェア
function auth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API keyが必要です' });
  const apiKey = db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key);
  if (!apiKey) return res.status(401).json({ error: '無効なAPI keyです' });
  req.apiKey = apiKey;
  next();
}

// 監視URL一覧
router.get('/', auth, (req, res) => {
  const urls = db.prepare('SELECT * FROM monitored_urls WHERE api_key = ? ORDER BY created_at DESC')
    .all(req.apiKey.key);
  res.json(urls);
});

// 監視URL追加
router.post('/', auth, (req, res) => {
  const { name, url, interval_minutes = 60, selector, notify_slack, notify_email } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name と url は必須です' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO monitored_urls (id, api_key, name, url, interval_minutes, selector, notify_slack, notify_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.apiKey.key, name, url, interval_minutes, selector || null, notify_slack || null, notify_email || null);

  const record = db.prepare('SELECT * FROM monitored_urls WHERE id = ?').get(id);
  scheduleUrl(record);
  res.status(201).json(record);
});

// 監視URL更新
router.patch('/:id', auth, (req, res) => {
  const { name, interval_minutes, selector, notify_slack, notify_email, is_active } = req.body;
  const existing = db.prepare('SELECT * FROM monitored_urls WHERE id = ? AND api_key = ?')
    .get(req.params.id, req.apiKey.key);
  if (!existing) return res.status(404).json({ error: '見つかりません' });

  db.prepare(`
    UPDATE monitored_urls SET
      name = COALESCE(?, name),
      interval_minutes = COALESCE(?, interval_minutes),
      selector = COALESCE(?, selector),
      notify_slack = COALESCE(?, notify_slack),
      notify_email = COALESCE(?, notify_email),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, interval_minutes, selector, notify_slack, notify_email, is_active, req.params.id);

  const updated = db.prepare('SELECT * FROM monitored_urls WHERE id = ?').get(req.params.id);
  if (updated.is_active) scheduleUrl(updated);
  else unscheduleUrl(updated.id);

  res.json(updated);
});

// 監視URL削除
router.delete('/:id', auth, (req, res) => {
  const existing = db.prepare('SELECT * FROM monitored_urls WHERE id = ? AND api_key = ?')
    .get(req.params.id, req.apiKey.key);
  if (!existing) return res.status(404).json({ error: '見つかりません' });

  unscheduleUrl(req.params.id);
  db.prepare('DELETE FROM monitored_urls WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 今すぐチェック
router.post('/:id/check', auth, async (req, res) => {
  const record = db.prepare('SELECT * FROM monitored_urls WHERE id = ? AND api_key = ?')
    .get(req.params.id, req.apiKey.key);
  if (!record) return res.status(404).json({ error: '見つかりません' });

  await runCheck(record);
  const updated = db.prepare('SELECT * FROM monitored_urls WHERE id = ?').get(req.params.id);
  res.json({ success: true, last_checked_at: updated.last_checked_at });
});

// 変更履歴
router.get('/:id/history', auth, (req, res) => {
  const record = db.prepare('SELECT * FROM monitored_urls WHERE id = ? AND api_key = ?')
    .get(req.params.id, req.apiKey.key);
  if (!record) return res.status(404).json({ error: '見つかりません' });

  const history = db.prepare('SELECT * FROM change_history WHERE url_id = ? ORDER BY detected_at DESC LIMIT 50')
    .all(req.params.id);
  res.json(history);
});

module.exports = router;
