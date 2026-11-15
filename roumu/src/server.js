process.env.TZ = process.env.TZ || 'Asia/Tokyo';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { DEFS, getSettings, saveSettings } = require('./settings');
const D = require('./lib/dates');
const { summarizeMonth, check36, fmtHours } = require('./lib/attendance');
const { leaveStatus } = require('./lib/leave');
const payroll = require('./lib/payroll');
const proc = require('./lib/procedures');
const { lookupHealth, lookupPension } = require('./lib/standardRemuneration');

const app = express();
const PORT = process.env.PORT || 3100;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// クラウド上（Render等）では本番扱い：管理者パスワード未設定のまま管理画面を開けないようにする
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1); // Render等のロードバランサ経由で正しい接続元IPを取得
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  if (IS_PRODUCTION) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 死活監視用（認証なし・情報を返さない）
app.get('/healthz', (req, res) => res.send('ok'));

// ---------- 総当たり対策：一定回数失敗すると一時的にロック ----------
const failures = new Map(); // key → { count, until }
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
function isLocked(key) {
  const f = failures.get(key);
  if (f && f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
  if (f && f.until) failures.delete(key);
  return 0;
}
function recordFail(key, max = MAX_FAILS) {
  const f = failures.get(key) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= max) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  failures.set(key, f);
}
function clearFail(key) { failures.delete(key); }

// ---------- 認証：打刻画面以外は管理者のみ ----------
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
app.use((req, res, next) => {
  res.locals.devMode = !ADMIN_PASSWORD;
  res.locals.fmtHours = fmtHours;
  res.locals.yen = (v) => (Number(v) || 0).toLocaleString('ja-JP');
  res.locals.path = req.path;
  if (req.path.startsWith('/punch')) return next();
  res.set('Cache-Control', 'no-store'); // 給与情報をブラウザ・中継サーバーに残さない
  if (!ADMIN_PASSWORD) {
    if (IS_PRODUCTION) return res.status(503).send('管理者パスワード（ADMIN_PASSWORD）が設定されていません。ホスティングサービスの環境変数で設定してください。');
    req.actor = '管理者（開発モード）';
    return next();
  }
  const ipKey = `admin:${req.ip}`;
  const locked = isLocked(ipKey);
  if (locked) return res.status(429).send(`ログインに続けて失敗したため、約${locked}分間ロックしています`);
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
    if (safeEqual(u, ADMIN_USER) && safeEqual(rest.join(':'), ADMIN_PASSWORD)) { clearFail(ipKey); req.actor = u; return next(); }
    recordFail(ipKey);
  }
  res.set('WWW-Authenticate', 'Basic realm="roumu", charset="UTF-8"').status(401).send('認証が必要です');
});

// ---------- 共通処理 ----------
const today = () => D.nowJst().date;
const currentYm = () => today().slice(0, 7);

function audit(actor, action, target, detail) {
  db.prepare('INSERT INTO audit_logs (actor, action, target, detail) VALUES (?, ?, ?, ?)').run(actor, action, target || null, detail || null);
}

