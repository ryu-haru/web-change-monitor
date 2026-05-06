const kv = require('../store');
const { v4: uuidv4 } = require('uuid');

async function getApiKey(req) {
  const key = req.headers['x-api-key'];
  if (!key) return null;
  return await kv.get(`apikey:key:${key}`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = await getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'API keyが必要です' });

  if (req.method === 'GET') {
    const ids = await kv.smembers(`urls:${apiKey.key}`) || [];
    const urls = await Promise.all(ids.map(id => kv.get(`url:${id}`)));
    return res.json(urls.filter(Boolean));
  }

  if (req.method === 'POST') {
    const { name, url, interval_minutes = 60, selector, notify_slack, notify_email } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: 'name と url は必須です' });
    const id = uuidv4();
    const record = { id, api_key: apiKey.key, name, url, interval_minutes, selector: selector || null,
      notify_slack: notify_slack || null, notify_email: notify_email || null,
      last_hash: null, last_content: null, last_checked_at: null, is_active: 1,
      created_at: Math.floor(Date.now() / 1000) };
    await kv.set(`url:${id}`, record);
    await kv.sadd(`urls:${apiKey.key}`, id);
    await kv.sadd('urls:all', id);
    return res.status(201).json(record);
  }

  res.status(405).json({ error: 'Method not allowed' });
};
