// 給与計算（月給制）
// 支給：基本給・役職手当・通勤手当・固定残業代・超過残業代・休日/深夜手当・インセンティブ（歩合）とその割増
// 控除：健康保険（＋介護）・子ども子育て支援金・厚生年金・雇用保険・源泉所得税・住民税
const { lookupHealth, lookupPension } = require('./standardRemuneration');
const { monthlyKou } = require('./withholding');
const { ageReachDate, daysInMonth } = require('./dates');

// 被保険者負担分の端数処理：給与から控除する場合、50銭以下切捨て・50銭超切上げ
// 浮動小数の誤差を避けるため、料率を千分の一%単位の整数にして計算
function employeeShare(base, ratePercent, half = true) {
  const rateMilli = Math.round(Number(ratePercent) * 1000); // 9.85% → 9850
  const denom = half ? 200000 : 100000; // base × rateMilli / (1000 × 100 × 2)
  const num = Math.round(base) * rateMilli;
  const floorYen = Math.floor(num / denom);
  const rem = num - floorYen * denom;
  return rem * 2 <= denom ? floorYen : floorYen + 1;
}

// 介護保険第2号被保険者（40歳到達月〜65歳到達月の前月）か
function isCareTarget(birthDate, ym) {
  if (!birthDate) return false;
  const start = ageReachDate(birthDate, 40).slice(0, 7);
  const end = ageReachDate(birthDate, 65).slice(0, 7);
  return ym >= start && ym < end;
}

/**
 * @param emp 従業員マスタ
 * @param s 設定（料率など）
 * @param att 月次勤怠サマリ（分単位）
 * @param input 月ごとの入力 {incentive, absenceDays, otherAllowance, otherDeduction, withholdingOverride, yearEndAdjustment, note}
 * @param ym 勤怠対象月, payYm 支給月
 */
