// Webアプリ（従業員マイページ・管理画面）の api() をモック上で検証
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { load } = require('./gas-mock');

execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build.js')]);
const NOW = '2026-11-14T06:00:00Z';

function env(email) {
  const e = load({ now: NOW, email });
  e.ctx.menuSetup();
  e.ctx.menuSeedDemo();
  const api = (token, action, data) => e.ctx.api({ token, action, data });
  const ok = (r) => { assert.ok(r.ok, r.error); return r.result; };
  return { ...e, api, ok };
}

function adminToken(x) {
  x.ctx.__email = 'owner@example.com';
  const r = x.ok(x.api(null, 'auth.init', {}));
  assert.ok(r.me.isAdmin);
  return r.token;
}

test('ログイン：オーナーは管理者、未登録はログイン画面、PIN・管理者パスワード', () => {
  const x = env('');
  assert.strictEqual(x.ok(x.api(null, 'auth.init', {})).needLogin, true);
  assert.strictEqual(x.api(null, 'auth.pin', { code: '1001', pin: '9999' }).ok, false);
  const emp = x.ok(x.api(null, 'auth.pin', { code: '1001', pin: '1111' }));
  assert.strictEqual(emp.me.isAdmin, false);
  assert.strictEqual(x.api(emp.token, 'adm.dashboard', {}).ok, false); // 従業員は管理画面不可
  assert.strictEqual(x.api(null, 'auth.admin', { password: 'x' }).ok, false); // 未設定
  x.ctx.PropertiesService.getScriptProperties().setProperty('adminPwHash', x.ctx.sha256_('roumu:Secret-Pass-1'));
  assert.strictEqual(x.api(null, 'auth.admin', { password: 'wrong' }).ok, false);
  const adm = x.ok(x.api(null, 'auth.admin', { password: 'Secret-Pass-1' }));
  assert.ok(x.api(adm.token, 'adm.dashboard', {}).ok);
  assert.strictEqual(x.api('bogus', 'me.home', {}).relogin, true);
  assert.ok(adminToken(x));
});

test('従業員マイページ：打刻・勤怠・明細（他人の明細は見られない）・有給', () => {
  const x = env('');
  const t = adminToken(x);
  x.ok(x.api(t, 'adm.savePayInputs', { ym: '2026-10', rows: [{ code: '1002', incentive: 120000 }] }));
  x.ok(x.api(t, 'adm.confirmPayroll', { ym: '2026-10' }));
  const me = x.ok(x.api(null, 'auth.pin', { code: '1002', pin: '2222' })).token;
  const home = x.ok(x.api(me, 'me.home', {}));
  assert.strictEqual(home.latestSlip.net, 389883); // デモデータ（土曜出勤なし）での値。Node版の計算と一致
  assert.ok(x.ok(x.api(me, 'me.punch', { action: 'in', place: '赤坂' })).ok);
  const att = x.ok(x.api(me, 'me.attendance', { ym: '2026-10' }));
  assert.strictEqual(att.days.length, 31);
  assert.strictEqual(att.summary.overtime, '38:15');
  const slips = x.ok(x.api(me, 'me.slips', {}));
  assert.strictEqual(slips.length, 1);
  assert.match(x.ok(x.api(me, 'me.slip', { id: slips[0].id })).html, /給与明細書/);
  const other = x.ok(x.api(t, 'adm.payroll', { ym: '2026-10' })).rows.find((r) => r.code === '1001').pay.id;
  assert.strictEqual(x.api(me, 'me.slip', { id: other }).ok, false);
  assert.ok(x.ok(x.api(me, 'me.leave', {})).balance >= 0);
});

test('管理画面：従業員登録・編集（入社タスク・賃金変更検知）・退職・有給', () => {
  const x = env('');
  const t = adminToken(x);
  assert.strictEqual(x.api(t, 'adm.saveEmployee', { fields: { code: '1001', name: '重複', hire_date: '2026-12-01', pin: '1234' } }).ok, false);
  const r = x.ok(x.api(t, 'adm.saveEmployee', { fields: { code: '1004', name: '高橋 新人', hire_date: '2026-12-01', pin: '4444', base_salary: 240000, social_insurance: true, employment_insurance: true, tax_column: '甲' } }));
  assert.ok(r.created >= 5);
  const d = x.ok(x.api(t, 'adm.employee', { code: '1004' }));
  assert.strictEqual(d.emp.health_std, 240000);
  assert.ok(d.tasks.some((k) => k.title.includes('資格取得届')));
  d.emp.base_salary = 260000;
  const r2 = x.ok(x.api(t, 'adm.saveEmployee', { originalCode: '1004', fields: d.emp }));
  assert.strictEqual(r2.changes.length, 1);
  x.ok(x.api(t, 'adm.retire', { code: '1004', leave_date: '2027-03-31', leave_reason: '自己都合' }));
  assert.ok(x.ok(x.api(t, 'adm.employee', { code: '1004' })).tasks.some((k) => k.title.includes('資格喪失届')));
  x.ok(x.api(t, 'adm.addLeave', { code: '1001', date: '2026-11-20', days: 1 }));
  const lv = x.ok(x.api(t, 'adm.employee', { code: '1001' })).leave.usages;
  x.ok(x.api(t, 'adm.deleteLeave', { row: lv[0].row }));
  assert.strictEqual(x.ok(x.api(t, 'adm.employee', { code: '1001' })).leave.usages.length, 0);
});

