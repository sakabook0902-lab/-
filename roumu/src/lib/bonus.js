// 賞与計算：標準賞与額にもとづく社会保険料・雇用保険料・源泉所得税
// ・標準賞与額＝賞与額の1,000円未満切捨て
// ・健康保険（介護・子ども子育て支援金も同じ）は年度（4月〜翌3月）累計573万円が上限
// ・厚生年金は1回（同月内）150万円が上限
// ・源泉所得税＝（賞与額−社会保険料）×算出率。算出率は国税庁「賞与に対する源泉徴収税額の算出率の表」で、
//   前月の社会保険料控除後の給与額と扶養人数から求める（本システムでは表を内蔵せず、担当者が入力する）
const { employeeShare, isCareTarget } = require('./payroll');

const HEALTH_ANNUAL_CAP = 5730000;
const PENSION_PER_PAYMENT_CAP = 1500000;

// 年度（4月始まり）の開始月
function fiscalStartYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04`;
}

/**
 * @param emp 従業員
 * @param s 設定（料率）
 * @param amount 賞与額（総支給）
 * @param payYm 支給月 'YYYY-MM'
 * @param ratePercent 源泉の算出率（%）。未入力なら源泉は0で要確認メモ
 * @param ytdHealthStd 同じ年度内で支給済みの標準賞与額（健保）の累計
 */
function calculateBonus({ emp, s, amount, payYm, ratePercent, ytdHealthStd = 0 }) {
  const n = (v) => Number(v || 0);
  const notes = [];
  const gross = Math.floor(n(amount));
  const std = Math.floor(gross / 1000) * 1000;
  const healthStd = Math.max(0, Math.min(std, HEALTH_ANNUAL_CAP - n(ytdHealthStd)));
  const pensionStd = Math.min(std, PENSION_PER_PAYMENT_CAP);
  if (healthStd < std) notes.push(`健康保険の標準賞与額が年度上限（573万円）に達したため ${healthStd.toLocaleString()}円 で計算`);
  if (pensionStd < std) notes.push('厚生年金の標準賞与額は1回150万円が上限');

  let health = 0, child = 0, pension = 0;
  const care = isCareTarget(emp.birth_date, payYm);
  if (emp.social_insurance) {
    health = employeeShare(healthStd, n(s.health_rate) + (care ? n(s.care_rate) : 0));
    pension = employeeShare(pensionStd, s.pension_rate);
    if (payYm >= (s.child_support_start_ym || '2026-05')) child = employeeShare(healthStd, s.child_support_rate);
  }
  const employment = emp.employment_insurance ? employeeShare(gross, s.employment_rate_employee, false) : 0;
  const social = health + child + pension + employment;
  const taxable = Math.max(0, gross - social);
  let withholding = 0;
  if (ratePercent === '' || ratePercent === null || ratePercent === undefined) {
    notes.push('源泉所得税の算出率が未入力です（国税庁「賞与に対する源泉徴収税額の算出率の表」で確認して入力）');
  } else {
    withholding = Math.floor(taxable * n(ratePercent) / 100);
  }
  const deductionTotal = social + withholding;
  return {
    payYm, gross, std, healthStd, pensionStd, care, health, child, pension, employment, social, taxable,
    ratePercent: ratePercent === '' ? '' : n(ratePercent), withholding, deductionTotal, net: gross - deductionTotal, notes,
  };
}

module.exports = { calculateBonus, fiscalStartYm, HEALTH_ANNUAL_CAP, PENSION_PER_PAYMENT_CAP };
