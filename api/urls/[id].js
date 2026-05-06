const kv = require('../store');

async function getApiKey(req) {
  const key = req.headers['x-api-key'];
  if (!key) return null;
  return await kv.get(`apikey:key:${key}`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = await getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'API keyが必要です' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const record = await kv.get(`url:${id}`);
  if (!record) return res.status(404).json({ error: 'Not found' });
  if (record.api_key !== apiKey.key) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    return res.json(record);
  }

  if (req.method === 'DELETE') {
    await kv.del(`url:${id}`);
    await kv.del(`history:${id}`);
    // Setからも削除（Upstash RESTでは直接削除）
    // smembersから削除するには再構築が必要なため、is_active=0で無効化
    await kv.set(`url:${id}`, { ...record, is_active: 0, deleted_at: Math.floor(Date.now()/1000) });
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
