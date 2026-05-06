const kv = require('../store');
const chromium = require('@sparticuz/chromium');
const { chromium: playwright } = require('playwright-core');
const crypto = require('crypto');
const { diffWords } = require('diff');

async function getApiKey(req) {
  const key = req.headers['x-api-key'];
  if (!key) return null;
  return await kv.get(`apikey:key:${key}`);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = await getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'API keyが必要です' });

  // Rate limit: check if user triggered a manual check in last 30 minutes
  const rateKey = `check-now-rate:${apiKey.key}`;
  const lastManual = await kv.get(rateKey);
  const nowSec = Math.floor(Date.now() / 1000);
  if (lastManual && nowSec - lastManual < 1800) {
    const waitMin = Math.ceil((1800 - (nowSec - lastManual)) / 60);
    return res.status(429).json({ error: `次のチェックまで${waitMin}分お待ちください。` });
  }

  const { id } = req.body || {};

  let ids;
  if (id) {
    ids = [id];
  } else {
    ids = await kv.smembers(`urls:${apiKey.key}`) || [];
  }

  if (!ids.length) return res.json({ checked: 0, changed: 0 });

  // Set rate limit
  await kv.set(rateKey, nowSec);

  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  let checked = 0, changed = 0;

  try {
    for (const urlId of ids) {
      const record = await kv.get(`url:${urlId}`);
      if (!record || record.api_key !== apiKey.key || !record.is_active) continue;

      try {
        const page = await browser.newPage();
        await page.goto(record.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const text = record.selector
          ? await page.locator(record.selector).first().textContent({ timeout: 4000 }).catch(() => '')
          : await page.evaluate(() => document.body.innerText);
        await page.close();

        const content = (text || '').trim();
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        if (record.last_hash && hash !== record.last_hash) {
          changed++;
          const changes = diffWords(record.last_content || '', content);
          const added = changes.filter(c => c.added).map(c => c.value).join(' ');
          const removed = changes.filter(c => c.removed).map(c => c.value).join(' ');
          const parts = [];
          if (removed) parts.push(`削除: "${removed.slice(0, 150)}"`);
          if (added) parts.push(`追加: "${added.slice(0, 150)}"`);
          const diff = parts.join('\n') || '変更を検出しました';
          await kv.lpush(`history:${urlId}`, JSON.stringify({
            id: require('uuid').v4(),
            detected_at: nowSec,
            diff_summary: diff
          }));
          await kv.ltrim(`history:${urlId}`, 0, 49);
        }

        await kv.set(`url:${urlId}`, {
          ...record,
          last_content: content.slice(0, 5000),
          last_hash: hash,
          last_checked_at: nowSec,
          error_count: 0,
          last_error: null
        });
        checked++;
      } catch (err) {
        await kv.set(`url:${urlId}`, {
          ...record,
          last_checked_at: nowSec,
          error_count: (record.error_count || 0) + 1,
          last_error: err.message
        }).catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  res.json({ checked, changed });
};
