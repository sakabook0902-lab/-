const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'roumu.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_kana TEXT,
  birth_date TEXT,
  gender TEXT,
  address TEXT,
  job TEXT,
  location TEXT,
  employment_type TEXT NOT NULL DEFAULT '正社員',
  hire_date TEXT NOT NULL,
  leave_date TEXT,
  leave_reason TEXT,
  pin TEXT NOT NULL,
  base_salary INTEGER NOT NULL DEFAULT 0,
  position_allowance INTEGER NOT NULL DEFAULT 0,
  commute_allowance INTEGER NOT NULL DEFAULT 0,
  fixed_ot_pay INTEGER NOT NULL DEFAULT 0,
  fixed_ot_hours REAL NOT NULL DEFAULT 0,
  social_insurance INTEGER NOT NULL DEFAULT 1,
  employment_insurance INTEGER NOT NULL DEFAULT 1,
  health_std INTEGER,
  pension_std INTEGER,
  tax_column TEXT NOT NULL DEFAULT '甲',
  dependents INTEGER NOT NULL DEFAULT 0,
  resident_tax_june INTEGER NOT NULL DEFAULT 0,
  resident_tax_monthly INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  break_start TEXT,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  work_place TEXT,
  note TEXT,
  edited INTEGER NOT NULL DEFAULT 0,
  UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS paid_leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_date TEXT NOT NULL,
  days REAL NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  ym TEXT NOT NULL,
  pay_ym TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '下書き',
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  gross INTEGER NOT NULL DEFAULT 0,
  net INTEGER NOT NULL DEFAULT 0,
  remuneration INTEGER NOT NULL DEFAULT 0,
  base_days INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (employee_id, ym)
);

CREATE TABLE IF NOT EXISTS salary_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  effective_ym TEXT NOT NULL,
  detail TEXT,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  basis TEXT,
  status TEXT NOT NULL DEFAULT '未対応',
  note TEXT,
  source_key TEXT UNIQUE,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`);

module.exports = db;
