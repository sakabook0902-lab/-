const test = require('node:test');
const assert = require('node:assert');
const { employeeShare, isCareTarget, calculate } = require('../src/lib/payroll');
const { monthlyKou } = require('../src/lib/withholding');
const { lookupHealth, lookupPension } = require('../src/lib/standardRemuneration');
const { calcDay, summarizeMonth, check36 } = require('../src/lib/attendance');
const { leaveStatus } = require('../src/lib/leave');
const { checkGetsuhen, hireTasks, leaveTasks } = require('../src/lib/procedures');
const { addMonths } = require('../src/lib/dates');

const S = {
  legal_holiday_weekday: 0, daily_legal_minutes: 480, weekly_legal_minutes: 2400,
  monthly_avg_scheduled_hours: 160, monthly_scheduled_days: 20,
  health_rate: 9.85, care_rate: 1.62, child_support_rate: 0.23, pension_rate: 18.3,
  employment_rate_employee: 0.5, child_support_start_ym: '2026-05', agreement36_monthly_hours: 45,
};

test('社会保険料の端数処理（50銭以下切捨て・50銭超切上げ）', () => {
  assert.strictEqual(employeeShare(300000, 9.85), 14775);
  assert.strictEqual(employeeShare(300000, 18.3), 27450);
  assert.strictEqual(employeeShare(100, 1), 0); // 0.50円 → 切捨て
  assert.strictEqual(employeeShare(101, 1), 1); // 0.505円 → 切上げ
  assert.strictEqual(employeeShare(333333, 0.5, false), 1667); // 雇用保険 1666.665円
  assert.strictEqual(employeeShare(333300, 0.5, false), 1666); // 1666.5円 → 切捨て
});

test('標準報酬月額の等級判定', () => {
  assert.deepStrictEqual(lookupHealth(300000), { grade: 22, standard: 300000 });
  assert.deepStrictEqual(lookupHealth(62999), { grade: 1, standard: 58000 });
  assert.deepStrictEqual(lookupHealth(2000000), { grade: 50, standard: 1390000 });
  assert.deepStrictEqual(lookupPension(50000), { grade: 1, standard: 88000 });
  assert.deepStrictEqual(lookupPension(700000), { grade: 32, standard: 650000 });
  assert.deepStrictEqual(lookupPension(394999), { grade: 23, standard: 380000 });
});

test('源泉所得税（電算機特例）', () => {
  const r = monthlyKou(300000, 0, 2026);
  // 給与所得控除 96,667 / 基礎控除 48,334 → 課税 154,999 × 5.105% = 7,912.69 → 7,910
  assert.strictEqual(r.taxableBase, 154999);
  assert.strictEqual(r.tax, 7910);
  assert.ok(monthlyKou(300000, 2, 2026).tax < r.tax);
  assert.strictEqual(monthlyKou(100000, 0, 2026).tax, 0);
});

test('日次勤怠：時間外・深夜・法定休日', () => {
  const d = calcDay({ work_date: '2026-11-10', clock_in: '09:00', clock_out: '20:00', break_minutes: 60 }, S);
  assert.strictEqual(d.worked, 600);
  assert.strictEqual(d.overtime, 120);
  const night = calcDay({ work_date: '2026-11-10', clock_in: '14:00', clock_out: '00:30', break_minutes: 60 }, S);
  assert.strictEqual(night.night, 150);
  const sun = calcDay({ work_date: '2026-11-15', clock_in: '10:00', clock_out: '15:00', break_minutes: 0 }, S);
  assert.strictEqual(sun.holiday, 300);
  assert.strictEqual(sun.overtime, 0);
});

test('週40時間超の時間外（月〜土 各8時間 → 土曜に8時間）', () => {
  // 2026-12-07(月)〜12-12(土)
  const week = ['07', '08', '09', '10', '11', '12'].map((d) => ({ work_date: `2026-12-${d}`, clock_in: '09:00', clock_out: '18:00', break_minutes: 60 }));
  const { summary, days } = summarizeMonth(week, '2026-12', S);
  assert.strictEqual(summary.worked, 2880);
  assert.strictEqual(summary.overtime, 480);
  assert.strictEqual(days[5].weeklyOvertime, 480);
});

