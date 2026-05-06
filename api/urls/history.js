const kv = require('../store');

async function getApiKey(req) {
  const key = req.headers['x-api-key'];
  if (!key) return null;
  return await kv.get(`apikey:key:${key}`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = await getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'API keyが必要です' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const record = await kv.get(`url:${id}`);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (record.api_key !== apiKey.key) return res.status(403).json({ error: 'Forbidden' });

  const limit = Math.min(parseInt(req.query.limit || '20'), 50);
  const raw = await kv.lrange(`history:${id}`, 0, limit - 1);
  const history = raw.map(item => {
    try { return typeof item === 'string' ? JSON.parse(item) : item; }
    catch { return item; }
  });

  res.json({ url_id: id, count: history.length, history });
};
