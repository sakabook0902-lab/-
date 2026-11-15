const test = require('node:test');
const assert = require('node:assert');
const { buildFiling, TYPES } = require('../src/lib/filings');

const company = { company_name: '株式会社テスト', company_address: '東京都品川区', company_rep: '代表 太郎', company_tel: '03-0000-0000',
  shakai_office_symbol: '01-ﾃｽ', shakai_office_number: '12345', koyou_office_number: '1301-123456-7', corporate_number: '1234567890123' };
const emp = { code: '1002', name: '佐藤 花子', name_kana: 'サトウ ハナコ', birth_date: '1994-04-10', gender: '女', address: '東京都港区',
  hire_date: '2026-11-16', employment_type: '正社員', job: 'キャリアアドバイザー', base_salary: 250000, commute_allowance: 12000, fixed_ot_pay: 40000,
  health_std: 300000, pension_std: 300000, weekly_hours: 40, resident_tax_june: 13600, resident_tax_monthly: 13000 };

test('すべての書類が組み立てられ、マイナンバーは常に要記入', () => {
  const pays = [{ ym: '2026-10', pay_ym: '2026-11', base_days: 31, gross: 464053, remuneration: 464053, resident: 13000 }];
  const ctx = { emp: { ...emp, leave_date: '2027-02-28', leave_reason: '自己都合' }, company, pays, change: { effective_ym: '2026-09', detail: '基本給 250,000→290,000円' },
    year: 2027, people: [{ emp, pays }], payDate: '2026-12-10', bonuses: [{ code: '1002', name: '佐藤 花子', amount: 500999, std: 500000 }], emps: [emp], today: '2026-11-14' };
  for (const t of Object.keys(TYPES)) {
    const d = buildFiling(t, ctx);
    assert.ok(d.title && d.deadline && d.sections.length, t);
  }
  const g = buildFiling('shakai_get', ctx);
  assert.strictEqual(g.deadline, '2026-11-21');
  assert.ok(g.missing.some((m) => m.includes('マイナンバー')));
  assert.ok(g.sections[2].rows[0].value.includes('302,000円'));
});

test('雇用保険：賃金月額は千円単位、喪失原因は退職事由から', () => {
  const k = buildFiling('koyou_get', { emp, company });
  assert.strictEqual(k.deadline, '2026-12-10');
  assert.strictEqual(k.sections[2].rows.find((r) => r.label === '賃金月額').value, '302千円');
  const l = buildFiling('koyou_loss', { emp: { ...emp, leave_date: '2026-12-31', leave_reason: '会社都合' }, company, pays: [] });
  assert.match(l.sections[1].rows.find((r) => r.label === '喪失原因').value, /^3/);
  assert.strictEqual(l.deadline, '2027-01-11');
});

test('住民税 異動届：年税額・徴収済額・未徴収税額と徴収方法', () => {
  const pays = ['2026-06', '2026-07', '2026-08'].map((m, i) => ({ pay_ym: m, resident: i === 0 ? 13600 : 13000 }));
  const d = buildFiling('jumin_ido', { emp: { ...emp, leave_date: '2026-08-31' }, company, pays });
  const v = (label) => d.sections[2].rows.find((r) => r.label === label).value;
  assert.strictEqual(v('特別徴収税額（年税額）'), '156,600円');
  assert.strictEqual(v('徴収済額'), '39,600円');
  assert.strictEqual(v('未徴収税額'), '117,000円');
  assert.match(v('未徴収税額の徴収方法'), /^普通徴収/);
  const d2 = buildFiling('jumin_ido', { emp: { ...emp, leave_date: '2027-03-31' }, company, pays: [] });
  assert.match(d2.sections[2].rows.find((r) => r.label === '未徴収税額の徴収方法').value, /^一括徴収/);
  assert.strictEqual(d2.deadline, '2027-04-10');
});

test('月額変更届：3ヶ月平均と新等級', () => {
  const pays = ['2026-09', '2026-10', '2026-11'].map((m) => ({ pay_ym: m, base_days: 30, remuneration: 410000 }));
  const d = buildFiling('getsuhen', { emp, company, change: { effective_ym: '2026-09', detail: '昇給' }, pays });
  assert.strictEqual(d.sections[2].rows.find((r) => r.label === '平均額').value, '410,000円');
  assert.match(d.sections[2].rows.find((r) => r.label.includes('新しい')).value, /27等級/);
  assert.strictEqual(d.table.rows.length, 3);
});
