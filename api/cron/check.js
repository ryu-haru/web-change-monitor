const kv = require('../store');
const chromium = require('@sparticuz/chromium');
const { chromium: playwright } = require('playwright-core');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { diffWords } = require('diff');

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
    body: JSON.stringify({
      text: `🔔 *${name}* に変更が検出されました`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `🔔 *${name}* に変更が検出されました\n<${url}|ページを確認する>` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*変更内容:*\n\`\`\`${diff.slice(0, 300)}\`\`\`` } },
      ]
    })
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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ids = await kv.smembers('urls:all') || [];
  let checked = 0, changed = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  // Fetch all URL records in parallel instead of sequentially
  const records = await Promise.all(ids.map(id => kv.get(`url:${id}`)));
  const due = records
    .map((record, i) => ({ record, id: ids[i] }))
    .filter(({ record }) => {
      if (!record || !record.is_active) return false;
      const intervalSec = (record.interval_minutes || 60) * 60;
      return nowSec - (record.last_checked_at || 0) >= intervalSec;
    });

  for (const { id, record } of due) {
    try {
      const content = await fetchContent(record.url, record.selector);
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      if (record.last_hash && hash !== record.last_hash) {
        changed++;
        const changes = diffWords(record.last_content || '', content);
        const added = changes.filter(c => c.added).map(c => c.value).join(' ');
        const removed = changes.filter(c => c.removed).map(c => c.value).join(' ');
        const parts = [];
        if (removed) parts.push(`削除: "${removed.slice(0, 150)}${removed.length > 150 ? '...' : ''}"`);
        if (added) parts.push(`追加: "${added.slice(0, 150)}${added.length > 150 ? '...' : ''}"`);
        const diff = parts.join('\n') || '変更を検出しました';

        // Parallelize history write and notifications
        await Promise.all([
          kv.lpush(`history:${id}`, JSON.stringify({ id: uuidv4(), detected_at: Math.floor(Date.now()/1000), diff_summary: diff }))
            .then(() => kv.ltrim(`history:${id}`, 0, 49)),
          record.notify_slack ? notifySlack(record.notify_slack, record.name, record.url, diff).catch(() => {}) : null,
          process.env.SLACK_DEFAULT_WEBHOOK ? notifySlack(process.env.SLACK_DEFAULT_WEBHOOK, record.name, record.url, diff).catch(() => {}) : null,
          record.notify_email ? notifyEmail(record.notify_email, record.name, record.url, diff).catch(() => {}) : null,
        ]);
      }

      await kv.set(`url:${id}`, { ...record, last_content: content.slice(0, 5000), last_hash: hash, last_checked_at: Math.floor(Date.now()/1000), error_count: 0, last_error: null });
      checked++;
    } catch (err) {
      console.error(`Error checking ${record.url}:`, err.message);
      const errorCount = (record.error_count || 0) + 1;
      await kv.set(`url:${id}`, { ...record, last_checked_at: Math.floor(Date.now()/1000), error_count: errorCount, last_error: err.message }).catch(() => {});
    }
  }

  res.json({ checked, changed, ts: new Date().toISOString() });
};