function calculate({ emp, s, att, input = {}, ym, payYm }) {
  const n = (v) => Number(v || 0);
  const lines = { earnings: [], deductions: [], notes: [] };
  const base = n(emp.base_salary);
  const position = n(emp.position_allowance);
  const commute = n(emp.commute_allowance);
  const fixedOt = n(emp.fixed_ot_pay);
  const incentive = n(input.incentive);
  const otherAllowance = n(input.otherAllowance);
  const absenceDays = n(input.absenceDays);

  // 割増賃金の算定基礎（通勤手当は除外）
  const monthlyHours = n(s.monthly_avg_scheduled_hours) || 160;
  const hourly = (base + position) / monthlyHours;
  const h = (min) => n(min) / 60;
  const ot60 = h(att.overtimeUpTo60);
  const otOver = h(att.overtimeOver60);
  const holidayH = h(att.holiday);
  const nightH = h(att.night);
  const workedH = h(att.worked);

  const otPay = Math.round(hourly * 1.25 * ot60 + hourly * 1.5 * otOver);
  const holidayPay = Math.round(hourly * 1.35 * holidayH);
  const nightPay = Math.round(hourly * 0.25 * nightH);

  // 歩合給（インセンティブ）の割増：歩合給 ÷ 総労働時間 × 割増率（0.25等）× 時間外時間
  let incentivePremium = 0;
  if (incentive > 0 && workedH > 0) {
    const ih = incentive / workedH;
    incentivePremium = Math.round(ih * 0.25 * ot60 + ih * 0.5 * otOver + ih * 0.35 * holidayH + ih * 0.25 * nightH);
  }

  // 固定残業代は時間外割増（月給分）に充当し、超過分を追加支給
  const excessOt = Math.max(0, otPay - fixedOt);
  if (fixedOt > 0 && n(emp.fixed_ot_hours) > 0 && ot60 + otOver > n(emp.fixed_ot_hours)) {
    lines.notes.push(`時間外 ${(ot60 + otOver).toFixed(1)}時間 が固定残業時間（${emp.fixed_ot_hours}時間）を超えています`);
  }

  const scheduledDays = n(s.monthly_scheduled_days) || 20;
  const absenceDeduction = Math.floor(((base + position) / scheduledDays) * absenceDays);

  const E = (label, amount, extra = {}) => amount && lines.earnings.push({ label, amount, ...extra });
  E('基本給', base);
  E('役職手当', position);
  E('固定残業代', fixedOt, { hint: emp.fixed_ot_hours ? `${emp.fixed_ot_hours}時間分` : '' });
  E('超過残業手当', excessOt, { hint: `時間外 ${(ot60 + otOver).toFixed(2)}h（60h超 ${otOver.toFixed(2)}h）` });
  E('休日労働手当', holidayPay, { hint: `${holidayH.toFixed(2)}h ×1.35` });
  E('深夜労働手当', nightPay, { hint: `${nightH.toFixed(2)}h ×0.25` });
  E('インセンティブ', incentive);
  E('インセンティブ割増', incentivePremium, { hint: '歩合給の時間外等割増' });
  E('その他手当', otherAllowance, { hint: input.otherAllowanceLabel || '' });
  E('通勤手当（非課税）', commute);
  if (absenceDeduction) lines.earnings.push({ label: '欠勤控除', amount: -absenceDeduction, hint: `${absenceDays}日` });

  const gross = lines.earnings.reduce((t, l) => t + l.amount, 0);
  const commuteNonTaxable = Math.min(commute, 150000);

  // 社会保険（標準報酬月額）
  let healthStd = n(emp.health_std);
  let pensionStd = n(emp.pension_std);
  if (!healthStd) {
    const est = base + position + commute + fixedOt;
    healthStd = lookupHealth(est).standard;
    pensionStd = lookupPension(est).standard;
    lines.notes.push('標準報酬月額が未登録のため、固定的賃金から仮計算しています。資格取得届の決定値を登録してください');
  }
  let health = 0, child = 0, pension = 0;
  const care = isCareTarget(emp.birth_date, ym);
  if (emp.social_insurance) {
    const hRate = n(s.health_rate) + (care ? n(s.care_rate) : 0);
    health = employeeShare(healthStd, hRate);
    pension = employeeShare(pensionStd, s.pension_rate);
    if (payYm >= (s.child_support_start_ym || '2026-05')) child = employeeShare(healthStd, s.child_support_rate);
  }
  const employment = emp.employment_insurance ? employeeShare(gross, s.employment_rate_employee, false) : 0;
  const socialTotal = health + child + pension + employment;

  // 源泉所得税（甲欄は自動計算、乙欄は手入力）
  const taxable = Math.max(0, gross - commuteNonTaxable - socialTotal);
  let withholding = 0;
  let withholdingMethod = '';
  if (input.withholdingOverride !== undefined && input.withholdingOverride !== '' && input.withholdingOverride !== null) {
    withholding = n(input.withholdingOverride);
    withholdingMethod = '手入力';
  } else if (emp.tax_column === '乙') {
    lines.notes.push('乙欄のため源泉所得税は自動計算していません。税額表（乙欄）で確認して手入力してください');
    withholdingMethod = '乙欄（要手入力）';
  } else {
    const r = monthlyKou(taxable, n(emp.dependents), Number(payYm.slice(0, 4)));
    withholding = r.tax;
    withholdingMethod = r.method;
  }

  // 住民税（特別徴収）：6月支給分と7月〜翌5月支給分で金額が異なる
  const residentTax = payYm.endsWith('-06') ? n(emp.resident_tax_june) : n(emp.resident_tax_monthly);
  const otherDeduction = n(input.otherDeduction);

  const D = (label, amount, hint = '') => amount && lines.deductions.push({ label, amount, hint });
  D(care ? '健康保険料（介護含む）' : '健康保険料', health, `標準報酬 ${healthStd.toLocaleString()}円`);
  D('子ども・子育て支援金', child);
  D('厚生年金保険料', pension, `標準報酬 ${pensionStd.toLocaleString()}円`);
  D('雇用保険料', employment);
  D('源泉所得税', withholding, withholdingMethod);
  D('住民税', residentTax);
  D('その他控除', otherDeduction, input.otherDeductionLabel || '');
  // 年末調整の過不足（プラス＝不足額の徴収、マイナス＝超過額の還付）。課税対象額には影響しない
  D('年末調整過不足', n(input.yearEndAdjustment), n(input.yearEndAdjustment) < 0 ? '還付' : '徴収');
  const deductionTotal = lines.deductions.reduce((t, l) => t + l.amount, 0);

  // 支払基礎日数：月給者は暦日数。欠勤控除がある場合は所定労働日数−欠勤日数
  const baseDays = absenceDays > 0 ? scheduledDays - absenceDays : daysInMonth(ym);

  return {
    ym, payYm, gross, deductionTotal, net: gross - deductionTotal, taxable, socialTotal,
    health, child, pension, employment, withholding, residentTax, care,
    healthStd, pensionStd, baseDays,
    remuneration: gross, // 社会保険上の報酬（通勤手当含む）
    hourly: Math.round(hourly * 100) / 100,
    lines,
  };
}

module.exports = { calculate, employeeShare, isCareTarget };