test('管理画面：勤怠の修正・削除と操作ログ', () => {
  const x = env('');
  const t = adminToken(x);
  x.ok(x.api(t, 'adm.saveAttendance', { code: '1001', date: '2026-11-02', clock_in: '9:00', clock_out: '18:00', break_minutes: 60, note: '打刻修正' }));
  let d = x.ok(x.api(t, 'adm.attendanceEmp', { code: '1001', ym: '2026-11' })).days.find((k) => k.date === '2026-11-02');
  assert.strictEqual(d.worked, '8:00');
  assert.ok(d.edited);
  x.ok(x.api(t, 'adm.saveAttendance', { code: '1001', date: '2026-11-02', clock_in: '', clock_out: '' }));
  d = x.ok(x.api(t, 'adm.attendanceEmp', { code: '1001', ym: '2026-11' })).days.find((k) => k.date === '2026-11-02');
  assert.strictEqual(d.clock_in, '');
  assert.ok(x.ok(x.api(t, 'adm.logs', {})).some((l) => l.action === '勤怠修正'));
  assert.ok(x.ok(x.api(t, 'adm.attendance', { ym: '2026-10' })).rows.length >= 2);
});

test('給与：計算・確定・取消・振込データ・仕訳CSV', () => {
  const x = env('');
  const t = adminToken(x);
  x.ok(x.api(t, 'adm.savePayInputs', { ym: '2026-10', rows: [{ code: '1002', incentive: 120000 }] }));
  let p = x.ok(x.api(t, 'adm.payroll', { ym: '2026-10' }));
  assert.strictEqual(p.payYm, '2026-11');
  assert.strictEqual(p.rows.find((r) => r.code === '1002').pay.net, 389883);
  assert.strictEqual(x.api(t, 'adm.transfer', { kind: 'payroll', key: '2026-10' }).ok, false); // 未確定
  x.ok(x.api(t, 'adm.confirmPayroll', { ym: '2026-10' }));
  const tr1 = x.ok(x.api(t, 'adm.transfer', { kind: 'payroll', key: '2026-10' }));
  assert.strictEqual(tr1.ok, false); // 口座未登録
  assert.ok(tr1.errors.some((e) => e.includes('委託者コード')));
  x.ok(x.api(t, 'adm.saveSettings', { values: { zengin_client_code: '1234567890', zengin_client_name: 'ｶ)ﾆｼﾞｶﾝｺﾞ', company_bank_code: '0005', company_bank_name: 'ﾐﾂﾋﾞｼ', company_branch_code: '001', company_branch_name: 'ﾎﾝﾃﾝ', company_account_number: '1234567' } }));
  for (const [code, kana] of [['1001', 'ヤマダ タロウ'], ['1002', 'サトウ ハナコ']]) {
    const e = x.ok(x.api(t, 'adm.employee', { code })).emp;
    Object.assign(e, { bank_code: '0001', bank_name: 'ミズホ', branch_code: '100', branch_name: 'トウキヨウ', account_type: '普通', account_number: '7654321', account_holder: kana });
    x.ok(x.api(t, 'adm.saveEmployee', { originalCode: code, fields: e }));
  }
  const tr = x.ok(x.api(t, 'adm.transfer', { kind: 'payroll', key: '2026-10' }));
  assert.ok(tr.ok, JSON.stringify(tr));
  assert.strictEqual(tr.count, 2);
  const file = x.rec.files.find((f) => f.name.startsWith('総合振込'));
  assert.strictEqual(file.blob.charset, 'Shift_JIS');
  file.blob.content.split('\r\n').filter(Boolean).forEach((l) => assert.strictEqual(l.length, 120));
  assert.match(file.blob.content, /2026-11-25|1125/);
  const j = x.ok(x.api(t, 'adm.journal', { kind: 'payroll', key: '2026-10' }));
  assert.ok(j.lines >= 4);
  const id = p.rows.find((r) => r.code === '1001').pay.id;
  assert.strictEqual(x.api(t, 'adm.unconfirmPayroll', { id }).ok, false); // 理由必須
  x.ok(x.api(t, 'adm.unconfirmPayroll', { id, reason: '入力ミス' }));
  p = x.ok(x.api(t, 'adm.payroll', { ym: '2026-10' }));
  assert.strictEqual(p.rows.find((r) => r.code === '1001').pay.status, '下書き');
});

