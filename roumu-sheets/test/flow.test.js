// スプレッドシート版（dist/Code.gs）を GAS のモック上で動かし、主要な業務フローを確認する
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { load } = require('./gas-mock');

execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build.js')]);

const NOW = '2026-11-14T06:00:00Z'; // 日本時間 15:00

function setup(email = '') {
  const env = load({ now: NOW, email });
  env.ctx.menuSetup();
  const { ctx } = env;
  ctx.append_('employees', {
    code: '1001', name: '山田 太郎', email: 'yamada@example.com', birth_date: '1986-11-02', hire_date: '2024-09-01', pin: '1111', location: '五反田',
    base_salary: 300000, position_allowance: 30000, commute_allowance: 15000, fixed_ot_pay: 50000, fixed_ot_hours: 25,
    social_insurance: true, employment_insurance: true, health_std: 410000, pension_std: 410000, tax_column: '甲', dependents: 2,
    resident_tax_june: 21300, resident_tax_monthly: 20900, slip_consent: true,
  });
  ctx.append_('employees', {
    code: '1002', name: '佐藤 花子', email: 'sato@example.com', birth_date: '1994-04-10', hire_date: '2025-04-01', pin: '2222', location: '赤坂',
    base_salary: 250000, commute_allowance: 12000, fixed_ot_pay: 40000, fixed_ot_hours: 20,
    social_insurance: true, employment_insurance: true, health_std: 300000, pension_std: 300000, tax_column: '甲', dependents: 0,
    resident_tax_june: 13600, resident_tax_monthly: 13000,
  });
  ctx.append_('employees', {
    code: '1003', name: '鈴木 一郎', hire_date: '2026-11-16', pin: '3333', base_salary: 230000, social_insurance: true, employment_insurance: true, tax_column: '甲',
  });
  // 10月の勤怠（佐藤：平日 9:30-19:30、4の倍数日は22:45まで）
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    ctx.append_('attendance', { code: '1002', name: '佐藤 花子', work_date: date, clock_in: '09:30', clock_out: d % 4 === 0 ? '22:45' : '19:30', break_minutes: 60 });
  }
  ctx.append_('attendance', { code: '1002', name: '佐藤 花子', work_date: '2026-10-03', clock_in: '10:00', clock_out: '15:00', break_minutes: 0 });
  return env;
}

test('初期設定でシート・設定が作られる', () => {
  const { ss, ctx } = setup();
  for (const n of ['ダッシュボード', '設定', '従業員', '勤怠', '有給取得', '給与入力', '給与', '労務タスク', '賃金変更履歴', '操作ログ']) {
    assert.ok(ss.getSheetByName(n), n);
  }
  assert.ok(!ss.getSheetByName('シート1'));
  assert.strictEqual(ctx.getSettings_().health_rate, '9.85');
});

test('給与計算：Node版と同じ結果になる', () => {
  const { ctx } = setup();
  ctx.calcPayroll('2026-10');
  const input = ctx.read_('payInput').find((r) => r.code === '1002' && r.ym === '2026-10');
  ctx.update_('payInput', input._row, { incentive: 120000 });
  ctx.calcPayroll('2026-10');
  const p = ctx.read_('payroll').find((r) => r.code === '1002');
  assert.strictEqual(p.pay_ym, '2026-11');
  assert.strictEqual(p['e:超過残業手当'], 34707);
  assert.strictEqual(p['e:インセンティブ割増'], 5747);
  assert.strictEqual(p.gross, 463919);
  assert.strictEqual(p['d:源泉所得税'], 16270);
  assert.strictEqual(p.net, 389759);
  assert.strictEqual(p.status, '下書き');
  // 入社前の鈴木さんは対象外
  assert.ok(!ctx.read_('payroll').some((r) => r.code === '1003'));
});

test('確定後は再計算で上書きされない・明細PDFとメール送信', () => {
  const { ctx, rec } = setup();
  ctx.calcPayroll('2026-10');
  ctx.confirmPayroll('2026-10');
  const before = ctx.read_('payroll').find((r) => r.code === '1002');
  assert.strictEqual(before.status, '確定');
  const input = ctx.read_('payInput').find((r) => r.code === '1002');
  ctx.update_('payInput', input._row, { incentive: 999999 });
  ctx.calcPayroll('2026-10');
  assert.strictEqual(ctx.read_('payroll').find((r) => r.code === '1002').gross, before.gross);

  ctx.makeSlips('2026-10');
  const after = ctx.read_('payroll');
  assert.ok(after.every((r) => r.pdf.startsWith('https://drive.google.com/')));
  assert.ok(rec.files[0].blob.content.includes('給与明細書'));
  const r = ctx.mailSlips('2026-10');
  assert.match(r, /送信：1名/); // 同意ありの山田さんのみ
  assert.strictEqual(rec.mails[0][0].to, 'yamada@example.com');
});

test('打刻：Googleアカウントで本人確認・二重打刻の防止・休憩・退勤', () => {
  const { ctx } = setup('yamada@example.com');
  const init = ctx.punchInit();
  assert.strictEqual(init.identified.name, '山田 太郎');
  assert.ok(ctx.punch('in', '', '', '五反田').ok);
  const dup = ctx.punch('in', '', '', '');
  assert.strictEqual(dup.ok, false);
  assert.match(dup.msg, /出勤打刻済み/);
  assert.ok(ctx.punch('break_start', '', '', '').ok);
  assert.ok(ctx.punch('break_end', '', '', '').ok);
  const out = ctx.punch('out', '', '', '');
  assert.ok(out.ok);
  const row = ctx.read_('attendance').find((r) => r.code === '1001' && r.work_date === '2026-11-14');
  assert.strictEqual(row.clock_in, '15:00');
  assert.strictEqual(row.clock_out, '15:00');
  assert.strictEqual(row.work_place, '五反田');
});

