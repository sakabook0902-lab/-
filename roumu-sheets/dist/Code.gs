// ============================================================
// 勤怠・給与計算・労務手続き管理（Googleスプレッドシート版）
// このファイルは scripts/build.js で自動生成しています。直接編集せず、
// roumu-sheets/src/ と roumu/src/lib/ を編集してからビルドしてください。
// 生成日時: 2026-11-14T07:10:00.074Z
// ============================================================

// ---- 計算ロジック（Node版と共通のモジュールを読み込み順に依存しない形で登録） ----
var __mods = __mods || {};
var __cache = __cache || {};
function __req(name) {
  name = String(name).replace(/^.*\//, '').replace(/\.js$/, '');
  if (__cache[name]) return __cache[name].exports;
  if (!__mods[name]) throw new Error('module not found: ' + name);
  var m = { exports: {} };
  __cache[name] = m;
  __mods[name](m, m.exports, __req);
  return m.exports;
}

// ---- lib/dates.js ----
__mods['dates'] = function (module, exports, require) {
// 日付ユーティリティ（すべて 'YYYY-MM-DD' / 'YYYY-MM' の文字列で扱う。タイムゾーンのずれを避けるためUTCで計算）

function parse(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(str, n) {
  const d = parse(str);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

// 月末を超える場合は月末に丸める（例: 1/31 + 1ヶ月 = 2/28）
function addMonths(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = daysInMonth(fmt(target).slice(0, 7));
  target.setUTCDate(Math.min(d, last));
  return fmt(target);
}

function addYears(str, n) {
  return addMonths(str, n * 12);
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ymAdd(ym, n) {
  return addMonths(`${ym}-01`, n).slice(0, 7);
}

function monthDates(ym) {
  const n = daysInMonth(ym);
  const out = [];
  for (let i = 1; i <= n; i++) out.push(`${ym}-${String(i).padStart(2, '0')}`);
  return out;
}

function weekday(str) {
  return parse(str).getUTCDay(); // 0=日
}

// 翌月10日（雇用保険資格取得届・住民税異動届などの期限）
function nextMonth10th(str) {
  return `${ymAdd(str.slice(0, 7), 1)}-10`;
}

// 年齢到達日（民法上、誕生日の前日に年齢が加算される）
function ageReachDate(birth, age) {
  return addDays(addYears(birth, age), -1);
}

function ageOn(birth, dateStr) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = dateStr.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function nowJst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

module.exports = {
  parse, fmt, addDays, addMonths, addYears, daysInMonth, ymAdd, monthDates, weekday,
  nextMonth10th, ageReachDate, ageOn, diffDays, WEEKDAYS, nowJst,
};

};

// ---- lib/standardRemuneration.js ----
__mods['standardRemuneration'] = function (module, exports, require) {
// 標準報酬月額表（健康保険 1〜50等級 / 厚生年金 1〜32等級）
// 等級区分は令和2年9月以降の表に基づく。改定があった場合はこの表を更新すること。

// [健保等級, 標準報酬月額, 報酬月額の下限（以上）]
const HEALTH_TABLE = [
  [1, 58000, 0], [2, 68000, 63000], [3, 78000, 73000], [4, 88000, 83000],
  [5, 98000, 93000], [6, 104000, 101000], [7, 110000, 107000], [8, 118000, 114000],
  [9, 126000, 122000], [10, 134000, 130000], [11, 142000, 138000], [12, 150000, 146000],
  [13, 160000, 155000], [14, 170000, 165000], [15, 180000, 175000], [16, 190000, 185000],
  [17, 200000, 195000], [18, 220000, 210000], [19, 240000, 230000], [20, 260000, 250000],
  [21, 280000, 270000], [22, 300000, 290000], [23, 320000, 310000], [24, 340000, 330000],
  [25, 360000, 350000], [26, 380000, 370000], [27, 410000, 395000], [28, 440000, 425000],
  [29, 470000, 455000], [30, 500000, 485000], [31, 530000, 515000], [32, 560000, 545000],
  [33, 590000, 575000], [34, 620000, 605000], [35, 650000, 635000], [36, 680000, 665000],
  [37, 710000, 695000], [38, 750000, 730000], [39, 790000, 770000], [40, 830000, 810000],
  [41, 880000, 855000], [42, 930000, 905000], [43, 980000, 955000], [44, 1030000, 1005000],
  [45, 1090000, 1055000], [46, 1150000, 1115000], [47, 1210000, 1175000], [48, 1270000, 1235000],
  [49, 1330000, 1295000], [50, 1390000, 1355000],
];

function lookupHealth(monthlyAmount) {
  let row = HEALTH_TABLE[0];
  for (const r of HEALTH_TABLE) if (monthlyAmount >= r[2]) row = r;
  return { grade: row[0], standard: row[1] };
}

// 厚生年金は健保4等級(88,000円)〜35等級(650,000円)が1〜32等級に対応
function lookupPension(monthlyAmount) {
  const h = lookupHealth(monthlyAmount);
  const g = Math.min(Math.max(h.grade, 4), 35);
  const row = HEALTH_TABLE[g - 1];
  return { grade: g - 3, standard: row[1] };
}

function healthGradeOf(standard) {
  const r = HEALTH_TABLE.find((x) => x[1] === standard);
  return r ? r[0] : null;
}

module.exports = { HEALTH_TABLE, lookupHealth, lookupPension, healthGradeOf };

};

// ---- lib/withholding.js ----
__mods['withholding'] = function (module, exports, require) {
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

};

// ---- lib/attendance.js ----
__mods['attendance'] = function (module, exports, require) {
// 勤怠計算：日次の実働・法定時間外・深夜・法定休日労働、月次集計、36協定チェック
const { weekday, parse, fmt } = require('./dates');

function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtHours(min) {
  const sign = min < 0 ? '-' : '';
  const v = Math.abs(Math.round(min));
  return `${sign}${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

// 深夜（22:00〜翌5:00）と重なる分数。退勤が出勤より前なら日跨ぎとみなす
function nightMinutes(inMin, outMin) {
  let total = 0;
  const windows = [[0, 300], [1320, 1740], [2760, 3180]]; // 0-5時, 22-29時, 翌22時-翌29時
  for (const [s, e] of windows) {
    total += Math.max(0, Math.min(outMin, e) - Math.max(inMin, s));
  }
  return total;
}

/**
 * 1日分の計算
 * @param rec {work_date, clock_in, clock_out, break_minutes}
 * @param settings {legal_holiday_weekday, daily_legal_minutes}
 */
function calcDay(rec, settings) {
  const inMin = toMin(rec.clock_in);
  let outMin = toMin(rec.clock_out);
  const isLegalHoliday = weekday(rec.work_date) === Number(settings.legal_holiday_weekday);
  const empty = { worked: 0, overtime: 0, night: 0, holiday: 0, regular: 0, isLegalHoliday, complete: false };
  if (inMin === null || outMin === null) return empty;
  if (outMin <= inMin) outMin += 1440;
  const breakMin = Number(rec.break_minutes || 0);
  const worked = Math.max(0, outMin - inMin - breakMin);
  // 休憩時間帯の記録がないため、深夜時間は休憩を差し引かずに算出（深夜帯に休憩がある場合は手修正）
  const night = Math.min(worked, nightMinutes(inMin, outMin));
  const dailyLimit = Number(settings.daily_legal_minutes || 480);
  if (isLegalHoliday) {
    return { worked, overtime: 0, night, holiday: worked, regular: 0, isLegalHoliday, complete: true };
  }
  const overtime = Math.max(0, worked - dailyLimit);
  return { worked, overtime, night, holiday: 0, regular: worked - overtime, isLegalHoliday, complete: true };
}

/**
 * 月次集計（週40時間超の判定のため、月初を含む週の前月分レコードも渡すこと）
 * @param records 日付昇順でなくてもよい
 * @param ym 'YYYY-MM'
 */
function summarizeMonth(records, ym, settings) {
  const sorted = [...records].sort((a, b) => a.work_date.localeCompare(b.work_date));
  const weeklyLimit = Number(settings.weekly_legal_minutes || 2400);
  const days = [];
  const weekRegular = {}; // 週の起算日（日曜）→ 累計の所定内実働
  const sum = { worked: 0, overtime: 0, weeklyOvertime: 0, night: 0, holiday: 0, workDays: 0, incomplete: 0 };

  for (const rec of sorted) {
    const c = calcDay(rec, settings);
    const d = parse(rec.work_date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const wk = fmt(d);
    weekRegular[wk] = weekRegular[wk] || 0;
    let weeklyOt = 0;
    if (c.regular > 0) {
      const before = weekRegular[wk];
      weekRegular[wk] += c.regular;
      weeklyOt = Math.max(0, weekRegular[wk] - Math.max(before, weeklyLimit));
    }
    if (!rec.work_date.startsWith(ym)) continue;
    const row = { ...rec, ...c, weeklyOvertime: weeklyOt, totalOvertime: c.overtime + weeklyOt };
    days.push(row);
    if (rec.clock_in && !rec.clock_out) sum.incomplete++;
    if (!c.complete) continue;
    sum.workDays++;
    sum.worked += c.worked;
    sum.overtime += c.overtime + weeklyOt;
    sum.weeklyOvertime += weeklyOt;
    sum.night += c.night;
    sum.holiday += c.holiday;
  }
  // 月60時間超の時間外は割増率50%以上（2023年4月から中小企業も適用）
  sum.overtimeUpTo60 = Math.min(sum.overtime, 3600);
  sum.overtimeOver60 = Math.max(0, sum.overtime - 3600);
  return { days, summary: sum };
}

/**
 * 36協定の上限チェック（一般条項＋特別条項の法定上限）
 * @param months [{ym, overtime, holiday}] 分単位、古い順。最後が対象月
 */
function check36(months, settings) {
  const alerts = [];
  const cur = months[months.length - 1];
  if (!cur) return alerts;
  const monthLimit = Number(settings.agreement36_monthly_hours || 45) * 60;
  const ot = cur.overtime;
  const otHol = cur.overtime + cur.holiday;
  if (ot > monthLimit) alerts.push({ level: 'danger', msg: `時間外 ${fmtHours(ot)} が36協定の月上限（${monthLimit / 60}時間）を超過。特別条項の適用手続きを確認してください` });
  else if (ot > monthLimit * 0.8) alerts.push({ level: 'warn', msg: `時間外 ${fmtHours(ot)}：月上限（${monthLimit / 60}時間）の80%超` });
  if (otHol >= 6000) alerts.push({ level: 'danger', msg: `時間外＋休日労働 ${fmtHours(otHol)}：法定上限（月100時間未満）に抵触` });
  for (let n = 2; n <= 6; n++) {
    if (months.length < n) break;
    const slice = months.slice(-n);
    const avg = slice.reduce((s, m) => s + m.overtime + m.holiday, 0) / n;
    if (avg > 4800) {
      alerts.push({ level: 'danger', msg: `直近${n}ヶ月平均の時間外＋休日労働 ${fmtHours(avg)}：法定上限（平均80時間以内）を超過` });
      break;
    }
  }
  return alerts;
}

module.exports = { toMin, fmtHours, calcDay, summarizeMonth, check36, nightMinutes };

};

// ---- lib/leave.js ----
__mods['leave'] = function (module, exports, require) {
// 年次有給休暇：法定付与日数の自動計算、残日数（古い付与分から消化・2年で時効）、年5日取得義務のチェック
// 対象は週5日以上（または週30時間以上）勤務の通常の労働者。比例付与・前倒し付与には未対応。
const { addMonths, addYears, diffDays } = require('./dates');

const GRANT_DAYS = [10, 11, 12, 14, 16, 18, 20];

function grantSchedule(hireDate, untilDate) {
  const grants = [];
  let i = 0;
  let date = addMonths(hireDate, 6);
  while (date <= untilDate) {
    grants.push({ date, days: GRANT_DAYS[Math.min(i, GRANT_DAYS.length - 1)], expires: addYears(date, 2) });
    i++;
    date = addYears(addMonths(hireDate, 6), i);
  }
  return grants;
}

/**
 * @param hireDate 入社日
 * @param usages [{leave_date, days}] 取得実績
 * @param today 基準日
 */
function leaveStatus(hireDate, usages, today) {
  const grants = grantSchedule(hireDate, today).map((g) => ({ ...g, used: 0 }));
  const sorted = [...usages].sort((a, b) => a.leave_date.localeCompare(b.leave_date));
  const unassigned = [];
  for (const u of sorted) {
    let remaining = Number(u.days);
    for (const g of grants) {
      if (remaining <= 0) break;
      if (u.leave_date < g.date || u.leave_date >= g.expires) continue;
      const take = Math.min(remaining, g.days - g.used);
      g.used += take;
      remaining -= take;
    }
    if (remaining > 0) unassigned.push({ ...u, days: remaining });
  }
  const valid = grants.filter((g) => g.expires > today);
  const balance = valid.reduce((s, g) => s + g.days - g.used, 0);

  // 年5日取得義務：直近の付与日（10日以上）から1年間に5日取得させる必要がある
  let obligation = null;
  const latest = grants.filter((g) => g.days >= 10 && g.date <= today).pop();
  if (latest) {
    const periodEnd = addYears(latest.date, 1);
    const taken = sorted
      .filter((u) => u.leave_date >= latest.date && u.leave_date < periodEnd)
      .reduce((s, u) => s + Number(u.days), 0);
    const daysLeft = diffDays(today, periodEnd);
    let level = 'ok';
    if (taken < 5) {
      if (daysLeft <= 60) level = 'danger';
      else if (daysLeft <= 120) level = 'warn';
    }
    obligation = { periodStart: latest.date, periodEnd, taken, required: 5, daysLeft, level };
  }
  const next = grantSchedule(hireDate, addYears(today, 2)).find((g) => g.date > today) || null;
  return { grants, balance, obligation, unassigned, nextGrant: next };
}

module.exports = { grantSchedule, leaveStatus, GRANT_DAYS };

};

// ---- lib/payroll.js ----
__mods['payroll'] = function (module, exports, require) {
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
 * @param input 月ごとの入力 {incentive, absenceDays, otherAllowance, otherDeduction, withholdingOverride, note}
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

};

// ---- lib/procedures.js ----
__mods['procedures'] = function (module, exports, require) {
// 労務手続きのタスク自動生成（期限は法令・各制度の一般的な提出期限に基づく）
// ※ 本システムは「やるべき手続きと期限の管理」を自動化するもの。
//   社会保険・労働保険の書類作成・提出を報酬を得て代行できるのは社会保険労務士のみ（社労士法27条）。
//   提出は自社の担当者または顧問社労士が行う前提。
const { addDays, addMonths, nextMonth10th, ymAdd } = require('./dates');
const { lookupHealth, healthGradeOf } = require('./standardRemuneration');

function hireTasks(emp) {
  const d = emp.hire_date;
  const t = [
    { key: 'contract', title: '労働条件通知書の交付・雇用契約書の締結', due: d, category: '入社', basis: '労基法15条' },
    { key: 'docs', title: '入社書類の回収（扶養控除等申告書・マイナンバー・振込口座・年金手帳/基礎年金番号）', due: d, category: '入社', basis: '' },
    { key: 'roster', title: '労働者名簿への登録内容の確認', due: d, category: '入社', basis: '労基法107条' },
    { key: 'health_check', title: '雇入れ時の健康診断（入社前3ヶ月以内の診断書で代替可）', due: d, category: '入社', basis: '安衛則43条' },
  ];
  if (emp.social_insurance) {
    t.push({ key: 'shakai_get', title: '健康保険・厚生年金保険 被保険者資格取得届', due: addDays(d, 5), category: '入社', basis: '入社日から5日以内' });
    if (Number(emp.dependents) > 0) {
      t.push({ key: 'fuyou', title: '健康保険 被扶養者（異動）届', due: addDays(d, 5), category: '入社', basis: '入社日から5日以内' });
    }
  }
  if (emp.employment_insurance) {
    t.push({ key: 'koyou_get', title: '雇用保険 被保険者資格取得届', due: nextMonth10th(d), category: '入社', basis: '入社月の翌月10日まで' });
  }
  t.push({ key: 'jumin', title: '住民税の特別徴収への切替確認（前職の給与所得者異動届出書）', due: addDays(d, 30), category: '入社', basis: '' });
  t.push({ key: 'prev_withholding', title: '前職の源泉徴収票の回収（年末調整用）', due: `${d.slice(0, 4)}-11-30`, category: '入社', basis: '中途入社の場合' });
  return t.map((x) => ({ ...x, source_key: `hire:${emp.id}:${x.key}` }));
}

function leaveTasks(emp) {
  const d = emp.leave_date;
  const t = [
    { key: 'last_pay', title: '最終給与の計算（社会保険料の控除月・有給残日数の確認）', due: d, category: '退職', basis: '' },
    { key: 'card', title: '健康保険証（資格確認書）の回収', due: addDays(d, 5), category: '退職', basis: '' },
  ];
  if (emp.social_insurance) {
    t.push({ key: 'shakai_loss', title: '健康保険・厚生年金保険 被保険者資格喪失届', due: addDays(d, 5), category: '退職', basis: '退職日の翌日（喪失日）から5日以内' });
  }
  if (emp.employment_insurance) {
    t.push({ key: 'koyou_loss', title: '雇用保険 被保険者資格喪失届・離職証明書', due: addDays(d, 11), category: '退職', basis: '喪失日の翌日から10日以内' });
  }
  t.push({ key: 'gensen', title: '退職者への源泉徴収票の交付', due: addMonths(d, 1), category: '退職', basis: '退職日から1ヶ月以内（所得税法226条）' });
  t.push({ key: 'jumin_ido', title: '住民税 給与所得者異動届出書の提出（市区町村）', due: nextMonth10th(d), category: '退職', basis: '退職月の翌月10日まで' });
  return t.map((x) => ({ ...x, employee_id: emp.id, source_key: `leave:${emp.id}:${x.key}` }));
}

function annualTasks(year, settings = {}) {
  const t = [
    { key: 'jumin_notice', title: `住民税 特別徴収税額決定通知書の受領・従業員マスタへの登録（${year}年6月支給分から反映）`, due: `${year}-05-31`, basis: '' },
    { key: 'nendo', title: `労働保険 年度更新（${year}年度）`, due: `${year}-07-10`, basis: '6月1日〜7月10日' },
    { key: 'santei', title: `健康保険・厚生年金保険 算定基礎届（${year}年）`, due: `${year}-07-10`, basis: '7月1日〜7月10日（4〜6月の報酬で算定）' },
    { key: 'nencho', title: `年末調整（${year}年分）`, due: `${year}-12-31`, basis: '本年最後の給与支払時' },
    { key: 'houtei', title: `給与支払報告書・法定調書合計表の提出（${year}年分）`, due: `${year + 1}-01-31`, basis: '翌年1月31日まで' },
  ];
  if (settings.agreement36_expiry) {
    t.push({ key: '36', title: '36協定の再締結・労働基準監督署への届出', due: addDays(settings.agreement36_expiry, -30), basis: `現協定の有効期限 ${settings.agreement36_expiry}` });
  }
  return t.map((x) => ({ ...x, category: '年次', source_key: `annual:${year}:${x.key}${x.key === '36' ? ':' + settings.agreement36_expiry : ''}` }));
}

/**
 * 随時改定（月額変更届）の判定
 * 固定的賃金の変動月から3ヶ月の報酬平均で、現在の標準報酬と2等級以上の差があり、
 * 3ヶ月とも支払基礎日数17日以上なら届出対象。
 * @param change {effective_ym} 変動後の賃金が初めて支給された月（支給月ベース）
 * @param payrolls [{pay_ym, remuneration, base_days}] 確定済み
 * @param currentStd 現在の健保標準報酬月額
 */
function checkGetsuhen(change, payrolls, currentStd) {
  const months = [0, 1, 2].map((i) => ymAdd(change.effective_ym, i));
  const rows = months.map((m) => payrolls.find((p) => p.pay_ym === m));
  if (rows.some((r) => !r)) return { status: 'waiting', months };
  if (rows.some((r) => r.base_days < 17)) return { status: 'not_applicable', reason: '支払基礎日数17日未満の月あり', months };
  const avg = Math.floor(rows.reduce((s, r) => s + r.remuneration, 0) / 3);
  const next = lookupHealth(avg);
  const curGrade = healthGradeOf(currentStd);
  const diff = curGrade ? next.grade - curGrade : null;
  return {
    status: diff !== null && Math.abs(diff) >= 2 ? 'required' : 'not_required',
    avg, newStd: next.standard, newGrade: next.grade, curGrade, diff, months,
    revisionYm: ymAdd(change.effective_ym, 3),
  };
}

/**
 * 算定基礎（定時決定）：4〜6月のうち支払基礎日数17日以上の月の報酬平均
 */
function santei(payrolls, year) {
  const months = ['04', '05', '06'].map((m) => `${year}-${m}`);
  const rows = months.map((m) => payrolls.find((p) => p.pay_ym === m)).filter(Boolean);
  const valid = rows.filter((r) => r.base_days >= 17);
  if (!valid.length) return { valid: 0, months };
  const avg = Math.floor(valid.reduce((s, r) => s + r.remuneration, 0) / valid.length);
  return { valid: valid.length, avg, ...lookupHealth(avg), months };
}

module.exports = { hireTasks, leaveTasks, annualTasks, checkGetsuhen, santei };

};

// ---- 画面（HTML） ----
var HTML_PUNCH = "<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<style>\n  :root { --bg:#f5f6f8; --panel:#fff; --border:#dfe3e8; --text:#1f2933; --muted:#6b7280; --ok:#16a34a; --danger:#dc2626; --accent:#2563eb; }\n  * { box-sizing: border-box; }\n  body { margin:0; font-family:\"Hiragino Sans\",\"Yu Gothic\",\"Segoe UI\",sans-serif; background:var(--bg); color:var(--text); }\n  .wrap { max-width:460px; margin:0 auto; padding:16px; }\n  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:20px; text-align:center; }\n  .company { color:var(--muted); font-size:.85rem; }\n  .clock { font-size:3rem; font-weight:700; font-variant-numeric:tabular-nums; margin:4px 0; }\n  .date { color:var(--muted); margin-bottom:14px; }\n  .who { font-size:1.15rem; font-weight:700; margin-bottom:10px; }\n  input, select { width:100%; padding:12px; font-size:1.05rem; border:1px solid var(--border); border-radius:8px; margin-bottom:10px; font-family:inherit; }\n  .btns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }\n  button { padding:18px; font-size:1.1rem; border:none; border-radius:10px; color:#fff; cursor:pointer; font-family:inherit; }\n  button:disabled { opacity:.5; }\n  .in { background:var(--ok); } .out { background:var(--danger); } .brk { background:#64748b; }\n  .msg { margin-top:14px; padding:10px; border-radius:8px; display:none; }\n  .msg.ok { display:block; background:#ecfdf5; border:1px solid var(--ok); color:#065f46; }\n  .msg.err { display:block; background:#fef2f2; border:1px solid var(--danger); color:var(--danger); }\n  .status { margin-top:16px; text-align:left; font-size:.9rem; background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:12px; display:none; }\n  .status b { display:inline-block; min-width:110px; color:var(--muted); font-weight:normal; }\n  .small { color:var(--muted); font-size:.8rem; margin-top:12px; }\n  .link { background:none; color:var(--accent); padding:6px; font-size:.85rem; }\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <div class=\"card\">\n    <div class=\"company\" id=\"company\">&nbsp;</div>\n    <div class=\"clock\" id=\"clock\">--:--</div>\n    <div class=\"date\" id=\"date\"></div>\n    <div class=\"who\" id=\"who\" style=\"display:none\"></div>\n    <div id=\"pinArea\" style=\"display:none\">\n      <input id=\"code\" placeholder=\"社員番号\" inputmode=\"numeric\" autocomplete=\"off\">\n      <input id=\"pin\" type=\"password\" placeholder=\"PIN\" inputmode=\"numeric\" autocomplete=\"off\">\n    </div>\n    <select id=\"place\">\n      <option value=\"\">勤務場所（登録拠点）</option>\n      <option>五反田</option><option>赤坂</option><option>リモート</option><option>その他</option>\n    </select>\n    <div class=\"btns\">\n      <button class=\"in\" data-a=\"in\">出勤</button>\n      <button class=\"out\" data-a=\"out\">退勤</button>\n      <button class=\"brk\" data-a=\"break_start\">休憩開始</button>\n      <button class=\"brk\" data-a=\"break_end\">休憩終了</button>\n    </div>\n    <div class=\"msg\" id=\"msg\"></div>\n    <div class=\"status\" id=\"status\"></div>\n    <div id=\"checkArea\" style=\"display:none\"><button class=\"link\" id=\"checkBtn\">今月の勤務状況を見る</button></div>\n    <div class=\"small\">打刻の修正が必要な場合は総務に連絡してください。</div>\n  </div>\n</div>\n<script>\n  var identified = null;\n  function jst() { return new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000); }\n  function tick() {\n    var d = jst();\n    document.getElementById('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);\n    document.getElementById('date').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';\n  }\n  tick(); setInterval(tick, 1000);\n\n  function showMsg(ok, text) { var m = document.getElementById('msg'); m.className = 'msg ' + (ok ? 'ok' : 'err'); m.textContent = text; }\n  function showStatus(s) {\n    if (!s) return;\n    var el = document.getElementById('status');\n    var t = s.today ? (s.today.in ? '出勤 ' + s.today.in : '') + (s.today.breakStart ? '／休憩中（' + s.today.breakStart + '〜）' : '') + (s.today.out ? '／退勤 ' + s.today.out : '') : '未出勤';\n    el.innerHTML = '<div><b>本日</b>' + t + '</div>' +\n      '<div><b>今月の出勤日数</b>' + s.workDays + '日</div>' +\n      '<div><b>今月の実働</b>' + s.worked + '（時間外 ' + s.overtime + '）</div>' +\n      '<div><b>有給の残日数</b>' + s.leaveBalance + '日</div>' +\n      (s.obligation ? '<div><b>有給 年5日</b>取得 ' + s.obligation.taken + ' / 5日（' + s.obligation.periodEnd + ' の前日まで）</div>' : '');\n    el.style.display = 'block';\n  }\n  function setBusy(b) { Array.prototype.forEach.call(document.querySelectorAll('.btns button'), function (x) { x.disabled = b; }); }\n\n  google.script.run.withSuccessHandler(function (r) {\n    document.getElementById('company').textContent = r.company || '';\n    if (r.identified) {\n      identified = r.identified;\n      var w = document.getElementById('who'); w.textContent = r.identified.name + ' さん'; w.style.display = 'block';\n      showStatus(r.status);\n    } else {\n      document.getElementById('pinArea').style.display = 'block';\n      document.getElementById('checkArea').style.display = 'block';\n    }\n  }).withFailureHandler(function (e) { showMsg(false, e.message); document.getElementById('pinArea').style.display = 'block'; }).punchInit();\n\n  Array.prototype.forEach.call(document.querySelectorAll('.btns button'), function (btn) {\n    btn.addEventListener('click', function () {\n      var code = identified ? '' : document.getElementById('code').value.trim();\n      var pin = identified ? '' : document.getElementById('pin').value.trim();\n      if (!identified && (!code || !pin)) { showMsg(false, '社員番号とPINを入力してください'); return; }\n      setBusy(true);\n      google.script.run.withSuccessHandler(function (r) {\n        setBusy(false);\n        showMsg(r.ok, r.msg);\n        if (r.ok) { showStatus(r.status); if (!identified) document.getElementById('pin').value = ''; }\n      }).withFailureHandler(function (e) { setBusy(false); showMsg(false, e.message); })\n        .punch(btn.getAttribute('data-a'), code, pin, document.getElementById('place').value);\n    });\n  });\n\n  document.getElementById('checkBtn').addEventListener('click', function () {\n    var code = document.getElementById('code').value.trim(), pin = document.getElementById('pin').value.trim();\n    if (!code || !pin) { showMsg(false, '社員番号とPINを入力してください'); return; }\n    google.script.run.withSuccessHandler(function (r) {\n      if (!r.ok) { showMsg(false, r.msg); return; }\n      showStatus(r.status);\n    }).myStatus(code, pin);\n  });\n</script>\n</body>\n</html>\n";

// ============================================================
// 本体：シート定義・メニュー・打刻Webアプリ・給与計算・労務タスク・通知
// ============================================================
var Dates = __req('dates');
var Att = __req('attendance');
var Leave = __req('leave');
var Payroll = __req('payroll');
var Proc = __req('procedures');
var SR = __req('standardRemuneration');

// ---------- シート定義 [キー, 見出し, 型] ----------
// 型: text / num / numOrNull / bool / date / time / ym / hours（表示用）
var EARN_LABELS = ['基本給', '役職手当', '固定残業代', '超過残業手当', '休日労働手当', '深夜労働手当', 'インセンティブ', 'インセンティブ割増', 'その他手当', '通勤手当（非課税）', '欠勤控除'];
var DED_LABELS = ['健康保険料', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料', '源泉所得税', '住民税', 'その他控除'];

var SHEETS = {
  dashboard: { name: 'ダッシュボード' },
  settings: { name: '設定' },
  employees: {
    name: '従業員', color: '#2563eb',
    cols: [
      ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['name_kana', 'フリガナ', 'text'], ['email', 'Googleアカウント（メール）', 'text'],
      ['birth_date', '生年月日', 'date'], ['gender', '性別', 'text'], ['address', '住所', 'text'], ['job', '従事する業務', 'text'],
      ['location', '拠点', 'text'], ['employment_type', '雇用形態', 'text'], ['hire_date', '入社日', 'date'], ['leave_date', '退職日', 'date'],
      ['leave_reason', '退職事由', 'text'], ['pin', '打刻PIN', 'text'], ['base_salary', '基本給', 'num'], ['position_allowance', '役職手当', 'num'],
      ['commute_allowance', '通勤手当', 'num'], ['fixed_ot_pay', '固定残業代', 'num'], ['fixed_ot_hours', '固定残業時間', 'num'],
      ['social_insurance', '社会保険加入', 'bool'], ['employment_insurance', '雇用保険加入', 'bool'], ['health_std', '健保標準報酬月額', 'numOrNull'],
      ['pension_std', '厚年標準報酬月額', 'numOrNull'], ['tax_column', '税区分（甲/乙）', 'text'], ['dependents', '扶養人数（源泉）', 'num'],
      ['resident_tax_june', '住民税6月分', 'num'], ['resident_tax_monthly', '住民税7月〜翌5月分', 'num'], ['slip_consent', '明細メール配信の同意', 'bool'],
    ],
  },
  attendance: {
    name: '勤怠', color: '#16a34a',
    cols: [
      ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['work_date', '日付', 'date'], ['clock_in', '出勤', 'time'], ['clock_out', '退勤', 'time'],
      ['break_minutes', '休憩（分）', 'num'], ['break_start', '休憩中（開始時刻）', 'time'], ['work_place', '勤務場所', 'text'], ['note', '備考', 'text'], ['edited', '手修正', 'bool'],
    ],
  },
  leaves: {
    name: '有給取得', color: '#16a34a',
    cols: [['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['leave_date', '取得日', 'date'], ['days', '日数（1 / 0.5）', 'num'], ['note', '備考', 'text']],
  },
  payInput: {
    name: '給与入力', color: '#d97706',
    cols: [
      ['ym', '勤怠月', 'ym'], ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['incentive', 'インセンティブ', 'num'], ['absenceDays', '欠勤日数', 'num'],
      ['otherAllowanceLabel', 'その他手当（名称）', 'text'], ['otherAllowance', 'その他手当（金額）', 'num'], ['otherDeductionLabel', 'その他控除（名称）', 'text'],
      ['otherDeduction', 'その他控除（金額）', 'num'], ['withholdingOverride', '源泉所得税（手入力）', 'text'], ['note', 'メモ', 'text'],
    ],
  },
  payroll: {
    name: '給与', color: '#d97706',
    cols: [['ym', '勤怠月', 'ym'], ['pay_ym', '支給月', 'ym'], ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['status', '状態', 'text']]
      .concat(EARN_LABELS.map(function (l) { return ['e:' + l, l, 'num']; }))
      .concat([['gross', '総支給額', 'num']])
      .concat(DED_LABELS.map(function (l) { return ['d:' + l, l, 'num']; }))
      .concat([
        ['deduction_total', '控除合計', 'num'], ['net', '差引支給額', 'num'], ['work_days', '出勤日数', 'num'], ['worked', '労働時間', 'text'],
        ['overtime', '時間外', 'text'], ['holiday', '法定休日', 'text'], ['night', '深夜', 'text'], ['base_days', '支払基礎日数', 'num'],
        ['remuneration', '報酬月額（社保）', 'num'], ['care', '介護保険対象', 'bool'], ['notes', '要確認事項', 'text'], ['confirmed_at', '確定日時', 'text'], ['pdf', '明細PDF', 'text'],
      ]),
  },
  tasks: {
    name: '労務タスク', color: '#dc2626',
    cols: [
      ['due_date', '期限', 'date'], ['status', '状態', 'text'], ['category', '区分', 'text'], ['title', '手続き', 'text'], ['name', '対象者', 'text'],
      ['basis', '根拠・期限の考え方', 'text'], ['note', 'メモ（提出日など）', 'text'], ['completed_at', '完了日', 'date'], ['key', '管理キー（編集しない）', 'text'],
    ],
  },
  changes: {
    name: '賃金変更履歴', color: '#7c3aed',
    cols: [['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['effective_ym', '変更後の初回支給月', 'ym'], ['detail', '変更内容', 'text'], ['checked', '随時改定 判定済', 'bool'], ['result', '判定結果', 'text']],
  },
  snapshot: {
    name: '_賃金スナップショット', hidden: true,
    cols: [['code', '社員番号', 'text'], ['base_salary', '基本給', 'num'], ['position_allowance', '役職手当', 'num'], ['commute_allowance', '通勤手当', 'num'], ['fixed_ot_pay', '固定残業代', 'num']],
  },
  log: {
    name: '操作ログ', color: '#6b7280',
    cols: [['at', '日時', 'text'], ['actor', '操作者', 'text'], ['action', '操作', 'text'], ['detail', '内容', 'text']],
  },
};

// ---------- 設定項目 ----------
var SETTING_DEFS = [
  ['company_name', '会社名', '株式会社ニジ看護転職', ''],
  ['pay_month_offset', '支給月（勤怠月の何ヶ月後）', '1', '末締め翌月払いなら1、当月払いなら0'],
  ['pay_day', '給与支給日', '25', ''],
  ['daily_legal_minutes', '1日の法定労働時間（分）', '480', ''],
  ['weekly_legal_minutes', '1週の法定労働時間（分）', '2400', ''],
  ['legal_holiday_weekday', '法定休日の曜日（0=日〜6=土）', '0', ''],
  ['monthly_avg_scheduled_hours', '月平均所定労働時間', '160', '（年間所定労働日数×1日の所定労働時間）÷12'],
  ['monthly_scheduled_days', '月平均所定労働日数', '20', '欠勤控除の計算に使用'],
  ['agreement36_monthly_hours', '36協定の月の時間外上限（時間）', '45', ''],
  ['agreement36_expiry', '36協定の有効期限（YYYY-MM-DD）', '', '入力すると期限30日前に再締結タスクを作成'],
  ['health_rate', '【要確認】健康保険料率（%・労使合計）', '9.85', '協会けんぽ東京支部 令和8年3月分〜。公式の保険料額表で必ず確認'],
  ['care_rate', '【要確認】介護保険料率（%・労使合計）', '1.62', '令和8年3月分〜'],
  ['child_support_rate', '【要確認】子ども・子育て支援金率（%・労使合計）', '0.23', '令和8年4月分〜'],
  ['child_support_start_ym', '子ども・子育て支援金の控除開始（支給月）', '2026-05', ''],
  ['pension_rate', '厚生年金保険料率（%・労使合計）', '18.3', ''],
  ['employment_rate_employee', '【要確認】雇用保険料率・労働者負担（%）', '0.5', '令和8年度 一般の事業'],
  ['notify_emails', '通知先メールアドレス（カンマ区切り）', '', '毎朝の通知の送り先'],
  ['slack_webhook', 'Slack Incoming Webhook URL（任意）', '', '設定するとSlackにも通知'],
  ['punch_require_pin', '打刻時に常にPINを求める（TRUE/FALSE）', 'FALSE', 'FALSEならGoogleアカウントで本人確認できた人はPIN不要'],
];

// ============================================================
// シート入出力
// ============================================================
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function ssTz_() { return ss_().getSpreadsheetTimeZone() || 'Asia/Tokyo'; }
function now_() { var n = Dates.nowJst(); return n.date + ' ' + n.time; }
function today_() { return Dates.nowJst().date; }
function pad2_(n) { return ('0' + n).slice(-2); }

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

function normalize_(type, v) {
  if (v === null || v === undefined) v = '';
  switch (type) {
    case 'num': return v === '' ? 0 : Number(v) || 0;
    case 'numOrNull': return v === '' ? null : Number(v) || null;
    case 'bool': return v === true || v === 1 || /^(TRUE|true|○|はい|1|yes)$/.test(String(v).trim());
    case 'date': {
      if (isDate_(v)) return Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd');
      var m = String(v).trim().replace(/[\/.年月]/g, '-').replace(/日$/, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      return m ? m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]) : '';
    }
    case 'ym': {
      if (isDate_(v)) return Utilities.formatDate(v, ssTz_(), 'yyyy-MM');
      var y = String(v).trim().replace(/[\/.年]/g, '-').replace(/月$/, '').match(/^(\d{4})-(\d{1,2})/);
      return y ? y[1] + '-' + pad2_(y[2]) : '';
    }
    case 'time': {
      if (isDate_(v)) return Utilities.formatDate(v, ssTz_(), 'HH:mm');
      var t = String(v).trim().replace('：', ':').match(/^(\d{1,2}):(\d{2})/);
      return t ? pad2_(t[1]) + ':' + t[2] : '';
    }
    default: return isDate_(v) ? Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd') : String(v).trim();
  }
}

function sheet_(key) {
  var sh = ss_().getSheetByName(SHEETS[key].name);
  if (!sh) throw new Error('シート「' + SHEETS[key].name + '」がありません。メニュー「労務 → 初期設定」を実行してください');
  return sh;
}

// シートを読み込み、見出し名で列を対応付けたオブジェクト配列にする（列の並び替えに強い）
function read_(key) {
  var def = SHEETS[key];
  var sh = sheet_(key);
  var values = sh.getDataRange().getValues();
  var header = values[0] || [];
  var idx = def.cols.map(function (c) { return header.indexOf(c[1]); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r.every(function (x) { return x === '' || x === null; })) continue;
    var o = { _row: i + 1 };
    def.cols.forEach(function (c, j) { o[c[0]] = normalize_(c[2], idx[j] >= 0 ? r[idx[j]] : ''); });
    rows.push(o);
  }
  return rows;
}

function toRow_(key, obj, existing) {
  var def = SHEETS[key];
  var sh = sheet_(key);
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return header.map(function (h, i) {
    var col = def.cols.filter(function (c) { return c[1] === h; })[0];
    if (!col || !(col[0] in obj)) return existing ? existing[i] : '';
    var v = obj[col[0]];
    if (col[2] === 'bool') return !!v;
    if (v === null || v === undefined || v === '') return '';
    // 日付・時刻・番号は先頭に ' を付けて文字列として保存（自動で日付型・数値型に変換されるのを防ぐ）
    if (['text', 'date', 'time', 'ym'].indexOf(col[2]) >= 0 && typeof v === 'string') return "'" + v;
    return v;
  });
}

function append_(key, obj) {
  var sh = sheet_(key);
  sh.appendRow(toRow_(key, obj));
}

function update_(key, rowNum, obj) {
  var sh = sheet_(key);
  var range = sh.getRange(rowNum, 1, 1, sh.getLastColumn());
  range.setValues([toRow_(key, obj, range.getValues()[0])]);
}

function log_(action, detail) {
  var actor = '';
  try { actor = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(); } catch (e) { actor = ''; }
  try { append_('log', { at: now_(), actor: actor || '（不明）', action: action, detail: detail || '' }); } catch (e) { /* 初期設定前 */ }
}

function getSettings_() {
  var map = {};
  SETTING_DEFS.forEach(function (d) { map[d[0]] = d[2]; });
  var sh = ss_().getSheetByName(SHEETS.settings.name);
  if (!sh) return map;
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var k = String(values[i][0]).trim();
    if (k) map[k] = isDate_(values[i][2]) ? Utilities.formatDate(values[i][2], ssTz_(), 'yyyy-MM-dd') : String(values[i][2]).trim();
  }
  return map;
}

// ============================================================
// メニュー・初期設定
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('労務')
    .addItem('① 給与を計算（勤怠月を指定）', 'menuCalcPayroll')
    .addItem('② 給与を確定', 'menuConfirmPayroll')
    .addItem('③ 給与明細PDFを作成', 'menuMakeSlips')
    .addItem('④ 給与明細をメール送信（同意者のみ）', 'menuMailSlips')
    .addSeparator()
    .addItem('ダッシュボード・労務タスクを更新', 'menuRefresh')
    .addItem('勤怠の月次集計を見る', 'menuAttendanceSummary')
    .addItem('算定基礎の試算（4〜6月支給）', 'menuSantei')
    .addItem('有給休暇の状況を見る', 'menuLeaveStatus')
    .addSeparator()
    .addItem('毎朝の自動更新・通知を設定', 'menuInstallTrigger')
    .addItem('通知のテスト送信', 'menuTestNotify')
    .addItem('打刻用URLを表示', 'menuShowUrl')
    .addItem('初期設定（シート作成）', 'menuSetup')
    .addSeparator()
    .addItem('デモデータを投入（従業員が空のときのみ）', 'menuSeedDemo')
    .addItem('データをすべて消去（引き渡し前・本番開始前）', 'menuClearData')
    .addToUi();
}

function menuSetup() {
  var ss = ss_();
  Object.keys(SHEETS).forEach(function (key) {
    var def = SHEETS[key];
    var sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (!def.cols) return;
    var header = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var missing = def.cols.filter(function (c) { return header.indexOf(c[1]) < 0; });
    if (missing.length) {
      var start = header.filter(String).length + 1;
      sh.getRange(1, start, 1, missing.length).setValues([missing.map(function (c) { return c[1]; })]);
    }
    var n = sh.getLastColumn();
    sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#f0f2f5');
    sh.setFrozenRows(1);
    // 日付・時刻・番号は文字列として保持（自動変換で値が変わるのを防ぐ）
    def.cols.forEach(function (c) {
      var col = sh.getRange(1, 1, 1, n).getValues()[0].indexOf(c[1]) + 1;
      if (col > 0 && ['text', 'date', 'time', 'ym'].indexOf(c[2]) >= 0) sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
    if (def.color) sh.setTabColor(def.color);
    if (def.hidden) sh.hideSheet();
  });

  // 設定シート
  var st = ss.getSheetByName(SHEETS.settings.name);
  var existing = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  if (!st.getLastRow()) st.getRange(1, 1, 1, 4).setValues([['キー（編集しない）', '項目', '値', '説明']]);
  SETTING_DEFS.forEach(function (d) { if (existing.indexOf(d[0]) < 0) st.appendRow([d[0], d[1], d[2], d[3]]); });
  st.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f0f2f5');
  st.getRange(2, 3, st.getMaxRows() - 1, 1).setNumberFormat('@');
  st.setFrozenRows(1);
  st.setColumnWidth(2, 320).setColumnWidth(3, 260).setColumnWidth(4, 420);
  st.setTabColor('#6b7280');

  // 誤操作防止（警告のみ。総務は編集可能）
  ['payroll', 'log', 'snapshot'].forEach(function (k) {
    var sh = sheet_(k);
    if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setDescription('自動作成シート').setWarningOnly(true);
  });
  var tk = sheet_('tasks');
  var keyCol = SHEETS.tasks.cols.length;
  if (tk.getMaxColumns() >= keyCol) tk.hideColumns(keyCol);

  // 不要な初期シート「シート1」を削除
  var def1 = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def1 && def1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def1);
  ss.setActiveSheet(ss.getSheetByName(SHEETS.dashboard.name));
  ss.moveActiveSheet(1);
  log_('初期設定', 'シートを作成・更新');
  refreshAll_();
  ui_alert_('初期設定が完了しました。\n\n1. 「設定」シートの【要確認】の料率を公式資料で確認してください\n2. 「従業員」シートに従業員を入力してください\n3. メニュー「打刻用URLを表示」の手順でWebアプリを公開してください');
}

function ui_alert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function ui_prompt_(msg, def) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(msg + (def ? '\n（空欄のままOKで ' + def + '）' : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  return r.getResponseText().trim() || def;
}

// ============================================================
// 共通データ取得
// ============================================================
function employees_() { return read_('employees').filter(function (e) { return e.code && e.name; }); }

function activeEmployees_(ym) {
  var start = ym + '-01';
  var end = ym + '-' + pad2_(Dates.daysInMonth(ym));
  return employees_().filter(function (e) {
    return e.hire_date && e.hire_date <= end && (!e.leave_date || e.leave_date >= start);
  });
}

function monthAttendance_(code, ym, s, allRecs) {
  var from = Dates.addDays(ym + '-01', -6);
  var to = ym + '-' + pad2_(Dates.daysInMonth(ym));
  var recs = (allRecs || read_('attendance')).filter(function (r) { return r.code === code && r.work_date >= from && r.work_date <= to; });
  return Att.summarizeMonth(recs, ym, s);
}

function alerts36_(code, ym, s, allRecs) {
  var months = [];
  for (var i = 5; i >= 0; i--) {
    var m = Dates.ymAdd(ym, -i);
    var sum = monthAttendance_(code, m, s, allRecs).summary;
    months.push({ ym: m, overtime: sum.overtime, holiday: sum.holiday });
  }
  return Att.check36(months, s);
}

function leaveOf_(emp, allLeaves) {
  var usages = (allLeaves || read_('leaves')).filter(function (l) { return l.code === emp.code && l.leave_date; })
    .map(function (l) { return { leave_date: l.leave_date, days: l.days || 1 }; });
  return Leave.leaveStatus(emp.hire_date, usages, today_());
}

function payYmOf_(ym, s) { return Dates.ymAdd(ym, Number(s.pay_month_offset || 0)); }

// ============================================================
// 打刻Webアプリ
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutput(HTML_PUNCH)
    .setTitle('打刻')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function currentEmail_() {
  try { return (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

// 画面表示時：Googleアカウントで本人を特定できればPIN不要
function punchInit() {
  var s = getSettings_();
  var email = currentEmail_();
  var emp = email ? employees_().filter(function (e) { return e.email && e.email.toLowerCase() === email; })[0] : null;
  var requirePin = String(s.punch_require_pin).toUpperCase() === 'TRUE';
  return {
    company: s.company_name,
    identified: emp && !requirePin ? { name: emp.name, code: emp.code } : null,
    status: emp && !requirePin ? myStatus_(emp, s) : null,
  };
}

function authPunch_(code, pin) {
  var s = getSettings_();
  var requirePin = String(s.punch_require_pin).toUpperCase() === 'TRUE';
  var email = currentEmail_();
  var list = employees_();
  if (!requirePin && email && !code) {
    var me = list.filter(function (e) { return e.email && e.email.toLowerCase() === email; })[0];
    if (me) return me;
  }
  code = String(code || '').trim();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + code;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('PINの入力に続けて失敗したため、約15分間打刻できません。管理者に連絡してください');
  var emp = list.filter(function (e) { return e.code === code; })[0];
  if (!emp || !emp.pin || String(emp.pin) !== String(pin || '').trim()) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('社員番号またはPINが正しくありません');
  }
  cache.remove(failKey);
  return emp;
}

function punch(action, code, pin, place) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var emp = authPunch_(code, pin);
    var n = Dates.nowJst();
    var date = n.date, time = n.time;
    if (emp.leave_date && emp.leave_date < date) throw new Error('退職済みのため打刻できません');
    if (emp.hire_date > date) throw new Error('入社日（' + emp.hire_date + '）より前は打刻できません');
    var recs = read_('attendance');
    var row = recs.filter(function (r) { return r.code === emp.code && r.work_date === date; })[0];
    var toMin = function (hm) { return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)); };
    var msg;
    if (action === 'in') {
      if (row && row.clock_in) throw new Error('本日は ' + row.clock_in + ' に出勤打刻済みです');
      var rec = { code: emp.code, name: emp.name, work_date: date, clock_in: time, break_minutes: 0, work_place: place || emp.location || '' };
      if (row) update_('attendance', row._row, rec); else append_('attendance', rec);
      msg = emp.name + 'さん 出勤 ' + time;
    } else {
      // 日跨ぎ勤務：本日の出勤がなく、前日が退勤未打刻なら前日分として扱う
      if (!row || !row.clock_in) {
        var y = Dates.addDays(date, -1);
        row = recs.filter(function (r) { return r.code === emp.code && r.work_date === y && r.clock_in && !r.clock_out; })[0];
        if (!row) throw new Error('本日の出勤打刻がありません');
      }
      if (row.clock_out) throw new Error('本日は ' + row.clock_out + ' に退勤打刻済みです');
      var since = function (bs) { var m = toMin(time) - toMin(bs); return m < 0 ? m + 1440 : m; };
      if (action === 'break_start') {
        if (row.break_start) throw new Error(row.break_start + ' から休憩中です');
        update_('attendance', row._row, { break_start: time });
        msg = emp.name + 'さん 休憩開始 ' + time;
      } else if (action === 'break_end') {
        if (!row.break_start) throw new Error('休憩開始の打刻がありません');
        update_('attendance', row._row, { break_minutes: row.break_minutes + since(row.break_start), break_start: '' });
        msg = emp.name + 'さん 休憩終了 ' + time;
      } else if (action === 'out') {
        var extra = row.break_start ? since(row.break_start) : 0;
        update_('attendance', row._row, { clock_out: time, break_minutes: row.break_minutes + extra, break_start: '' });
        msg = emp.name + 'さん 退勤 ' + time + '　お疲れさまでした';
      } else {
        throw new Error('不明な操作です');
      }
    }
    return { ok: true, msg: msg, status: myStatus_(emp, getSettings_()) };
  } catch (e) {
    return { ok: false, msg: e.message };
  } finally {
    lock.releaseLock();
  }
}

// 本人の今月の勤務状況（打刻画面に表示）
function myStatus_(emp, s) {
  var ym = Dates.nowJst().date.slice(0, 7);
  var res = monthAttendance_(emp.code, ym, s);
  var lv = leaveOf_(emp);
  var today = res.days.filter(function (d) { return d.work_date === today_(); })[0];
  return {
    ym: ym, workDays: res.summary.workDays, worked: Att.fmtHours(res.summary.worked), overtime: Att.fmtHours(res.summary.overtime),
    leaveBalance: lv.balance, obligation: lv.obligation ? { taken: lv.obligation.taken, periodEnd: lv.obligation.periodEnd } : null,
    today: today ? { in: today.clock_in || '', out: today.clock_out || '', breakStart: today.break_start || '' } : null,
  };
}

function myStatus(code, pin) {
  try { var emp = authPunch_(code, pin); return { ok: true, name: emp.name, status: myStatus_(emp, getSettings_()) }; } catch (e) { return { ok: false, msg: e.message }; }
}

// ============================================================
// 給与計算
// ============================================================
function defaultYm_() { return Dates.ymAdd(today_().slice(0, 7), -1); }

function askYm_(label) {
  var ym = ui_prompt_(label + '（勤怠月を YYYY-MM で入力）', defaultYm_());
  if (!ym) return null;
  ym = normalize_('ym', ym);
  if (!ym) { ui_alert_('YYYY-MM の形式で入力してください'); return null; }
  return ym;
}

function menuCalcPayroll() {
  var ym = askYm_('給与を計算します');
  if (!ym) return;
  var r = calcPayroll(ym);
  ui_alert_(r);
}

function calcPayroll(ym) {
  var s = getSettings_();
  var emps = activeEmployees_(ym);
  // 給与入力シートに対象月の行がない人は空行を追加（インセンティブ等を入力してもらう）
  var inputs = read_('payInput');
  emps.forEach(function (e) {
    if (!inputs.some(function (i) { return i.ym === ym && i.code === e.code; })) append_('payInput', { ym: ym, code: e.code, name: e.name });
  });
  inputs = read_('payInput');
  var pays = read_('payroll');
  var recs = read_('attendance');
  var calculated = 0, skipped = 0, warnings = [];
  emps.forEach(function (e) {
    var existing = pays.filter(function (p) { return p.ym === ym && p.code === e.code; })[0];
    if (existing && existing.status === '確定') { skipped++; return; }
    var inp = inputs.filter(function (i) { return i.ym === ym && i.code === e.code; })[0] || {};
    var input = {
      incentive: inp.incentive, absenceDays: inp.absenceDays, otherAllowance: inp.otherAllowance, otherAllowanceLabel: inp.otherAllowanceLabel,
      otherDeduction: inp.otherDeduction, otherDeductionLabel: inp.otherDeductionLabel,
      withholdingOverride: inp.withholdingOverride === '' || inp.withholdingOverride === undefined ? '' : Number(inp.withholdingOverride),
    };
    var att = monthAttendance_(e.code, ym, s, recs).summary;
    var r = Payroll.calculate({ emp: e, s: s, att: att, input: input, ym: ym, payYm: payYmOf_(ym, s) });
    var row = { ym: ym, pay_ym: r.payYm, code: e.code, name: e.name, status: '下書き', gross: r.gross, deduction_total: r.deductionTotal, net: r.net,
      work_days: att.workDays, worked: Att.fmtHours(att.worked), overtime: Att.fmtHours(att.overtime), holiday: Att.fmtHours(att.holiday), night: Att.fmtHours(att.night),
      base_days: r.baseDays, remuneration: r.remuneration, care: r.care, notes: r.lines.notes.join(' / '), confirmed_at: '', pdf: '' };
    EARN_LABELS.forEach(function (l) { row['e:' + l] = 0; });
    DED_LABELS.forEach(function (l) { row['d:' + l] = 0; });
    r.lines.earnings.forEach(function (l) { row['e:' + l.label] = l.amount; });
    r.lines.deductions.forEach(function (l) { row['d:' + (l.label.indexOf('健康保険料') === 0 ? '健康保険料' : l.label)] = l.amount; });
    if (existing) update_('payroll', existing._row, row); else append_('payroll', row);
    if (r.lines.notes.length) warnings.push(e.name + '：' + r.lines.notes.join(' / '));
    calculated++;
  });
  log_('給与計算', ym + '勤怠分 ' + calculated + '名（確定済み' + skipped + '名は対象外）');
  return ym + '勤怠分（' + payYmOf_(ym, s) + '支給）の給与を ' + calculated + '名分計算しました。' +
    (skipped ? '\n確定済みの ' + skipped + '名は再計算していません。' : '') +
    '\n\nインセンティブ・欠勤日数などは「給与入力」シートに入力してから、もう一度この操作を実行してください。' +
    (warnings.length ? '\n\n【要確認】\n' + warnings.join('\n') : '');
}

function menuConfirmPayroll() {
  var ym = askYm_('給与を確定します');
  if (!ym) return;
  var ui = SpreadsheetApp.getUi();
  if (ui.alert(ym + '勤怠分の下書きの給与をすべて確定します。よろしいですか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ui_alert_(confirmPayroll(ym));
}

function confirmPayroll(ym) {
  var pays = read_('payroll').filter(function (p) { return p.ym === ym && p.status === '下書き'; });
  pays.forEach(function (p) { update_('payroll', p._row, { status: '確定', confirmed_at: now_() }); });
  log_('給与確定', ym + '勤怠分 ' + pays.length + '名');
  var g = runGetsuhenCheck_();
  refreshAll_();
  return pays.length + '名分を確定しました。' + (g.length ? '\n\n月額変更届の対象者がいます（労務タスクに登録しました）：\n' + g.join('\n') : '');
}

// 賃金変更履歴と確定済み給与から、月額変更届（随時改定）の要否を判定
function runGetsuhenCheck_() {
  var emps = employees_();
  var pays = read_('payroll').filter(function (p) { return p.status === '確定'; });
  var out = [];
  read_('changes').filter(function (c) { return !c.checked && c.effective_ym; }).forEach(function (c) {
    var emp = emps.filter(function (e) { return e.code === c.code; })[0];
    if (!emp) return;
    var mine = pays.filter(function (p) { return p.code === c.code; }).map(function (p) { return { pay_ym: p.pay_ym, remuneration: p.remuneration, base_days: p.base_days }; });
    var r = Proc.checkGetsuhen(c, mine, emp.health_std || SR.lookupHealth(emp.base_salary).standard);
    if (r.status === 'waiting') return;
    var text = r.status === 'required' ? '届出が必要（' + r.curGrade + '等級→' + r.newGrade + '等級）' : r.status === 'not_required' ? '届出不要（2等級未満の変動）' : '対象外（' + r.reason + '）';
    update_('changes', c._row, { checked: true, result: text });
    if (r.status === 'required') {
      upsertTasks_([{
        key: 'getsuhen:' + c.code + ':' + c.effective_ym, category: '随時改定', name: emp.name, due: r.revisionYm + '-10',
        title: '健康保険・厚生年金保険 月額変更届（' + r.curGrade + '等級→' + r.newGrade + '等級、標準報酬 ' + r.newStd.toLocaleString() + '円）',
        basis: r.months.join('・') + '支給の報酬平均 ' + r.avg.toLocaleString() + '円。' + r.revisionYm + '分から改定。速やかに提出',
      }]);
      out.push(emp.name + '：' + r.curGrade + '等級→' + r.newGrade + '等級');
    }
  });
  return out;
}

// 固定的賃金の変更を検知して賃金変更履歴に記録（従業員シートを直接編集する運用のため、スナップショットと比較）
function detectWageChanges_() {
  var s = getSettings_();
  var snaps = read_('snapshot');
  var fields = { base_salary: '基本給', position_allowance: '役職手当', commute_allowance: '通勤手当', fixed_ot_pay: '固定残業代' };
  var found = [];
  employees_().forEach(function (e) {
    var snap = snaps.filter(function (x) { return x.code === e.code; })[0];
    var cur = { code: e.code, base_salary: e.base_salary, position_allowance: e.position_allowance, commute_allowance: e.commute_allowance, fixed_ot_pay: e.fixed_ot_pay };
    if (!snap) { append_('snapshot', cur); return; }
    var diff = Object.keys(fields).filter(function (k) { return Number(snap[k]) !== Number(cur[k]); });
    if (!diff.length) return;
    var detail = diff.map(function (k) { return fields[k] + ' ' + Number(snap[k]).toLocaleString() + '→' + Number(cur[k]).toLocaleString() + '円'; }).join('、');
    // 変更後の初回支給月は「次に計算する給与の支給月」と仮置き。違う場合は賃金変更履歴シートで修正
    var eff = payYmOf_(today_().slice(0, 7), s);
    append_('changes', { code: e.code, name: e.name, effective_ym: eff, detail: detail, checked: false, result: '' });
    update_('snapshot', snap._row, cur);
    log_('固定的賃金の変更を検知', e.name + '：' + detail + '（' + eff + '支給分から・要確認）');
    found.push(e.name + '：' + detail);
  });
  return found;
}

// ============================================================
// 給与明細
// ============================================================
function slipHtml_(p, s) {
  var y = function (v) { return Number(v || 0).toLocaleString(); };
  var rowsE = EARN_LABELS.filter(function (l) { return p['e:' + l]; }).map(function (l) { return '<tr><td>' + l + '</td><td class="n">' + y(p['e:' + l]) + '</td></tr>'; }).join('');
  var rowsD = DED_LABELS.filter(function (l) { return p['d:' + l]; }).map(function (l) { return '<tr><td>' + (l === '健康保険料' && p.care ? '健康保険料（介護含む）' : l) + '</td><td class="n">' + y(p['d:' + l]) + '</td></tr>'; }).join('');
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  return '<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:11pt;margin:24px}h1{text-align:center;font-size:18pt}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #999;padding:5px 8px}.n{text-align:right}.cols{width:100%}.cols td{border:none;vertical-align:top;width:50%;padding:0 6px}</style></head><body>' +
    '<h1>給与明細書</h1><p><b>' + esc(p.name) + '</b> 様（' + esc(p.code) + '）<br>' + p.pay_ym.replace('-', '年') + '月' + esc(s.pay_day) + '日支給（' + p.ym.replace('-', '年') + '月勤怠分）　' + esc(s.company_name) + '</p>' +
    '<table><tr><th>出勤日数</th><th>労働時間</th><th>時間外</th><th>法定休日</th><th>深夜</th></tr><tr><td>' + p.work_days + '日</td><td>' + p.worked + '</td><td>' + p.overtime + '</td><td>' + p.holiday + '</td><td>' + p.night + '</td></tr></table>' +
    '<table class="cols"><tr><td><h3>支給</h3><table>' + rowsE + '<tr><th>総支給額</th><th class="n">' + y(p.gross) + '</th></tr></table></td>' +
    '<td><h3>控除</h3><table>' + rowsD + '<tr><th>控除合計</th><th class="n">' + y(p.deduction_total) + '</th></tr></table></td></tr></table>' +
    '<table><tr><th style="width:50%">差引支給額</th><th class="n" style="font-size:14pt">' + y(p.net) + ' 円</th></tr></table></body></html>';
}

function slipFolder_(payYm) {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty('slipRootFolderId');
  var root = null;
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder('給与明細（' + getSettings_().company_name + '）');
    props.setProperty('slipRootFolderId', root.getId());
  }
  var it = root.getFoldersByName(payYm);
  return it.hasNext() ? it.next() : root.createFolder(payYm);
}

function menuMakeSlips() {
  var ym = askYm_('確定済みの給与から明細PDFを作成します');
  if (!ym) return;
  ui_alert_(makeSlips(ym));
}

function makeSlips(ym) {
  var s = getSettings_();
  var pays = read_('payroll').filter(function (p) { return p.ym === ym && p.status === '確定'; });
  if (!pays.length) return ym + '勤怠分の確定済み給与がありません。先に「給与を確定」を実行してください';
  var folder = slipFolder_(pays[0].pay_ym);
  pays.forEach(function (p) {
    var blob = Utilities.newBlob(slipHtml_(p, s), 'text/html', 'slip.html').getAs('application/pdf').setName('給与明細_' + p.pay_ym + '_' + p.code + '_' + p.name + '.pdf');
    var old = folder.getFilesByName(blob.getName());
    while (old.hasNext()) old.next().setTrashed(true);
    var file = folder.createFile(blob);
    update_('payroll', p._row, { pdf: file.getUrl() });
  });
  log_('給与明細PDF作成', ym + '勤怠分 ' + pays.length + '名');
  return pays.length + '名分の給与明細PDFを、ドライブのフォルダ「' + folder.getName() + '」に作成しました。\n（「給与」シートの「明細PDF」列にリンクがあります）';
}

function menuMailSlips() {
  var ym = askYm_('給与明細をメールで送信します（「明細メール配信の同意」がTRUEの人のみ）');
  if (!ym) return;
  var ui = SpreadsheetApp.getUi();
  if (ui.alert(ym + '勤怠分の明細PDFを、同意済みの従業員に送信します。よろしいですか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ui_alert_(mailSlips(ym));
}

function mailSlips(ym) {
  var s = getSettings_();
  var emps = employees_();
  var sent = [], skipped = [];
  read_('payroll').filter(function (p) { return p.ym === ym && p.status === '確定'; }).forEach(function (p) {
    var e = emps.filter(function (x) { return x.code === p.code; })[0];
    if (!e || !e.slip_consent || !e.email || !p.pdf) { skipped.push(p.name); return; }
    var id = (p.pdf.match(/[-\w]{25,}/) || [])[0];
    var file = DriveApp.getFileById(id);
    MailApp.sendEmail({
      to: e.email,
      subject: '【' + s.company_name + '】' + p.pay_ym.replace('-', '年') + '月分 給与明細',
      body: e.name + ' さん\n\n' + p.pay_ym.replace('-', '年') + '月' + s.pay_day + '日支給分の給与明細を添付します。\n内容に不明点があれば総務までご連絡ください。\n\n' + s.company_name,
      attachments: [file.getAs('application/pdf')],
    });
    sent.push(p.name);
  });
  log_('給与明細メール送信', ym + '勤怠分 送信' + sent.length + '名');
  return '送信：' + sent.length + '名' + (skipped.length ? '\n未送信（同意なし・メール未登録・PDF未作成）：' + skipped.join('、') : '');
}

// ============================================================
// 労務タスク
// ============================================================
function upsertTasks_(list) {
  var existing = read_('tasks').map(function (t) { return t.key; });
  var n = 0;
  list.forEach(function (t) {
    if (existing.indexOf(t.key) >= 0) return;
    append_('tasks', { due_date: t.due || '', status: '未対応', category: t.category, title: t.title, name: t.name || '全社', basis: t.basis || '', note: '', completed_at: '', key: t.key });
    existing.push(t.key);
    n++;
  });
  return n;
}

function refreshTasks_() {
  var s = getSettings_();
  var t = today_();
  var list = [];
  employees_().forEach(function (e) {
    var emp = { id: e.code, hire_date: e.hire_date, leave_date: e.leave_date, social_insurance: e.social_insurance, employment_insurance: e.employment_insurance, dependents: e.dependents };
    // 入社手続き：入社日が60日前以降の人のみ（既存社員の過去分を大量に作らないため）
    if (e.hire_date && e.hire_date >= Dates.addDays(t, -60)) {
      Proc.hireTasks(emp).forEach(function (x) { list.push({ key: x.source_key, category: x.category, title: x.title, due: x.due, basis: x.basis, name: e.name }); });
    }
    if (e.leave_date && e.leave_date >= Dates.addDays(t, -60)) {
      Proc.leaveTasks(emp).forEach(function (x) { list.push({ key: x.source_key, category: x.category, title: x.title, due: x.due, basis: x.basis, name: e.name }); });
    }
  });
  var y = Number(t.slice(0, 4));
  Proc.annualTasks(y, s).concat(Proc.annualTasks(y + 1, s)).forEach(function (x) {
    if (x.due >= t) list.push({ key: x.source_key, category: x.category, title: x.title, due: x.due, basis: x.basis });
  });
  return upsertTasks_(list);
}

// 「状態」を「完了」にした行に完了日を入れる・並べ替え
function tidyTasks_() {
  var sh = sheet_('tasks');
  read_('tasks').forEach(function (t) {
    if (t.status === '完了' && !t.completed_at) update_('tasks', t._row, { completed_at: today_() });
  });
  if (sh.getLastRow() > 2) {
    var statusCol = 2, dueCol = 1;
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort([{ column: statusCol, ascending: false }, { column: dueCol, ascending: true }]);
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(['未対応', '対応中', '完了'], true).build();
  sh.getRange(2, 2, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

// ============================================================
// ダッシュボード・通知
// ============================================================
function collectAlerts_() {
  var s = getSettings_();
  var t = today_();
  var ym = t.slice(0, 7);
  var recs = read_('attendance');
  var leaves = read_('leaves');
  var emps = activeEmployees_(ym).filter(function (e) { return !e.leave_date || e.leave_date >= t; });
  var soon = Dates.addDays(t, 14);
  var tasks = read_('tasks').filter(function (x) { return x.status !== '完了' && x.due_date && x.due_date <= soon; })
    .sort(function (a, b) { return a.due_date < b.due_date ? -1 : 1; });
  var ot = [], lv = [], missing = [];
  emps.forEach(function (e) {
    alerts36_(e.code, ym, s, recs).forEach(function (a) { ot.push({ level: a.level, text: e.name + '：' + a.msg }); });
    var l = leaveOf_(e, leaves);
    if (l.obligation && l.obligation.level !== 'ok') lv.push({ level: l.obligation.level, text: e.name + '：取得 ' + l.obligation.taken + ' / 5日（' + l.obligation.periodEnd + ' の前日まで・残り' + l.obligation.daysLeft + '日）' });
  });
  var from = Dates.addDays(t, -31);
  recs.filter(function (r) { return r.work_date < t && r.work_date >= from && r.clock_in && !r.clock_out; })
    .forEach(function (r) { missing.push(r.name + '：' + r.work_date + '（出勤 ' + r.clock_in + '）'); });
  var drafts = read_('payroll').filter(function (p) { return p.status === '下書き'; }).length;
  return { t: t, tasks: tasks, ot: ot, lv: lv, missing: missing, drafts: drafts, empCount: emps.length };
}

function buildDashboard_(a) {
  var sh = sheet_('dashboard');
  sh.clear();
  var rows = [];
  var push = function (r, style) { rows.push({ r: r, style: style }); };
  push(['勤怠・給与・労務 ダッシュボード', '', '', '更新：' + now_()], 'title');
  push(['在籍者 ' + a.empCount + '名', '期限超過タスク ' + a.tasks.filter(function (x) { return x.due_date < a.t; }).length + '件', '36協定アラート ' + a.ot.length + '件', '未確定の給与 ' + a.drafts + '件'], 'stat');
  push(['', '', '', ''], '');
  push(['■ 期限が近い労務手続き（2週間以内・超過含む）', '', '', ''], 'h');
  push(['期限', '区分', '手続き', '対象者'], 'th');
  if (!a.tasks.length) push(['なし', '', '', ''], '');
  a.tasks.forEach(function (x) { push([x.due_date + (x.due_date < a.t ? '（超過）' : ''), x.category, x.title, x.name], x.due_date < a.t ? 'danger' : ''); });
  push(['', '', '', ''], '');
  push(['■ 36協定アラート（今月）', '', '', ''], 'h');
  if (!a.ot.length) push(['なし', '', '', ''], '');
  a.ot.forEach(function (x) { push([x.level === 'danger' ? '超過' : '注意', x.text, '', ''], x.level === 'danger' ? 'danger' : 'warn'); });
  push(['', '', '', ''], '');
  push(['■ 有給休暇 年5日取得義務', '', '', ''], 'h');
  if (!a.lv.length) push(['なし', '', '', ''], '');
  a.lv.forEach(function (x) { push([x.level === 'danger' ? '至急' : '注意', x.text, '', ''], x.level === 'danger' ? 'danger' : 'warn'); });
  push(['', '', '', ''], '');
  push(['■ 退勤の打刻漏れ（直近1ヶ月）', '', '', ''], 'h');
  if (!a.missing.length) push(['なし', '', '', ''], '');
  a.missing.forEach(function (x) { push([x, '', '', ''], 'warn'); });

  sh.getRange(1, 1, rows.length, 4).setValues(rows.map(function (x) { return x.r; }));
  rows.forEach(function (x, i) {
    var rg = sh.getRange(i + 1, 1, 1, 4);
    if (x.style === 'title') rg.setFontSize(14).setFontWeight('bold');
    if (x.style === 'stat') rg.setFontWeight('bold').setBackground('#eef2ff');
    if (x.style === 'h') rg.setFontWeight('bold');
    if (x.style === 'th') rg.setBackground('#f0f2f5').setFontWeight('bold');
    if (x.style === 'danger') rg.setBackground('#fee2e2');
    if (x.style === 'warn') rg.setBackground('#fef3c7');
  });
  sh.setColumnWidth(1, 200).setColumnWidth(2, 200).setColumnWidth(3, 520).setColumnWidth(4, 160);
}

function refreshAll_() {
  var created = refreshTasks_();
  tidyTasks_();
  var changes = detectWageChanges_();
  var a = collectAlerts_();
  buildDashboard_(a);
  return { created: created, changes: changes, alerts: a };
}

function menuRefresh() {
  var r = refreshAll_();
  ui_alert_('更新しました。\n新しい労務タスク：' + r.created + '件' + (r.changes.length ? '\n\n固定的賃金の変更を検知しました（賃金変更履歴に記録。初回支給月が違う場合は修正してください）：\n' + r.changes.join('\n') : ''));
}

function notifyText_(a) {
  var lines = [];
  var overdue = a.tasks.filter(function (x) { return x.due_date < a.t; });
  if (overdue.length) { lines.push('■ 期限超過の手続き'); overdue.forEach(function (x) { lines.push('・' + x.due_date + ' ' + x.title + '（' + x.name + '）'); }); }
  var soon = a.tasks.filter(function (x) { return x.due_date >= a.t; });
  if (soon.length) { lines.push('■ 2週間以内の手続き'); soon.forEach(function (x) { lines.push('・' + x.due_date + ' ' + x.title + '（' + x.name + '）'); }); }
  if (a.ot.length) { lines.push('■ 36協定アラート'); a.ot.forEach(function (x) { lines.push('・' + x.text); }); }
  if (a.lv.length) { lines.push('■ 有給休暇 年5日取得義務'); a.lv.forEach(function (x) { lines.push('・' + x.text); }); }
  if (a.missing.length) { lines.push('■ 退勤の打刻漏れ'); a.missing.forEach(function (x) { lines.push('・' + x); }); }
  return lines.join('\n');
}

function sendNotify_(text, force) {
  var s = getSettings_();
  if (!text && !force) return 'お知らせはありません（送信しませんでした）';
  var body = (text || '現在お知らせはありません。') + '\n\nスプレッドシート：' + ss_().getUrl();
  var done = [];
  var to = String(s.notify_emails || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (to.length) { MailApp.sendEmail(to.join(','), '【労務】' + today_() + ' のお知らせ', body); done.push('メール'); }
  if (s.slack_webhook) {
    UrlFetchApp.fetch(s.slack_webhook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: '*【労務】' + today_() + ' のお知らせ*\n' + body }), muteHttpExceptions: true });
    done.push('Slack');
  }
  return done.length ? done.join('・') + 'に送信しました' : '通知先（設定シートのメールアドレス・Slack）が未設定です';
}

// 毎朝の自動実行（トリガーから呼ばれる）
function dailyJob() {
  var r = refreshAll_();
  var text = notifyText_(r.alerts);
  if (r.changes.length) text = '■ 固定的賃金の変更を検知（初回支給月を確認してください）\n・' + r.changes.join('\n・') + (text ? '\n' + text : '');
  sendNotify_(text, false);
}

function menuInstallTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Tokyo').create();
  log_('自動通知の設定', '毎朝8時台');
  ui_alert_('毎朝8時台に、ダッシュボード・労務タスクを更新し、お知らせがあれば通知する設定をしました。\n通知先は「設定」シートの「通知先メールアドレス」「Slack Webhook URL」です。');
}

function menuTestNotify() {
  var a = collectAlerts_();
  ui_alert_(sendNotify_(notifyText_(a), true));
}

// ============================================================
// 参照用ダイアログ
// ============================================================
function showTable_(title, header, rows, note) {
  var esc = function (t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var html = '<style>body{font-family:sans-serif;font-size:13px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px}th{background:#f0f2f5}.d{background:#fee2e2}.w{background:#fef3c7}</style>' +
    '<table><tr>' + header.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' +
    rows.map(function (r) { return '<tr class="' + (r.cls || '') + '">' + r.cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' +
    (note ? '<p style="color:#666">' + esc(note) + '</p>' : '');
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(900).setHeight(520), title);
}

function menuAttendanceSummary() {
  var ym = ui_prompt_('勤怠の月次集計を表示します（YYYY-MM）', today_().slice(0, 7));
  if (!ym) return;
  ym = normalize_('ym', ym);
  var s = getSettings_();
  var recs = read_('attendance');
  var rows = activeEmployees_(ym).map(function (e) {
    var sum = monthAttendance_(e.code, ym, s, recs).summary;
    var al = alerts36_(e.code, ym, s, recs);
    return { cls: al.some(function (a) { return a.level === 'danger'; }) ? 'd' : al.length ? 'w' : '',
      cells: [e.name, sum.workDays, Att.fmtHours(sum.worked), Att.fmtHours(sum.overtime), Att.fmtHours(sum.overtimeOver60), Att.fmtHours(sum.holiday), Att.fmtHours(sum.night), sum.incomplete ? sum.incomplete + '件' : '', al.map(function (a) { return a.msg; }).join(' / ')] };
  });
  showTable_('勤怠 月次集計 ' + ym, ['氏名', '出勤日数', '実働', '時間外', 'うち60h超', '法定休日', '深夜', '打刻漏れ', '36協定'], rows, '時間外＝1日8時間超＋週40時間超（法定休日を除く）');
}

function menuLeaveStatus() {
  var leaves = read_('leaves');
  var rows = activeEmployees_(today_().slice(0, 7)).map(function (e) {
    var l = leaveOf_(e, leaves);
    var ob = l.obligation;
    return { cls: ob && ob.level === 'danger' ? 'd' : ob && ob.level === 'warn' ? 'w' : '',
      cells: [e.name, e.hire_date, l.balance + '日', ob ? ob.taken + ' / 5日' : '-', ob ? ob.periodStart + '〜' + ob.periodEnd + 'の前日' : '-', l.nextGrant ? l.nextGrant.date + '（' + l.nextGrant.days + '日）' : '-'] };
  });
  showTable_('有給休暇の状況（' + today_() + '時点）', ['氏名', '入社日', '残日数', '年5日義務', '義務の対象期間', '次回付与'], rows, '週5日勤務の法定付与日数で計算しています。比例付与・前倒し付与には未対応です。');
}

function menuSantei() {
  var year = Number(ui_prompt_('算定基礎を試算する年（YYYY）', today_().slice(0, 4)));
  if (!year) return;
  var pays = read_('payroll').filter(function (p) { return p.status === '確定'; });
  var rows = employees_().filter(function (e) { return e.social_insurance; }).map(function (e) {
    var mine = pays.filter(function (p) { return p.code === e.code; }).map(function (p) { return { pay_ym: p.pay_ym, remuneration: p.remuneration, base_days: p.base_days }; });
    var r = Proc.santei(mine, year);
    var cur = SR.lookupHealth(e.health_std || 0).grade;
    var pen = r.avg ? SR.lookupPension(r.avg) : null;
    return { cls: r.avg && r.grade !== cur ? 'w' : '',
      cells: [e.name, r.valid + ' / 3', r.avg ? r.avg.toLocaleString() : '-', (e.health_std || 0).toLocaleString() + '（' + cur + '等級）', r.avg ? r.standard.toLocaleString() + '（' + r.grade + '等級）' : '-', pen ? pen.standard.toLocaleString() + '（' + pen.grade + '等級）' : '-'] };
  });
  showTable_('算定基礎の試算 ' + year + '年', ['氏名', '対象月数', '報酬月額（平均）', '現在の健保標準報酬', '新しい健保標準報酬', '新しい厚年標準報酬'], rows, '4〜6月に支給した確定済み給与のうち、支払基礎日数17日以上の月の平均です。');
}

function menuShowUrl() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  var msg = url
    ? '打刻用URL：\n' + url + '\n\n従業員にこのURLを案内し、スマホの「ホーム画面に追加」をしてもらってください。'
    : 'まだWebアプリとして公開されていません。\n\n1. 画面右上「デプロイ」→「新しいデプロイ」\n2. 種類の選択で「ウェブアプリ」\n3. 次のユーザーとして実行：「自分」\n4. アクセスできるユーザー：「（会社名）内の全員」（Google Workspaceの場合）\n5. 「デプロイ」→ 表示されたURLが打刻用URLです';
  ui_alert_(msg);
}

// ============================================================
// 手修正の記録（シート直接編集の監査証跡）
// ============================================================
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var name = sh.getName();
    var watched = [SHEETS.attendance.name, SHEETS.employees.name, SHEETS.payInput.name, SHEETS.leaves.name, SHEETS.settings.name, SHEETS.changes.name];
    if (watched.indexOf(name) < 0 || e.range.getRow() === 1) return;
    var header = sh.getRange(1, e.range.getColumn()).getValue();
    var detail = name + '!' + e.range.getA1Notation() + '（' + header + '）：' + (e.oldValue === undefined ? '' : e.oldValue) + ' → ' + (e.value === undefined ? '（複数セル/削除）' : e.value);
    var who = '';
    try { who = (e.user && e.user.getEmail()) || ''; } catch (x) { who = ''; }
    sh.getParent().getSheetByName(SHEETS.log.name).appendRow([now_(), who || '（シート直接編集）', 'シート編集', detail]);
    // 勤怠シートの時刻を手で直した場合は「手修正」に印を付ける
    if (name === SHEETS.attendance.name) {
      var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      var editedCol = hdr.indexOf('手修正') + 1;
      if (editedCol > 0 && e.range.getColumn() !== editedCol) sh.getRange(e.range.getRow(), editedCol).setValue(true);
    }
  } catch (err) { /* 記録失敗で編集を妨げない */ }
}

// ============================================================
// デモデータ（動作確認用の架空データ）・データ消去
// ============================================================
function menuSeedDemo() {
  if (employees_().length) { ui_alert_('従業員シートにデータがあるため、デモデータは投入しません'); return; }
  var t = today_();
  var ymNow = t.slice(0, 7), ymPrev = Dates.ymAdd(ymNow, -1);
  var demo = [
    { code: '1001', name: '山田 太郎（デモ）', birth_date: '1986-11-02', gender: '男', job: '営業', location: '五反田', employment_type: '正社員', hire_date: '2024-09-01', pin: '1111', base_salary: 300000, position_allowance: 30000, commute_allowance: 15000, fixed_ot_pay: 50000, fixed_ot_hours: 25, social_insurance: true, employment_insurance: true, health_std: 410000, pension_std: 410000, tax_column: '甲', dependents: 2, resident_tax_june: 21300, resident_tax_monthly: 20900 },
    { code: '1002', name: '佐藤 花子（デモ）', birth_date: '1994-04-10', gender: '女', job: 'キャリアアドバイザー', location: '赤坂', employment_type: '正社員', hire_date: '2025-04-01', pin: '2222', base_salary: 250000, commute_allowance: 12000, fixed_ot_pay: 40000, fixed_ot_hours: 20, social_insurance: true, employment_insurance: true, health_std: 300000, pension_std: 300000, tax_column: '甲', dependents: 0, resident_tax_june: 13600, resident_tax_monthly: 13000 },
    { code: '1003', name: '鈴木 一郎（デモ）', birth_date: '1999-08-20', gender: '男', job: 'リクルーティングアドバイザー', location: '五反田', employment_type: '正社員', hire_date: Dates.addDays(t, 2), pin: '3333', base_salary: 230000, commute_allowance: 10000, fixed_ot_pay: 35000, fixed_ot_hours: 20, social_insurance: true, employment_insurance: true, health_std: 280000, pension_std: 280000, tax_column: '甲', dependents: 0, resident_tax_monthly: 9800 },
  ];
  demo.forEach(function (e) { append_('employees', e); });
  var rows = [];
  [ymPrev, ymNow].forEach(function (ym) {
    Dates.monthDates(ym).forEach(function (date) {
      var wd = Dates.weekday(date);
      if (date >= t || wd === 0 || wd === 6) return;
      var i = Number(date.slice(8));
      rows.push(['1001', demo[0].name, date, '09:00', i % 3 === 0 ? '21:30' : '20:00', 60, '', '五反田', '', false]);
      rows.push(['1002', demo[1].name, date, '09:30', i % 4 === 0 ? '22:45' : '19:30', 60, '', i % 2 ? '赤坂' : 'リモート', '', false]);
    });
  });
  var sh = sheet_('attendance');
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows.map(function (r) { return r.map(function (v) { return typeof v === 'string' && v ? "'" + v : v; }); }));
  append_('leaves', { code: '1002', name: demo[1].name, leave_date: ymPrev + '-15', days: 1, note: '私用' });
  log_('デモデータ投入', '架空の従業員3名・2ヶ月分の勤怠');
  refreshAll_();
  ui_alert_('デモデータ（架空の従業員3名・PIN 1111 / 2222 / 3333）を投入しました。\n「労務 → ① 給与を計算」で ' + ymPrev + ' を指定して試してください。');
}

function menuClearData() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('従業員・勤怠・有給・給与・タスク・賃金変更履歴のデータをすべて消去します（設定と操作ログは残ります）。元に戻せません。よろしいですか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var r = ui.prompt('確認のため「消去」と入力してください', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || r.getResponseText().trim() !== '消去') { ui_alert_('中止しました'); return; }
  clearData_();
  ui_alert_('データを消去しました。');
}

function clearData_() {
  ['employees', 'attendance', 'leaves', 'payInput', 'payroll', 'tasks', 'changes', 'snapshot'].forEach(function (k) {
    var sh = sheet_(k);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  buildDashboard_(collectAlerts_());
  log_('データ消去', '従業員・勤怠・有給・給与・タスク・賃金変更履歴');
}
