const kv = require('../store');
const chromium = require('@sparticuz/chromium');
const { chromium: playwright } = require('playwright-core');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

async function fetchContent(url, selector) {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    const text = selector
      ? await page.locator(selector).first().textContent({ timeout: 8000 })
      : await page.evaluate(() => document.body.innerText);
    return text?.trim() || '';
  } finally {
    await browser.close();
  }
}

async function notifySlack(webhook, name, url, diff) {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `🔔 *${name}* に変更が検出されました\n<${url}|確認する>\n\`\`\`${diff.slice(0, 300)}\`\`\`` })
  });
}

async function notifyEmail(to, name, url, diff) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'Web Change Monitor <noreply@web-change-monitor.com>',
      to: [to],
      subject: `🔔 変更検出: ${name}`,
      html: `
        <h2>Webページに変更が検出されました</h2>
        <p><strong>監視ページ:</strong> ${name}</p>
        <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
        <p><strong>検出日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
        <hr>
        <p>${diff}</p>
        <hr>
        <p style="color:#666;font-size:12px">
          <a href="https://web-change-monitor-one.vercel.app">Web Change Monitor</a> より送信
        </p>
      `,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ids = await kv.smembers('urls:all') || [];
  let checked = 0, changed = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const id of ids) {
    const record = await kv.get(`url:${id}`);
    if (!record || !record.is_active) continue;

    const intervalSec = (record.interval_minutes || 60) * 60;
    const lastChecked = record.last_checked_at || 0;
    if (nowSec - lastChecked < intervalSec) continue;

    try {
      const content = await fetchContent(record.url, record.selector);
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      if (record.last_hash && hash !== record.last_hash) {
        changed++;
        const diff = `前回から変更あり (${new Date().toLocaleString('ja-JP')})`;
        await kv.lpush(`history:${id}`, JSON.stringify({ id: uuidv4(), detected_at: Math.floor(Date.now()/1000), diff_summary: diff }));
        await kv.ltrim(`history:${id}`, 0, 49);

        if (record.notify_slack) await notifySlack(record.notify_slack, record.name, record.url, diff).catch(() => {});
        if (process.env.SLACK_DEFAULT_WEBHOOK) await notifySlack(process.env.SLACK_DEFAULT_WEBHOOK, record.name, record.url, diff).catch(() => {});
        if (record.notify_email) await notifyEmail(record.notify_email, record.name, record.url, diff).catch(() => {});
      }

      await kv.set(`url:${id}`, { ...record, last_content: content.slice(0, 5000), last_hash: hash, last_checked_at: Math.floor(Date.now()/1000) });
      checked++;
    } catch (err) {
      console.error(`Error checking ${record.url}:`, err.message);
    }
  }

  res.json({ checked, changed, ts: new Date().toISOString() });
};
