const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.dirname(process.env.DATABASE_PATH || './data/monitor.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(process.env.DATABASE_PATH || './data/monitor.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    email TEXT,
    plan TEXT DEFAULT 'free',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS monitored_urls (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    interval_minutes INTEGER DEFAULT 60,
    selector TEXT,
    last_content TEXT,
    last_hash TEXT,
    last_checked_at INTEGER,
    is_active INTEGER DEFAULT 1,
    notify_slack TEXT,
    notify_email TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (api_key) REFERENCES api_keys(key)
  );

  CREATE TABLE IF NOT EXISTS change_history (
    id TEXT PRIMARY KEY,
    url_id TEXT NOT NULL,
    detected_at INTEGER DEFAULT (unixepoch()),
    diff_summary TEXT,
    FOREIGN KEY (url_id) REFERENCES monitored_urls(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_monitored_urls_api_key ON monitored_urls(api_key);
  CREATE INDEX IF NOT EXISTS idx_monitored_urls_is_active ON monitored_urls(is_active);
  CREATE INDEX IF NOT EXISTS idx_change_history_url_id ON change_history(url_id);
`);

module.exports = db;
