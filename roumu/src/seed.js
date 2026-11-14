// デモ用サンプルデータ投入（架空の従業員3名・直近2ヶ月分の勤怠）
// 使い方: npm run seed  ※ 既存データがある場合は何もしません
process.env.TZ = process.env.TZ || 'Asia/Tokyo';
const db = require('./db');
const D = require('./lib/dates');
const proc = require('./lib/procedures');

if (db.prepare('SELECT COUNT(*) AS n FROM employees').get().n > 0) {
  console.log('従業員データが既にあるため、サンプル投入をスキップしました');
  process.exit(0);
}

const emps = [
  { code: '1001', name: '山田 太郎', name_kana: 'ヤマダ タロウ', birth_date: '1986-11-02', gender: '男', job: '代表取締役補佐・営業', location: '五反田', hire_date: '2024-09-01', pin: '1111', base_salary: 300000, position_allowance: 30000, commute_allowance: 15000, fixed_ot_pay: 50000, fixed_ot_hours: 25, health_std: 410000, pension_std: 410000, dependents: 2, resident_tax_june: 21300, resident_tax_monthly: 20900 },
  { code: '1002', name: '佐藤 花子', name_kana: 'サトウ ハナコ', birth_date: '1994-04-10', gender: '女', job: 'キャリアアドバイザー', location: '赤坂', hire_date: '2025-04-01', pin: '2222', base_salary: 250000, position_allowance: 0, commute_allowance: 12000, fixed_ot_pay: 40000, fixed_ot_hours: 20, health_std: 300000, pension_std: 300000, dependents: 0, resident_tax_june: 13600, resident_tax_monthly: 13000 },
  { code: '1003', name: '鈴木 一郎', name_kana: 'スズキ イチロウ', birth_date: '1999-08-20', gender: '男', job: 'リクルーティングアドバイザー', location: '五反田', hire_date: '2026-11-16', pin: '3333', base_salary: 230000, position_allowance: 0, commute_allowance: 10000, fixed_ot_pay: 35000, fixed_ot_hours: 20, health_std: 280000, pension_std: 280000, dependents: 0, resident_tax_june: 0, resident_tax_monthly: 9800 },
];

const cols = Object.keys(emps[0]);
const ins = db.prepare(`INSERT INTO employees (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
const today = D.nowJst().date;
const ymNow = today.slice(0, 7);
const ymPrev = D.ymAdd(ymNow, -1);

db.transaction(() => {
  for (const e of emps) {
    const id = ins.run(...cols.map((c) => e[c])).lastInsertRowid;
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    const tasks = proc.hireTasks(emp);
    const stmt = db.prepare('INSERT OR IGNORE INTO tasks (employee_id, category, title, due_date, basis, source_key, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    // 入社済みの人の過去タスクは完了扱い
    for (const t of tasks) stmt.run(id, t.category, t.title, t.due, t.basis, t.source_key, t.due < today ? '完了' : '未対応');
  }
  const att = db.prepare('INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, break_minutes, work_place) VALUES (?, ?, ?, ?, ?, ?)');
  const patterns = {
    1: (i) => ['09:00', i % 3 === 0 ? '21:30' : '20:00'],
    2: (i) => ['09:30', i % 4 === 0 ? '22:45' : '19:30'],
  };
  for (const ym of [ymPrev, ymNow]) {
    for (const date of D.monthDates(ym)) {
      if (date >= today) continue;
      const wd = D.weekday(date);
      if (wd === 0 || wd === 6) continue;
      const i = Number(date.slice(8));
      for (const id of [1, 2]) {
        const [cin, cout] = patterns[id](i);
        att.run(id, date, cin, cout, 60, id === 1 ? '五反田' : (i % 2 ? '赤坂' : 'リモート'));
      }
    }
    // 1名だけ土曜出勤（週40時間超の時間外の例）
    const sat = D.monthDates(ym).find((d) => D.weekday(d) === 6 && d < today);
    if (sat) att.run(2, sat, '10:00', '15:00', 0, '赤坂');
  }
  db.prepare('INSERT INTO paid_leaves (employee_id, leave_date, days, note) VALUES (?, ?, ?, ?)').run(2, `${ymPrev}-15`, 1, '私用');
})();

console.log('サンプルデータを投入しました（従業員3名、PIN: 1111 / 2222 / 3333）');
