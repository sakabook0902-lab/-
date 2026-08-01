const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  reason TEXT,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_name TEXT NOT NULL,
  party_name_kana TEXT,
  representative TEXT,
  address TEXT,
  corporate_number TEXT,
  requested_by TEXT NOT NULL,
  blacklist_hit INTEGER NOT NULL DEFAULT 0,
  blacklist_hit_detail TEXT,
  external_source TEXT,
  external_result TEXT,
  external_note TEXT,
  external_checked_by TEXT,
  external_checked_at TEXT,
  capital INTEGER,
  employee_count INTEGER,
  business_category TEXT,
  established_date TEXT,
  registry_source TEXT,
  registry_looked_up_at TEXT,
  annual_revenue TEXT,
  contact_phone TEXT,
  admin_sanction_status TEXT,
  admin_sanction_note TEXT,
  admin_sanction_checked_by TEXT,
  admin_sanction_checked_at TEXT,
  status TEXT NOT NULL DEFAULT '一次スクリーニング済み',
  decision TEXT,
  decided_by TEXT,
  decided_at TEXT,
  next_check_due TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (check_id) REFERENCES checks(id)
);
`);

module.exports = db;
