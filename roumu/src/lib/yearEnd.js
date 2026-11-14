// 年末調整の計算（計算補助）
// ⚠ 令和7年度税制改正（給与所得控除の最低保障額・基礎控除の引上げ等）を反映したパラメータです。
//   年分ごとに改正があるため、本番利用前に国税庁「年末調整のしかた」の該当年分と必ず照合してください。
//   配偶者特別控除・特定親族特別控除・障害者控除などは担当者が金額を入力する方式です。

const PARAMS = {
  2026: {
    label: '令和8年分（要確認）',
    // 給与所得控除後の金額（年末調整では190万円以上660万円未満は4,000円単位に切り捨ててから計算）
    salaryIncome(income) {
      const x = Math.floor(income);
      if (x < 1900000) return Math.max(0, x - 650000);
      if (x < 6600000) {
        const a = Math.floor(x / 4000) * 4000;
        if (a < 3600000) return Math.floor(a * 0.7 - 80000);
        return Math.floor(a * 0.8 - 440000);
      }
      if (x < 8500000) return Math.floor(x * 0.9 - 1100000);
      return x - 1950000;
    },
    // 基礎控除（合計所得金額に応じて）
    basic(totalIncome) {
      if (totalIncome <= 1320000) return 950000;
      if (totalIncome <= 3360000) return 880000;
      if (totalIncome <= 4890000) return 680000;
      if (totalIncome <= 6550000) return 630000;
      if (totalIncome <= 23500000) return 580000;
      if (totalIncome <= 24000000) return 480000;
      if (totalIncome <= 24500000) return 320000;
      if (totalIncome <= 25000000) return 160000;
      return 0;
    },
    // 配偶者控除（配偶者の合計所得金額58万円以下の場合）：本人の合計所得金額に応じて
    spouse(totalIncome, elderly) {
      if (totalIncome <= 9000000) return elderly ? 480000 : 380000;
      if (totalIncome <= 9500000) return elderly ? 320000 : 260000;
      if (totalIncome <= 10000000) return elderly ? 160000 : 130000;
      return 0;
    },
    dependent: { general: 380000, specific: 630000, elderly: 480000, elderlyLivingTogether: 580000 },
    // 所得税の速算表 [課税所得の上限, 税率, 控除額]
    brackets: [
      [1949000, 0.05, 0], [3299000, 0.1, 97500], [6949000, 0.2, 427500], [8999000, 0.23, 636000],
      [17999000, 0.33, 1536000], [39999000, 0.4, 2796000], [Infinity, 0.45, 4796000],
    ],
  },
};

/**
 * @param input {
 *   year, salaryIncome（給与・賞与の支払総額。非課税通勤手当を除く）, withheld（源泉徴収済み税額）,
 *   socialWithheld（給与・賞与から控除した社会保険料）, socialDeclared（本人が申告した社会保険料：国民年金等）,
 *   lifeInsurance（生命保険料控除額）, earthquake（地震保険料控除額）,
 *   spouseType（'なし' | '一般' | '老人'）, spouseSpecial（配偶者特別控除額・手入力）,
 *   depGeneral, depSpecific, depElderly, depElderlyTogether（扶養親族の人数）,
 *   otherDeduction（障害者控除・特定親族特別控除など手入力）, housingLoan（住宅借入金等特別控除額）
 * }
 */
function calculateYearEnd(input) {
  const n = (v) => Number(v || 0);
  const p = PARAMS[input.year] || PARAMS[Math.max(...Object.keys(PARAMS).map(Number))];
  const income = n(input.salaryIncome);
  const salaryIncomeAfter = p.salaryIncome(income); // 給与所得控除後の金額（＝合計所得金額とみなす）
  const social = n(input.socialWithheld) + n(input.socialDeclared);
  const spouse = input.spouseType === '一般' ? p.spouse(salaryIncomeAfter, false) : input.spouseType === '老人' ? p.spouse(salaryIncomeAfter, true) : 0;
  const dependents = n(input.depGeneral) * p.dependent.general + n(input.depSpecific) * p.dependent.specific
    + n(input.depElderly) * p.dependent.elderly + n(input.depElderlyTogether) * p.dependent.elderlyLivingTogether;
  const basic = p.basic(salaryIncomeAfter);
  const deductions = {
    social, lifeInsurance: n(input.lifeInsurance), earthquake: n(input.earthquake), spouse, spouseSpecial: n(input.spouseSpecial),
    dependents, basic, other: n(input.otherDeduction),
  };
  const deductionTotal = Object.values(deductions).reduce((a, b) => a + b, 0);
  const taxableIncome = Math.max(0, Math.floor((salaryIncomeAfter - deductionTotal) / 1000) * 1000); // 1,000円未満切捨て
  const [, rate, minus] = p.brackets.find(([upper]) => taxableIncome <= upper);
  const computedTax = Math.max(0, Math.floor(taxableIncome * rate - minus));
  const afterHousing = Math.max(0, computedTax - n(input.housingLoan));
  const annualTax = Math.floor(afterHousing * 1.021 / 100) * 100; // 復興特別所得税込み、100円未満切捨て
  const withheld = n(input.withheld);
  const diff = annualTax - withheld; // プラス＝不足（12月給与で徴収）、マイナス＝超過（還付）
  return {
    label: p.label, income, salaryIncomeAfter, deductions, deductionTotal, taxableIncome, computedTax,
    housingLoan: Math.min(n(input.housingLoan), computedTax), annualTax, withheld, diff,
  };
}

module.exports = { calculateYearEnd, PARAMS };
