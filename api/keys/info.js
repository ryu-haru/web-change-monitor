const kv = require('../store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API keyが必要です' });

  const record = await kv.get(`apikey:key:${key}`);
  if (!record) return res.status(401).json({ error: 'Invalid API key' });

  const urlIds = await kv.smembers(`urls:${key}`) || [];

  res.json({
    email: record.email,
    plan: record.plan || 'free',
    url_count: urlIds.length,
    url_limit: record.plan === 'pro' ? null : 3,
    upgraded_at: record.upgraded_at || null,
  });
};
