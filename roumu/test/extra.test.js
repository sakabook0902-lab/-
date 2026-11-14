const test = require('node:test');
const assert = require('node:assert');
const { calculateBonus, fiscalStartYm } = require('../src/lib/bonus');
const { calculateYearEnd } = require('../src/lib/yearEnd');
const { buildTransferFile, toZenginKana } = require('../src/lib/zengin');
const { calculate } = require('../src/lib/payroll');

const S = { health_rate: 9.85, care_rate: 1.62, child_support_rate: 0.23, pension_rate: 18.3, employment_rate_employee: 0.5, child_support_start_ym: '2026-05', monthly_avg_scheduled_hours: 160, monthly_scheduled_days: 20 };
const emp = { birth_date: '1994-04-10', social_insurance: 1, employment_insurance: 1, tax_column: '甲', dependents: 0, health_std: 300000, pension_std: 300000, base_salary: 250000 };

test('賞与：標準賞与額・社会保険料・源泉', () => {
  const r = calculateBonus({ emp, s: S, amount: 500999, payYm: '2026-12', ratePercent: 6.126 });
  assert.strictEqual(r.std, 500000);
  assert.strictEqual(r.health, 24625); // 500,000 × 9.85% ÷ 2
  assert.strictEqual(r.child, 575);
  assert.strictEqual(r.pension, 45750);
  assert.strictEqual(r.employment, 2505); // 500,999 × 0.5% = 2,504.995 → 2,505
  assert.strictEqual(r.withholding, Math.floor((500999 - r.social) * 0.06126));
  assert.strictEqual(r.net, 500999 - r.deductionTotal);
});

test('賞与：上限（厚年150万・健保年度573万）と算出率未入力', () => {
  const r = calculateBonus({ emp, s: S, amount: 2000000, payYm: '2026-12', ratePercent: '', ytdHealthStd: 5000000 });
  assert.strictEqual(r.pensionStd, 1500000);
  assert.strictEqual(r.healthStd, 730000);
  assert.strictEqual(r.withholding, 0);
  assert.ok(r.notes.some((x) => x.includes('算出率')));
  assert.strictEqual(fiscalStartYm('2027-02'), '2026-04');
  assert.strictEqual(fiscalStartYm('2026-04'), '2026-04');
});

test('年末調整：給与収入500万円・社保70万円', () => {
  const r = calculateYearEnd({ year: 2026, salaryIncome: 5000000, withheld: 130000, socialWithheld: 700000 });
  assert.strictEqual(r.salaryIncomeAfter, 3560000);
  assert.strictEqual(r.deductions.basic, 680000);
  assert.strictEqual(r.taxableIncome, 2180000);
  assert.strictEqual(r.computedTax, 120500);
  assert.strictEqual(r.annualTax, 123000);
  assert.strictEqual(r.diff, -7000); // 還付
});

test('年末調整：配偶者・扶養・住宅ローン控除・低収入', () => {
  const r = calculateYearEnd({ year: 2026, salaryIncome: 6000000, withheld: 100000, socialWithheld: 850000, spouseType: '一般', depSpecific: 1, housingLoan: 200000 });
  assert.strictEqual(r.salaryIncomeAfter, 4360000);
  assert.strictEqual(r.deductions.spouse, 380000);
  assert.strictEqual(r.deductions.dependents, 630000);
  assert.strictEqual(r.annualTax, 0);
  assert.strictEqual(calculateYearEnd({ year: 2026, salaryIncome: 1000000 }).salaryIncomeAfter, 350000);
  assert.strictEqual(calculateYearEnd({ year: 2026, salaryIncome: 1903999 }).salaryIncomeAfter, 1250000); // 1,900,000 ×0.7−80,000
});

test('給与：年末調整の過不足は課税対象に影響しない', () => {
  const att = { worked: 9600, overtimeUpTo60: 0, overtimeOver60: 0, holiday: 0, night: 0 };
  const a = calculate({ emp, s: S, att, input: {}, ym: '2026-11', payYm: '2026-12' });
  const b = calculate({ emp, s: S, att, input: { yearEndAdjustment: -7000 }, ym: '2026-11', payYm: '2026-12' });
  assert.strictEqual(a.taxable, b.taxable);
  assert.strictEqual(b.net, a.net + 7000);
});

test('全銀データ：120桁・合計・カナ変換', () => {
  assert.strictEqual(toZenginKana('ヤマダ　タロウ'), 'ﾔﾏﾀﾞ ﾀﾛｳ');
  assert.strictEqual(toZenginKana('さとう　はなこ'), 'ｻﾄｳ ﾊﾅｺ');
  assert.strictEqual(toZenginKana('ｶ)ﾆｼﾞ'), 'ｶ)ﾆｼﾞ');
  assert.strictEqual(toZenginKana('キッチャ'), 'ｷﾂﾁﾔ');
  const company = { clientCode: '1234567890', clientName: 'カ）ニジカンゴテンショク', bankCode: '0005', bankName: 'ミツビシユーエフジエイ', branchCode: '001', branchName: 'ホンテン', accountType: '普通', accountNumber: '1234567' };
  const r = buildTransferFile(company, '2026-11-25', [
    { bankCode: '0001', bankName: 'ミズホ', branchCode: '100', branchName: 'トウキヨウ', accountType: '普通', accountNumber: '7654321', holderName: 'ヤマダ タロウ', amount: 393962 },
    { bankCode: '9900', bankName: 'ユウチヨ', branchCode: '018', branchName: 'ゼロイチハチ', accountType: '普通', accountNumber: '1111111', holderName: 'サトウ ハナコ', amount: 389759 },
  ]);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.total, 783721);
  r.lines.forEach((l) => assert.strictEqual(l.length, 120, l));
  assert.ok(r.lines[0].startsWith('1210'));
  assert.ok(r.lines[3].startsWith('8000002000000783721'));
  const bad = buildTransferFile(company, '2026-11-25', [{ holderName: 'テスト', amount: 1000 }]);
  assert.ok(bad.errors.length);
});