function upsertTasks(list, employeeId = null) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO tasks (employee_id, category, title, due_date, basis, source_key) VALUES (?, ?, ?, ?, ?, ?)`);
  let n = 0;
  for (const t of list) n += stmt.run(t.employee_id ?? employeeId, t.category, t.title, t.due || null, t.basis || null, t.source_key).changes;
  return n;
}

function getEmployee(id) {
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

// 対象月に在籍している従業員
function activeEmployees(ym) {
  const start = `${ym}-01`;
  const end = `${ym}-${D.daysInMonth(ym)}`;
  return db.prepare(`SELECT * FROM employees WHERE hire_date <= ? AND (leave_date IS NULL OR leave_date = '' OR leave_date >= ?) ORDER BY code`).all(end, start);
}

function monthAttendance(empId, ym, s) {
  const from = D.addDays(`${ym}-01`, -6);
  const to = `${ym}-${D.daysInMonth(ym)}`;
  const recs = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date').all(empId, from, to);
  return summarizeMonth(recs, ym, s);
}

function alerts36(empId, ym, s) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const m = D.ymAdd(ym, -i);
    const { summary } = monthAttendance(empId, m, s);
    months.push({ ym: m, overtime: summary.overtime, holiday: summary.holiday });
  }
  return check36(months, s);
}

function leaveOf(emp, date = today()) {
  const usages = db.prepare('SELECT * FROM paid_leaves WHERE employee_id = ? ORDER BY leave_date').all(emp.id);
  return { ...leaveStatus(emp.hire_date, usages, date), usages };
}

function payYmOf(ym, s) {
  return D.ymAdd(ym, Number(s.pay_month_offset || 0));
}

function computePayroll(emp, ym, input, s) {
  const { summary } = monthAttendance(emp.id, ym, s);
  return { result: payroll.calculate({ emp, s, att: summary, input, ym, payYm: payYmOf(ym, s) }), summary };
}

function savePayroll(emp, ym, input, s) {
  const { result, summary } = computePayroll(emp, ym, input, s);
  result.attendance = summary;
  db.prepare(`INSERT INTO payrolls (employee_id, ym, pay_ym, input_json, result_json, gross, net, remuneration, base_days, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(employee_id, ym) DO UPDATE SET pay_ym=excluded.pay_ym, input_json=excluded.input_json, result_json=excluded.result_json,
      gross=excluded.gross, net=excluded.net, remuneration=excluded.remuneration, base_days=excluded.base_days, updated_at=excluded.updated_at
    WHERE status = '下書き'`).run(emp.id, ym, result.payYm, JSON.stringify(input), JSON.stringify(result), result.gross, result.net, result.remuneration, result.baseDays);
}

// 確定済み給与から月額変更届（随時改定）の要否を判定し、必要ならタスク化
function runGetsuhenCheck(emp) {
  const changes = db.prepare('SELECT * FROM salary_changes WHERE employee_id = ? AND checked = 0').all(emp.id);
  const pays = db.prepare(`SELECT pay_ym, remuneration, base_days FROM payrolls WHERE employee_id = ? AND status = '確定'`).all(emp.id);
  const out = [];
  for (const c of changes) {
    const r = proc.checkGetsuhen(c, pays, emp.health_std || lookupHealth(emp.base_salary).standard);
    if (r.status === 'waiting') continue;
    db.prepare('UPDATE salary_changes SET checked = 1 WHERE id = ?').run(c.id);
    if (r.status === 'required') {
      upsertTasks([{
        category: '随時改定', employee_id: emp.id,
        title: `${emp.name}：健康保険・厚生年金保険 月額変更届（${r.curGrade}等級→${r.newGrade}等級、標準報酬 ${r.newStd.toLocaleString()}円）`,
        due: `${r.revisionYm}-10`,
        basis: `${r.months.join('・')}支給の報酬平均 ${r.avg.toLocaleString()}円。${r.revisionYm}分から改定。速やかに提出`,
        source_key: `getsuhen:${c.id}`,
      }]);
    }
    out.push({ change: c, result: r });
  }
  return out;
}

function ensureAnnualTasks() {
  const s = getSettings();
  const y = Number(today().slice(0, 4));
  const list = [...proc.annualTasks(y, s), ...proc.annualTasks(y + 1, s)].filter((t) => t.due >= today());
  upsertTasks(list);
}

// ---------- ダッシュボード ----------
app.get('/', (req, res) => {
  ensureAnnualTasks();
  const s = getSettings();
  const t = today();
  const ym = currentYm();
  const emps = activeEmployees(ym).filter((e) => !e.leave_date || e.leave_date >= t);
  const soon = D.addDays(t, 14);
  const tasks = db.prepare(`SELECT t.*, e.name AS employee_name FROM tasks t LEFT JOIN employees e ON e.id = t.employee_id
    WHERE t.status = '未対応' AND t.due_date <= ? ORDER BY t.due_date`).all(soon);
  const punchedToday = db.prepare('SELECT employee_id, clock_in, clock_out FROM attendance WHERE work_date = ?').all(t);
  const punchMap = Object.fromEntries(punchedToday.map((p) => [p.employee_id, p]));
  const missingOut = db.prepare(`SELECT a.*, e.name FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.work_date < ? AND a.work_date >= ? AND a.clock_in IS NOT NULL AND a.clock_out IS NULL ORDER BY a.work_date`).all(t, D.addDays(t, -31));
  const leaveAlerts = [];
  const otAlerts = [];
  for (const e of emps) {
    const l = leaveOf(e);
    if (l.obligation && l.obligation.level !== 'ok') leaveAlerts.push({ emp: e, ob: l.obligation });
    for (const a of alerts36(e.id, ym, s)) otAlerts.push({ emp: e, ...a });
  }
  const drafts = db.prepare(`SELECT COUNT(*) AS n FROM payrolls WHERE status = '下書き'`).get().n;
  res.render('dashboard', { title: 'ダッシュボード', t, emps, tasks, punchMap, missingOut, leaveAlerts, otAlerts, drafts, s });
});

// ---------- 打刻（従業員用） ----------
app.get('/punch', (req, res) => {
  res.render('punch', { title: '打刻', message: req.query.msg || null, error: req.query.err || null, now: D.nowJst() });
});

app.post('/punch', (req, res) => {
  const { code, pin, action, work_place } = req.body;
  const back = (key, msg) => res.redirect(`/punch?${key}=${encodeURIComponent(msg)}`);
  const codeKey = `punch:${(code || '').trim()}`;
  const ipKey = `punchip:${req.ip}`;
  const locked = isLocked(codeKey) || isLocked(ipKey);
  if (locked) return back('err', `PINの入力に続けて失敗したため、約${locked}分間打刻できません。管理者に連絡してください`);
  const emp = db.prepare('SELECT * FROM employees WHERE code = ?').get((code || '').trim());
  if (!emp || !safeEqual(emp.pin, (pin || '').trim())) {
    recordFail(codeKey);
    recordFail(ipKey, 20); // 同じオフィス（同一IP）の全員を巻き込まないよう、IP単位は緩めに
    return back('err', '社員番号またはPINが正しくありません');
  }
  clearFail(codeKey);
  clearFail(ipKey);
  const { date, time } = D.nowJst();
  if (emp.leave_date && emp.leave_date < date) return back('err', '退職済みのため打刻できません');
  if (emp.hire_date > date) return back('err', `入社日（${emp.hire_date}）より前は打刻できません`);
  let row = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(emp.id, date);
  const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

  if (action === 'in') {
    if (row && row.clock_in) return back('err', `${emp.name}さんは本日 ${row.clock_in} に出勤打刻済みです`);
    db.prepare(`INSERT INTO attendance (employee_id, work_date, clock_in, work_place) VALUES (?, ?, ?, ?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET clock_in = excluded.clock_in, work_place = excluded.work_place`).run(emp.id, date, time, work_place || emp.location || null);
    return back('msg', `${emp.name}さん 出勤 ${time}（${work_place || emp.location || ''}）`);
  }
  // 日跨ぎ勤務：本日の出勤がなく、前日が退勤未打刻なら前日分として扱う
  if (!row || !row.clock_in) {
    const prev = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ? AND clock_in IS NOT NULL AND clock_out IS NULL').get(emp.id, D.addDays(date, -1));
    if (prev) row = prev; else return back('err', '本日の出勤打刻がありません');
  }
  if (row.clock_out) return back('err', `本日は ${row.clock_out} に退勤打刻済みです`);
  const sinceBreak = (bs) => { let m = toMin(time) - toMin(bs); if (m < 0) m += 1440; return m; };
  if (action === 'break_start') {
    if (row.break_start) return back('err', `${row.break_start} から休憩中です`);
    db.prepare('UPDATE attendance SET break_start = ? WHERE id = ?').run(time, row.id);
    return back('msg', `${emp.name}さん 休憩開始 ${time}`);
  }
  if (action === 'break_end') {
    if (!row.break_start) return back('err', '休憩開始の打刻がありません');
    db.prepare('UPDATE attendance SET break_minutes = break_minutes + ?, break_start = NULL WHERE id = ?').run(sinceBreak(row.break_start), row.id);
    return back('msg', `${emp.name}さん 休憩終了 ${time}`);
  }
  if (action === 'out') {
    const extra = row.break_start ? sinceBreak(row.break_start) : 0;
    db.prepare('UPDATE attendance SET clock_out = ?, break_minutes = break_minutes + ?, break_start = NULL WHERE id = ?').run(time, extra, row.id);
    return back('msg', `${emp.name}さん 退勤 ${time} お疲れさまでした`);
  }
  return back('err', '不明な操作です');
});

// ---------- 従業員 ----------
const EMP_FIELDS = ['code', 'name', 'name_kana', 'birth_date', 'gender', 'address', 'job', 'location', 'employment_type', 'hire_date', 'pin',
  'base_salary', 'position_allowance', 'commute_allowance', 'fixed_ot_pay', 'fixed_ot_hours', 'health_std', 'pension_std',
  'tax_column', 'dependents', 'resident_tax_june', 'resident_tax_monthly'];
const NUM_FIELDS = ['base_salary', 'position_allowance', 'commute_allowance', 'fixed_ot_pay', 'fixed_ot_hours', 'dependents', 'resident_tax_june', 'resident_tax_monthly'];
const FIXED_WAGE = { base_salary: '基本給', position_allowance: '役職手当', commute_allowance: '通勤手当', fixed_ot_pay: '固定残業代' };

function readEmpForm(body) {
  const v = {};
  for (const f of EMP_FIELDS) v[f] = (body[f] ?? '').toString().trim();
  for (const f of NUM_FIELDS) v[f] = Number(v[f] || 0);
  v.health_std = v.health_std ? Number(v.health_std) : null;
  v.pension_std = v.pension_std ? Number(v.pension_std) : null;
  v.employment_type = v.employment_type || '正社員';
  v.tax_column = v.tax_column === '乙' ? '乙' : '甲';
  v.social_insurance = body.social_insurance ? 1 : 0;
  v.employment_insurance = body.employment_insurance ? 1 : 0;
  const errors = [];
  if (!v.code) errors.push('社員番号は必須です');
  if (!v.name) errors.push('氏名は必須です');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.hire_date)) errors.push('入社日を入力してください');
  if (!/^\d{4,8}$/.test(v.pin)) errors.push('打刻用PINは4〜8桁の数字で設定してください');
  return { v, errors };
}

app.get('/employees', (req, res) => {
  const emps = db.prepare('SELECT * FROM employees ORDER BY (leave_date IS NOT NULL AND leave_date != \'\' AND leave_date < ?), code').all(today());
  res.render('employees', { title: '従業員', emps, t: today() });
});

app.get('/employees/new', (req, res) => {
  res.render('employee_form', { title: '従業員登録', emp: { employment_type: '正社員', tax_column: '甲', social_insurance: 1, employment_insurance: 1 }, errors: [], isNew: true, nextPayYm: payYmOf(currentYm(), getSettings()) });
});

app.post('/employees', (req, res) => {
  const { v, errors } = readEmpForm(req.body);
  if (db.prepare('SELECT 1 FROM employees WHERE code = ?').get(v.code)) errors.push('この社員番号は既に使われています');
  if (errors.length) return res.render('employee_form', { title: '従業員登録', emp: v, errors, isNew: true, nextPayYm: '' });
  if (!v.health_std) {
    const est = v.base_salary + v.position_allowance + v.commute_allowance + v.fixed_ot_pay;
    v.health_std = lookupHealth(est).standard;
    v.pension_std = lookupPension(est).standard;
  }
  const cols = [...EMP_FIELDS, 'social_insurance', 'employment_insurance'];
  const info = db.prepare(`INSERT INTO employees (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => v[c] === '' ? null : v[c]));
  const emp = getEmployee(info.lastInsertRowid);
  const n = upsertTasks(proc.hireTasks(emp), emp.id);
  audit(req.actor, '従業員登録', `employee:${emp.id}`, `${emp.name} / 入社手続きタスク${n}件を自動作成`);
  res.redirect(`/employees/${emp.id}`);
});