test('賞与：計算・確定（賞与支払届タスク）・明細・マイページに表示', () => {
  const x = env('');
  const t = adminToken(x);
  x.ok(x.api(t, 'adm.savePayInputs', { ym: '2026-10', rows: [] }));
  x.ok(x.api(t, 'adm.confirmPayroll', { ym: '2026-10' }));
  const b0 = x.ok(x.api(t, 'adm.bonus', { payDate: '2026-12-10' }));
  assert.ok(b0.rows.find((r) => r.code === '1002').prevSalary > 0);
  const msg = x.ok(x.api(t, 'adm.saveBonus', { payDate: '2026-12-10', rows: [{ code: '1001', amount: 600000, rate: '4.084' }, { code: '1002', amount: 500999, rate: '' }] }));
  assert.match(msg, /算出率/);
  const b = x.ok(x.api(t, 'adm.bonus', { payDate: '2026-12-10' })).rows.find((r) => r.code === '1002').bonus;
  assert.strictEqual(b.health, 24625);
  assert.strictEqual(b.withholding, 0);
  x.ok(x.api(t, 'adm.confirmBonus', { payDate: '2026-12-10' }));
  assert.ok(x.ok(x.api(t, 'adm.tasks', {})).some((k) => k.title.includes('賞与支払届') && k.due === '2026-12-15'));
  assert.match(x.ok(x.api(t, 'adm.bonusSlips', { payDate: '2026-12-10' })), /2名分/);
  assert.strictEqual(x.ok(x.api(t, 'adm.bonusList', {}))[0].count, 2);
  const me = x.ok(x.api(null, 'auth.pin', { code: '1001', pin: '1111' })).token;
  const slips = x.ok(x.api(me, 'me.slips', {}));
  assert.strictEqual(slips[0].kind, '賞与');
  assert.match(x.ok(x.api(me, 'me.slip', { id: slips[0].id })).html, /賞与明細書/);
});

test('年末調整：自動集計・計算・12月給与への反映', () => {
  const x = env('');
  const t = adminToken(x);
  x.ok(x.api(t, 'adm.savePayInputs', { ym: '2026-10', rows: [] }));
  x.ok(x.api(t, 'adm.confirmPayroll', { ym: '2026-10' }));
  const y = x.ok(x.api(t, 'adm.yearEnd', { year: '2026' }));
  const row = y.rows.find((r) => r.code === '1002');
  assert.ok(row.auto.salaryIncome > 0);
  assert.ok(row.auto.withheld > 0);
  const saved = x.ok(x.api(t, 'adm.saveYearEnd', { year: '2026', rows: [{ code: '1002', lifeInsurance: 40000, spouseType: 'なし' }] })).rows.find((r) => r.code === '1002').saved;
  assert.strictEqual(saved.status, '計算済み');
  assert.ok(saved.diff < 0); // 1ヶ月分しか支払がないので還付
  const msg = x.ok(x.api(t, 'adm.reflectYearEnd', { year: '2026' }));
  assert.match(msg, /1名分/);
  const p = x.ok(x.api(t, 'adm.payroll', { ym: '2026-11' })).rows.find((r) => r.code === '1002');
  assert.strictEqual(p.input.yearEndAdjustment, saved.diff);
  const slip = x.ok(x.api(t, 'adm.slip', { id: p.pay.id })).html;
  assert.match(slip, /年末調整過不足/);
});

test('タスク・設定・ダッシュボード', () => {
  const x = env('');
  const t = adminToken(x);
  const dash = x.ok(x.api(t, 'adm.dashboard', {}));
  assert.ok(dash.alerts.tasks.length > 0);
  const task = x.ok(x.api(t, 'adm.tasks', {}))[0];
  x.ok(x.api(t, 'adm.updateTask', { row: task.row, status: '完了', note: '11/14提出' }));
  assert.ok(x.ok(x.api(t, 'adm.tasks', { status: '完了' })).some((k) => k.note === '11/14提出' && k.completed_at));
  x.ok(x.api(t, 'adm.addTask', { title: '就業規則の見直し', due: '2026-12-01' }));
  assert.ok(x.ok(x.api(t, 'adm.tasks', {})).some((k) => k.title === '就業規則の見直し'));
  assert.strictEqual(x.ok(x.api(t, 'adm.saveSettings', { values: { pay_day: '20' } })), 1);
  assert.strictEqual(x.ok(x.api(t, 'adm.settings', {})).find((s) => s.key === 'pay_day').value, '20');
  assert.ok(x.ok(x.api(t, 'adm.refresh', {})));
});
