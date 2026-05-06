const { chromium } = require('playwright');
const { diffWords } = require('diff');
const crypto = require('crypto');

async function fetchPageContent(url, selector = null) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    let content;
    if (selector) {
      const el = page.locator(selector).first();
      content = await el.textContent({ timeout: 10000 });
    } else {
      content = await page.evaluate(() => document.body.innerText);
    }
    return content?.trim() || '';
  } finally {
    await browser.close();
  }
}

function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function buildDiffSummary(oldText, newText) {
  const changes = diffWords(oldText || '', newText || '');
  const added = changes.filter(c => c.added).map(c => c.value).join(' ');
  const removed = changes.filter(c => c.removed).map(c => c.value).join(' ');

  const summary = [];
  if (removed) summary.push(`削除: "${removed.slice(0, 100)}${removed.length > 100 ? '...' : ''}"`);
  if (added) summary.push(`追加: "${added.slice(0, 100)}${added.length > 100 ? '...' : ''}"`);
  return summary.join('\n') || '変更を検出しました';
}

async function checkUrl(urlRecord) {
  try {
    const newContent = await fetchPageContent(urlRecord.url, urlRecord.selector);
    const newHash = hashContent(newContent);

    if (!urlRecord.last_hash) {
      return { changed: false, content: newContent, hash: newHash };
    }

    if (newHash !== urlRecord.last_hash) {
      const diff = buildDiffSummary(urlRecord.last_content, newContent);
      return { changed: true, content: newContent, hash: newHash, diff };
    }

    return { changed: false, content: newContent, hash: newHash };
  } catch (err) {
    console.error(`[monitor] Error checking ${urlRecord.url}:`, err.message);
    return { changed: false, error: err.message };
  }
}

module.exports = { checkUrl };
