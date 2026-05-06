const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { checkUrl } = require('./monitor');
const { sendNotifications } = require('./notifier');

const jobs = new Map();

async function runCheck(urlRecord) {
  console.log(`[scheduler] Checking: ${urlRecord.name} (${urlRecord.url})`);
  const result = await checkUrl(urlRecord);

  db.prepare(`
    UPDATE monitored_urls SET last_content = ?, last_hash = ?, last_checked_at = unixepoch()
    WHERE id = ?
  `).run(result.content, result.hash, urlRecord.id);

  if (result.changed) {
    console.log(`[scheduler] Change detected: ${urlRecord.name}`);
    db.prepare(`
      INSERT INTO change_history (id, url_id, diff_summary) VALUES (?, ?, ?)
    `).run(uuidv4(), urlRecord.id, result.diff);

    await sendNotifications(urlRecord, result.diff);
  }
}

function scheduleUrl(urlRecord) {
  if (jobs.has(urlRecord.id)) {
    jobs.get(urlRecord.id).destroy();
  }

  const minutes = Math.max(5, urlRecord.interval_minutes);
  const cronExpr = `*/${minutes} * * * *`;

  const job = cron.schedule(cronExpr, () => runCheck(urlRecord), { scheduled: true });
  jobs.set(urlRecord.id, job);
  console.log(`[scheduler] Scheduled "${urlRecord.name}" every ${minutes} min`);
}

function unscheduleUrl(urlId) {
  if (jobs.has(urlId)) {
    jobs.get(urlId).destroy();
    jobs.delete(urlId);
  }
}

function initScheduler() {
  const urls = db.prepare('SELECT * FROM monitored_urls WHERE is_active = 1').all();
  urls.forEach(scheduleUrl);
  console.log(`[scheduler] Initialized ${urls.length} monitors`);
}

module.exports = { scheduleUrl, unscheduleUrl, initScheduler, runCheck };