app.get('/employees/:id', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).send('従業員が見つかりません');
  const tasks = db.prepare('SELECT * FROM tasks WHERE employee_id = ? ORDER BY status DESC, due_date').all(emp.id);
  const pays = db.prepare('SELECT * FROM payrolls WHERE employee_id = ? ORDER BY ym DESC LIMIT 12').all(emp.id);
  const changes = db.prepare('SELECT * FROM salary_changes WHERE employee_id = ? ORDER BY effective_ym DESC').all(emp.id);
  res.render('employee_detail', { title: emp.name, emp, leave: leaveOf(emp), tasks, pays, changes, t: today(), care: payroll.isCareTarget(emp.birth_date, currentYm()) });
});

app.get('/employees/:id/edit', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).send('従業員が見つかりません');
  res.render('employee_form', { title: `${emp.name} 編集`, emp, errors: [], isNew: false, nextPayYm: payYmOf(currentYm(), getSettings()) });
});

app.post('/employees/:id', (req, res) => {
  const before = getEmployee(req.params.id);
  if (!before) return res.status(404).send('従業員が見つかりません');
  const { v, errors } = readEmpForm(req.body);
  if (db.prepare('SELECT 1 FROM employees WHERE code = ? AND id != ?').get(v.code, before.id)) errors.push('この社員番号は既に使われています');
  const changed = Object.keys(FIXED_WAGE).filter((k) => Number(before[k]) !== Number(v[k]));
  const effYm = (req.body.change_effective_ym || '').trim();
  if (changed.length && !/^\d{4}-\d{2}$/.test(effYm)) errors.push('固定的賃金を変更する場合は「変更後の賃金を初めて支給する月」を入力してください（随時改定の判定に使います）');
  if (errors.length) return res.render('employee_form', { title: `${before.name} 編集`, emp: { ...v, id: before.id }, errors, isNew: false, nextPayYm: effYm });
  const cols = [...EMP_FIELDS, 'social_insurance', 'employment_insurance'];
  db.prepare(`UPDATE employees SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => v[c] === '' ? null : v[c]), before.id);
  if (changed.length) {
    const detail = changed.map((k) => `${FIXED_WAGE[k]} ${Number(before[k]).toLocaleString()}→${Number(v[k]).toLocaleString()}円`).join('、');
    db.prepare('INSERT INTO salary_changes (employee_id, effective_ym, detail) VALUES (?, ?, ?)').run(before.id, effYm, detail);
    audit(req.actor, '固定的賃金の変更', `employee:${before.id}`, `${detail}（${effYm}支給分から）`);
  }
  audit(req.actor, '従業員情報更新', `employee:${before.id}`, v.name);
  res.redirect(`/employees/${before.id}`);
});

app.post('/employees/:id/retire', (req, res) => {
  const emp = getEmployee(req.params.id);
  const leaveDate = (req.body.leave_date || '').trim();
  if (!emp || !/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) return res.redirect(`/employees/${req.params.id}`);
  db.prepare('UPDATE employees SET leave_date = ?, leave_reason = ? WHERE id = ?').run(leaveDate, req.body.leave_reason || null, emp.id);
  const n = upsertTasks(proc.leaveTasks({ ...emp, leave_date: leaveDate }));
  audit(req.actor, '退職登録', `employee:${emp.id}`, `${emp.name} 退職日 ${leaveDate} / 退職手続きタスク${n}件を自動作成`);
  res.redirect(`/employees/${emp.id}`);
});

app.post('/employees/:id/paid-leaves', (req, res) => {
  const emp = getEmployee(req.params.id);
  const date = (req.body.leave_date || '').trim();
  if (emp && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const days = req.body.days === '0.5' ? 0.5 : 1;
    db.prepare('INSERT INTO paid_leaves (employee_id, leave_date, days, note) VALUES (?, ?, ?, ?)').run(emp.id, date, days, req.body.note || null);
    audit(req.actor, '有給取得登録', `employee:${emp.id}`, `${date} ${days}日`);
  }
  res.redirect(`/employees/${req.params.id}#leave`);
});

app.post('/paid-leaves/:id/delete', (req, res) => {
  const row = db.prepare('SELECT * FROM paid_leaves WHERE id = ?').get(req.params.id);
  if (row) {
    db.prepare('DELETE FROM paid_leaves WHERE id = ?').run(row.id);
    audit(req.actor, '有給取得削除', `employee:${row.employee_id}`, `${row.leave_date} ${row.days}日`);
  }
  res.redirect(row ? `/employees/${row.employee_id}#leave` : '/employees');
});

// ---------- 勤怠 ----------
app.get('/attendance', (req, res) => {
  const s = getSettings();
  const ym = /^\d{4}-\d{2}$/.test(req.query.ym || '') ? req.query.ym : currentYm();
  const rows = activeEmployees(ym).map((e) => {
    const { summary } = monthAttendance(e.id, ym, s);
    return { emp: e, summary, alerts: alerts36(e.id, ym, s) };
  });
  res.render('attendance_summary', { title: `勤怠一覧 ${ym}`, ym, rows, prev: D.ymAdd(ym, -1), next: D.ymAdd(ym, 1) });
});

app.get('/attendance/:empId', (req, res) => {
  const s = getSettings();
  const emp = getEmployee(req.params.empId);
  if (!emp) return res.status(404).send('従業員が見つかりません');
  const ym = /^\d{4}-\d{2}$/.test(req.query.ym || '') ? req.query.ym : currentYm();
  const { days, summary } = monthAttendance(emp.id, ym, s);
  const byDate = Object.fromEntries(days.map((d) => [d.work_date, d]));
  const leaves = db.prepare('SELECT * FROM paid_leaves WHERE employee_id = ? AND leave_date LIKE ?').all(emp.id, `${ym}%`);
  const leaveMap = Object.fromEntries(leaves.map((l) => [l.leave_date, l]));
  const dates = D.monthDates(ym).map((d) => ({ date: d, wd: D.weekday(d), rec: byDate[d], leave: leaveMap[d] }));
  res.render('attendance_employee', { title: `${emp.name} 勤怠 ${ym}`, emp, ym, dates, summary, alerts: alerts36(emp.id, ym, s), WEEKDAYS: D.WEEKDAYS, s, prev: D.ymAdd(ym, -1), next: D.ymAdd(ym, 1) });
});

app.post('/attendance/:empId/save', (req, res) => {
  const emp = getEmployee(req.params.empId);
  const { work_date, clock_in, clock_out, break_minutes, note } = req.body;
  if (!emp || !/^\d{4}-\d{2}-\d{2}$/.test(work_date || '')) return res.redirect('/attendance');
  const t = (x) => (/^\d{1,2}:\d{2}$/.test((x || '').trim()) ? x.trim().padStart(5, '0') : null);
  const before = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?').get(emp.id, work_date);
  if (!t(clock_in) && !t(clock_out)) {
    if (before) db.prepare('DELETE FROM attendance WHERE id = ?').run(before.id);
  } else {
    db.prepare(`INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, break_minutes, note, edited) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET clock_in=excluded.clock_in, clock_out=excluded.clock_out, break_minutes=excluded.break_minutes, note=excluded.note, break_start=NULL, edited=1`)
      .run(emp.id, work_date, t(clock_in), t(clock_out), Number(break_minutes || 0), note || null);
  }
  const fmtRec = (r) => (r ? `${r.clock_in || '-'}〜${r.clock_out || '-'} 休憩${r.break_minutes}分` : 'なし');
  audit(req.actor, '勤怠修正', `employee:${emp.id}`, `${work_date}：${fmtRec(before)} → ${t(clock_in) || '-'}〜${t(clock_out) || '-'} 休憩${Number(break_minutes || 0)}分 ${note ? '（' + note + '）' : ''}`);
  res.redirect(`/attendance/${emp.id}?ym=${work_date.slice(0, 7)}#d${work_date}`);
});

// ---------- 給与計算 ----------
app.get('/payroll', (req, res) => {
  const s = getSettings();
  const ym = /^\d{4}-\d{2}$/.test(req.query.ym || '') ? req.query.ym : D.ymAdd(currentYm(), -1);
  const emps = activeEmployees(ym);
  const rows = emps.map((e) => ({ emp: e, pay: db.prepare('SELECT * FROM payrolls WHERE employee_id = ? AND ym = ?').get(e.id, ym) }));
  const totals = rows.reduce((t, r) => (r.pay ? { gross: t.gross + r.pay.gross, net: t.net + r.pay.net } : t), { gross: 0, net: 0 });
  res.render('payroll_list', { title: `給与計算 ${ym}勤怠分`, ym, payYm: payYmOf(ym, s), rows, totals, s, prev: D.ymAdd(ym, -1), next: D.ymAdd(ym, 1), msg: req.query.msg });
});

app.post('/payroll/run', (req, res) => {
  const s = getSettings();
  const ym = req.body.ym;
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return res.redirect('/payroll');
  let n = 0;
  for (const e of activeEmployees(ym)) {
    const existing = db.prepare('SELECT * FROM payrolls WHERE employee_id = ? AND ym = ?').get(e.id, ym);
    if (existing && existing.status === '確定') continue;
    savePayroll(e, ym, existing ? JSON.parse(existing.input_json) : {}, s);
    n++;
  }
  audit(req.actor, '給与一括計算', `payroll:${ym}`, `${n}名`);
  res.redirect(`/payroll?ym=${ym}&msg=${encodeURIComponent(`${n}名分を勤怠データから計算しました（確定済みは対象外）`)}`);
});

app.post('/payroll/confirm-all', (req, res) => {
  const ym = req.body.ym;
  const drafts = db.prepare(`SELECT * FROM payrolls WHERE ym = ? AND status = '下書き'`).all(ym);
  let tasks = 0;
  for (const p of drafts) {
    db.prepare(`UPDATE payrolls SET status = '確定', confirmed_at = datetime('now','localtime') WHERE id = ?`).run(p.id);
    tasks += runGetsuhenCheck(getEmployee(p.employee_id)).filter((x) => x.result.status === 'required').length;
  }
  audit(req.actor, '給与一括確定', `payroll:${ym}`, `${drafts.length}名`);
  const msg = `${drafts.length}名分を確定しました${tasks ? `。月額変更届の対象者が${tasks}名います（タスクに登録済み）` : ''}`;
  res.redirect(`/payroll?ym=${ym}&msg=${encodeURIComponent(msg)}`);
});

function loadPay(id) {
  const p = db.prepare('SELECT * FROM payrolls WHERE id = ?').get(id);
  if (!p) return null;
  return { ...p, input: JSON.parse(p.input_json), result: JSON.parse(p.result_json), emp: getEmployee(p.employee_id) };
}

app.get('/payroll/:id', (req, res) => {
  const p = loadPay(req.params.id);
  if (!p) return res.status(404).send('給与データが見つかりません');
  res.render('payroll_detail', { title: `${p.emp.name} 給与 ${p.ym}勤怠分`, p, msg: req.query.msg });
});

app.post('/payroll/:id/inputs', (req, res) => {
  const p = loadPay(req.params.id);
  if (!p || p.status !== '下書き') return res.redirect(`/payroll/${req.params.id}`);
  const b = req.body;
  const input = {
    incentive: Number(b.incentive || 0), absenceDays: Number(b.absenceDays || 0),
    otherAllowance: Number(b.otherAllowance || 0), otherAllowanceLabel: b.otherAllowanceLabel || '',
    otherDeduction: Number(b.otherDeduction || 0), otherDeductionLabel: b.otherDeductionLabel || '',
    withholdingOverride: b.withholdingOverride === '' ? '' : Number(b.withholdingOverride), note: b.note || '',
  };
  savePayroll(p.emp, p.ym, input, getSettings());
  audit(req.actor, '給与入力更新', `payroll:${p.id}`, `${p.emp.name} ${p.ym} ${JSON.stringify(input)}`);
  res.redirect(`/payroll/${p.id}?msg=${encodeURIComponent('再計算しました')}`);
});

app.post('/payroll/:id/confirm', (req, res) => {
  const p = loadPay(req.params.id);
  if (!p) return res.redirect('/payroll');
  db.prepare(`UPDATE payrolls SET status = '確定', confirmed_at = datetime('now','localtime') WHERE id = ?`).run(p.id);
  const g = runGetsuhenCheck(p.emp).filter((x) => x.result.status === 'required');
  audit(req.actor, '給与確定', `payroll:${p.id}`, `${p.emp.name} ${p.ym} 差引支給額 ${p.net}`);
  res.redirect(`/payroll/${p.id}?msg=${encodeURIComponent('確定しました' + (g.length ? '。月額変更届の対象です（タスクに登録済み）' : ''))}`);
});

app.post('/payroll/:id/unconfirm', (req, res) => {
  const p = loadPay(req.params.id);
  if (!p) return res.redirect('/payroll');
  db.prepare(`UPDATE payrolls SET status = '下書き', confirmed_at = NULL WHERE id = ?`).run(p.id);
  audit(req.actor, '給与確定取消', `payroll:${p.id}`, `${p.emp.name} ${p.ym} 理由：${req.body.reason || '未記入'}`);
  res.redirect(`/payroll/${p.id}`);
});

app.get('/payroll/:id/slip', (req, res) => {
  const p = loadPay(req.params.id);
  if (!p) return res.status(404).send('給与データが見つかりません');
  res.render('payslip', { title: '給与明細', p, s: getSettings() });
});

// ---------- 労務タスク ----------
app.get('/tasks', (req, res) => {
  const status = ['未対応', '完了'].includes(req.query.status) ? req.query.status : '未対応';
  const tasks = db.prepare(`SELECT t.*, e.name AS employee_name FROM tasks t LEFT JOIN employees e ON e.id = t.employee_id
    WHERE t.status = ? ORDER BY ${status === '完了' ? 't.completed_at DESC' : 't.due_date'} LIMIT 300`).all(status);
  res.render('tasks', { title: '労務タスク', tasks, status, t: today(), year: Number(today().slice(0, 4)), emps: db.prepare('SELECT id, name FROM employees ORDER BY code').all() });
});

app.post('/tasks/:id/complete', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (task) {
    db.prepare(`UPDATE tasks SET status = '完了', completed_at = datetime('now','localtime'), completed_by = ?, note = COALESCE(?, note) WHERE id = ?`).run(req.actor, req.body.note || null, task.id);
    audit(req.actor, 'タスク完了', `task:${task.id}`, task.title);
  }
  res.redirect(req.body.back || '/tasks');
});

