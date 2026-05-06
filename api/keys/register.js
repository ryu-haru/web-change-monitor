const kv = require('../store');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email は必須です' });

  const existing = await kv.get(`apikey:email:${email}`);
  if (existing) return res.status(409).json({ error: '登録済みです', api_key: existing });

  const key = 'wcm_' + crypto.randomBytes(24).toString('hex');
  await kv.set(`apikey:key:${key}`, { id: uuidv4(), email, plan: 'free', key });
  await kv.set(`apikey:email:${email}`, key);
  await kv.sadd('apikeys:all', key);

  res.status(201).json({ api_key: key, email, plan: 'free' });
};