test('36協定チェック', () => {
  const a = check36([{ ym: '2026-10', overtime: 50 * 60, holiday: 0 }], S);
  assert.strictEqual(a[0].level, 'danger');
  const b = check36([
    { ym: '2026-09', overtime: 70 * 60, holiday: 20 * 60 },
    { ym: '2026-10', overtime: 70 * 60, holiday: 20 * 60 },
  ], S);
  assert.ok(b.some((x) => x.msg.includes('平均80時間')));
});

test('有給：付与・残日数・年5日義務', () => {
  const st = leaveStatus('2025-04-01', [{ leave_date: '2026-11-02', days: 1 }, { leave_date: '2026-03-01', days: 2 }], '2026-11-14');
  assert.deepStrictEqual(st.grants.map((g) => [g.date, g.days]), [['2025-10-01', 10], ['2026-10-01', 11]]);
  assert.strictEqual(st.balance, 18);
  assert.strictEqual(st.obligation.taken, 1);
  assert.strictEqual(st.nextGrant.date, '2027-10-01');
});

test('介護保険の対象月（40歳到達月から）', () => {
  assert.strictEqual(isCareTarget('1986-11-02', '2026-11'), true);
  assert.strictEqual(isCareTarget('1986-11-02', '2026-10'), false);
  assert.strictEqual(isCareTarget('1986-11-01', '2026-10'), true); // 誕生日前日が10/31
  assert.strictEqual(isCareTarget('1961-12-15', '2026-12'), false); // 65歳到達月は対象外
});

test('給与計算：固定残業代の超過分・歩合割増', () => {
  const emp = {
    base_salary: 250000, position_allowance: 0, commute_allowance: 10000, fixed_ot_pay: 40000, fixed_ot_hours: 20,
    social_insurance: 1, employment_insurance: 1, health_std: 300000, pension_std: 300000,
    birth_date: '1995-05-05', tax_column: '甲', dependents: 0, resident_tax_monthly: 12000, resident_tax_june: 12500,
  };
  const att = { worked: 190 * 60, overtimeUpTo60: 30 * 60, overtimeOver60: 0, holiday: 0, night: 0 };
  const r = calculate({ emp, s: S, att, input: { incentive: 95000 }, ym: '2026-10', payYm: '2026-11' });
  const get = (l) => r.lines.earnings.find((x) => x.label === l)?.amount;
  assert.strictEqual(get('超過残業手当'), 58594 - 40000); // 1562.5×1.25×30 = 58,593.75
  assert.strictEqual(get('インセンティブ割増'), 3750); // 95,000/190h ×0.25×30h
  assert.strictEqual(r.gross, 250000 + 40000 + 18594 + 95000 + 3750 + 10000);
  assert.strictEqual(r.health, 14775);
  assert.strictEqual(r.child, 345);
  assert.strictEqual(r.pension, 27450);
  assert.strictEqual(r.residentTax, 12000);
  assert.strictEqual(r.net, r.gross - r.deductionTotal);
  assert.ok(r.lines.notes.some((n) => n.includes('固定残業時間')));
});

test('随時改定（月額変更届）の判定', () => {
  const p = (pay_ym, remuneration) => ({ pay_ym, remuneration, base_days: 30 });
  const r = checkGetsuhen({ effective_ym: '2026-07' }, [p('2026-07', 360000), p('2026-08', 365000), p('2026-09', 370000)], 300000);
  assert.strictEqual(r.status, 'required');
  assert.strictEqual(r.newStd, 360000);
  assert.strictEqual(r.revisionYm, '2026-10');
  const w = checkGetsuhen({ effective_ym: '2026-07' }, [p('2026-07', 360000)], 300000);
  assert.strictEqual(w.status, 'waiting');
});

test('入退社タスクの期限', () => {
  const h = hireTasks({ id: 1, hire_date: '2026-11-16', social_insurance: 1, employment_insurance: 1, dependents: 1 });
  const due = (k) => h.find((t) => t.source_key.endsWith(k)).due;
  assert.strictEqual(due(':shakai_get'), '2026-11-21');
  assert.strictEqual(due(':koyou_get'), '2026-12-10');
  assert.ok(h.some((t) => t.source_key.endsWith(':fuyou')));
  const l = leaveTasks({ id: 1, leave_date: '2026-12-31', social_insurance: 1, employment_insurance: 1 });
  assert.strictEqual(l.find((t) => t.source_key.endsWith(':koyou_loss')).due, '2027-01-11');
  assert.strictEqual(l.find((t) => t.source_key.endsWith(':jumin_ido')).due, '2027-01-10');
  assert.strictEqual(addMonths('2026-01-31', 1), '2026-02-28');
});