app.post('/tasks/:id/reopen', (req, res) => {
  db.prepare(`UPDATE tasks SET status = '未対応', completed_at = NULL, completed_by = NULL WHERE id = ?`).run(req.params.id);
  audit(req.actor, 'タスク差戻し', `task:${req.params.id}`, '');
  res.redirect('/tasks?status=完了');
});

app.post('/tasks/new', (req, res) => {
  const { title, due_date, employee_id, note } = req.body;
  if (title) {
    const info = db.prepare(`INSERT INTO tasks (employee_id, category, title, due_date, note) VALUES (?, 'その他', ?, ?, ?)`).run(employee_id || null, title, due_date || null, note || null);
    audit(req.actor, 'タスク追加', `task:${info.lastInsertRowid}`, title);
  }
  res.redirect('/tasks');
});

app.post('/tasks/annual', (req, res) => {
  const year = Number(req.body.year);
  const n = upsertTasks(proc.annualTasks(year, getSettings()));
  audit(req.actor, '年次タスク生成', `year:${year}`, `${n}件`);
  res.redirect('/tasks');
});

// ---------- 算定基礎（定時決定）シミュレーション ----------
app.get('/santei', (req, res) => {
  const year = Number(req.query.year) || Number(today().slice(0, 4));
  const rows = db.prepare('SELECT * FROM employees WHERE social_insurance = 1 ORDER BY code').all().map((e) => {
    const pays = db.prepare(`SELECT pay_ym, remuneration, base_days FROM payrolls WHERE employee_id = ? AND status = '確定'`).all(e.id);
    const r = proc.santei(pays, year);
    const curGrade = lookupHealth(e.health_std || 0).grade;
    return { emp: e, r, curGrade, pension: r.avg ? lookupPension(r.avg) : null };
  });
  res.render('santei', { title: `算定基礎 ${year}年`, year, rows });
});

