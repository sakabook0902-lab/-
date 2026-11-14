// 設定値（料率・所定労働時間など）。画面から変更でき、DBの settings テーブルに保存される。
// verify: true の項目は、年度改定があるため必ず公式資料で確認すること。
const db = require('./db');

const DEFS = [
  { group: '会社', key: 'company_name', label: '会社名', def: '株式会社ニジ看護転職' },
  { group: '会社', key: 'pay_month_offset', label: '支給月（勤怠月の何ヶ月後に支給するか）', def: '1', hint: '末締め翌月払いなら 1、当月払いなら 0' },
  { group: '会社', key: 'pay_day', label: '給与支給日', def: '25' },
  { group: '労働時間', key: 'daily_legal_minutes', label: '1日の法定労働時間（分）', def: '480' },
  { group: '労働時間', key: 'weekly_legal_minutes', label: '1週の法定労働時間（分）', def: '2400' },
  { group: '労働時間', key: 'legal_holiday_weekday', label: '法定休日の曜日（0=日〜6=土）', def: '0' },
  { group: '労働時間', key: 'monthly_avg_scheduled_hours', label: '月平均所定労働時間', def: '160', hint: '（年間所定労働日数×1日の所定労働時間）÷12。就業規則・カレンダーから算出' },
  { group: '労働時間', key: 'monthly_scheduled_days', label: '月平均所定労働日数（欠勤控除の計算用）', def: '20' },
  { group: '36協定', key: 'agreement36_monthly_hours', label: '36協定の月の時間外上限（時間）', def: '45' },
  { group: '36協定', key: 'agreement36_expiry', label: '36協定の有効期限', def: '', hint: '入力すると期限30日前に再締結タスクを自動作成' },
  { group: '社会保険料率', key: 'health_rate', label: '健康保険料率（%・労使合計）', def: '9.85', verify: true, hint: '協会けんぽ東京支部 令和8年3月分〜。必ず協会けんぽの保険料額表で確認' },
  { group: '社会保険料率', key: 'care_rate', label: '介護保険料率（%・労使合計）', def: '1.62', verify: true, hint: '令和8年3月分〜（全国一律）' },
  { group: '社会保険料率', key: 'child_support_rate', label: '子ども・子育て支援金率（%・労使合計）', def: '0.23', verify: true, hint: '令和8年4月分〜（全国一律）' },
  { group: '社会保険料率', key: 'child_support_start_ym', label: '子ども・子育て支援金の控除開始（支給月）', def: '2026-05', hint: '4月分保険料を5月支給給与で控除する場合（翌月徴収）' },
  { group: '社会保険料率', key: 'pension_rate', label: '厚生年金保険料率（%・労使合計）', def: '18.3' },
  { group: '社会保険料率', key: 'employment_rate_employee', label: '雇用保険料率・労働者負担（%）', def: '0.5', verify: true, hint: '令和8年度 一般の事業 5/1000' },
];

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(DEFS.map((d) => [d.key, d.def]));
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function saveSettings(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const d of DEFS) if (values[d.key] !== undefined) stmt.run(d.key, String(values[d.key]).trim());
  });
  tx();
}

module.exports = { DEFS, getSettings, saveSettings };