test('打刻：PIN認証・総当たりロック・入社前は打刻不可', () => {
  const { ctx } = setup('');
  assert.strictEqual(ctx.punchInit().identified, null);
  assert.strictEqual(ctx.punch('in', '1003', '3333', '').ok, false); // 入社前
  for (let i = 0; i < 5; i++) assert.strictEqual(ctx.punch('in', '1002', '0000', '').ok, false);
  const locked = ctx.punch('in', '1002', '2222', '');
  assert.match(locked.msg, /15分間/);
  assert.ok(ctx.punch('in', '1001', '1111', '').ok);
  assert.ok(ctx.myStatus('1001', '1111').ok);
});

test('労務タスク・ダッシュボード・賃金変更の検知・月額変更届', () => {
  const { ctx } = setup();
  const r = ctx.refreshAll_();
  const tasks = ctx.read_('tasks');
  assert.ok(r.created > 0);
  assert.ok(tasks.some((t) => t.title.includes('資格取得届') && t.name === '鈴木 一郎' && t.due_date === '2026-11-21'));
  assert.ok(tasks.some((t) => t.category === '年次'));
  assert.ok(ctx.read_('snapshot').length === 3);

  // 昇給を従業員シートで直接変更 → 次回の更新で検知
  const emp = ctx.read_('employees').find((e) => e.code === '1002');
  ctx.update_('employees', emp._row, { base_salary: 320000 });
  const r2 = ctx.refreshAll_();
  assert.strictEqual(r2.changes.length, 1);
  const ch = ctx.read_('changes')[0];
  assert.strictEqual(ch.effective_ym, '2026-12');

  // 9〜11月支給の確定給与がそろうと月額変更届を判定
  ctx.update_('changes', ch._row, { effective_ym: '2026-09' });
  for (const [ym, pay] of [['2026-08', '2026-09'], ['2026-09', '2026-10'], ['2026-10', '2026-11']]) {
    ctx.append_('payroll', { ym, pay_ym: pay, code: '1002', name: '佐藤 花子', status: '確定', remuneration: 410000, base_days: 30 });
  }
  ctx.runGetsuhenCheck_();
  assert.ok(ctx.read_('tasks').some((t) => t.category === '随時改定' && t.title.includes('22等級→27等級')));
  assert.match(ctx.read_('changes')[0].result, /届出が必要/);

  // 同じタスクを二重に作らない
  const n = ctx.read_('tasks').length;
  ctx.refreshAll_();
  assert.strictEqual(ctx.read_('tasks').length, n);
  const dash = ctx.ss_().getSheetByName('ダッシュボード').getDataRange().getValues().map((x) => x.join(' ')).join('\n');
  assert.match(dash, /期限が近い労務手続き/);
});

test('毎朝の通知：メールとSlackに送信', () => {
  const { ctx, rec } = setup();
  const st = ctx.ss_().getSheetByName('設定');
  const rows = st.getDataRange().getValues();
  const idx = (k) => rows.findIndex((r) => r[0] === k) + 1;
  st.getRange(idx('notify_emails'), 3).setValue('soumu@example.com');
  st.getRange(idx('slack_webhook'), 3).setValue('https://hooks.slack.com/services/XXX');
  ctx.dailyJob();
  assert.strictEqual(rec.mails.length, 1);
  assert.match(rec.mails[0][2], /資格取得届/);
  assert.strictEqual(rec.fetches.length, 1);
});

test('シートで日付型・時刻型に変換された値も正しく読める', () => {
  const { ctx } = setup();
  assert.strictEqual(ctx.normalize_('date', new Date('2026-11-01T00:00:00+09:00')), '2026-11-01');
  assert.strictEqual(ctx.normalize_('time', new Date('2026-11-01T09:05:00+09:00')), '09:05');
  assert.strictEqual(ctx.normalize_('date', '2026/1/5'), '2026-01-05');
  assert.strictEqual(ctx.normalize_('ym', '2026/9'), '2026-09');
  assert.strictEqual(ctx.normalize_('time', '9:00'), '09:00');
  assert.strictEqual(ctx.normalize_('bool', 'TRUE'), true);
  assert.strictEqual(ctx.normalize_('text', 1001), '1001');
});

test('デモデータ投入 → 給与計算 → データ消去', () => {
  const env = load({ now: NOW });
  env.ctx.menuSetup();
  env.ctx.menuSeedDemo();
  assert.strictEqual(env.ctx.read_('employees').length, 3);
  assert.ok(env.ctx.read_('attendance').length > 20);
  env.ctx.calcPayroll('2026-10');
  assert.strictEqual(env.ctx.read_('payroll').length, 2);
  env.ctx.clearData_();
  for (const k of ['employees', 'attendance', 'payroll', 'tasks']) assert.strictEqual(env.ctx.read_(k).length, 0, k);
  assert.strictEqual(env.ctx.getSettings_().company_name, '株式会社ニジ看護転職');
});