// ---------- CSV出力（法定三帳簿） ----------
function sendCsv(res, filename, header, rows) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send('﻿' + body);
}

app.get('/export/roster.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY code').all().map((e) => [e.code, e.name, e.name_kana, e.birth_date, e.gender, e.address, e.job, e.employment_type, e.hire_date, e.leave_date, e.leave_reason]);
  audit(req.actor, 'CSV出力', 'roster', '労働者名簿');
  sendCsv(res, '労働者名簿.csv', ['社員番号', '氏名', 'フリガナ', '生年月日', '性別', '住所', '従事する業務', '雇用形態', '雇入年月日', '退職年月日', '退職事由'], rows);
});

app.get('/export/attendance.csv', (req, res) => {
  const s = getSettings();
  const ym = /^\d{4}-\d{2}$/.test(req.query.ym || '') ? req.query.ym : currentYm();
  const rows = [];
  for (const e of activeEmployees(ym)) {
    for (const d of monthAttendance(e.id, ym, s).days) {
      rows.push([e.code, e.name, d.work_date, d.clock_in, d.clock_out, d.break_minutes, fmtHours(d.worked), fmtHours(d.totalOvertime), fmtHours(d.night), fmtHours(d.holiday), d.edited ? '修正あり' : '', d.note]);
    }
  }
  audit(req.actor, 'CSV出力', 'attendance', `出勤簿 ${ym}`);
  sendCsv(res, `出勤簿_${ym}.csv`, ['社員番号', '氏名', '日付', '出勤', '退勤', '休憩(分)', '実働', '時間外', '深夜', '法定休日', '修正', '備考'], rows);
});

