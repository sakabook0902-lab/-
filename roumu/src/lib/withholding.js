// 源泉所得税（復興特別所得税込み）月額・甲欄の計算
// 国税庁「電子計算機等を使用して源泉徴収税額を計算する方法」（電算機計算の特例）による。
//
// ⚠ 重要：パラメータは年分ごとに改正されます。本番利用の前に、必ず国税庁の該当年分の資料
//   （例：令和8年分 源泉徴収税額表 > 電子計算機等を使用して源泉徴収税額を計算する方法）
//   の別表第一〜第四と、下記 PARAMS の数値が一致していることを確認してください。
//   電算機特例の結果は税額表（月額表）と数円〜数十円ずれることがありますが、どちらも適法です。
//   乙欄（扶養控除等申告書の提出がない人）は本システムでは自動計算せず、手入力としています。

const PARAMS = {
  2026: {
    label: '令和8年分（要確認）',
    // 別表第一：給与所得控除の額（月額）
    kyuyoKojo(a) {
      if (a <= 158333) return 54167;
      if (a <= 299999) return Math.ceil(a * 0.3 + 6667);
      if (a <= 549999) return Math.ceil(a * 0.2 + 36667);
      if (a <= 708330) return Math.ceil(a * 0.1 + 91667);
      return 162500;
    },
    // 源泉控除対象配偶者・扶養親族 1人あたり（月額）
    perDependent: 31667,
    // 別表第三：基礎控除の額（月額）
    kisoKojo(a) {
      if (a <= 2162499) return 48334;
      if (a <= 2204166) return 40000;
      if (a <= 2245833) return 26667;
      if (a <= 2287500) return 13334;
      return 0;
    },
    // 別表第四：税率表 [課税給与所得金額の上限, 税率, 控除額]
    brackets: [
      [162500, 0.05105, 0],
      [275000, 0.1021, 8296],
      [579166, 0.2042, 36374],
      [750000, 0.23483, 54113],
      [1500000, 0.33693, 130688],
      [3333333, 0.4084, 237893],
      [Infinity, 0.45945, 408061],
    ],
  },
};

/**
 * @param {number} amount 社会保険料等控除後の給与等の金額（月額）
 * @param {number} dependents 源泉控除対象配偶者＋控除対象扶養親族の数
 * @param {number} year 支払年
 */
function monthlyKou(amount, dependents = 0, year = 2026) {
  const p = PARAMS[year] || PARAMS[Math.max(...Object.keys(PARAMS).map(Number))];
  const a = Math.max(0, Math.floor(amount));
  const b = Math.max(0, a - p.kyuyoKojo(a) - p.perDependent * dependents - p.kisoKojo(a));
  const [, rate, minus] = p.brackets.find(([upper]) => b <= upper);
  const raw = b * rate - minus;
  const tax = Math.max(0, Math.round(raw / 10) * 10); // 10円未満四捨五入
  return { tax, taxableBase: b, method: `電算機計算の特例 ${p.label}` };
}

module.exports = { monthlyKou, PARAMS };