app.get('/export/wage-ledger.csv', (req, res) => {
  const year = Number(req.query.year) || Number(today().slice(0, 4));
  const pays = db.prepare(`SELECT p.*, e.code, e.name FROM payrolls p JOIN employees e ON e.id = p.employee_id WHERE p.pay_ym LIKE ? AND p.status = '確定' ORDER BY e.code, p.pay_ym`).all(`${year}-%`);
  const labels = new Set();
  const parsed = pays.map((p) => ({ p, r: JSON.parse(p.result_json) })).filter(({ r }) => r.lines);
  parsed.forEach(({ r }) => r.lines.earnings.forEach((l) => labels.add(l.label)));
  const earnLabels = [...labels];
  const dedLabels = ['健康保険料', '健康保険料（介護含む）', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料', '源泉所得税', '住民税', 'その他控除'];
  const rows = parsed.map(({ p, r }) => {
    const a = r.attendance || {};
    const e = Object.fromEntries(r.lines.earnings.map((l) => [l.label, l.amount]));
    const d = Object.fromEntries(r.lines.deductions.map((l) => [l.label, l.amount]));
    return [p.code, p.name, p.pay_ym, p.ym, a.workDays, fmtHours(a.worked || 0), fmtHours(a.overtime || 0), fmtHours(a.holiday || 0), fmtHours(a.night || 0),
      ...earnLabels.map((l) => e[l] || 0), r.gross, ...dedLabels.map((l) => d[l] || 0), r.deductionTotal, r.net];
  });
  audit(req.actor, 'CSV出力', 'wage-ledger', `賃金台帳 ${year}`);
  sendCsv(res, `賃金台帳_${year}.csv`, ['社員番号', '氏名', '支給月', '勤怠月', '労働日数', '労働時間', '時間外', '休日労働', '深夜', ...earnLabels, '総支給額', ...dedLabels, '控除合計', '差引支給額'], rows);
});

// ---------- 設定・ログ ----------
app.get('/settings', (req, res) => {
  res.render('settings', { title: '設定', DEFS, s: getSettings(), msg: req.query.msg });
});

app.post('/settings', (req, res) => {
  const before = getSettings();
  saveSettings(req.body);
  const after = getSettings();
  const diff = DEFS.filter((d) => before[d.key] !== after[d.key]).map((d) => `${d.label}: ${before[d.key]}→${after[d.key]}`).join(' / ');
  if (diff) audit(req.actor, '設定変更', 'settings', diff);
  res.redirect('/settings?msg=' + encodeURIComponent('保存しました'));
});

// ---------- バックアップ・復元（アカウント間のデータ移行にも使用） ----------
app.get('/settings/backup', async (req, res) => {
  const tmp = path.join(os.tmpdir(), `roumu-backup-${process.pid}-${Date.now()}.db`);
  try {
    await db.backupTo(tmp);
    const { date, time } = D.nowJst();
    audit(req.actor, 'バックアップ取得', 'database', '');
    res.download(tmp, `roumu-backup-${date}-${time.replace(':', '')}.db`, () => fs.unlink(tmp, () => {}));
  } catch (e) {
    fs.unlink(tmp, () => {});
    res.status(500).send('バックアップの作成に失敗しました：' + e.message);
  }
});

app.post('/settings/restore', express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
  if (req.get('X-Confirm-Restore') !== 'yes') return res.status(400).json({ error: '確認ヘッダーがありません' });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'ファイルが空です' });
  const tmp = path.join(os.tmpdir(), `roumu-restore-${process.pid}-${Date.now()}.db`);
  try {
    fs.writeFileSync(tmp, req.body);
    const info = db.validateBackup(tmp);
    audit(req.actor, 'バックアップから復元（実行前）', 'database', `従業員${info.employees}名のデータで置き換え`);
    const kept = db.restoreFrom(tmp);
    audit(req.actor, 'バックアップから復元', 'database', `従業員${info.employees}名 / 復元前のデータは ${path.basename(kept)} に退避`);
    res.json({ ok: true, employees: info.employees });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    fs.unlink(tmp, () => {});
  }
});

app.get('/audit', (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all();
  res.render('audit', { title: '操作ログ', logs });
});

if (require.main === module) {
  if (process.env.SEED_DEMO === 'true') require('./seed').seed();
  app.listen(PORT, () => {
    console.log(`勤怠・給与・労務システム起動: http://localhost:${PORT}`);
    if (!ADMIN_PASSWORD) console.warn('⚠ ADMIN_PASSWORD が未設定です（開発モード：管理画面に認証がかかっていません）');
  });
}

module.exports = app;
