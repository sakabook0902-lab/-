// ============================================================
// 勤怠・給与計算・労務手続き管理（Googleスプレッドシート版）
// このファイルは scripts/build.js で自動生成しています。直接編集せず、
// roumu-sheets/src/ と roumu/src/lib/ を編集してからビルドしてください。
// 生成日時: 2026-11-15T09:08:27.333Z
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

  // 月の途中で入社・退職した場合（日割の要否は就業規則・賃金規程による）
  const mStart = `${ym}-01`;
  const mEnd = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
  if (emp.hire_date && emp.hire_date > mStart && emp.hire_date <= mEnd) {
    lines.notes.push(`月の途中で入社しています（${emp.hire_date}）。賃金規程に日割の定めがある場合は「欠勤日数」または「その他控除」で調整してください`);
  }
  if (emp.leave_date && emp.leave_date >= mStart && emp.leave_date < mEnd) {
    lines.notes.push(`月の途中で退職しています（${emp.leave_date}）。賃金規程に日割の定めがある場合は「欠勤日数」または「その他控除」で調整してください`);
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

// ---- lib/bonus.js ----
__mods['bonus'] = function (module, exports, require) {
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

};

// ---- lib/yearEnd.js ----
__mods['yearEnd'] = function (module, exports, require) {
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

};

// ---- lib/zengin.js ----
__mods['zengin'] = function (module, exports, require) {
// 全銀協フォーマット（総合振込・種別コード21）のデータ作成
// 1レコード120桁（半角）。文字は半角カナ・英大文字・数字・一部記号。出力時に Shift_JIS・CRLF にすること。

const FULL = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴー';
const HALF = ['ｱ', 'ｱ', 'ｲ', 'ｲ', 'ｳ', 'ｳ', 'ｴ', 'ｴ', 'ｵ', 'ｵ', 'ｶ', 'ｶﾞ', 'ｷ', 'ｷﾞ', 'ｸ', 'ｸﾞ', 'ｹ', 'ｹﾞ', 'ｺ', 'ｺﾞ', 'ｻ', 'ｻﾞ', 'ｼ', 'ｼﾞ', 'ｽ', 'ｽﾞ', 'ｾ', 'ｾﾞ', 'ｿ', 'ｿﾞ',
  'ﾀ', 'ﾀﾞ', 'ﾁ', 'ﾁﾞ', 'ﾂ', 'ﾂ', 'ﾂﾞ', 'ﾃ', 'ﾃﾞ', 'ﾄ', 'ﾄﾞ', 'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾉ', 'ﾊ', 'ﾊﾞ', 'ﾊﾟ', 'ﾋ', 'ﾋﾞ', 'ﾋﾟ', 'ﾌ', 'ﾌﾞ', 'ﾌﾟ', 'ﾍ', 'ﾍﾞ', 'ﾍﾟ', 'ﾎ', 'ﾎﾞ', 'ﾎﾟ',
  'ﾏ', 'ﾐ', 'ﾑ', 'ﾒ', 'ﾓ', 'ﾔ', 'ﾔ', 'ﾕ', 'ﾕ', 'ﾖ', 'ﾖ', 'ﾗ', 'ﾘ', 'ﾙ', 'ﾚ', 'ﾛ', 'ﾜ', 'ﾜ', 'ｲ', 'ｴ', 'ｦ', 'ﾝ', 'ｳﾞ', 'ｰ'];
// 振込データでは小書き文字（ｧ、ｯ等）は使えないため大文字に置き換える（上の対応表で処理済み）

function toZenginKana(str) {
  let s = String(str || '').normalize('NFKC'); // 半角カナ→全角、全角英数→半角
  s = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); // ひらがな→カタカナ
  let out = '';
  for (const c of s) {
    const i = FULL.indexOf(c);
    if (i >= 0) out += HALF[i];
    else if (/[A-Za-z0-9]/.test(c)) out += c.toUpperCase();
    else if (c === ' ' || c === '　') out += ' ';
    else if ('()-./'.includes(c)) out += c;
    else if (c === '（') out += '(';
    else if (c === '）') out += ')';
    else if (c === '・') out += '.';
    // それ以外（漢字など）は使えないため除外
  }
  return out;
}

function padText(v, len) {
  const s = toZenginKana(v);
  return (s + ' '.repeat(len)).slice(0, len);
}

function padNum(v, len) {
  const s = String(Math.floor(Number(v) || 0));
  if (s.length > len) throw new Error(`桁数オーバー: ${s}（${len}桁まで）`);
  return s.padStart(len, '0');
}

function digits(v, len, label) {
  const s = String(v || '').replace(/\D/g, '');
  if (!s) throw new Error(`${label}が未入力です`);
  if (s.length > len) throw new Error(`${label}の桁数が多すぎます（${len}桁まで）: ${v}`);
  return s.padStart(len, '0');
}

const TYPE = { 普通: '1', 当座: '2', 貯蓄: '4' };

/**
 * @param company { clientCode, clientName, bankCode, bankName, branchCode, branchName, accountType, accountNumber }
 * @param payDate 'YYYY-MM-DD'（振込指定日）
 * @param items [{ bankCode, bankName, branchCode, branchName, accountType, accountNumber, holderName, amount, customerCode }]
 * @returns { text, count, total, errors }
 */
function buildTransferFile(company, payDate, items) {
  const errors = [];
  const lines = [];
  const mmdd = payDate.slice(5, 7) + payDate.slice(8, 10);
  try {
    lines.push('1' + '21' + '0' + digits(company.clientCode, 10, '委託者コード') + padText(company.clientName, 40) + mmdd
      + digits(company.bankCode, 4, '会社の銀行番号') + padText(company.bankName, 15) + digits(company.branchCode, 3, '会社の支店番号')
      + padText(company.branchName, 15) + (TYPE[company.accountType] || '1') + digits(company.accountNumber, 7, '会社の口座番号') + ' '.repeat(17));
  } catch (e) {
    errors.push('会社情報：' + e.message);
  }
  let total = 0, count = 0;
  for (const it of items) {
    if (!(Number(it.amount) > 0)) continue;
    try {
      const holder = toZenginKana(it.holderName);
      if (!holder.trim()) throw new Error('受取人名（カナ）が未入力です');
      lines.push('2' + digits(it.bankCode, 4, '銀行番号') + padText(it.bankName, 15) + digits(it.branchCode, 3, '支店番号') + padText(it.branchName, 15)
        + ' '.repeat(4) + (TYPE[it.accountType] || '1') + digits(it.accountNumber, 7, '口座番号') + padText(holder, 30) + padNum(it.amount, 10)
        + '0' + padText(it.customerCode || '', 10) + ' '.repeat(10) + ' ' + ' ' + ' '.repeat(7));
      total += Math.floor(Number(it.amount));
      count++;
    } catch (e) {
      errors.push(`${it.label || it.holderName}：${e.message}`);
    }
  }
  lines.push('8' + padNum(count, 6) + padNum(total, 12) + ' '.repeat(101));
  lines.push('9' + ' '.repeat(119));
  return { text: lines.join('\r\n') + '\r\n', lines, count, total, errors };
}

module.exports = { buildTransferFile, toZenginKana };

};

// ---- lib/filings.js ----
__mods['filings'] = function (module, exports, require) {
// 労務手続きの「記入内容シート」を組み立てる（PDF化は呼び出し側で行う）
// 正式な様式そのものではなく、正式様式の項目順にシステムのデータを当てはめた転記用の資料。
// e-Gov・日本年金機構の届書作成プログラム・正式様式へ転記して提出する前提。
// マイナンバーは保持しないため、常に「本人確認書類から記入」となる。
const { addDays, nextMonth10th, ymAdd } = require('./dates');
const { lookupHealth, lookupPension, healthGradeOf } = require('./standardRemuneration');

const yen = (v) => (v === '' || v === null || v === undefined ? '' : `${Number(v).toLocaleString()}円`);
const jpDate = (d) => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日').replace(/^(\d{4})-(\d{2})$/, '$1年$2月') : '');

// 行 [項目, 値, 補足]。値が空なら要記入として扱う（optional: true は空でもよい）
function row(label, value, hint = '', optional = false) {
  return { label, value: value === null || value === undefined ? '' : String(value), hint, optional };
}

function companySection(c, kind) {
  const rows = [
    row('事業所名称', c.company_name),
    row('事業所所在地', c.company_address),
    row('事業主氏名', c.company_rep),
    row('電話番号', c.company_tel),
  ];
  if (kind === 'shakai') {
    rows.unshift(row('事業所整理記号', c.shakai_office_symbol), row('事業所番号', c.shakai_office_number));
  }
  if (kind === 'koyou') rows.unshift(row('雇用保険 適用事業所番号', c.koyou_office_number));
  if (kind === 'jumin') rows.unshift(row('法人番号', c.corporate_number), row('特別徴収義務者 指定番号', '', '市区町村ごとに異なる。通知書に記載'));
  return { title: '事業所（提出者）', rows };
}

function personRows(e, opts = {}) {
  const rows = [
    row('氏名', e.name),
    row('フリガナ', e.name_kana),
    row('生年月日', jpDate(e.birth_date)),
    row('性別', e.gender),
  ];
  if (opts.myNumber) rows.push(row(opts.myNumberLabel || '個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'));
  if (opts.address) rows.push(row('住所', e.address));
  return rows;
}

function monthlyFixed(e) {
  const n = (v) => Number(v || 0);
  return n(e.base_salary) + n(e.position_allowance) + n(e.commute_allowance) + n(e.fixed_ot_pay);
}

// 給与の行から「支給月・基礎日数・報酬」の表を作る
function remunerationTable(pays, months) {
  const rows = months.map((m) => {
    const p = pays.find((x) => x.pay_ym === m);
    return p ? [jpDate(m), `${p.base_days}日`, yen(p.remuneration), '0円', yen(p.remuneration)] : [jpDate(m), '（給与データなし）', '', '', ''];
  });
  return { head: ['支給月', '支払基礎日数', '通貨によるもの', '現物によるもの', '合計'], rows };
}

const BUILDERS = {
  // ---------- 健康保険・厚生年金保険 被保険者資格取得届 ----------
  shakai_get({ emp: e, company }) {
    const fixed = monthlyFixed(e);
    return {
      title: '健康保険・厚生年金保険 被保険者資格取得届',
      submitTo: '日本年金機構（管轄の年金事務所）／e-Gov電子申請',
      deadline: addDays(e.hire_date, 5),
      deadlineNote: '資格取得日（入社日）から5日以内',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          ...personRows(e, { myNumber: true, myNumberLabel: '個人番号（マイナンバー）または基礎年金番号' }),
          row('住所', e.address, 'マイナンバーを記入しない場合に必要', true),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('被扶養者', '', '健康保険の被扶養者がいれば「有」とし、被扶養者（異動）届を同時に提出（源泉の扶養人数とは基準が異なる）'),
        ] },
        { title: '報酬月額', rows: [
          row('通貨によるもの', yen(fixed), '基本給＋役職手当＋通勤手当＋固定残業代。固定残業代を超える残業・インセンティブの見込額があれば加算'),
          row('現物によるもの', '0円', '社宅・食事の支給などがあれば記入', true),
          row('合計', yen(fixed)),
          row('（参考）見込みの標準報酬月額', `健保 ${yen(lookupHealth(fixed).standard)}（${lookupHealth(fixed).grade}等級）／厚年 ${yen(lookupPension(fixed).standard)}（${lookupPension(fixed).grade}等級）`, '決定は年金事務所が行う', true),
        ] },
        { title: '備考', rows: [
          row('雇用形態', e.employment_type, '短時間労働者・契約社員などは備考欄の該当項目を確認', true),
          row('70歳以上被用者該当', '', '該当する場合のみ', true),
        ] },
      ],
      notes: ['資本金1億円を超える法人（特定の法人）は、資格取得届も含めて電子申請が推奨されます。', '決定通知書が届いたら、標準報酬月額を従業員情報に登録してください。'],
    };
  },

  // ---------- 健康保険・厚生年金保険 被保険者資格喪失届 ----------
  shakai_loss({ emp: e, company }) {
    const lossDate = addDays(e.leave_date, 1);
    return {
      title: '健康保険・厚生年金保険 被保険者資格喪失届',
      submitTo: '日本年金機構（管轄の年金事務所）／e-Gov電子申請',
      deadline: addDays(e.leave_date, 5),
      deadlineNote: '資格喪失日（退職日の翌日）から5日以内',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          row('被保険者整理番号', e.insured_number, '資格取得時の決定通知書・保険証に記載'),
          ...personRows(e, { myNumber: true, myNumberLabel: '個人番号（マイナンバー）または基礎年金番号' }),
          row('喪失年月日', jpDate(lossDate), '退職日の翌日'),
          row('喪失（不該当）原因', `退職等（${jpDate(e.leave_date)} 退職）`),
          row('保険証（資格確認書）の回収', '', '回収した枚数／添付できない枚数を記入（マイナ保険証のみの場合は不要）'),
          row('70歳以上被用者不該当', '', '該当する場合のみ', true),
        ] },
      ],
      notes: ['最終給与で控除する社会保険料は「喪失日の属する月の前月分まで」です。月末退職の場合は退職月分まで控除します。'],
    };
  },

  // ---------- 雇用保険 被保険者資格取得届 ----------
  koyou_get({ emp: e, company }) {
    const wage = monthlyFixed(e);
    const fixedTerm = /契約|パート|アルバイト/.test(e.employment_type || '');
    return {
      title: '雇用保険 被保険者資格取得届',
      submitTo: '管轄のハローワーク／e-Gov電子申請',
      deadline: nextMonth10th(e.hire_date),
      deadlineNote: '資格取得日（入社日）の属する月の翌月10日まで',
      sections: [
        companySection(company, 'koyou'),
        { title: '被保険者', rows: [
          row('個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'),
          row('被保険者番号', e.koyou_number, '前職で雇用保険に加入していた場合は雇用保険被保険者証の番号。初めての場合は空欄', true),
          row('取得区分', e.koyou_number ? '再取得' : '新規', '過去7年以内に加入歴があれば「再取得」'),
          ...personRows(e),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('被保険者となったことの原因', '', '新規学卒／新規（その他）／日雇からの切替／その他 から選択'),
        ] },
        { title: '雇用条件', rows: [
          row('賃金（支払の態様）', '月給'),
          row('賃金月額', `${Math.floor(wage / 1000)}千円`, `${yen(wage)}（基本給・手当・通勤手当・固定残業代の合計。千円未満切捨て）`),
          row('雇用形態', e.employment_type),
          row('職種', e.job),
          row('就職経路', '', '安定所紹介／自己就職／民間紹介 など'),
          row('1週間の所定労働時間', e.weekly_hours ? `${e.weekly_hours}時間` : '', '就業規則・雇用契約書の時間'),
          row('契約期間の定め', fixedTerm ? '有（期間・更新の有無を記入）' : '無'),
        ] },
      ],
      notes: ['手続き後に交付される「雇用保険被保険者証」「資格取得等確認通知書（被保険者通知用）」は本人に渡してください。', '被保険者番号を従業員情報に登録しておくと、退職時の書類に自動で入ります。'],
    };
  },

  // ---------- 雇用保険 被保険者資格喪失届（＋離職証明書の賃金の参考） ----------
  koyou_loss({ emp: e, company, pays = [] }) {
    const companyReason = /会社都合/.test(e.leave_reason || '');
    const months = [];
    for (let i = 0; i < 13; i++) months.push(ymAdd(e.leave_date.slice(0, 7), -i));
    const wageRows = months.map((m) => {
      const p = pays.find((x) => x.ym === m);
      return p ? [jpDate(m) + '勤怠分（' + jpDate(p.pay_ym) + '支給）', `${p.base_days}日`, yen(p.gross)] : null;
    }).filter(Boolean);
    return {
      title: '雇用保険 被保険者資格喪失届（離職証明書の作成資料付き）',
      submitTo: '管轄のハローワーク／e-Gov電子申請',
      deadline: addDays(e.leave_date, 11),
      deadlineNote: '被保険者でなくなった日（退職日の翌日）の翌日から10日以内',
      sections: [
        companySection(company, 'koyou'),
        { title: '被保険者', rows: [
          row('個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'),
          row('被保険者番号', e.koyou_number),
          ...personRows(e),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('離職等年月日', jpDate(e.leave_date)),
          row('喪失原因', companyReason ? '3（事業主の都合による離職）' : '2（3以外の離職：自己都合・契約満了等）', `退職事由：${e.leave_reason || '未登録'}。区分は離職理由に応じて確認`),
          row('離職票の交付希望', '', '本人に確認（59歳以上は希望がなくても離職証明書の提出が必要）'),
          row('1週間の所定労働時間', e.weekly_hours ? `${e.weekly_hours}時間` : ''),
          row('補充採用予定の有無', '', '有／無'),
        ] },
      ],
      table: { title: '離職証明書「賃金支払状況」の作成資料（確定済み給与より）', head: ['賃金支払対象期間', '基礎日数', '賃金額（総支給）'], rows: wageRows },
      notes: ['離職証明書は離職日以前の賃金締切日ごとに記入します。上の表は本システムの確定済み給与からの参考値で、基礎日数11日以上（または80時間以上）の月を12ヶ月分さかのぼって記入します。'],
    };
  },

  // ---------- 月額変更届（随時改定） ----------
  getsuhen({ emp: e, company, change, pays = [] }) {
    const months = [0, 1, 2].map((i) => ymAdd(change.effective_ym, i));
    const rows = months.map((m) => pays.find((p) => p.pay_ym === m));
    const total = rows.reduce((s, p) => s + (p ? p.remuneration : 0), 0);
    const avg = rows.every(Boolean) ? Math.floor(total / 3) : '';
    const curGrade = healthGradeOf(e.health_std);
    const nh = avg ? lookupHealth(avg) : null;
    const np = avg ? lookupPension(avg) : null;
    return {
      title: '健康保険・厚生年金保険 被保険者報酬月額変更届（随時改定）',
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: `${ymAdd(change.effective_ym, 3)}-10`,
      deadlineNote: '固定的賃金の変動後3ヶ月分の報酬が確定したら速やかに',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          row('被保険者整理番号', e.insured_number),
          row('氏名', e.name), row('生年月日', jpDate(e.birth_date)),
          row('改定年月', jpDate(ymAdd(change.effective_ym, 3))),
          row('従前の標準報酬月額', `健保 ${yen(e.health_std)}（${curGrade || '-'}等級）／厚年 ${yen(e.pension_std)}`),
          row('従前の改定月', '', '直近の決定通知書で確認'),
          row('昇（降）給', `${jpDate(change.effective_ym)}支給分から：${change.detail || ''}`),
          row('遡及支払額', '', 'ない場合は空欄', true),
        ] },
        { title: '報酬（変動後3ヶ月）', rows: [
          row('総計', yen(total)),
          row('平均額', yen(avg)),
          row('修正平均額', '', '遡及支払がある場合のみ', true),
          row('（参考）新しい標準報酬月額', nh ? `健保 ${yen(nh.standard)}（${nh.grade}等級）／厚年 ${yen(np.standard)}（${np.grade}等級）` : '', '決定は年金事務所が行う', true),
        ] },
      ],
      table: { title: '報酬月額', ...remunerationTable(pays, months) },
      notes: ['3ヶ月とも支払基礎日数17日以上で、従前と2等級以上の差がある場合に届出が必要です。'],
    };
  },

  // ---------- 算定基礎届（定時改定） ----------
  santei({ company, year, people = [] }) {
    const months = ['04', '05', '06'].map((m) => `${year}-${m}`);
    const rows = people.map(({ emp: e, pays }) => {
      const r = months.map((m) => pays.find((p) => p.pay_ym === m));
      const valid = r.filter((p) => p && p.base_days >= 17);
      const total = valid.reduce((s, p) => s + p.remuneration, 0);
      const avg = valid.length ? Math.floor(total / valid.length) : 0;
      const nh = avg ? lookupHealth(avg) : null;
      return [e.insured_number || '（要記入）', e.name, jpDate(e.birth_date), `${yen(e.health_std)}`,
        ...r.map((p) => (p ? `${p.base_days}日 ${yen(p.remuneration)}` : '-')),
        yen(total), yen(avg), nh ? `${yen(nh.standard)}（${nh.grade}等級）` : '-'];
    });
    return {
      title: `健康保険・厚生年金保険 被保険者報酬月額算定基礎届（${year}年 定時決定）`,
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: `${year}-07-10`,
      deadlineNote: '7月1日〜7月10日',
      sections: [companySection(company, 'shakai')],
      table: { title: '4〜6月に支払った報酬（確定済み給与より）', head: ['整理番号', '氏名', '生年月日', '従前の標準報酬', '4月支給', '5月支給', '6月支給', '総計（17日以上の月）', '平均額', '（参考）新しい健保標準報酬'], rows },
      notes: ['支払基礎日数17日未満の月は除いて平均します（短時間労働者は別基準）。', '7月〜9月に随時改定が予定される人は算定基礎届の対象外です。', '9月分の保険料（10月支給の給与）から新しい標準報酬月額で控除します。'],
    };
  },

  // ---------- 賞与支払届 ----------
  bonus_pay({ company, payDate, bonuses = [], emps = [] }) {
    const rows = bonuses.map((b) => {
      const e = emps.find((x) => x.code === b.code) || {};
      return [e.insured_number || '（要記入）', b.name, jpDate(e.birth_date), yen(b.amount), '0円', yen(b.amount), yen(b.std)];
    });
    return {
      title: '健康保険・厚生年金保険 被保険者賞与支払届',
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: addDays(payDate, 5),
      deadlineNote: '賞与支払日から5日以内',
      sections: [companySection(company, 'shakai'), { title: '賞与', rows: [row('賞与支払年月日', jpDate(payDate))] }],
      table: { title: '被保険者ごとの賞与額', head: ['整理番号', '氏名', '生年月日', '通貨', '現物', '合計', '標準賞与額（千円未満切捨て）'], rows },
      notes: ['標準賞与額の上限：健康保険は年度累計573万円、厚生年金は1回150万円。'],
    };
  },

  // ---------- 住民税 特別徴収への切替届出（依頼）書 ----------
  jumin_tokucho({ emp: e, company, today }) {
    const startYm = ymAdd(today.slice(0, 7), 1);
    return {
      title: '住民税 特別徴収への切替届出（依頼）書',
      submitTo: '従業員の住所地（1月1日時点）の市区町村 住民税担当課（eLTAX可）',
      deadline: addDays(today, 14),
      deadlineNote: '特別徴収を開始したい月の前月中旬までが目安（市区町村により異なる）',
      sections: [
        companySection(company, 'jumin'),
        { title: '給与所得者', rows: [
          ...personRows(e, { address: true }),
          row('1月1日時点の住所', '', '現住所と異なる場合のみ', true),
          row('宛名番号（個人番号）', '', '本人の納税通知書・本人確認書類から記入'),
          row('入社年月日', jpDate(e.hire_date)),
        ] },
        { title: '特別徴収の内容', rows: [
          row('特別徴収開始月', jpDate(startYm), '給与から控除を始める月'),
          row('切替の理由', '中途入社のため（普通徴収からの切替）'),
          row('普通徴収の納期限が過ぎていない期別', '', '本人の納税通知書で確認（納期限が過ぎた分は切替できない）'),
          row('月割額', '', '市区町村から届く税額変更通知書の金額を従業員情報に登録'),
        ] },
      ],
      notes: ['様式は市区町村ごとに異なります。各市区町村のホームページの様式に転記してください。', '前職で特別徴収されていた場合は、前職が提出する「給与所得者異動届出書」の下段に記入して引き継ぐ方法もあります。'],
    };
  },

  // ---------- 住民税 給与所得者異動届出書（退職：普通徴収・一括徴収） ----------
  jumin_ido({ emp: e, company, pays = [] }) {
    const ld = e.leave_date;
    const m = Number(ld.slice(5, 7));
    const y = Number(ld.slice(0, 4));
    const fyStart = `${m >= 6 ? y : y - 1}-06`;
    const fyEnd = ymAdd(fyStart, 11);
    const annual = Number(e.resident_tax_june || 0) + Number(e.resident_tax_monthly || 0) * 11;
    const collected = pays.filter((p) => p.pay_ym >= fyStart && p.pay_ym <= fyEnd).reduce((s, p) => s + Number(p.resident || 0), 0);
    const remaining = Math.max(0, annual - collected);
    const janToApr = m >= 1 && m <= 4;
    return {
      title: '住民税 給与所得者異動届出書（退職）',
      submitTo: '従業員の住所地（1月1日時点）の市区町村 住民税担当課（eLTAX可）',
      deadline: nextMonth10th(ld),
      deadlineNote: '異動（退職）があった月の翌月10日まで',
      sections: [
        companySection(company, 'jumin'),
        { title: '給与所得者', rows: [
          ...personRows(e, { address: true }),
          row('宛名番号（個人番号）', '', '特別徴収税額決定通知書に記載'),
          row('異動年月日', jpDate(ld)),
          row('異動事由', '退職'),
        ] },
        { title: '税額', rows: [
          row('特別徴収税額（年税額）', yen(annual), `6月分 ${yen(e.resident_tax_june)}＋7月〜翌5月分 ${yen(e.resident_tax_monthly)}×11`),
          row('徴収済額', yen(collected), `${jpDate(fyStart)}〜${jpDate(fyEnd)}支給の確定済み給与から集計（最終給与を確定してから出力）`),
          row('未徴収税額', yen(remaining)),
          row('未徴収税額の徴収方法', janToApr ? '一括徴収（1月1日〜4月30日の退職は、最後の給与等で未徴収税額を上回る場合は一括徴収が必要）' : '普通徴収（本人の申出があれば一括徴収も可）', '本人の希望・最終給与の額で確認'),
          row('一括徴収する場合の徴収月', '', '一括徴収の場合のみ', true),
        ] },
      ],
      notes: ['様式は市区町村ごとに異なります（総務省の標準様式に準じたものが多い）。', '転職先が決まっていて特別徴収を継続する場合は「転勤（転職）等による特別徴収継続」欄に転職先を記入します。'],
    };
  },
};

const TYPES = {
  shakai_get: '健康保険・厚生年金保険 資格取得届',
  shakai_loss: '健康保険・厚生年金保険 資格喪失届',
  koyou_get: '雇用保険 資格取得届',
  koyou_loss: '雇用保険 資格喪失届（離職証明書の資料付き）',
  getsuhen: '月額変更届（随時改定）',
  santei: '算定基礎届（定時改定）',
  bonus_pay: '賞与支払届',
  jumin_tokucho: '住民税 特別徴収への切替届出書',
  jumin_ido: '住民税 給与所得者異動届出書（退職）',
};

function buildFiling(type, ctx) {
  const fn = BUILDERS[type];
  if (!fn) throw new Error(`不明な書類です: ${type}`);
  const doc = fn(ctx);
  doc.type = type;
  doc.missing = [];
  for (const sec of doc.sections) for (const r of sec.rows) if (!r.value && !r.optional) doc.missing.push(`${sec.title}：${r.label}`);
  return doc;
}

module.exports = { buildFiling, TYPES };

};

// ---- 画面（HTML） ----
var HTML_APP = "<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<style>\n  :root { --bg:#f5f6f8; --panel:#fff; --border:#dfe3e8; --text:#1f2933; --muted:#6b7280; --accent:#2563eb; --accent-weak:#eff6ff; --ok:#16a34a; --danger:#dc2626; --warn:#d97706; }\n  * { box-sizing:border-box; }\n  body { margin:0; font-family:\"Hiragino Sans\",\"Yu Gothic\",\"Segoe UI\",sans-serif; background:var(--bg); color:var(--text); font-size:14px; }\n  a { color:var(--accent); cursor:pointer; text-decoration:none; }\n  header { background:var(--panel); border-bottom:1px solid var(--border); padding:10px 20px; display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; position:sticky; top:0; z-index:5; }\n  header .brand { font-weight:700; font-size:15px; }\n  header .me { margin-left:auto; color:var(--muted); font-size:13px; display:flex; gap:10px; align-items:center; }\n  nav { display:flex; flex-wrap:wrap; gap:2px; width:100%; }\n  nav a { padding:6px 10px; border-radius:6px; color:var(--text); font-size:13px; }\n  nav a.on { background:var(--accent-weak); color:var(--accent); font-weight:700; }\n  main { max-width:1440px; margin:0 auto; padding:18px 16px 60px; }\n  h1 { font-size:20px; margin:4px 0 14px; }\n  h2 { font-size:16px; margin:0 0 10px; }\n  .panel { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px 18px; margin-bottom:16px; }\n  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }\n  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:16px; }\n  .stat { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:12px; text-align:center; }\n  .stat b { display:block; font-size:22px; } .stat span { color:var(--muted); font-size:12px; }\n  .stat.danger { border-color:var(--danger); } .stat.warn { border-color:var(--warn); }\n  .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }\n  .between { justify-content:space-between; }\n  table { width:100%; border-collapse:collapse; background:var(--panel); }\n  th, td { border:1px solid var(--border); padding:6px 8px; text-align:left; font-size:13px; vertical-align:top; }\n  th { background:#f0f2f5; white-space:nowrap; }\n  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }\n  .wrap { overflow-x:auto; }\n  tr.sun td:first-child { color:var(--danger); } tr.sat td:first-child { color:var(--accent); }\n  tr.bad td { background:#fff5f5; }\n  input, select, textarea { font:inherit; padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:#fff; }\n  td input { padding:4px 6px; width:90px; } td input.w { width:150px; } td input.s { width:64px; }\n  button { font:inherit; border:none; border-radius:6px; padding:8px 14px; background:var(--accent); color:#fff; cursor:pointer; }\n  button.sub { background:#fff; color:var(--accent); border:1px solid var(--accent); }\n  button.danger { background:var(--danger); } button.small { padding:4px 9px; font-size:12px; white-space:nowrap; }\n  table.wide td:first-child { min-width:170px; } td .note { font-size:11px; color:var(--warn); margin-top:2px; } td .stack { display:flex; flex-direction:column; gap:3px; } td .acts { display:flex; flex-wrap:wrap; gap:4px; }\n  button:disabled { opacity:.5; cursor:default; }\n  .badge { display:inline-block; padding:1px 8px; border-radius:10px; font-size:12px; background:#e5e7eb; white-space:nowrap; }\n  .badge.ok { background:#dcfce7; color:var(--ok); } .badge.danger { background:#fee2e2; color:var(--danger); } .badge.warn { background:#fef3c7; color:#92400e; }\n  .muted { color:var(--muted); } .small { font-size:12px; }\n  .alert { padding:10px 14px; border-radius:8px; margin-bottom:12px; white-space:pre-wrap; }\n  .alert.err { background:#fef2f2; border:1px solid var(--danger); color:var(--danger); }\n  .alert.ok { background:#ecfdf5; border:1px solid var(--ok); color:#065f46; }\n  .alert.warn { background:#fffbeb; border:1px solid var(--warn); color:#92400e; }\n  .form { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px 14px; }\n  .form label { display:flex; flex-direction:column; gap:3px; font-size:12px; color:var(--muted); }\n  .form label.chk { flex-direction:row; align-items:center; gap:6px; color:var(--text); font-size:13px; }\n  .form input, .form select { color:var(--text); font-size:14px; }\n  fieldset { border:1px solid var(--border); border-radius:8px; padding:10px 14px 14px; margin:0 0 14px; }\n  legend { font-weight:700; padding:0 6px; }\n  .punch { max-width:440px; margin:0 auto; text-align:center; }\n  .clock { font-size:52px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.1; }\n  .pbtns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }\n  .pbtns button { padding:18px; font-size:17px; } .in { background:var(--ok) !important; } .out { background:var(--danger) !important; } .brk { background:#64748b !important; }\n  .kv div { display:flex; justify-content:space-between; border-bottom:1px dashed var(--border); padding:6px 0; } .kv div span:first-child { color:var(--muted); }\n  .modal { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:flex-start; justify-content:center; padding:24px 12px; z-index:20; overflow:auto; }\n  .modal .box { background:#fff; border-radius:10px; max-width:860px; width:100%; padding:18px; }\n  .slip h1 { text-align:center; font-size:20px; } .slip table { margin-top:8px; } .slip .n { text-align:right; } .slip .cols { display:flex; gap:12px; flex-wrap:wrap; } .slip .cols > div { flex:1; min-width:260px; }\n  .loading { position:fixed; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,var(--accent),#93c5fd); animation:ld 1s linear infinite; z-index:30; }\n  @keyframes ld { from { background-position:0 0; } to { background-position:200px 0; } }\n  .login { max-width:400px; margin:40px auto; }\n  .tabs { display:flex; gap:4px; margin-bottom:12px; } .tabs a { flex:1; text-align:center; padding:8px; border-radius:6px; background:#eef2f7; color:var(--text); } .tabs a.on { background:var(--accent); color:#fff; }\n  @media print { header, .noprint { display:none !important; } .modal { position:static; background:none; padding:0; } body { background:#fff; } }\n</style>\n</head>\n<body>\n<div id=\"loading\" class=\"loading\" style=\"display:none\"></div>\n<header id=\"header\" style=\"display:none\"></header>\n<main id=\"main\"><p class=\"muted\">読み込み中…</p></main>\n<div id=\"modal\"></div>\n<script>\nvar S = { token: null, me: null, company: '', mode: 'me', view: '', params: {} };\nvar WD = '日月火水木金土';\n\nfunction esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\nfunction yen(v) { return Number(v || 0).toLocaleString(); }\nfunction $(id) { return document.getElementById(id); }\nfunction val(id) { var el = $(id); return el ? el.value.trim() : ''; }\nfunction todayJst() { var d = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000); return d; }\nfunction ymNow() { var d = todayJst(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }\nfunction ymAdd(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + ('0' + (m + 1)).slice(-2); }\nfunction store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }\n\nfunction call(action, data) {\n  $('loading').style.display = 'block';\n  return new Promise(function (resolve, reject) {\n    google.script.run.withSuccessHandler(function (r) {\n      $('loading').style.display = 'none';\n      if (r && r.ok) return resolve(r.result);\n      if (r && r.relogin) { logout(true); }\n      reject(new Error(r ? r.error : '通信に失敗しました'));\n    }).withFailureHandler(function (e) { $('loading').style.display = 'none'; reject(e); })\n      .api({ token: S.token, action: action, data: data || {} });\n  });\n}\n\nfunction flash(msg, type) { var el = $('flash'); if (el) { el.className = 'alert ' + (type || 'ok'); el.textContent = msg; el.style.display = 'block'; window.scrollTo(0, 0); } else alert(msg); }\nfunction fail(e) { flash(e.message || String(e), 'err'); }\n\n// ---------- 画面切替 ----------\nvar ME_NAV = [['home', '打刻・ホーム'], ['attendance', '勤怠'], ['slips', '給与明細'], ['leave', '有給休暇']];\nvar ADM_NAV = [['dashboard', 'ダッシュボード'], ['employees', '従業員'], ['attendance', '勤怠'], ['payroll', '給与計算'], ['bonus', '賞与'], ['yearend', '年末調整'], ['tasks', '労務タスク'], ['filings', '届出書類'], ['settings', '設定'], ['logs', '操作ログ']];\n\nfunction renderHeader() {\n  var nav = (S.mode === 'adm' ? ADM_NAV : ME_NAV).map(function (n) { return '<a class=\"' + (S.view === n[0] ? 'on' : '') + '\" onclick=\"go(\\'' + n[0] + '\\')\">' + n[1] + '</a>'; }).join('');\n  var sw = '';\n  if (S.me.isAdmin && S.me.isEmployee) sw = '<a onclick=\"switchMode()\">' + (S.mode === 'adm' ? 'マイページへ' : '管理画面へ') + '</a>';\n  $('header').innerHTML = '<span class=\"brand\">' + esc(S.company) + (S.mode === 'adm' ? ' 管理画面' : '') + '</span>' +\n    '<span class=\"me\">' + esc(S.me.name) + ' ' + sw + ' <a onclick=\"logout()\">ログアウト</a></span><nav>' + nav + '</nav>';\n  $('header').style.display = 'flex';\n}\n\nfunction switchMode() { S.mode = S.mode === 'adm' ? 'me' : 'adm'; go(S.mode === 'adm' ? 'dashboard' : 'home'); }\n\nfunction go(view, params, msg, type) {\n  S.view = view; S.params = params || {};\n  renderHeader();\n  $('main').innerHTML = '<div id=\"flash\" class=\"alert\" style=\"display:none\"></div><div id=\"view\"><p class=\"muted\">読み込み中…</p></div>';\n  var fn = (S.mode === 'adm' ? ADM : ME)[view];\n  Promise.resolve().then(function () { return fn(S.params); }).then(function () { if (msg) flash(msg, type); }).catch(fail);\n}\nfunction view(html) { $('view').innerHTML = html; }\nfunction modal(html) { $('modal').innerHTML = html ? '<div class=\"modal\" onclick=\"if(event.target===this)modal()\"><div class=\"box\">' + html + '</div></div>' : ''; }\n\n// ---------- ログイン ----------\nfunction start() {\n  S.token = store('roumu_token');\n  call('auth.init').then(function (r) {\n    S.company = r.company;\n    document.title = r.company + ' 勤怠・給与';\n    if (r.token) return loggedIn(r.token, r.me);\n    if (S.token && store('roumu_me')) return loggedIn(S.token, JSON.parse(store('roumu_me')));\n    renderLogin(r);\n  }).catch(function (e) { $('main').innerHTML = '<div class=\"alert err\">' + esc(e.message) + '</div>'; });\n}\n\nfunction renderLogin(r, tab) {\n  tab = tab || 'emp';\n  $('header').style.display = 'none';\n  $('main').innerHTML = '<div class=\"login panel\"><h1>' + esc(S.company || '') + '</h1>' +\n    '<div class=\"tabs\"><a class=\"' + (tab === 'emp' ? 'on' : '') + '\" id=\"tEmp\">従業員</a><a class=\"' + (tab === 'adm' ? 'on' : '') + '\" id=\"tAdm\">管理者</a></div>' +\n    '<div id=\"flash\" class=\"alert\" style=\"display:none\"></div>' +\n    (tab === 'emp'\n      ? '<div class=\"form\" style=\"grid-template-columns:1fr\"><label>社員番号<input id=\"lCode\" inputmode=\"numeric\" autocomplete=\"username\"></label><label>PIN<input id=\"lPin\" type=\"password\" inputmode=\"numeric\" autocomplete=\"current-password\"></label></div><p><button id=\"lBtn\" style=\"width:100%\">ログイン</button></p><p class=\"small muted\">会社のGoogleアカウントでログインしている場合は自動でログインします。</p>'\n      : '<div class=\"form\" style=\"grid-template-columns:1fr\"><label>管理者パスワード<input id=\"lPw\" type=\"password\" autocomplete=\"current-password\"></label></div><p><button id=\"lBtn\" style=\"width:100%\">ログイン</button></p><p class=\"small muted\">管理者に登録されたGoogleアカウントで開くと自動でログインします。' + (r && r.adminPasswordEnabled === false ? '（管理者パスワードは未設定です）' : '') + '</p>') +\n    '</div>';\n  $('tEmp').onclick = function () { renderLogin(r, 'emp'); };\n  $('tAdm').onclick = function () { renderLogin(r, 'adm'); };\n  $('lBtn').onclick = function () {\n    var p = tab === 'emp' ? call('auth.pin', { code: val('lCode'), pin: val('lPin') }) : call('auth.admin', { password: $('lPw').value });\n    p.then(function (x) { loggedIn(x.token, x.me); }).catch(fail);\n  };\n}\n\nfunction loggedIn(token, me) {\n  S.token = token; S.me = me;\n  store('roumu_token', token); store('roumu_me', JSON.stringify(me));\n  S.mode = me.isEmployee ? 'me' : 'adm';\n  go(S.mode === 'adm' ? 'dashboard' : 'home');\n}\n\nfunction logout(silent) {\n  if (!silent) call('auth.logout', { token: S.token }).catch(function () {});\n  store('roumu_token', null); store('roumu_me', null);\n  S.token = null; S.me = null;\n  renderLogin({});\n  if (silent) flash('ログインの有効期限が切れました。もう一度ログインしてください', 'warn');\n}\n\n// ---------- 共通部品 ----------\nfunction monthNav(ym, fn) {\n  return '<div class=\"row\"><button class=\"sub small\" onclick=\"' + fn + '(\\'' + ymAdd(ym, -1) + '\\')\">← 前月</button><b>' + ym.replace('-', '年') + '月</b><button class=\"sub small\" onclick=\"' + fn + '(\\'' + ymAdd(ym, 1) + '\\')\">翌月 →</button></div>';\n}\nfunction showSlip(id, adm) {\n  call(adm ? 'adm.slip' : 'me.slip', { id: id }).then(function (r) {\n    modal('<div class=\"row between noprint\"><b>' + esc(r.title) + '</b><span><button class=\"small\" onclick=\"window.print()\">印刷・PDF保存</button> <button class=\"small sub\" onclick=\"modal()\">閉じる</button></span></div>' + r.html);\n  }).catch(fail);\n}\nfunction badgeStatus(st) { return '<span class=\"badge ' + (st === '確定' || st === '完了' || st === '計算済み' ? 'ok' : st === '未計算' ? '' : 'warn') + '\">' + esc(st) + '</span>'; }\nfunction attTable(r, editable) {\n  var rows = r.days.map(function (d) {\n    var cls = (d.wd === 0 ? 'sun' : d.wd === 6 ? 'sat' : '') + (d.missingOut ? ' bad' : '');\n    var cells = editable\n      ? '<td><input id=\"i_' + d.date + '\" value=\"' + esc(d.clock_in) + '\" placeholder=\"09:00\" class=\"s\"></td><td><input id=\"o_' + d.date + '\" value=\"' + esc(d.clock_out) + '\" placeholder=\"18:00\" class=\"s\"></td><td><input id=\"b_' + d.date + '\" value=\"' + esc(d.break_minutes) + '\" placeholder=\"60\" class=\"s\"></td><td><input id=\"m_' + d.date + '\" value=\"' + esc(d.note) + '\" class=\"w\"></td>'\n      : '<td>' + esc(d.clock_in) + '</td><td>' + esc(d.clock_out) + '</td><td class=\"n\">' + esc(d.break_minutes) + '</td><td>' + esc(d.note) + '</td>';\n    return '<tr class=\"' + cls + '\"><td>' + d.date.slice(5).replace('-', '/') + '（' + WD[d.wd] + '）</td>' + cells +\n      '<td class=\"n\">' + esc(d.worked) + (d.missingOut ? '<span class=\"badge danger\">退勤なし</span>' : '') + '</td><td class=\"n\">' + esc(d.overtime || (d.holiday ? '休' + d.holiday : '')) + '</td><td class=\"n\">' + esc(d.night) + '</td>' +\n      '<td class=\"small\">' + esc(d.place) + (d.leave ? ' <span class=\"badge ok\">有給' + (d.leave < 1 ? '(半)' : '') + '</span>' : '') + (d.edited ? ' ✎' : '') + '</td>' +\n      (editable ? '<td><button class=\"small sub\" onclick=\"saveAtt(\\'' + d.date + '\\')\">保存</button></td>' : '') + '</tr>';\n  }).join('');\n  return '<div class=\"wrap\"><table><tr><th>日付</th><th>出勤</th><th>退勤</th><th>休憩(分)</th><th>備考</th><th class=\"n\">実働</th><th class=\"n\">時間外</th><th class=\"n\">深夜</th><th>場所</th>' + (editable ? '<th></th>' : '') + '</tr>' + rows + '</table></div>';\n}\nfunction sumStats(sm) {\n  return '<div class=\"stats\"><div class=\"stat\"><b>' + sm.workDays + '日</b><span>出勤日数</span></div><div class=\"stat\"><b>' + sm.worked + '</b><span>実働</span></div>' +\n    '<div class=\"stat\"><b>' + sm.overtime + '</b><span>時間外（60h超 ' + sm.over60 + '）</span></div><div class=\"stat\"><b>' + sm.holiday + '</b><span>法定休日</span></div><div class=\"stat\"><b>' + sm.night + '</b><span>深夜</span></div></div>';\n}\n\n// ============================================================\n// 従業員マイページ\n// ============================================================\nvar ME = {\n  home: function () {\n    return call('me.home').then(function (r) {\n      var st = r.status, t = st.today || {};\n      var todayTxt = st.today ? (t.in ? '出勤 ' + t.in : '') + (t.breakStart ? '　休憩中（' + t.breakStart + '〜）' : '') + (t.out ? '　退勤 ' + t.out : '') : 'まだ出勤していません';\n      view('<div class=\"punch panel\"><div class=\"muted\" id=\"dateTxt\"></div><div class=\"clock\" id=\"clock\">--:--</div><div class=\"muted\">' + esc(todayTxt) + '</div>' +\n        '<p><select id=\"place\" style=\"width:100%\"><option value=\"\">勤務場所（登録拠点）</option><option>五反田</option><option>赤坂</option><option>リモート</option><option>その他</option></select></p>' +\n        '<div class=\"pbtns\"><button class=\"in\" onclick=\"punch(\\'in\\')\">出勤</button><button class=\"out\" onclick=\"punch(\\'out\\')\">退勤</button><button class=\"brk\" onclick=\"punch(\\'break_start\\')\">休憩開始</button><button class=\"brk\" onclick=\"punch(\\'break_end\\')\">休憩終了</button></div></div>' +\n        '<div class=\"stats\"><div class=\"stat\"><b>' + st.workDays + '日</b><span>今月の出勤</span></div><div class=\"stat\"><b>' + st.worked + '</b><span>今月の実働</span></div><div class=\"stat\"><b>' + st.overtime + '</b><span>今月の時間外</span></div><div class=\"stat\"><b>' + st.leaveBalance + '日</b><span>有給の残日数</span></div></div>' +\n        (r.latestSlip ? '<div class=\"panel\"><div class=\"row between\"><span>最新の明細：<b>' + esc(r.latestSlip.label) + '</b>　差引支給額 <b>' + yen(r.latestSlip.net) + '円</b></span><button class=\"small sub\" onclick=\"showSlip(\\'' + r.latestSlip.id + '\\')\">明細を見る</button></div></div>' : ''));\n      tick();\n    });\n  },\n  attendance: function (p) {\n    var ym = p.ym || ymNow();\n    return call('me.attendance', { ym: ym }).then(function (r) {\n      view('<div class=\"row between\"><h1>勤怠</h1>' + monthNav(ym, 'meAtt') + '</div>' + sumStats(r.summary) + attTable(r, false) + '<p class=\"small muted\">修正が必要な場合は総務に連絡してください。✎は総務が修正した日です。</p>');\n    });\n  },\n  slips: function () {\n    return call('me.slips').then(function (list) {\n      view('<h1>給与明細</h1>' + (list.length ? '<div class=\"wrap\"><table><tr><th>明細</th><th class=\"n\">総支給額</th><th class=\"n\">差引支給額</th><th></th></tr>' +\n        list.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class=\"n\">' + yen(x.gross) + '</td><td class=\"n\">' + yen(x.net) + '</td><td><button class=\"small sub\" onclick=\"showSlip(\\'' + x.id + '\\')\">表示</button></td></tr>'; }).join('') + '</table></div>'\n        : '<p class=\"muted\">まだ明細はありません。</p>'));\n    });\n  },\n  leave: function () {\n    return call('me.leave').then(function (r) {\n      var ob = r.obligation;\n      view('<h1>有給休暇</h1><div class=\"stats\"><div class=\"stat\"><b>' + r.balance + '日</b><span>残日数</span></div>' +\n        (ob ? '<div class=\"stat ' + (ob.level === 'ok' ? '' : ob.level) + '\"><b>' + ob.taken + ' / 5日</b><span>年5日の取得（' + ob.periodEnd + 'の前日まで）</span></div>' : '') +\n        (r.nextGrant ? '<div class=\"stat\"><b>' + r.nextGrant.days + '日</b><span>次回付与 ' + r.nextGrant.date + '</span></div>' : '') + '</div>' +\n        '<div class=\"grid2\"><div class=\"panel\"><h2>付与</h2><table><tr><th>付与日</th><th class=\"n\">付与</th><th class=\"n\">使用</th><th>時効</th></tr>' +\n        r.grants.map(function (g) { return '<tr><td>' + g.date + '</td><td class=\"n\">' + g.days + '</td><td class=\"n\">' + g.used + '</td><td>' + g.expires + '</td></tr>'; }).join('') + '</table></div>' +\n        '<div class=\"panel\"><h2>取得履歴</h2><table><tr><th>取得日</th><th>日数</th><th>備考</th></tr>' +\n        r.usages.map(function (u) { return '<tr><td>' + u.date + '</td><td>' + u.days + '</td><td>' + esc(u.note) + '</td></tr>'; }).join('') + '</table><p class=\"small muted\">有給の申請は総務に連絡してください。</p></div></div>');\n    });\n  },\n};\nfunction meAtt(ym) { go('attendance', { ym: ym }); }\nvar clockTimer;\nfunction tick() {\n  clearInterval(clockTimer);\n  var f = function () { var d = todayJst(); if (!$('clock')) return clearInterval(clockTimer); $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); $('dateTxt').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; };\n  f(); clockTimer = setInterval(f, 1000);\n}\nfunction punch(action) {\n  call('me.punch', { action: action, place: val('place') }).then(function (r) {\n    if (!r.ok) return flash(r.msg, 'err');\n    ME.home().then(function () { flash(r.msg, 'ok'); });\n  }).catch(fail);\n}\n\n// ============================================================\n// 管理画面\n// ============================================================\nvar EMP_GROUPS = [\n  ['基本情報（労働者名簿）', ['code', 'name', 'name_kana', 'email', 'birth_date', 'gender', 'address', 'job', 'location', 'employment_type', 'hire_date', 'pin']],\n  ['給与（固定的賃金）', ['base_salary', 'position_allowance', 'commute_allowance', 'fixed_ot_pay', 'fixed_ot_hours']],\n  ['社会保険・税', ['social_insurance', 'employment_insurance', 'health_std', 'pension_std', 'insured_number', 'koyou_number', 'weekly_hours', 'tax_column', 'dependents', 'resident_tax_june', 'resident_tax_monthly', 'slip_consent']],\n  ['振込口座', ['bank_code', 'bank_name', 'branch_code', 'branch_name', 'account_type', 'account_number', 'account_holder']],\n];\nvar SELECTS = { gender: ['', '男', '女', 'その他'], location: ['', '五反田', '赤坂', 'リモート'], employment_type: ['正社員', '契約社員', 'パート・アルバイト'], tax_column: ['甲', '乙'], account_type: ['普通', '当座'] };\n\nfunction empForm(cols, e) {\n  var colMap = {}; cols.forEach(function (c) { colMap[c[0]] = c; });\n  return EMP_GROUPS.map(function (g) {\n    return '<fieldset><legend>' + g[0] + '</legend><div class=\"form\">' + g[1].filter(function (k) { return colMap[k]; }).map(function (k) {\n      var c = colMap[k], v = e[k] === null || e[k] === undefined ? '' : e[k];\n      if (c[2] === 'bool') return '<label class=\"chk\"><input type=\"checkbox\" id=\"f_' + k + '\"' + (v ? ' checked' : '') + '> ' + esc(c[1]) + '</label>';\n      if (SELECTS[k]) return '<label>' + esc(c[1]) + '<select id=\"f_' + k + '\">' + SELECTS[k].map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';\n      var type = c[2] === 'date' ? 'date' : (c[2] === 'num' || c[2] === 'numOrNull') ? 'number' : 'text';\n      return '<label>' + esc(c[1]) + '<input type=\"' + type + '\" id=\"f_' + k + '\" value=\"' + esc(v) + '\"' + (k === 'health_std' || k === 'pension_std' ? ' placeholder=\"空欄なら自動算出\"' : '') + '></label>';\n    }).join('') + '</div></fieldset>';\n  }).join('');\n}\nfunction readEmpForm(cols) {\n  var f = {};\n  cols.forEach(function (c) { var el = $('f_' + c[0]); if (!el) return; f[c[0]] = el.type === 'checkbox' ? el.checked : el.value.trim(); });\n  return f;\n}\n\nvar ADM = {\n  dashboard: function () {\n    return call('adm.dashboard').then(function (r) {\n      var a = r.alerts, t = r.today;\n      var overdue = a.tasks.filter(function (x) { return x.due_date < t; }).length;\n      view('<div class=\"row between\"><h1>ダッシュボード</h1><button class=\"sub small\" onclick=\"admRefresh()\">最新の状態に更新</button></div>' +\n        '<div class=\"stats\"><div class=\"stat\"><b>' + a.empCount + '名</b><span>在籍者</span></div>' +\n        '<div class=\"stat\"><b>' + r.punches.filter(function (p) { return p.in; }).length + ' / ' + r.punches.length + '</b><span>本日の出勤打刻</span></div>' +\n        '<div class=\"stat ' + (overdue ? 'danger' : '') + '\"><b>' + overdue + '件</b><span>期限超過の手続き</span></div>' +\n        '<div class=\"stat ' + (a.tasks.length - overdue ? 'warn' : '') + '\"><b>' + (a.tasks.length - overdue) + '件</b><span>2週間以内の手続き</span></div>' +\n        '<div class=\"stat ' + (a.ot.length ? 'danger' : '') + '\"><b>' + a.ot.length + '件</b><span>36協定アラート</span></div>' +\n        '<div class=\"stat ' + (a.lv.length ? 'warn' : '') + '\"><b>' + a.lv.length + '件</b><span>有給5日義務</span></div>' +\n        '<div class=\"stat\"><b>' + a.drafts + '件</b><span>未確定の給与</span></div></div>' +\n        '<div class=\"panel\"><div class=\"row between\"><h2>期限が近い労務手続き</h2><a onclick=\"go(\\'tasks\\')\">すべて見る →</a></div>' +\n        (a.tasks.length ? '<div class=\"wrap\"><table><tr><th>期限</th><th>区分</th><th>手続き</th><th>対象者</th><th></th></tr>' + a.tasks.map(function (x) {\n          return '<tr class=\"' + (x.due_date < t ? 'bad' : '') + '\"><td>' + x.due_date + (x.due_date < t ? ' <span class=\"badge danger\">超過</span>' : '') + '</td><td><span class=\"badge\">' + esc(x.category) + '</span></td><td>' + esc(x.title) + '<div class=\"small muted\">' + esc(x.basis) + '</div></td><td>' + esc(x.name) + '</td><td><div class=\"acts\">' + (x.filing ? '<button class=\"small sub\" onclick=\\'openFiling(' + esc(JSON.stringify(x.filing)) + ')\\'>書類</button>' : '') + '<button class=\"small\" onclick=\"taskDone(' + x._row + ')\">完了</button></div></td></tr>';\n        }).join('') + '</table></div>' : '<p class=\"muted\">2週間以内に期限が来る手続きはありません。</p>') + '</div>' +\n        '<div class=\"grid2\"><div class=\"panel\"><h2>36協定アラート（今月）</h2>' + (a.ot.length ? a.ot.map(function (x) { return '<p><span class=\"badge ' + x.level + '\">' + (x.level === 'danger' ? '超過' : '注意') + '</span> ' + esc(x.text) + '</p>'; }).join('') : '<p class=\"muted\">なし</p>') + '</div>' +\n        '<div class=\"panel\"><h2>有給休暇 年5日取得義務</h2>' + (a.lv.length ? a.lv.map(function (x) { return '<p><span class=\"badge ' + x.level + '\">' + (x.level === 'danger' ? '至急' : '注意') + '</span> ' + esc(x.text) + '</p>'; }).join('') : '<p class=\"muted\">なし</p>') + '</div></div>' +\n        '<div class=\"grid2\"><div class=\"panel\"><h2>本日の打刻</h2><table><tr><th>氏名</th><th>出勤</th><th>退勤</th><th>場所</th></tr>' + r.punches.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.in) + '</td><td>' + esc(p.out) + '</td><td>' + esc(p.place) + '</td></tr>'; }).join('') + '</table></div>' +\n        '<div class=\"panel\"><h2>退勤の打刻漏れ（直近1ヶ月）</h2>' + (a.missing.length ? a.missing.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') : '<p class=\"muted\">なし</p>') + '</div></div>');\n    });\n  },\n\n  employees: function () {\n    return call('adm.employees').then(function (list) {\n      view('<div class=\"row between\"><h1>従業員</h1><button onclick=\"go(\\'employeeEdit\\', {})\">＋ 従業員を登録</button></div><div class=\"wrap\"><table><tr><th>社員番号</th><th>氏名</th><th>雇用形態</th><th>拠点</th><th>入社日</th><th class=\"n\">基本給</th><th class=\"n\">固定残業代</th><th>状態</th></tr>' +\n        list.map(function (e) { return '<tr><td>' + esc(e.code) + '</td><td><a onclick=\"go(\\'employee\\', {code:\\'' + esc(e.code) + '\\'})\">' + esc(e.name) + '</a></td><td>' + esc(e.employment_type) + '</td><td>' + esc(e.location) + '</td><td>' + esc(e.hire_date) + '</td><td class=\"n\">' + yen(e.base_salary) + '</td><td class=\"n\">' + (e.fixed_ot_pay ? yen(e.fixed_ot_pay) + '（' + e.fixed_ot_hours + 'h）' : '-') + '</td><td>' + badgeStatus(e.status === '在籍' ? '確定' : e.status).replace('確定', '在籍') + '</td></tr>'; }).join('') +\n        '</table></div><p class=\"small muted\">登録すると入社手続きのタスクが自動で作られます。基本給などを変えると月額変更届の判定に使う「賃金変更履歴」に自動で記録されます。</p>');\n    });\n  },\n  employee: function (p) {\n    return call('adm.employee', { code: p.code }).then(function (r) {\n      var e = r.emp, l = r.leave, ob = l.obligation;\n      view('<div class=\"row between\"><h1>' + esc(e.name) + ' <span class=\"muted small\">' + esc(e.code) + '</span></h1><div class=\"row\"><button class=\"sub small\" onclick=\"go(\\'attendanceEmp\\', {code:\\'' + esc(e.code) + '\\'})\">勤怠を見る</button><button class=\"small\" onclick=\"go(\\'employeeEdit\\', {code:\\'' + esc(e.code) + '\\'})\">編集</button></div></div>' +\n        '<div class=\"grid2\"><div class=\"panel\"><h2>基本情報</h2><div class=\"kv\"><div><span>雇用形態・拠点</span><span>' + esc(e.employment_type) + ' / ' + esc(e.location) + '</span></div><div><span>業務</span><span>' + esc(e.job) + '</span></div><div><span>入社日</span><span>' + esc(e.hire_date) + '</span></div><div><span>生年月日</span><span>' + esc(e.birth_date) + '</span></div><div><span>Googleアカウント</span><span>' + esc(e.email || '未登録') + '</span></div><div><span>退職日</span><span>' + esc(e.leave_date || '-') + ' ' + esc(e.leave_reason) + '</span></div></div></div>' +\n        '<div class=\"panel\"><h2>給与・社会保険</h2><div class=\"kv\"><div><span>基本給</span><span>' + yen(e.base_salary) + '円</span></div><div><span>役職手当／通勤手当</span><span>' + yen(e.position_allowance) + '円 / ' + yen(e.commute_allowance) + '円</span></div><div><span>固定残業代</span><span>' + yen(e.fixed_ot_pay) + '円（' + e.fixed_ot_hours + '時間）</span></div><div><span>標準報酬（健保／厚年）</span><span>' + yen(e.health_std) + ' / ' + yen(e.pension_std) + '</span></div><div><span>税区分・扶養</span><span>' + esc(e.tax_column) + '欄 / ' + e.dependents + '人</span></div><div><span>住民税</span><span>6月 ' + yen(e.resident_tax_june) + ' / 7月〜 ' + yen(e.resident_tax_monthly) + '</span></div><div><span>振込口座</span><span>' + esc(e.bank_name) + ' ' + esc(e.branch_name) + ' ' + esc(e.account_type) + ' ' + (e.account_number ? '****' + String(e.account_number).slice(-3) : '未登録') + '</span></div></div></div></div>' +\n        '<div class=\"panel\"><h2>有給休暇</h2><div class=\"stats\"><div class=\"stat\"><b>' + l.balance + '日</b><span>残日数</span></div>' + (ob ? '<div class=\"stat ' + (ob.level === 'ok' ? '' : ob.level) + '\"><b>' + ob.taken + ' / 5</b><span>年5日義務（' + ob.periodEnd + 'の前日まで）</span></div>' : '') + (l.nextGrant ? '<div class=\"stat\"><b>' + l.nextGrant.days + '日</b><span>次回付与 ' + l.nextGrant.date + '</span></div>' : '') + '</div>' +\n        '<div class=\"row\"><input type=\"date\" id=\"lvDate\"><select id=\"lvDays\"><option value=\"1\">1日</option><option value=\"0.5\">半日</option></select><input id=\"lvNote\" placeholder=\"備考\"><button class=\"small\" onclick=\"addLeave(\\'' + esc(e.code) + '\\')\">取得を登録</button></div>' +\n        '<table style=\"margin-top:8px\"><tr><th>取得日</th><th>日数</th><th>備考</th><th></th></tr>' + l.usages.slice().reverse().map(function (u) { return '<tr><td>' + u.date + '</td><td>' + u.days + '</td><td>' + esc(u.note) + '</td><td><button class=\"small sub\" onclick=\"delLeave(' + u.row + ',\\'' + esc(e.code) + '\\')\">削除</button></td></tr>'; }).join('') + '</table></div>' +\n        '<div class=\"panel\"><h2>労務手続き</h2>' + (r.tasks.length ? '<table><tr><th>期限</th><th>手続き</th><th>状態</th></tr>' + r.tasks.map(function (x) { return '<tr><td>' + esc(x.due) + '</td><td>' + esc(x.title) + '</td><td>' + badgeStatus(x.status) + '</td></tr>'; }).join('') + '</table>' : '<p class=\"muted\">なし</p>') + '</div>' +\n        '<div class=\"grid2\"><div class=\"panel\"><h2>給与履歴</h2><table><tr><th>支給月</th><th class=\"n\">総支給</th><th class=\"n\">差引支給</th><th>状態</th><th></th></tr>' + r.pays.map(function (x) { return '<tr><td>' + x.pay_ym + '</td><td class=\"n\">' + yen(x.gross) + '</td><td class=\"n\">' + yen(x.net) + '</td><td>' + badgeStatus(x.status) + '</td><td><button class=\"small sub\" onclick=\"showSlip(\\'' + x.id + '\\', true)\">明細</button></td></tr>'; }).join('') + '</table></div>' +\n        '<div class=\"panel\"><h2>賃金変更履歴</h2>' + (r.changes.length ? r.changes.map(function (c) { return '<p>' + esc(c.effective_ym) + '支給分〜：' + esc(c.detail) + ' ' + (c.checked ? '<span class=\"badge ok\">' + esc(c.result) + '</span>' : '<span class=\"badge warn\">3ヶ月分の確定待ち</span>') + '</p>'; }).join('') : '<p class=\"muted\">なし</p>') + '</div></div>' +\n        (e.leave_date ? '' : '<div class=\"panel\"><h2>退職登録</h2><div class=\"row\"><input type=\"date\" id=\"rtDate\"><select id=\"rtReason\"><option>自己都合</option><option>会社都合</option><option>契約期間満了</option><option>定年</option><option>その他</option></select><button class=\"danger small\" onclick=\"retire(\\'' + esc(e.code) + '\\')\">退職を登録（退職手続きタスクを自動作成）</button></div></div>'));\n    });\n  },\n  employeeEdit: function (p) {\n    var isNew = !p.code;\n    return call(isNew ? 'adm.employeeForm' : 'adm.employee', { code: p.code }).then(function (r) {\n      var e = isNew ? { employment_type: '正社員', tax_column: '甲', social_insurance: true, employment_insurance: true, dependents: 0, account_type: '普通' } : r.emp;\n      S.cols = r.cols;\n      view('<h1>' + (isNew ? '従業員を登録' : esc(e.name) + ' を編集') + '</h1><div class=\"panel\">' + empForm(r.cols, e) +\n        '<p class=\"small muted\">標準報酬月額は資格取得届・算定基礎届などの決定通知書の金額を入力。住民税は「特別徴収税額決定通知書」の金額。口座名義・銀行名・支店名は振込データ用にカナで入力します。</p>' +\n        '<div class=\"row\"><button onclick=\"saveEmp(' + (isNew ? 'null' : '\\'' + esc(e.code) + '\\'') + ')\">' + (isNew ? '登録（入社手続きタスクを作成）' : '保存') + '</button><button class=\"sub\" onclick=\"go(\\'' + (isNew ? 'employees' : 'employee') + '\\', {code:\\'' + esc(e.code || '') + '\\'})\">キャンセル</button></div></div>');\n    });\n  },\n\n  attendance: function (p) {\n    var ym = p.ym || ymNow();\n    return call('adm.attendance', { ym: ym }).then(function (r) {\n      view('<div class=\"row between\"><h1>勤怠</h1>' + monthNav(ym, 'admAtt') + '</div><div class=\"wrap\"><table><tr><th>氏名</th><th class=\"n\">出勤日数</th><th class=\"n\">実働</th><th class=\"n\">時間外</th><th class=\"n\">60h超</th><th class=\"n\">法定休日</th><th class=\"n\">深夜</th><th>打刻漏れ</th><th>36協定</th></tr>' +\n        r.rows.map(function (x) { var bad = x.alerts.some(function (a) { return a.level === 'danger'; }); return '<tr class=\"' + (bad ? 'bad' : '') + '\"><td><a onclick=\"go(\\'attendanceEmp\\', {code:\\'' + esc(x.code) + '\\', ym:\\'' + ym + '\\'})\">' + esc(x.name) + '</a></td><td class=\"n\">' + x.workDays + '</td><td class=\"n\">' + x.worked + '</td><td class=\"n\">' + x.overtime + '</td><td class=\"n\">' + x.over60 + '</td><td class=\"n\">' + x.holiday + '</td><td class=\"n\">' + x.night + '</td><td>' + (x.incomplete ? '<span class=\"badge danger\">' + x.incomplete + '件</span>' : '') + '</td><td class=\"small\">' + x.alerts.map(function (a) { return '<span class=\"badge ' + a.level + '\">' + (a.level === 'danger' ? '超過' : '注意') + '</span> ' + esc(a.msg); }).join('<br>') + '</td></tr>'; }).join('') +\n        '</table></div><p class=\"small muted\">時間外＝1日8時間超＋週40時間超（法定休日を除く）。氏名を押すと日別の勤怠を確認・修正できます。</p>');\n    });\n  },\n  attendanceEmp: function (p) {\n    var ym = p.ym || ymNow();\n    return call('adm.attendanceEmp', { code: p.code, ym: ym }).then(function (r) {\n      S.attCode = r.code;\n      view('<div class=\"row between\"><h1>' + esc(r.name) + ' の勤怠</h1>' + monthNav(ym, 'admAttEmp') + '</div>' +\n        r.alerts.map(function (a) { return '<div class=\"alert ' + (a.level === 'danger' ? 'err' : 'warn') + '\">' + esc(a.msg) + '</div>'; }).join('') + sumStats(r.summary) + attTable(r, true) +\n        '<p class=\"small muted\">出勤・退勤を両方空にして保存すると、その日の記録を削除します。修正内容は操作ログに残ります。</p>');\n    });\n  },\n\n  payroll: function (p) {\n    var ym = p.ym || S.payYm || ymAdd(ymNow(), -1);\n    S.payYm = ym;\n    return call('adm.payroll', { ym: ym }).then(function (r) {\n      var allConfirmed = r.rows.length && r.rows.every(function (x) { return x.pay && x.pay.status === '確定'; });\n      var tot = r.rows.reduce(function (t, x) { if (x.pay) { t.g += x.pay.gross; t.n += x.pay.net; } return t; }, { g: 0, n: 0 });\n      view('<div class=\"row between\"><h1>給与計算 <span class=\"muted small\">' + ym + '勤怠分（' + r.payYm + '月' + r.payDay + '日支給）</span></h1>' + monthNav(ym, 'admPay') + '</div>' +\n        '<div class=\"panel\"><div class=\"row\"><button onclick=\"payCalc()\">① 入力を保存して計算</button><button class=\"sub\" onclick=\"payConfirm()\">② 確定</button><button class=\"sub\" onclick=\"payDo(\\'makeSlips\\')\">③ 明細PDFを作成</button><button class=\"sub\" onclick=\"payDo(\\'mailSlips\\')\">④ 明細をメール送信</button><button class=\"sub\" onclick=\"payTransfer()\">振込データ（全銀）</button><button class=\"sub\" onclick=\"payJournal()\">仕訳CSV</button></div>' +\n        '<p class=\"small muted\">インセンティブ・欠勤日数などを入力して①を押すと、勤怠データから全員分を計算します。確定済みの人は再計算されません。振込データ・仕訳CSVは確定後に作成でき、Googleドライブに保存されます。</p></div>' +\n        '<div class=\"wrap\"><table class=\"wide\"><tr><th>氏名</th><th>インセンティブ</th><th>欠勤日数</th><th>その他手当（名称／金額）</th><th>その他控除（名称／金額）</th><th>源泉税（手入力）</th><th>年末調整</th><th class=\"n\">総支給額</th><th class=\"n\">控除合計</th><th class=\"n\">差引支給額</th><th>状態</th><th></th></tr>' +\n        r.rows.map(function (x) {\n          var i = x.input, pay = x.pay, lock = pay && pay.status === '確定' ? ' disabled' : '', c = x.code;\n          return '<tr><td>' + esc(x.name) + (pay && pay.notes ? '<div class=\"note\">⚠ ' + esc(pay.notes) + '</div>' : '') + '</td>' +\n            '<td><input type=\"number\" id=\"pi_inc_' + c + '\" value=\"' + (i.incentive || '') + '\"' + lock + '></td><td><input type=\"number\" step=\"0.5\" class=\"s\" id=\"pi_abs_' + c + '\" value=\"' + (i.absenceDays || '') + '\"' + lock + '></td>' +\n            '<td><div class=\"stack\"><input placeholder=\"名称\" id=\"pi_oal_' + c + '\" value=\"' + esc(i.otherAllowanceLabel || '') + '\"' + lock + '><input type=\"number\" placeholder=\"金額\" id=\"pi_oa_' + c + '\" value=\"' + (i.otherAllowance || '') + '\"' + lock + '></div></td>' +\n            '<td><div class=\"stack\"><input placeholder=\"名称\" id=\"pi_odl_' + c + '\" value=\"' + esc(i.otherDeductionLabel || '') + '\"' + lock + '><input type=\"number\" placeholder=\"金額\" id=\"pi_od_' + c + '\" value=\"' + (i.otherDeduction || '') + '\"' + lock + '></div></td>' +\n            '<td><input type=\"number\" id=\"pi_wh_' + c + '\" value=\"' + esc(i.withholdingOverride || '') + '\" placeholder=\"自動\"' + lock + '></td><td><input type=\"number\" id=\"pi_ye_' + c + '\" value=\"' + (i.yearEndAdjustment || '') + '\"' + lock + '></td>' +\n            '<td class=\"n\">' + (pay ? yen(pay.gross) : '-') + '</td><td class=\"n\">' + (pay ? yen(pay.deduction_total) : '-') + '</td><td class=\"n\"><b>' + (pay ? yen(pay.net) : '-') + '</b></td><td>' + badgeStatus(pay ? pay.status : '未計算') + '</td>' +\n            '<td><div class=\"acts\">' + (pay ? '<button class=\"small sub\" onclick=\"showSlip(\\'' + pay.id + '\\', true)\">明細</button>' + (pay.status === '確定' ? '<button class=\"small sub\" onclick=\"payUnconfirm(\\'' + pay.id + '\\')\">取消</button>' : '') + (pay.pdf ? '<a href=\"' + esc(pay.pdf) + '\" target=\"_blank\">PDF</a>' : '') : '') + '</div></td></tr>';\n        }).join('') + '<tr><th>合計</th><th colspan=\"6\"></th><th class=\"n\">' + yen(tot.g) + '</th><th></th><th class=\"n\">' + yen(tot.n) + '</th><th colspan=\"2\">' + (allConfirmed ? badgeStatus('確定') : '') + '</th></tr></table></div>');\n      S.payRows = r.rows.map(function (x) { return x.code; });\n    });\n  },\n\n  bonus: function (p) {\n    if (!p.payDate) {\n      return call('adm.bonusList').then(function (list) {\n        view('<h1>賞与</h1><div class=\"panel\"><div class=\"row\"><label>支給日 <input type=\"date\" id=\"bnDate\"></label><button onclick=\"if(val(\\'bnDate\\'))go(\\'bonus\\',{payDate:val(\\'bnDate\\')})\">この日の賞与を作成・開く</button></div></div>' +\n          '<div class=\"panel\"><h2>これまでの賞与</h2>' + (list.length ? '<table><tr><th>支給日</th><th class=\"n\">人数</th><th class=\"n\">賞与総額</th><th>状態</th></tr>' + list.map(function (b) { return '<tr><td><a onclick=\"go(\\'bonus\\',{payDate:\\'' + b.date + '\\'})\">' + b.date + '</a></td><td class=\"n\">' + b.count + '</td><td class=\"n\">' + yen(b.total) + '</td><td>' + badgeStatus(b.confirmed ? '確定' : '下書き') + '</td></tr>'; }).join('') + '</table>' : '<p class=\"muted\">まだありません</p>') + '</div>');\n      });\n    }\n    return call('adm.bonus', { payDate: p.payDate }).then(function (r) {\n      S.bonusDate = r.payDate;\n      S.bonusRows = r.rows.map(function (x) { return x.code; });\n      view('<div class=\"row between\"><h1>賞与 <span class=\"muted small\">' + r.payDate + ' 支給</span></h1><a onclick=\"go(\\'bonus\\')\">← 賞与の一覧</a></div>' +\n        '<div class=\"panel\"><div class=\"row\"><button onclick=\"bonusSave()\">① 保存して計算</button><button class=\"sub\" onclick=\"bonusConfirm()\">② 確定（賞与支払届タスクを作成）</button><button class=\"sub\" onclick=\"bonusDo(\\'bonusSlips\\')\">③ 明細PDFを作成</button><button class=\"sub\" onclick=\"bonusTransfer()\">振込データ（全銀）</button><button class=\"sub\" onclick=\"bonusJournal()\">仕訳CSV</button></div>' +\n        '<p class=\"small muted\">源泉所得税の算出率は、国税庁「賞与に対する源泉徴収税額の算出率の表」で「前月の社会保険料控除後の給与」と「扶養人数」から求めて入力してください（例：6.126）。賞与額を空にして保存すると、その人の行を削除します。</p></div>' +\n        '<div class=\"wrap\"><table class=\"wide\"><tr><th>氏名</th><th class=\"n\">前月の社保控除後給与</th><th class=\"n\">扶養</th><th>賞与額</th><th>算出率（%）</th><th class=\"n\">社会保険料等</th><th class=\"n\">源泉所得税</th><th class=\"n\">差引支給額</th><th>状態</th><th></th></tr>' +\n        r.rows.map(function (x) {\n          var b = x.bonus, lock = b && b.status === '確定' ? ' disabled' : '';\n          return '<tr><td>' + esc(x.name) + (b && b.notes ? '<div class=\"note\">⚠ ' + esc(b.notes) + '</div>' : '') + '</td><td class=\"n\">' + yen(x.prevSalary) + '<div class=\"small muted\">' + esc(x.prevNote) + '</div></td><td class=\"n\">' + x.dependents + '人（' + esc(x.taxColumn) + '）</td>' +\n            '<td><input type=\"number\" id=\"bn_amt_' + x.code + '\" value=\"' + (b ? b.amount : '') + '\"' + lock + '></td><td><input class=\"s\" id=\"bn_rate_' + x.code + '\" value=\"' + esc(b ? b.rate : '') + '\"' + lock + '></td>' +\n            '<td class=\"n\">' + (b ? yen(b.health + b.child + b.pension + b.employment) : '-') + '</td><td class=\"n\">' + (b ? yen(b.withholding) : '-') + '</td><td class=\"n\"><b>' + (b ? yen(b.net) : '-') + '</b></td><td>' + badgeStatus(b ? b.status : '未計算') + '</td>' +\n            '<td>' + (b ? '<button class=\"small sub\" onclick=\"showSlip(\\'' + b.id + '\\', true)\">明細</button>' + (b.pdf ? ' <a href=\"' + esc(b.pdf) + '\" target=\"_blank\">PDF</a>' : '') : '') + '</td></tr>';\n        }).join('') + '</table></div>');\n    });\n  },\n\n  yearend: function (p) {\n    var year = p.year || S.yeYear || String(todayJst().getFullYear());\n    S.yeYear = year;\n    return call('adm.yearEnd', { year: year }).then(function (r) { renderYearEnd(r); });\n  },\n\n  tasks: function (p) {\n    var st = p.status || '未完了';\n    return call('adm.tasks', { status: st }).then(function (list) {\n      var t = todayJst(); var ts = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);\n      view('<div class=\"row between\"><h1>労務タスク</h1><div class=\"tabs\" style=\"width:260px;margin:0\"><a class=\"' + (st === '未完了' ? 'on' : '') + '\" onclick=\"go(\\'tasks\\',{status:\\'未完了\\'})\">未完了</a><a class=\"' + (st === '完了' ? 'on' : '') + '\" onclick=\"go(\\'tasks\\',{status:\\'完了\\'})\">完了</a></div></div>' +\n        '<p class=\"small muted\">入社・退職の登録、賞与の確定、給与確定時の月額変更届の判定、年次スケジュールから自動で作られます。書類の作成・提出は自社の担当者または顧問社労士が行ってください。</p>' +\n        '<div class=\"wrap\"><table><tr><th>期限</th><th>区分</th><th>手続き</th><th>対象者</th><th>状態・メモ</th></tr>' + list.map(function (x) {\n          var od = st !== '完了' && x.due && x.due < ts;\n          return '<tr class=\"' + (od ? 'bad' : '') + '\"><td>' + esc(x.due) + (od ? ' <span class=\"badge danger\">超過</span>' : '') + '</td><td><span class=\"badge\">' + esc(x.category) + '</span></td><td>' + esc(x.title) + '<div class=\"small muted\">' + esc(x.basis) + '</div></td><td>' + esc(x.name) + '</td>' +\n            '<td><div class=\"row\"><select id=\"ts_' + x.row + '\">' + ['未対応', '対応中', '完了'].map(function (o) { return '<option' + (o === x.status ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select><input id=\"tn_' + x.row + '\" value=\"' + esc(x.note) + '\" placeholder=\"メモ（提出日など）\" class=\"w\"><button class=\"small\" onclick=\"taskSave(' + x.row + ')\">保存</button>' + (x.filing ? '<button class=\"small sub\" onclick=\\'openFiling(' + esc(JSON.stringify(x.filing)) + ')\\'>書類</button>' : '') + '</div>' + (x.completed_at ? '<div class=\"small muted\">完了 ' + esc(x.completed_at) + '</div>' : '') + '</td></tr>';\n        }).join('') + '</table></div>' +\n        '<div class=\"panel\" style=\"margin-top:16px\"><h2>タスクを追加</h2><div class=\"row\"><input id=\"ntTitle\" placeholder=\"内容\" style=\"flex:1;min-width:220px\"><input type=\"date\" id=\"ntDue\"><input id=\"ntName\" placeholder=\"対象者（空欄なら全社）\"><button class=\"small\" onclick=\"taskAdd()\">追加</button></div></div>');\n    });\n  },\n\n  filings: function (p) {\n    return call('adm.filingTargets').then(function (r) {\n      S.ft = r;\n      var types = Object.keys(r.types).map(function (k) { return '<option value=\"' + k + '\"' + (p.type === k ? ' selected' : '') + '>' + esc(r.types[k]) + '</option>'; }).join('');\n      view('<h1>届出書類（記入内容シート）</h1>' +\n        '<div class=\"alert warn\">正式な様式そのものではありません。正式様式の項目順に、従業員・給与データを当てはめた<b>転記用の資料</b>です。e-Gov電子申請・日本年金機構の届書作成プログラム・各機関の様式に転記して提出してください。マイナンバーは保持していないため、本人確認書類から記入します。</div>' +\n        '<div class=\"panel\"><div class=\"form\"><label>書類<select id=\"fgType\" onchange=\"fgTarget()\">' + types + '</select></label><label id=\"fgTargetBox\">対象</label></div>' +\n        '<div class=\"row\" style=\"margin-top:10px\"><button onclick=\"fgShow()\">内容を表示</button><button class=\"sub\" onclick=\"fgPdf()\">PDFを作成（Googleドライブに保存）</button></div></div>' +\n        '<div id=\"fgOut\"></div>');\n      fgTarget(p);\n      if (p.type) fgShow();\n    });\n  },\n\n  settings: function () {\n    return call('adm.settings').then(function (list) {\n      var groups = [['会社・労働時間', function (k) { return /company_name|pay_|legal|scheduled|daily|weekly|agreement36/.test(k); }], ['社会保険料率（毎年度要確認）', function (k) { return /_rate|child_support/.test(k); }],\n        ['通知・ログイン', function (k) { return /notify|slack|punch_require|admin_emails/.test(k); }], ['会社情報（届出書類用）', function (k) { return /corporate_number|company_address|company_rep|company_tel|_office_/.test(k); }], ['振込データ（会社の口座）', function (k) { return /zengin|company_bank|company_branch|company_account/.test(k); }], ['仕訳CSVの勘定科目', function (k) { return /^acct_/.test(k); }]];\n      S.settingKeys = list.map(function (x) { return x.key; });\n      view('<h1>設定</h1><div class=\"alert warn\">【要確認】の料率は毎年度改定されます。協会けんぽ（都道府県支部）・厚生労働省の公式資料で確認してから給与計算を行ってください。</div><div class=\"panel\">' +\n        groups.map(function (g) { return '<fieldset><legend>' + g[0] + '</legend><div class=\"form\">' + list.filter(function (x) { return g[1](x.key); }).map(function (x) { return '<label>' + esc(x.label) + '<input id=\"st_' + x.key + '\" value=\"' + esc(x.value) + '\">' + (x.hint ? '<span>' + esc(x.hint) + '</span>' : '') + '</label>'; }).join('') + '</div></fieldset>'; }).join('') +\n        '<button onclick=\"saveSettings()\">保存</button></div>');\n    });\n  },\n  logs: function () {\n    return call('adm.logs').then(function (list) {\n      view('<h1>操作ログ</h1><p class=\"small muted\">勤怠修正・給与確定・設定変更・ログインなどの記録（直近300件）。</p><div class=\"wrap\"><table><tr><th>日時</th><th>操作者</th><th>操作</th><th>内容</th></tr>' +\n        list.map(function (l) { return '<tr><td class=\"small\">' + esc(l.at) + '</td><td>' + esc(l.actor) + '</td><td>' + esc(l.action) + '</td><td class=\"small\">' + esc(l.detail) + '</td></tr>'; }).join('') + '</table></div>');\n    });\n  },\n};\n\n// ---------- 管理画面の操作 ----------\nfunction admRefresh() { call('adm.refresh').then(function (r) { go('dashboard', {}, '更新しました（新しいタスク ' + r.created + '件' + (r.changes.length ? '、賃金変更を検知：' + r.changes.join('、') : '') + '）'); }).catch(fail); }\nfunction taskDone(row) { call('adm.updateTask', { row: row, status: '完了' }).then(function () { go(S.view); }).catch(fail); }\nfunction taskSave(row) { call('adm.updateTask', { row: row, status: $('ts_' + row).value, note: val('tn_' + row) }).then(function () { go('tasks', S.params); }).catch(fail); }\nfunction taskAdd() { call('adm.addTask', { title: val('ntTitle'), due: val('ntDue'), name: val('ntName') }).then(function () { go('tasks'); }).catch(fail); }\nfunction saveEmp(orig) {\n  var f = readEmpForm(S.cols);\n  call('adm.saveEmployee', { originalCode: orig, fields: f }).then(function (r) {\n    go('employee', { code: r.code }, '保存しました' + (r.created ? '（労務タスク ' + r.created + '件を作成）' : '') + (r.changes.length ? '\\n固定的賃金の変更を記録しました：' + r.changes.join('、') + '\\n（賃金変更履歴の「変更後の初回支給月」が違う場合はスプレッドシートで修正してください）' : ''));\n  }).catch(fail);\n}\nfunction retire(code) { if (!val('rtDate')) return flash('退職日を入力してください', 'err'); if (!confirm('退職を登録し、退職手続きのタスクを作成します。よろしいですか？')) return; call('adm.retire', { code: code, leave_date: val('rtDate'), leave_reason: val('rtReason') }).then(function (r) { go('employee', { code: code }); }).catch(fail); }\nfunction addLeave(code) { call('adm.addLeave', { code: code, date: val('lvDate'), days: val('lvDays'), note: val('lvNote') }).then(function () { go('employee', { code: code }); }).catch(fail); }\nfunction delLeave(row, code) { if (!confirm('削除しますか？')) return; call('adm.deleteLeave', { row: row }).then(function () { go('employee', { code: code }); }).catch(fail); }\nfunction admAtt(ym) { go('attendance', { ym: ym }); }\nfunction admAttEmp(ym) { go('attendanceEmp', { code: S.attCode, ym: ym }); }\nfunction saveAtt(date) {\n  call('adm.saveAttendance', { code: S.attCode, date: date, clock_in: val('i_' + date), clock_out: val('o_' + date), break_minutes: val('b_' + date), note: val('m_' + date) })\n    .then(function () { go('attendanceEmp', { code: S.attCode, ym: date.slice(0, 7) }, date + ' を保存しました'); }).catch(fail);\n}\nfunction admPay(ym) { go('payroll', { ym: ym }); }\nfunction payInputs() {\n  return S.payRows.map(function (c) { return { code: c, incentive: val('pi_inc_' + c), absenceDays: val('pi_abs_' + c), otherAllowanceLabel: val('pi_oal_' + c), otherAllowance: val('pi_oa_' + c), otherDeductionLabel: val('pi_odl_' + c), otherDeduction: val('pi_od_' + c), withholdingOverride: val('pi_wh_' + c), yearEndAdjustment: val('pi_ye_' + c) }; });\n}\nfunction payCalc() { call('adm.savePayInputs', { ym: S.payYm, rows: payInputs() }).then(function (msg) { go('payroll', { ym: S.payYm }, msg); }).catch(fail); }\nfunction payConfirm() { if (!confirm(S.payYm + '勤怠分の下書きの給与をすべて確定します。よろしいですか？')) return; call('adm.confirmPayroll', { ym: S.payYm }).then(function (msg) { go('payroll', { ym: S.payYm }, msg); }).catch(fail); }\nfunction payUnconfirm(id) { var reason = prompt('確定を取り消す理由を入力してください（操作ログに残ります）'); if (!reason) return; call('adm.unconfirmPayroll', { id: id, reason: reason }).then(function () { go('payroll', { ym: S.payYm }); }).catch(fail); }\nfunction payDo(action) { if (action === 'mailSlips' && !confirm('明細メール配信に同意した従業員に、明細PDFをメールで送信します。よろしいですか？')) return; call('adm.' + action, { ym: S.payYm }).then(function (msg) { go('payroll', { ym: S.payYm }, msg); }).catch(fail); }\nfunction fileResult(r) {\n  if (r.ok === false) return flash('作成できませんでした。次の項目を確認してください：\\n' + r.errors.join('\\n'), 'err');\n  flash(r.name + ' を作成しました' + (r.count ? '（' + r.count + '件・合計 ' + yen(r.total) + '円）' : '') + '\\nGoogleドライブ：' + r.url);\n  $('flash').innerHTML += '<br><a href=\"' + esc(r.url) + '\" target=\"_blank\">ファイルを開く</a>';\n}\nfunction payTransfer() { var d = prompt('振込指定日（YYYY-MM-DD）。空欄なら設定の給与支給日', ''); if (d === null) return; call('adm.transfer', { kind: 'payroll', key: S.payYm, payDate: d }).then(fileResult).catch(fail); }\nfunction payJournal() { call('adm.journal', { kind: 'payroll', key: S.payYm }).then(fileResult).catch(fail); }\nfunction bonusInputs() { return S.bonusRows.map(function (c) { return { code: c, amount: val('bn_amt_' + c), rate: val('bn_rate_' + c) }; }); }\nfunction bonusSave() { call('adm.saveBonus', { payDate: S.bonusDate, rows: bonusInputs() }).then(function (msg) { go('bonus', { payDate: S.bonusDate }, msg); }).catch(fail); }\nfunction bonusConfirm() { if (!confirm(S.bonusDate + ' 支給の賞与を確定します。よろしいですか？')) return; call('adm.confirmBonus', { payDate: S.bonusDate }).then(function (msg) { go('bonus', { payDate: S.bonusDate }, msg); }).catch(fail); }\nfunction bonusDo(action) { call('adm.' + action, { payDate: S.bonusDate }).then(function (msg) { go('bonus', { payDate: S.bonusDate }, msg); }).catch(fail); }\nfunction bonusTransfer() { call('adm.transfer', { kind: 'bonus', key: S.bonusDate, payDate: S.bonusDate }).then(fileResult).catch(fail); }\nfunction bonusJournal() { call('adm.journal', { kind: 'bonus', key: S.bonusDate }).then(fileResult).catch(fail); }\nfunction saveSettings() { var v = {}; S.settingKeys.forEach(function (k) { v[k] = val('st_' + k); }); call('adm.saveSettings', { values: v }).then(function (n) { go('settings', {}, n + '件の設定を保存しました'); }).catch(fail); }\n\n// ---------- 届出書類 ----------\nfunction openFiling(f) { go('filings', f); }\nfunction fgTarget(p) {\n  p = p || {};\n  var t = $('fgType').value, r = S.ft, html;\n  if (t === 'getsuhen') html = r.changes.length ? '<select id=\"fgChange\">' + r.changes.map(function (c, i) { return '<option value=\"' + i + '\"' + (c.code === p.code && (!p.eff || c.eff === p.eff) ? ' selected' : '') + '>' + esc(c.name + '：' + c.eff + '支給分〜 ' + c.detail + (c.result ? '（' + c.result + '）' : '')) + '</option>'; }).join('') + '</select>' : '<span class=\"muted\">賃金変更履歴がありません</span>';\n  else if (t === 'bonus_pay') html = r.bonusDates.length ? '<select id=\"fgDate\">' + r.bonusDates.map(function (d) { return '<option' + (d === p.payDate ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' : '<span class=\"muted\">確定済みの賞与がありません</span>';\n  else if (t === 'santei') html = '<input id=\"fgYear\" type=\"number\" value=\"' + esc(p.year || r.year) + '\">';\n  else {\n    var leaving = /loss|ido/.test(t);\n    var list = r.emps.filter(function (e) { return !leaving || e.leave_date; });\n    html = list.length ? '<select id=\"fgEmp\">' + list.map(function (e) { return '<option value=\"' + esc(e.code) + '\"' + (e.code === p.code ? ' selected' : '') + '>' + esc(e.name + '（入社 ' + e.hire_date + (e.leave_date ? '・退職 ' + e.leave_date : '') + '）') + '</option>'; }).join('') + '</select>' : '<span class=\"muted\">退職日が登録された従業員がいません</span>';\n  }\n  $('fgTargetBox').innerHTML = '対象' + html;\n}\nfunction fgParams() {\n  var t = $('fgType').value, d = { type: t };\n  if (t === 'getsuhen') { var c = S.ft.changes[Number(val('fgChange'))]; if (c) { d.code = c.code; d.eff = c.eff; } }\n  else if (t === 'bonus_pay') d.payDate = val('fgDate');\n  else if (t === 'santei') d.year = val('fgYear');\n  else d.code = val('fgEmp');\n  return d;\n}\nfunction fgShow() {\n  call('adm.filing', fgParams()).then(function (r) {\n    $('fgOut').innerHTML = '<div class=\"panel\"><style>' + r.css + '</style><div class=\"row between noprint\" style=\"margin-bottom:8px\"><span>' + (r.missing.length ? '<span class=\"badge warn\">要記入 ' + r.missing.length + '件</span>' : '<span class=\"badge ok\">要記入なし</span>') + '</span><span><button class=\"small sub\" onclick=\"window.print()\">印刷</button> <button class=\"small\" onclick=\"fgPdf()\">PDFを作成</button></span></div>' + r.html + '</div>';\n  }).catch(fail);\n}\nfunction fgPdf() { call('adm.filingPdf', fgParams()).then(fileResult).catch(fail); }\n\n// ---------- 年末調整 ----------\nvar YE_FIELDS = [['socialDeclared', '申告による社会保険料'], ['lifeInsurance', '生命保険料控除'], ['earthquake', '地震保険料控除'], ['spouseSpecial', '配偶者特別控除'],\n  ['depGeneral', '一般扶養（人）'], ['depSpecific', '特定扶養 19〜22歳（人）'], ['depElderly', '老人扶養 70歳〜（人）'], ['depElderlyTogether', '同居老親等（人）'], ['otherDeduction', 'その他の所得控除（障害者・特定親族特別控除など）'], ['housingLoan', '住宅借入金等特別控除']];\nfunction renderYearEnd(r) {\n  S.yeRows = r.rows.map(function (x) { return x.code; });\n  view('<div class=\"row between\"><h1>年末調整 <span class=\"muted small\">' + r.year + '年分</span></h1><div class=\"row\"><button class=\"sub small\" onclick=\"go(\\'yearend\\',{year:\\'' + (r.year - 1) + '\\'})\">← 前年</button><button class=\"sub small\" onclick=\"go(\\'yearend\\',{year:\\'' + (Number(r.year) + 1) + '\\'})\">翌年 →</button></div></div>' +\n    '<div class=\"alert warn\">' + esc(r.note) + '</div>' +\n    '<div class=\"panel\"><div class=\"row\"><button onclick=\"yeCalc()\">① 入力を保存して計算</button><button class=\"sub\" onclick=\"yeReflect()\">② 過不足を12月支給の給与に反映</button></div></div>' +\n    r.rows.map(function (x) {\n      var sv = x.saved || {}, a = x.auto;\n      var v = function (k) { return sv[k] !== undefined && sv[k] !== '' ? sv[k] : ''; };\n      return '<div class=\"panel\"><div class=\"row between\"><h2>' + esc(x.name) + '</h2>' + (x.saved ? badgeStatus('計算済み') + (sv.reflected ? ' <span class=\"badge ok\">12月給与に反映済み</span>' : '') : badgeStatus('未計算')) + '</div>' +\n        '<div class=\"kv\" style=\"max-width:520px\"><div><span>給与等の支払金額（自動）</span><span>' + yen(a.salaryIncome) + '円</span></div><div><span>源泉徴収済み税額（自動）</span><span>' + yen(a.withheld) + '円</span></div><div><span>給与等から控除した社会保険料（自動）</span><span>' + yen(a.socialWithheld) + '円</span></div><div><span>集計対象</span><span class=\"small\">' + esc(a.months.join('・')) + '月支給' + (a.bonusCount ? '＋賞与' + a.bonusCount + '回' : '') + '</span></div></div>' +\n        '<div class=\"form\" style=\"margin-top:10px\"><label>配偶者控除<select id=\"ye_spouseType_' + x.code + '\">' + ['なし', '一般', '老人'].map(function (o) { return '<option' + (o === (sv.spouseType || 'なし') ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>' +\n        YE_FIELDS.map(function (f) { return '<label>' + f[1] + '<input type=\"number\" id=\"ye_' + f[0] + '_' + x.code + '\" value=\"' + v(f[0]) + '\"></label>'; }).join('') + '</div>' +\n        (x.saved ? '<div class=\"stats\" style=\"margin-top:12px\"><div class=\"stat\"><b>' + yen(sv.salaryIncomeAfter) + '</b><span>給与所得控除後</span></div><div class=\"stat\"><b>' + yen(sv.deductionTotal) + '</b><span>所得控除の合計</span></div><div class=\"stat\"><b>' + yen(sv.taxableIncome) + '</b><span>課税所得</span></div><div class=\"stat\"><b>' + yen(sv.annualTax) + '</b><span>年調年税額</span></div><div class=\"stat ' + (sv.diff > 0 ? 'warn' : '') + '\"><b>' + (sv.diff > 0 ? '徴収 ' : sv.diff < 0 ? '還付 ' : '') + yen(Math.abs(sv.diff)) + '円</b><span>過不足</span></div></div>' : '') + '</div>';\n    }).join(''));\n}\nfunction yeCalc() {\n  var rows = S.yeRows.map(function (c) { var r = { code: c, spouseType: val('ye_spouseType_' + c) }; YE_FIELDS.forEach(function (f) { r[f[0]] = val('ye_' + f[0] + '_' + c); }); return r; });\n  call('adm.saveYearEnd', { year: S.yeYear, rows: rows }).then(function () { go('yearend', { year: S.yeYear }, '計算しました'); }).catch(fail);\n}\nfunction yeReflect() { if (!confirm(S.yeYear + '年12月支給の給与に、年末調整の過不足を反映して再計算します。よろしいですか？')) return; call('adm.reflectYearEnd', { year: S.yeYear }).then(function (msg) { flash(msg); }).catch(fail); }\n\nstart();\n</script>\n</body>\n</html>\n";

// ============================================================
// 本体：シート定義・メニュー・打刻Webアプリ・給与計算・労務タスク・通知
// ============================================================
var Dates = __req('dates');
var Att = __req('attendance');
var Leave = __req('leave');
var Payroll = __req('payroll');
var Proc = __req('procedures');
var SR = __req('standardRemuneration');
var Bonus = __req('bonus');
var YearEnd = __req('yearEnd');
var Zengin = __req('zengin');
var Filings = __req('filings');

// ---------- シート定義 [キー, 見出し, 型] ----------
// 型: text / num / numOrNull / bool / date / time / ym / hours（表示用）
var EARN_LABELS = ['基本給', '役職手当', '固定残業代', '超過残業手当', '休日労働手当', '深夜労働手当', 'インセンティブ', 'インセンティブ割増', 'その他手当', '通勤手当（非課税）', '欠勤控除'];
var DED_LABELS = ['健康保険料', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料', '源泉所得税', '住民税', 'その他控除', '年末調整過不足'];

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
      ['bank_code', '振込先 銀行番号', 'text'], ['bank_name', '振込先 銀行名（カナ）', 'text'], ['branch_code', '振込先 支店番号', 'text'], ['branch_name', '振込先 支店名（カナ）', 'text'],
      ['account_type', '振込先 預金種目', 'text'], ['account_number', '振込先 口座番号', 'text'], ['account_holder', '振込先 口座名義（カナ）', 'text'],
      ['insured_number', '健保・厚年 被保険者整理番号', 'text'], ['koyou_number', '雇用保険 被保険者番号', 'text'], ['weekly_hours', '週の所定労働時間', 'num'],
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
      ['otherDeduction', 'その他控除（金額）', 'num'], ['withholdingOverride', '源泉所得税（手入力）', 'text'], ['yearEndAdjustment', '年末調整過不足', 'num'], ['note', 'メモ', 'text'],
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
  bonus: {
    name: '賞与', color: '#d97706',
    cols: [
      ['pay_date', '支給日', 'date'], ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['status', '状態', 'text'], ['amount', '賞与額', 'num'],
      ['rate', '源泉 算出率（%）', 'text'], ['prev_salary', '前月の社保控除後給与', 'num'], ['dependents', '扶養人数', 'num'], ['std', '標準賞与額', 'num'],
      ['health_std', '健保 標準賞与額', 'num'], ['care', '介護保険対象', 'bool'], ['health', '健康保険料', 'num'], ['child', '子ども・子育て支援金', 'num'],
      ['pension', '厚生年金保険料', 'num'], ['employment', '雇用保険料', 'num'], ['withholding', '源泉所得税', 'num'], ['deduction_total', '控除合計', 'num'],
      ['net', '差引支給額', 'num'], ['notes', '要確認事項', 'text'], ['confirmed_at', '確定日時', 'text'], ['pdf', '明細PDF', 'text'],
    ],
  },
  yearEnd: {
    name: '年末調整', color: '#0891b2',
    cols: [
      ['year', '対象年', 'text'], ['code', '社員番号', 'text'], ['name', '氏名', 'text'], ['status', '状態', 'text'],
      ['salaryIncome', '給与等の支払金額', 'num'], ['withheld', '源泉徴収済み税額', 'num'], ['socialWithheld', '給与等から控除した社会保険料', 'num'],
      ['socialDeclared', '申告による社会保険料', 'num'], ['lifeInsurance', '生命保険料控除', 'num'], ['earthquake', '地震保険料控除', 'num'],
      ['spouseType', '配偶者控除（なし/一般/老人）', 'text'], ['spouseSpecial', '配偶者特別控除', 'num'], ['depGeneral', '一般扶養（人）', 'num'],
      ['depSpecific', '特定扶養（人）', 'num'], ['depElderly', '老人扶養（人）', 'num'], ['depElderlyTogether', '同居老親等（人）', 'num'],
      ['otherDeduction', 'その他の所得控除', 'num'], ['housingLoan', '住宅借入金等特別控除', 'num'], ['salaryIncomeAfter', '給与所得控除後の金額', 'num'],
      ['deductionTotal', '所得控除の合計', 'num'], ['taxableIncome', '課税所得', 'num'], ['annualTax', '年調年税額', 'num'],
      ['diff', '過不足（＋徴収／−還付）', 'num'], ['reflected', '12月給与に反映済み', 'bool'], ['calculated_at', '計算日時', 'text'],
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
  ['corporate_number', '会社：法人番号（13桁）', '', '届出書類の記入内容シートに使用'],
  ['company_address', '会社：所在地', '', ''],
  ['company_rep', '会社：代表者（事業主）氏名', '', ''],
  ['company_tel', '会社：電話番号', '', ''],
  ['shakai_office_symbol', '社会保険：事業所整理記号', '', '適用通知書・保険料納入告知書に記載'],
  ['shakai_office_number', '社会保険：事業所番号', '', ''],
  ['koyou_office_number', '雇用保険：適用事業所番号', '', '例：1301-123456-7'],
  ['admin_emails', '管理者のGoogleアカウント（カンマ区切り）', '', 'ここに入れた人は管理画面を使える（スプレッドシートのオーナーは常に管理者）'],
  ['zengin_client_code', '振込：委託者コード（10桁）', '', '銀行と総合振込の契約をしたときに通知される番号'],
  ['zengin_client_name', '振込：委託者名（カナ）', '', '例：ｶ)ﾆｼﾞｶﾝｺﾞﾃﾝｼｮｸ'],
  ['company_bank_code', '振込：振込元 銀行番号（4桁）', '', ''],
  ['company_bank_name', '振込：振込元 銀行名（カナ）', '', ''],
  ['company_branch_code', '振込：振込元 支店番号（3桁）', '', ''],
  ['company_branch_name', '振込：振込元 支店名（カナ）', '', ''],
  ['company_account_type', '振込：振込元 預金種目（普通/当座）', '普通', ''],
  ['company_account_number', '振込：振込元 口座番号（7桁）', '', ''],
  ['acct_salary', '仕訳：給与の勘定科目', '給料手当', ''],
  ['acct_bonus', '仕訳：賞与の勘定科目', '賞与', ''],
  ['acct_commute', '仕訳：通勤手当の勘定科目', '旅費交通費', ''],
  ['acct_deposit', '仕訳：預り金の勘定科目', '預り金', '社会保険料・源泉所得税・住民税'],
  ['acct_payable', '仕訳：差引支給額の勘定科目', '未払金', '支給日に普通預金で支払う前提'],
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
  if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1); // 文字列化の印 ' が値に残った場合
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
    .addItem('Webアプリ（従業員マイページ・管理画面）のURLを表示', 'menuShowUrl')
    .addItem('管理者パスワードを設定（Googleアカウントで入れない場合用）', 'menuSetAdminPassword')
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
  return HtmlService.createHtmlOutput(HTML_APP)
    .setTitle(getSettings_().company_name + ' 勤怠・給与')
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
  try {
    return punchCore_(authPunch_(code, pin), action, place);
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

// 打刻の本体（本人確認済みの従業員で実行）
function punchCore_(emp, action, place) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
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
      otherDeduction: inp.otherDeduction, otherDeductionLabel: inp.otherDeductionLabel, yearEndAdjustment: inp.yearEndAdjustment,
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
function esc_(t) {
  return String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
function yen_(v) { return Number(v || 0).toLocaleString(); }

var SLIP_CSS = 'body{font-family:sans-serif;font-size:11pt;margin:24px}.slip h1{text-align:center;font-size:18pt}.slip table{border-collapse:collapse;width:100%;margin-top:8px}.slip td,.slip th{border:1px solid #999;padding:5px 8px}.slip .n{text-align:right}.slip .cols{display:flex;gap:12px}.slip .cols>div{flex:1}';

// 給与明細の本文（画面表示とPDFで共通）
function slipBody_(p, s) {
  var rowsE = EARN_LABELS.filter(function (l) { return p['e:' + l]; }).map(function (l) { return '<tr><td>' + l + '</td><td class="n">' + yen_(p['e:' + l]) + '</td></tr>'; }).join('');
  var rowsD = DED_LABELS.filter(function (l) { return p['d:' + l]; }).map(function (l) { return '<tr><td>' + (l === '健康保険料' && p.care ? '健康保険料（介護含む）' : l) + '</td><td class="n">' + yen_(p['d:' + l]) + '</td></tr>'; }).join('');
  return '<div class="slip"><h1>給与明細書</h1><p><b>' + esc_(p.name) + '</b> 様（' + esc_(p.code) + '）<br>' + p.pay_ym.replace('-', '年') + '月' + esc_(s.pay_day) + '日支給（' + p.ym.replace('-', '年') + '月勤怠分）　' + esc_(s.company_name) + '</p>' +
    '<table><tr><th>出勤日数</th><th>労働時間</th><th>時間外</th><th>法定休日</th><th>深夜</th></tr><tr><td>' + p.work_days + '日</td><td>' + esc_(p.worked) + '</td><td>' + esc_(p.overtime) + '</td><td>' + esc_(p.holiday) + '</td><td>' + esc_(p.night) + '</td></tr></table>' +
    '<div class="cols"><div><h3>支給</h3><table>' + rowsE + '<tr><th>総支給額</th><th class="n">' + yen_(p.gross) + '</th></tr></table></div>' +
    '<div><h3>控除</h3><table>' + rowsD + '<tr><th>控除合計</th><th class="n">' + yen_(p.deduction_total) + '</th></tr></table></div></div>' +
    '<table><tr><th style="width:50%">差引支給額</th><th class="n" style="font-size:14pt">' + yen_(p.net) + ' 円</th></tr></table></div>';
}

// 賞与明細の本文
function bonusSlipBody_(b, s) {
  var rows = [['健康保険料' + (b.care ? '（介護含む）' : ''), b.health], ['子ども・子育て支援金', b.child], ['厚生年金保険料', b.pension], ['雇用保険料', b.employment], ['源泉所得税', b.withholding]]
    .filter(function (r) { return r[1]; }).map(function (r) { return '<tr><td>' + r[0] + '</td><td class="n">' + yen_(r[1]) + '</td></tr>'; }).join('');
  return '<div class="slip"><h1>賞与明細書</h1><p><b>' + esc_(b.name) + '</b> 様（' + esc_(b.code) + '）<br>' + esc_(b.pay_date.replace(/-/g, '/')) + ' 支給　' + esc_(s.company_name) + '</p>' +
    '<div class="cols"><div><h3>支給</h3><table><tr><td>賞与</td><td class="n">' + yen_(b.amount) + '</td></tr><tr><th>総支給額</th><th class="n">' + yen_(b.amount) + '</th></tr></table></div>' +
    '<div><h3>控除</h3><table>' + rows + '<tr><th>控除合計</th><th class="n">' + yen_(b.deduction_total) + '</th></tr></table></div></div>' +
    '<table><tr><th style="width:50%">差引支給額</th><th class="n" style="font-size:14pt">' + yen_(b.net) + ' 円</th></tr></table></div>';
}

function slipHtml_(p, s) {
  return '<html><head><meta charset="utf-8"><style>' + SLIP_CSS + '</style></head><body>' + slipBody_(p, s) + '</body></html>';
}

function slipPdf_(html, name) {
  return Utilities.newBlob('<html><head><meta charset="utf-8"><style>' + SLIP_CSS + '</style></head><body>' + html + '</body></html>', 'text/html', 'slip.html')
    .getAs('application/pdf').setName(name);
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
    var blob = slipPdf_(slipBody_(p, s), '給与明細_' + p.pay_ym + '_' + p.code + '_' + p.name + '.pdf');
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
    ? 'Webアプリ（従業員マイページ・管理画面）のURL：\n' + url + '\n\n・従業員：このURLで打刻・勤怠・給与明細・有給を確認できます（スマホの「ホーム画面に追加」推奨）\n・管理者：同じURLを開くと管理画面に入れます（設定シートの「管理者のGoogleアカウント」に登録した人とオーナー）'
    : 'まだWebアプリとして公開されていません。\n\n1. 拡張機能 → Apps Script を開き、右上「デプロイ」→「新しいデプロイ」\n2. 種類の選択で「ウェブアプリ」\n3. 次のユーザーとして実行：「自分」\n4. アクセスできるユーザー：「（会社名）内の全員」（Google Workspaceの場合）または「Googleアカウントを持つ全員」\n5. 「デプロイ」→ 表示されたURLが、従業員マイページ・管理画面の共通URLです';
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

// ============================================================
// Webアプリ（従業員マイページ・管理画面）のサーバー側
// 画面（app.html）からは api({token, action, data}) だけを呼ぶ
// ============================================================

// ---------- ログイン・セッション ----------
var SESSION_SEC = 6 * 3600;

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function newSession_(sess) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess:' + token, JSON.stringify(sess), SESSION_SEC);
  return token;
}

function getSession_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess:' + token);
  return raw ? JSON.parse(raw) : null;
}

function ownerEmail_() {
  try { return (Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

function isAdminEmail_(email, s) {
  if (!email) return false;
  if (email === ownerEmail_()) return true;
  return String(s.admin_emails || '').toLowerCase().split(',').map(function (x) { return x.trim(); }).indexOf(email) >= 0;
}

function sessionInfo_(sess) {
  return { name: sess.name, code: sess.code || '', isAdmin: !!sess.isAdmin, isEmployee: !!sess.code, via: sess.via };
}

function menuSetAdminPassword() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('管理者パスワードを設定します（12文字以上推奨）。\nGoogleアカウントで管理画面に入れない場合に使います。', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText();
  if (pw.length < 8) { ui_alert_('8文字以上にしてください'); return; }
  PropertiesService.getScriptProperties().setProperty('adminPwHash', sha256_('roumu:' + pw));
  log_('管理者パスワード設定', '');
  ui_alert_('管理者パスワードを設定しました。');
}

// ---------- 入口 ----------
function api(req) {
  req = req || {};
  try {
    var action = String(req.action || '');
    var data = req.data || {};
    if (action.indexOf('auth.') === 0) {
      if (!AUTH_ACTIONS[action.slice(5)]) throw new Error('不明な操作です');
      return { ok: true, result: AUTH_ACTIONS[action.slice(5)](data) };
    }
    var sess = getSession_(req.token);
    if (!sess) return { ok: false, error: 'ログインの有効期限が切れました。もう一度ログインしてください', relogin: true };
    if (action.indexOf('me.') === 0) {
      if (!sess.code) throw new Error('従業員として登録されていないアカウントです');
      var emp = employees_().filter(function (e) { return e.code === sess.code; })[0];
      if (!emp) throw new Error('従業員情報が見つかりません');
      if (!ME_ACTIONS[action.slice(3)]) throw new Error('不明な操作です');
      return { ok: true, result: ME_ACTIONS[action.slice(3)](emp, data, sess) };
    }
    if (action.indexOf('adm.') === 0) {
      if (!sess.isAdmin) throw new Error('管理者のみ利用できます');
      sess.actor = sess.email || ('管理者（' + (sess.name || 'パスワード') + '）');
      var fn = ADM_ACTIONS[action.slice(4)];
      if (!fn) throw new Error('不明な操作です: ' + action);
      return { ok: true, result: fn(data, sess) };
    }
    throw new Error('不明な操作です: ' + action);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

var AUTH_ACTIONS = {
  // 画面を開いたとき：Googleアカウントで本人を特定できれば自動ログイン
  init: function () {
    var s = getSettings_();
    var email = currentEmail_();
    var emp = email ? employees_().filter(function (e) { return e.email && e.email.toLowerCase() === email; })[0] : null;
    var admin = isAdminEmail_(email, s);
    var requirePin = String(s.punch_require_pin).toUpperCase() === 'TRUE';
    if ((emp && !requirePin) || admin) {
      var sess = { email: email, name: emp ? emp.name : email, code: emp && !requirePin ? emp.code : '', isAdmin: admin, via: 'google' };
      return { company: s.company_name, token: newSession_(sess), me: sessionInfo_(sess) };
    }
    return { company: s.company_name, needLogin: true, adminPasswordEnabled: !!PropertiesService.getScriptProperties().getProperty('adminPwHash') };
  },
  pin: function (d) {
    var emp = authPunch_(d.code, d.pin);
    if (emp.leave_date && emp.leave_date < today_()) throw new Error('退職済みのためログインできません');
    var sess = { email: '', name: emp.name, code: emp.code, isAdmin: false, via: 'pin' };
    log_('ログイン（PIN）', emp.name);
    return { token: newSession_(sess), me: sessionInfo_(sess) };
  },
  admin: function (d) {
    var cache = CacheService.getScriptCache();
    var fails = Number(cache.get('adminfail') || 0);
    if (fails >= 5) throw new Error('パスワードの入力に続けて失敗したため、約15分間ログインできません');
    var hash = PropertiesService.getScriptProperties().getProperty('adminPwHash');
    if (!hash) throw new Error('管理者パスワードが設定されていません（スプレッドシートの「労務」メニューから設定）');
    if (sha256_('roumu:' + String(d.password || '')) !== hash) {
      cache.put('adminfail', String(fails + 1), 900);
      throw new Error('パスワードが正しくありません');
    }
    cache.remove('adminfail');
    var sess = { email: '', name: '管理者', code: '', isAdmin: true, via: 'password' };
    log_('ログイン（管理者パスワード）', '');
    return { token: newSession_(sess), me: sessionInfo_(sess) };
  },
  logout: function (d) {
    if (d.token) CacheService.getScriptCache().remove('sess:' + d.token);
    return true;
  },
};

// ============================================================
// 従業員マイページ
// ============================================================
function slipsOf_(code) {
  var list = [];
  read_('payroll').filter(function (p) { return p.code === code && p.status === '確定'; }).forEach(function (p) {
    list.push({ id: 'p:' + p._row, kind: '給与', label: p.pay_ym.replace('-', '年') + '月 給与', sortKey: p.pay_ym + '-25', gross: p.gross, net: p.net });
  });
  read_('bonus').filter(function (b) { return b.code === code && b.status === '確定'; }).forEach(function (b) {
    list.push({ id: 'b:' + b._row, kind: '賞与', label: b.pay_date.replace(/-/g, '/') + ' 賞与', sortKey: b.pay_date, gross: b.amount, net: b.net });
  });
  return list.sort(function (a, b) { return a.sortKey < b.sortKey ? 1 : -1; });
}

function slipById_(id, code) {
  var s = getSettings_();
  var kind = id.slice(0, 1), row = Number(id.slice(2));
  if (kind === 'p') {
    var p = read_('payroll').filter(function (x) { return x._row === row; })[0];
    if (!p || (code && p.code !== code)) throw new Error('明細が見つかりません');
    return { html: slipBody_(p, s), title: p.pay_ym + ' 給与明細 ' + p.name };
  }
  var b = read_('bonus').filter(function (x) { return x._row === row; })[0];
  if (!b || (code && b.code !== code)) throw new Error('明細が見つかりません');
  return { html: bonusSlipBody_(b, s), title: b.pay_date + ' 賞与明細 ' + b.name };
}

function monthDays_(code, ym, s, allRecs) {
  var res = monthAttendance_(code, ym, s, allRecs);
  var byDate = {};
  res.days.forEach(function (d) { byDate[d.work_date] = d; });
  var leaves = read_('leaves').filter(function (l) { return l.code === code && l.leave_date.indexOf(ym) === 0; });
  var leaveMap = {};
  leaves.forEach(function (l) { leaveMap[l.leave_date] = l; });
  var days = Dates.monthDates(ym).map(function (date) {
    var d = byDate[date] || {};
    return {
      date: date, wd: Dates.weekday(date), clock_in: d.clock_in || '', clock_out: d.clock_out || '', break_minutes: d.break_minutes === undefined ? '' : d.break_minutes,
      worked: d.complete ? Att.fmtHours(d.worked) : '', overtime: d.totalOvertime ? Att.fmtHours(d.totalOvertime) : '', holiday: d.holiday ? Att.fmtHours(d.holiday) : '',
      night: d.night ? Att.fmtHours(d.night) : '', place: d.work_place || '', note: d.note || '', edited: !!d.edited, missingOut: !!(d.clock_in && !d.clock_out && date < today_()),
      leave: leaveMap[date] ? leaveMap[date].days : 0,
    };
  });
  var sm = res.summary;
  return { ym: ym, days: days, summary: { workDays: sm.workDays, worked: Att.fmtHours(sm.worked), overtime: Att.fmtHours(sm.overtime), over60: Att.fmtHours(sm.overtimeOver60), holiday: Att.fmtHours(sm.holiday), night: Att.fmtHours(sm.night), incomplete: sm.incomplete } };
}

var ME_ACTIONS = {
  home: function (emp) {
    var s = getSettings_();
    var slips = slipsOf_(emp.code);
    return { status: myStatus_(emp, s), latestSlip: slips[0] || null, name: emp.name };
  },
  punch: function (emp, d) { return punchCore_(emp, d.action, d.place); },
  attendance: function (emp, d) { return monthDays_(emp.code, normalize_('ym', d.ym) || today_().slice(0, 7), getSettings_()); },
  slips: function (emp) { return slipsOf_(emp.code); },
  slip: function (emp, d) { return slipById_(String(d.id), emp.code); },
  leave: function (emp) {
    var l = leaveOf_(emp);
    var usages = read_('leaves').filter(function (x) { return x.code === emp.code; }).map(function (x) { return { date: x.leave_date, days: x.days, note: x.note }; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { balance: l.balance, grants: l.grants, obligation: l.obligation, nextGrant: l.nextGrant, usages: usages };
  },
};

// ============================================================
// 管理画面
// ============================================================
function admLog_(sess, action, detail) {
  try { append_('log', { at: now_(), actor: sess.actor, action: action, detail: detail || '' }); } catch (e) { /* ignore */ }
}

function empPublic_(e, t) {
  var status = e.leave_date && e.leave_date < t ? '退職' : e.leave_date ? '退職予定' : e.hire_date > t ? '入社予定' : '在籍';
  return { code: e.code, name: e.name, location: e.location, employment_type: e.employment_type, hire_date: e.hire_date, leave_date: e.leave_date, status: status,
    base_salary: e.base_salary, fixed_ot_pay: e.fixed_ot_pay, fixed_ot_hours: e.fixed_ot_hours, email: e.email };
}

var EMP_EDITABLE = SHEETS.employees.cols.map(function (c) { return c[0]; });

var ADM_ACTIONS = {
  dashboard: function () {
    var a = collectAlerts_();
    var t = today_();
    var punches = read_('attendance').filter(function (r) { return r.work_date === t; });
    var emps = activeEmployees_(t.slice(0, 7)).filter(function (e) { return (!e.leave_date || e.leave_date >= t) && e.hire_date <= t; });
    a.tasks.forEach(function (x) { x.filing = filingForTask_(x.key); });
    return {
      today: t, alerts: a,
      punches: emps.map(function (e) { var p = punches.filter(function (x) { return x.code === e.code; })[0] || {}; return { name: e.name, code: e.code, in: p.clock_in || '', out: p.clock_out || '', place: p.work_place || '' }; }),
    };
  },
  refresh: function (d, sess) { var r = refreshAll_(); admLog_(sess, 'ダッシュボード更新', 'タスク' + r.created + '件作成'); return { created: r.created, changes: r.changes }; },

  // ---- 従業員 ----
  employees: function () { var t = today_(); return employees_().map(function (e) { return empPublic_(e, t); }); },
  employee: function (d) {
    var e = employees_().filter(function (x) { return x.code === d.code; })[0];
    if (!e) throw new Error('従業員が見つかりません');
    var l = leaveOf_(e);
    var usages = read_('leaves').filter(function (x) { return x.code === e.code; }).map(function (x) { return { row: x._row, date: x.leave_date, days: x.days, note: x.note }; });
    var tasks = read_('tasks').filter(function (x) { return x.name === e.name; }).map(function (x) { return { row: x._row, due: x.due_date, status: x.status, title: x.title, basis: x.basis }; });
    var pays = read_('payroll').filter(function (p) { return p.code === e.code; }).map(function (p) { return { id: 'p:' + p._row, ym: p.ym, pay_ym: p.pay_ym, gross: p.gross, net: p.net, status: p.status }; }).reverse().slice(0, 12);
    var changes = read_('changes').filter(function (c) { return c.code === e.code; });
    delete e._row;
    return { emp: e, leave: { balance: l.balance, grants: l.grants, obligation: l.obligation, nextGrant: l.nextGrant, usages: usages }, tasks: tasks, pays: pays, changes: changes, cols: SHEETS.employees.cols };
  },
  employeeForm: function () { return { cols: SHEETS.employees.cols }; },
  saveEmployee: function (d, sess) {
    var v = {};
    SHEETS.employees.cols.forEach(function (c) { if (d.fields[c[0]] !== undefined) v[c[0]] = normalize_(c[2], d.fields[c[0]]); });
    var errors = [];
    if (!v.code) errors.push('社員番号は必須です');
    if (!v.name) errors.push('氏名は必須です');
    if (!v.hire_date) errors.push('入社日を入力してください（YYYY-MM-DD）');
    if (!/^\d{4,8}$/.test(v.pin || '')) errors.push('打刻PINは4〜8桁の数字にしてください');
    var list = employees_();
    var exists = list.filter(function (e) { return e.code === v.code; })[0];
    var original = d.originalCode ? list.filter(function (e) { return e.code === d.originalCode; })[0] : null;
    if (exists && (!original || exists._row !== original._row)) errors.push('この社員番号は既に使われています');
    if (errors.length) throw new Error(errors.join(' / '));
    if (!v.health_std) {
      var est = Number(v.base_salary || 0) + Number(v.position_allowance || 0) + Number(v.commute_allowance || 0) + Number(v.fixed_ot_pay || 0);
      v.health_std = SR.lookupHealth(est).standard;
      v.pension_std = SR.lookupPension(est).standard;
    }
    if (original) { update_('employees', original._row, v); admLog_(sess, '従業員情報更新', v.name); }
    else { append_('employees', v); admLog_(sess, '従業員登録', v.name); }
    var r = refreshAll_(); // 入社手続きタスク作成・固定的賃金の変更検知
    return { code: v.code, created: r.created, changes: r.changes };
  },
  retire: function (d, sess) {
    var e = employees_().filter(function (x) { return x.code === d.code; })[0];
    var date = normalize_('date', d.leave_date);
    if (!e || !date) throw new Error('退職日を入力してください');
    update_('employees', e._row, { leave_date: date, leave_reason: d.leave_reason || '' });
    admLog_(sess, '退職登録', e.name + ' ' + date);
    return { created: refreshTasks_() };
  },
  addLeave: function (d, sess) {
    var e = employees_().filter(function (x) { return x.code === d.code; })[0];
    var date = normalize_('date', d.date);
    if (!e || !date) throw new Error('取得日を入力してください');
    append_('leaves', { code: e.code, name: e.name, leave_date: date, days: Number(d.days) === 0.5 ? 0.5 : 1, note: d.note || '' });
    admLog_(sess, '有給取得登録', e.name + ' ' + date);
    return true;
  },
  deleteLeave: function (d, sess) {
    var row = read_('leaves').filter(function (x) { return x._row === Number(d.row); })[0];
    if (!row) throw new Error('見つかりません');
    sheet_('leaves').deleteRow(row._row);
    admLog_(sess, '有給取得削除', row.name + ' ' + row.leave_date);
    return true;
  },

  // ---- 勤怠 ----
  attendance: function (d) {
    var s = getSettings_();
    var ym = normalize_('ym', d.ym) || today_().slice(0, 7);
    var recs = read_('attendance');
    return { ym: ym, rows: activeEmployees_(ym).map(function (e) {
      var sm = monthAttendance_(e.code, ym, s, recs).summary;
      return { code: e.code, name: e.name, workDays: sm.workDays, worked: Att.fmtHours(sm.worked), overtime: Att.fmtHours(sm.overtime), over60: Att.fmtHours(sm.overtimeOver60),
        holiday: Att.fmtHours(sm.holiday), night: Att.fmtHours(sm.night), incomplete: sm.incomplete, alerts: alerts36_(e.code, ym, s, recs) };
    }) };
  },
  attendanceEmp: function (d) {
    var e = employees_().filter(function (x) { return x.code === d.code; })[0];
    if (!e) throw new Error('従業員が見つかりません');
    var s = getSettings_();
    var ym = normalize_('ym', d.ym) || today_().slice(0, 7);
    var r = monthDays_(e.code, ym, s);
    r.name = e.name; r.code = e.code; r.alerts = alerts36_(e.code, ym, s); r.legalHoliday = Number(s.legal_holiday_weekday);
    return r;
  },
  saveAttendance: function (d, sess) {
    var e = employees_().filter(function (x) { return x.code === d.code; })[0];
    var date = normalize_('date', d.date);
    if (!e || !date) throw new Error('日付が正しくありません');
    var cin = normalize_('time', d.clock_in), cout = normalize_('time', d.clock_out);
    var row = read_('attendance').filter(function (r) { return r.code === e.code && r.work_date === date; })[0];
    var before = row ? (row.clock_in || '-') + '〜' + (row.clock_out || '-') + ' 休憩' + row.break_minutes + '分' : 'なし';
    if (!cin && !cout) {
      if (row) sheet_('attendance').deleteRow(row._row);
    } else {
      var rec = { code: e.code, name: e.name, work_date: date, clock_in: cin, clock_out: cout, break_minutes: Number(d.break_minutes || 0), break_start: '', note: d.note || '', edited: true };
      if (row) update_('attendance', row._row, rec); else append_('attendance', rec);
    }
    admLog_(sess, '勤怠修正', e.name + ' ' + date + '：' + before + ' → ' + (cin || '-') + '〜' + (cout || '-') + ' 休憩' + Number(d.break_minutes || 0) + '分' + (d.note ? '（' + d.note + '）' : ''));
    return true;
  },

  // ---- 給与 ----
  payroll: function (d) {
    var s = getSettings_();
    var ym = normalize_('ym', d.ym) || defaultYm_();
    var inputs = read_('payInput').filter(function (i) { return i.ym === ym; });
    var pays = read_('payroll').filter(function (p) { return p.ym === ym; });
    var rows = activeEmployees_(ym).map(function (e) {
      var inp = inputs.filter(function (i) { return i.code === e.code; })[0] || {};
      var p = pays.filter(function (x) { return x.code === e.code; })[0];
      delete inp._row;
      return { code: e.code, name: e.name, input: inp, pay: p ? { id: 'p:' + p._row, status: p.status, gross: p.gross, deduction_total: p.deduction_total, net: p.net, notes: p.notes, pdf: p.pdf, overtime: p.overtime } : null };
    });
    return { ym: ym, payYm: payYmOf_(ym, s), payDay: s.pay_day, rows: rows };
  },
  savePayInputs: function (d, sess) {
    var ym = normalize_('ym', d.ym);
    var inputs = read_('payInput');
    var confirmed = read_('payroll').filter(function (p) { return p.ym === ym && p.status === '確定'; }).map(function (p) { return p.code; });
    var emps = employees_();
    (d.rows || []).forEach(function (r) {
      if (confirmed.indexOf(r.code) >= 0) return;
      var e = emps.filter(function (x) { return x.code === r.code; })[0];
      if (!e) return;
      var v = { ym: ym, code: e.code, name: e.name, incentive: Number(r.incentive || 0), absenceDays: Number(r.absenceDays || 0), otherAllowanceLabel: r.otherAllowanceLabel || '',
        otherAllowance: Number(r.otherAllowance || 0), otherDeductionLabel: r.otherDeductionLabel || '', otherDeduction: Number(r.otherDeduction || 0),
        withholdingOverride: r.withholdingOverride === '' || r.withholdingOverride === undefined || r.withholdingOverride === null ? '' : String(Number(r.withholdingOverride)),
        yearEndAdjustment: Number(r.yearEndAdjustment || 0), note: r.note || '' };
      var ex = inputs.filter(function (i) { return i.ym === ym && i.code === e.code; })[0];
      if (ex) update_('payInput', ex._row, v); else append_('payInput', v);
    });
    var msg = calcPayroll(ym);
    admLog_(sess, '給与入力・計算', ym);
    return msg;
  },
  calcPayroll: function (d) { return calcPayroll(normalize_('ym', d.ym)); },
  confirmPayroll: function (d) { return confirmPayroll(normalize_('ym', d.ym)); },
  unconfirmPayroll: function (d, sess) {
    var row = read_('payroll').filter(function (p) { return 'p:' + p._row === d.id; })[0];
    if (!row) throw new Error('見つかりません');
    if (!d.reason) throw new Error('取消理由を入力してください');
    update_('payroll', row._row, { status: '下書き', confirmed_at: '' });
    admLog_(sess, '給与確定取消', row.name + ' ' + row.ym + ' 理由：' + d.reason);
    return true;
  },
  slip: function (d) { return slipById_(String(d.id), null); },
  makeSlips: function (d) { return makeSlips(normalize_('ym', d.ym)); },
  mailSlips: function (d) { return mailSlips(normalize_('ym', d.ym)); },
  transfer: function (d, sess) { var r = transferFile_(d.kind, d.key, normalize_('date', d.payDate)); admLog_(sess, '振込データ作成', d.kind + ' ' + d.key); return r; },
  journal: function (d, sess) { var r = journalFile_(d.kind, d.key); admLog_(sess, '仕訳CSV作成', d.kind + ' ' + d.key); return r; },

  // ---- 賞与 ----
  bonusList: function () {
    var dates = {};
    read_('bonus').forEach(function (b) { dates[b.pay_date] = dates[b.pay_date] || { date: b.pay_date, count: 0, total: 0, confirmed: true }; dates[b.pay_date].count++; dates[b.pay_date].total += b.amount; if (b.status !== '確定') dates[b.pay_date].confirmed = false; });
    return Object.keys(dates).sort().reverse().map(function (k) { return dates[k]; });
  },
  bonus: function (d) {
    var payDate = normalize_('date', d.payDate);
    if (!payDate) throw new Error('支給日を入力してください');
    var rows = read_('bonus').filter(function (b) { return b.pay_date === payDate; });
    var s = getSettings_();
    var list = activeEmployees_(payDate.slice(0, 7)).map(function (e) {
      var b = rows.filter(function (x) { return x.code === e.code; })[0];
      var ref = bonusRef_(e, payDate, s);
      return { code: e.code, name: e.name, dependents: e.dependents, taxColumn: e.tax_column, prevSalary: ref.prevSalary, prevNote: ref.note,
        bonus: b ? { id: 'b:' + b._row, amount: b.amount, rate: b.rate, status: b.status, health: b.health, child: b.child, pension: b.pension, employment: b.employment, withholding: b.withholding, deduction_total: b.deduction_total, net: b.net, notes: b.notes, pdf: b.pdf } : null };
    });
    return { payDate: payDate, rows: list };
  },
  saveBonus: function (d, sess) {
    var payDate = normalize_('date', d.payDate);
    if (!payDate) throw new Error('支給日を入力してください');
    var s = getSettings_();
    var emps = employees_();
    var all = read_('bonus');
    var n = 0, warn = [];
    (d.rows || []).forEach(function (r) {
      var e = emps.filter(function (x) { return x.code === r.code; })[0];
      if (!e) return;
      var ex = all.filter(function (b) { return b.pay_date === payDate && b.code === e.code; })[0];
      if (ex && ex.status === '確定') return;
      var amount = Number(r.amount || 0);
      if (!amount) { if (ex) sheet_('bonus').deleteRow(ex._row); return; }
      var fyStart = Bonus.fiscalStartYm(payDate.slice(0, 7));
      var ytd = all.filter(function (b) { return b.code === e.code && b.status === '確定' && b.pay_date.slice(0, 7) >= fyStart && b.pay_date < payDate; })
        .reduce(function (t, b) { return t + Number(b.health_std || 0); }, 0);
      var res = Bonus.calculateBonus({ emp: e, s: s, amount: amount, payYm: payDate.slice(0, 7), ratePercent: r.rate === '' || r.rate === undefined ? '' : Number(r.rate), ytdHealthStd: ytd });
      var ref = bonusRef_(e, payDate, s);
      var v = { pay_date: payDate, code: e.code, name: e.name, status: '下書き', amount: res.gross, rate: res.ratePercent === '' ? '' : String(res.ratePercent), prev_salary: ref.prevSalary,
        dependents: e.dependents, std: res.std, health_std: res.healthStd, care: res.care, health: res.health, child: res.child, pension: res.pension, employment: res.employment,
        withholding: res.withholding, deduction_total: res.deductionTotal, net: res.net, notes: res.notes.join(' / '), confirmed_at: '', pdf: '' };
      if (ex) update_('bonus', ex._row, v); else append_('bonus', v);
      if (res.notes.length) warn.push(e.name + '：' + res.notes.join(' / '));
      n++;
    });
    admLog_(sess, '賞与計算', payDate + ' ' + n + '名');
    return n + '名分の賞与を計算しました。' + (warn.length ? '\n【要確認】\n' + warn.join('\n') : '');
  },
  confirmBonus: function (d, sess) {
    var payDate = normalize_('date', d.payDate);
    var rows = read_('bonus').filter(function (b) { return b.pay_date === payDate && b.status === '下書き'; });
    rows.forEach(function (b) { update_('bonus', b._row, { status: '確定', confirmed_at: now_() }); });
    if (rows.length) {
      upsertTasks_([{ key: 'bonus:' + payDate, category: '賞与', name: '全社', due: Dates.addDays(payDate, 5),
        title: '健康保険・厚生年金保険 被保険者賞与支払届（' + payDate + ' 支給分・' + rows.length + '名）', basis: '支給日から5日以内' }]);
    }
    admLog_(sess, '賞与確定', payDate + ' ' + rows.length + '名');
    return rows.length + '名分を確定しました。賞与支払届のタスクを登録しました。';
  },
  bonusSlips: function (d, sess) {
    var s = getSettings_();
    var payDate = normalize_('date', d.payDate);
    var rows = read_('bonus').filter(function (b) { return b.pay_date === payDate && b.status === '確定'; });
    if (!rows.length) throw new Error('確定済みの賞与がありません');
    var folder = slipFolder_('賞与_' + payDate);
    rows.forEach(function (b) {
      var name = '賞与明細_' + payDate + '_' + b.code + '_' + b.name + '.pdf';
      var old = folder.getFilesByName(name);
      while (old.hasNext()) old.next().setTrashed(true);
      var file = folder.createFile(slipPdf_(bonusSlipBody_(b, s), name));
      update_('bonus', b._row, { pdf: file.getUrl() });
    });
    admLog_(sess, '賞与明細PDF作成', payDate + ' ' + rows.length + '名');
    return rows.length + '名分の賞与明細PDFを作成しました。';
  },

  // ---- 年末調整 ----
  yearEnd: function (d) {
    var year = String(Number(d.year) || Number(today_().slice(0, 4)));
    return { year: year, rows: yearEndRows_(year), note: yearEndNote_(year) };
  },
  saveYearEnd: function (d, sess) {
    var year = String(Number(d.year));
    var saved = read_('yearEnd');
    var emps = employees_();
    (d.rows || []).forEach(function (r) {
      var e = emps.filter(function (x) { return x.code === r.code; })[0];
      if (!e) return;
      var auto = yearEndAuto_(e, year);
      var input = { year: Number(year), salaryIncome: auto.salaryIncome, withheld: auto.withheld, socialWithheld: auto.socialWithheld };
      ['socialDeclared', 'lifeInsurance', 'earthquake', 'spouseSpecial', 'depGeneral', 'depSpecific', 'depElderly', 'depElderlyTogether', 'otherDeduction', 'housingLoan']
        .forEach(function (k) { input[k] = Number(r[k] || 0); });
      input.spouseType = ['一般', '老人'].indexOf(r.spouseType) >= 0 ? r.spouseType : 'なし';
      var res = YearEnd.calculateYearEnd(input);
      var v = { year: year, code: e.code, name: e.name, status: '計算済み', salaryIncome: res.income, withheld: res.withheld, socialWithheld: input.socialWithheld,
        socialDeclared: input.socialDeclared, lifeInsurance: input.lifeInsurance, earthquake: input.earthquake, spouseType: input.spouseType, spouseSpecial: input.spouseSpecial,
        depGeneral: input.depGeneral, depSpecific: input.depSpecific, depElderly: input.depElderly, depElderlyTogether: input.depElderlyTogether, otherDeduction: input.otherDeduction,
        housingLoan: input.housingLoan, salaryIncomeAfter: res.salaryIncomeAfter, deductionTotal: res.deductionTotal, taxableIncome: res.taxableIncome, annualTax: res.annualTax,
        diff: res.diff, reflected: false, calculated_at: now_() };
      var ex = saved.filter(function (x) { return x.year === year && x.code === e.code; })[0];
      if (ex) update_('yearEnd', ex._row, v); else append_('yearEnd', v);
    });
    admLog_(sess, '年末調整計算', year);
    return { rows: yearEndRows_(year) };
  },
  reflectYearEnd: function (d, sess) {
    var s = getSettings_();
    var year = String(Number(d.year));
    var ym = Dates.ymAdd(year + '-12', -Number(s.pay_month_offset || 0)); // 12月支給の給与の勤怠月
    var confirmed = read_('payroll').filter(function (p) { return p.ym === ym && p.status === '確定'; }).map(function (p) { return p.code; });
    var inputs = read_('payInput');
    var n = 0, skipped = [];
    read_('yearEnd').filter(function (x) { return x.year === year && x.status === '計算済み'; }).forEach(function (x) {
      if (confirmed.indexOf(x.code) >= 0) { skipped.push(x.name); return; }
      var ex = inputs.filter(function (i) { return i.ym === ym && i.code === x.code; })[0];
      if (ex) update_('payInput', ex._row, { yearEndAdjustment: x.diff });
      else append_('payInput', { ym: ym, code: x.code, name: x.name, yearEndAdjustment: x.diff });
      update_('yearEnd', x._row, { reflected: true });
      n++;
    });
    var msg = calcPayroll(ym);
    admLog_(sess, '年末調整を12月給与に反映', year + ' ' + n + '名');
    return n + '名分の過不足を ' + year + '年12月支給の給与（' + ym + '勤怠分）に反映し、再計算しました。' + (skipped.length ? '\n確定済みのため反映できなかった人：' + skipped.join('、') : '') + '\n\n' + msg;
  },

  // ---- タスク・設定・ログ ----
  tasks: function (d) {
    var st = d.status || '未完了';
    return read_('tasks').filter(function (t) { return st === '完了' ? t.status === '完了' : t.status !== '完了'; })
      .sort(function (a, b) { return st === '完了' ? (a.completed_at < b.completed_at ? 1 : -1) : (a.due_date < b.due_date ? -1 : 1); })
      .map(function (t) { return { row: t._row, due: t.due_date, status: t.status, category: t.category, title: t.title, name: t.name, basis: t.basis, note: t.note, completed_at: t.completed_at, filing: filingForTask_(t.key) }; });
  },
  updateTask: function (d, sess) {
    var t = read_('tasks').filter(function (x) { return x._row === Number(d.row); })[0];
    if (!t) throw new Error('タスクが見つかりません');
    var v = { status: d.status, note: d.note === undefined ? t.note : d.note };
    if (d.status === '完了' && !t.completed_at) v.completed_at = today_();
    if (d.status !== '完了') v.completed_at = '';
    update_('tasks', t._row, v);
    admLog_(sess, 'タスク更新', t.title + ' → ' + d.status);
    return true;
  },
  addTask: function (d, sess) {
    if (!d.title) throw new Error('内容を入力してください');
    append_('tasks', { due_date: normalize_('date', d.due) || '', status: '未対応', category: 'その他', title: d.title, name: d.name || '全社', basis: '', note: '', completed_at: '', key: 'manual:' + Utilities.getUuid() });
    admLog_(sess, 'タスク追加', d.title);
    return true;
  },
  settings: function () {
    var s = getSettings_();
    return SETTING_DEFS.map(function (x) { return { key: x[0], label: x[1], value: s[x[0]], hint: x[3] }; });
  },
  saveSettings: function (d, sess) {
    var sh = sheet_('settings');
    var values = sh.getDataRange().getValues();
    var before = getSettings_();
    var changed = [];
    SETTING_DEFS.forEach(function (x) {
      if (d.values[x[0]] === undefined) return;
      var v = String(d.values[x[0]]).trim();
      if (String(before[x[0]]) === v) return;
      var idx = -1;
      for (var i = 1; i < values.length; i++) if (String(values[i][0]).trim() === x[0]) idx = i;
      if (idx >= 0) sh.getRange(idx + 1, 3).setValue("'" + v); else sh.appendRow([x[0], x[1], "'" + v, x[3]]);
      changed.push(x[1] + '：' + before[x[0]] + '→' + v);
    });
    if (changed.length) admLog_(sess, '設定変更', changed.join(' / '));
    return changed.length;
  },
  logs: function () {
    return read_('log').slice(-300).reverse().map(function (l) { return { at: l.at, actor: l.actor, action: l.action, detail: l.detail }; });
  },
};

// ---------- 賞与：源泉の算出率を引くための参考値 ----------
function bonusRef_(e, payDate, s) {
  var pays = read_('payroll').filter(function (p) { return p.code === e.code && p.pay_ym < payDate.slice(0, 7); })
    .sort(function (a, b) { return a.pay_ym < b.pay_ym ? 1 : -1; });
  var p = pays[0];
  if (!p) return { prevSalary: 0, note: '前月の給与なし（算出率は別の方法で求める必要があります）' };
  var social = ['健康保険料', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料'].reduce(function (t, l) { return t + Number(p['d:' + l] || 0); }, 0);
  var prev = Number(p.gross || 0) - Math.min(Number(p['e:通勤手当（非課税）'] || 0), 150000) - social;
  return { prevSalary: prev, note: p.pay_ym + '支給分より' };
}

// ---------- 年末調整：給与・賞与からの自動集計 ----------
function yearEndAuto_(e, year) {
  var pays = read_('payroll').filter(function (p) { return p.code === e.code && p.pay_ym.indexOf(year + '-') === 0 && (p.status === '確定' || p.pay_ym === year + '-12'); });
  var bonuses = read_('bonus').filter(function (b) { return b.code === e.code && b.pay_date.indexOf(year + '-') === 0 && b.status === '確定'; });
  var salaryIncome = 0, withheld = 0, social = 0, months = [];
  pays.forEach(function (p) {
    salaryIncome += Number(p.gross || 0) - Math.min(Number(p['e:通勤手当（非課税）'] || 0), 150000);
    withheld += Number(p['d:源泉所得税'] || 0);
    social += ['健康保険料', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料'].reduce(function (t, l) { return t + Number(p['d:' + l] || 0); }, 0);
    months.push(p.pay_ym.slice(5) + (p.status === '確定' ? '' : '(下書き)'));
  });
  bonuses.forEach(function (b) { salaryIncome += Number(b.amount || 0); withheld += Number(b.withholding || 0); social += b.health + b.child + b.pension + b.employment; });
  return { salaryIncome: salaryIncome, withheld: withheld, socialWithheld: social, months: months, bonusCount: bonuses.length };
}

function yearEndRows_(year) {
  var saved = read_('yearEnd').filter(function (x) { return x.year === year; });
  return activeEmployees_(year + '-12').map(function (e) {
    var a = yearEndAuto_(e, year);
    var sv = saved.filter(function (x) { return x.code === e.code; })[0];
    if (sv) delete sv._row;
    return { code: e.code, name: e.name, auto: a, saved: sv || null, defaults: { depGeneral: 0, spouseType: 'なし' } };
  });
}

function yearEndNote_(year) {
  return '「給与等の支払金額」「源泉徴収済み税額」「社会保険料」は、' + year + '年中に支給した確定済みの給与・賞与（12月支給分は下書きも含む）から自動集計します。' +
    '扶養控除等申告書・保険料控除申告書・基礎控除申告書の内容を入力して「計算」してください。計算式は令和7年度改正を反映していますが、国税庁「年末調整のしかた」での確認が必要です。';
}

// ---------- 振込データ（全銀） ----------
function dataFolder_(name) {
  var props = PropertiesService.getScriptProperties();
  var key = 'folder:' + name;
  var id = props.getProperty(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 再作成 */ } }
  var f = DriveApp.createFolder(name + '（' + getSettings_().company_name + '）');
  props.setProperty(key, f.getId());
  return f;
}

function transferFile_(kind, key, payDate) {
  var s = getSettings_();
  var emps = employees_();
  var rows;
  if (kind === 'bonus') {
    rows = read_('bonus').filter(function (b) { return b.pay_date === key && b.status === '確定'; }).map(function (b) { return { code: b.code, net: b.net }; });
    payDate = payDate || key;
  } else {
    rows = read_('payroll').filter(function (p) { return p.ym === key && p.status === '確定'; }).map(function (p) { return { code: p.code, net: p.net, pay_ym: p.pay_ym }; });
    if (!payDate && rows[0]) payDate = rows[0].pay_ym + '-' + pad2_(s.pay_day);
  }
  if (!rows.length) throw new Error('確定済みのデータがありません');
  if (!payDate) throw new Error('振込指定日を入力してください');
  var company = { clientCode: s.zengin_client_code, clientName: s.zengin_client_name, bankCode: s.company_bank_code, bankName: s.company_bank_name,
    branchCode: s.company_branch_code, branchName: s.company_branch_name, accountType: s.company_account_type, accountNumber: s.company_account_number };
  var items = rows.map(function (r) {
    var e = emps.filter(function (x) { return x.code === r.code; })[0] || {};
    return { label: e.name, bankCode: e.bank_code, bankName: e.bank_name, branchCode: e.branch_code, branchName: e.branch_name, accountType: e.account_type,
      accountNumber: e.account_number, holderName: e.account_holder, amount: r.net, customerCode: r.code };
  });
  var built = Zengin.buildTransferFile(company, payDate, items);
  if (built.errors.length) return { ok: false, errors: built.errors };
  var name = '総合振込_' + (kind === 'bonus' ? '賞与_' : '給与_') + payDate + '.txt';
  var blob = Utilities.newBlob('', 'text/plain', name);
  blob.setDataFromString(built.text, 'Shift_JIS');
  var file = dataFolder_('振込データ').createFile(blob);
  return { ok: true, url: file.getUrl(), name: name, count: built.count, total: built.total };
}

// ---------- 給与仕訳（CSV） ----------
function journalFile_(kind, key) {
  var s = getSettings_();
  var lines = [['取引日', '借方勘定科目', '借方金額', '貸方勘定科目', '貸方金額', '摘要']];
  var dep = s.acct_deposit, pay = s.acct_payable;
  var add = function (date, dr, amt, cr, memo) { if (amt) lines.push([date, dr, amt, cr, amt, memo]); };
  var date, total = { salary: 0, commute: 0, social: 0, tax: 0, resident: 0, other: 0, yea: 0, net: 0 };
  if (kind === 'bonus') {
    var rows = read_('bonus').filter(function (b) { return b.pay_date === key && b.status === '確定'; });
    if (!rows.length) throw new Error('確定済みの賞与がありません');
    date = key;
    rows.forEach(function (b) { total.salary += b.amount; total.social += b.health + b.child + b.pension + b.employment; total.tax += b.withholding; total.net += b.net; });
    add(date, s.acct_bonus, total.salary, pay, key + ' 賞与（総支給）');
  } else {
    var ps = read_('payroll').filter(function (p) { return p.ym === key && p.status === '確定'; });
    if (!ps.length) throw new Error('確定済みの給与がありません');
    date = ps[0].pay_ym + '-' + pad2_(s.pay_day);
    ps.forEach(function (p) {
      var commute = Number(p['e:通勤手当（非課税）'] || 0);
      total.commute += commute;
      total.salary += p.gross - commute;
      total.social += ['健康保険料', '子ども・子育て支援金', '厚生年金保険料', '雇用保険料'].reduce(function (t, l) { return t + Number(p['d:' + l] || 0); }, 0);
      total.tax += Number(p['d:源泉所得税'] || 0);
      total.resident += Number(p['d:住民税'] || 0);
      total.other += Number(p['d:その他控除'] || 0);
      total.yea += Number(p['d:年末調整過不足'] || 0);
      total.net += p.net;
    });
    add(date, s.acct_salary, total.salary, pay, key + '勤怠分 給与');
    add(date, s.acct_commute, total.commute, pay, key + '勤怠分 通勤手当');
  }
  add(date, pay, total.social, dep, '社会保険料・雇用保険料（本人負担）');
  add(date, pay, total.tax, dep, '源泉所得税');
  add(date, pay, total.resident, dep, '住民税');
  add(date, pay, total.other, dep, 'その他控除');
  if (total.yea > 0) add(date, pay, total.yea, dep, '年末調整 不足額の徴収');
  if (total.yea < 0) add(date, dep, -total.yea, pay, '年末調整 超過額の還付');
  var csv = lines.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
  var name = '給与仕訳_' + (kind === 'bonus' ? '賞与_' : '') + key + '.csv';
  var file = dataFolder_('給与仕訳').createFile(Utilities.newBlob('﻿' + csv, 'text/csv', name));
  return { ok: true, url: file.getUrl(), name: name, lines: lines.length - 1 };
}

// ============================================================
// 届出書類の記入内容シート（PDF）
// ============================================================
var FILING_EMP_TYPES = ['shakai_get', 'shakai_loss', 'koyou_get', 'koyou_loss', 'jumin_tokucho', 'jumin_ido'];

function payRowsOf_(code) {
  return read_('payroll').filter(function (p) { return p.code === code && p.status === '確定'; }).map(function (p) {
    return { ym: p.ym, pay_ym: p.pay_ym, base_days: p.base_days, gross: p.gross, remuneration: p.remuneration, resident: Number(p['d:住民税'] || 0) };
  });
}

// タスクの管理キーから、対応する書類を判定
function filingForTask_(key) {
  var k = String(key || '').split(':');
  var map = { shakai_get: 'shakai_get', koyou_get: 'koyou_get', jumin: 'jumin_tokucho', shakai_loss: 'shakai_loss', koyou_loss: 'koyou_loss', jumin_ido: 'jumin_ido' };
  if ((k[0] === 'hire' || k[0] === 'leave') && map[k[2]]) return { type: map[k[2]], code: k[1] };
  if (k[0] === 'getsuhen') return { type: 'getsuhen', code: k[1], eff: k[2] };
  if (k[0] === 'bonus') return { type: 'bonus_pay', payDate: k[1] };
  if (k[0] === 'annual' && k[2] === 'santei') return { type: 'santei', year: k[1] };
  return null;
}

function filingDoc_(d) {
  var s = getSettings_();
  var emps = employees_();
  var ctx = { company: s, today: today_(), emps: emps };
  if (FILING_EMP_TYPES.indexOf(d.type) >= 0 || d.type === 'getsuhen') {
    var e = emps.filter(function (x) { return x.code === d.code; })[0];
    if (!e) throw new Error('従業員を選んでください');
    if (/loss|ido/.test(d.type) && !e.leave_date) throw new Error(e.name + 'さんは退職日が登録されていません（従業員画面で退職登録してください）');
    ctx.emp = e;
    ctx.pays = payRowsOf_(e.code);
  }
  if (d.type === 'getsuhen') {
    var ch = read_('changes').filter(function (c) { return c.code === d.code && (!d.eff || c.effective_ym === d.eff); }).pop();
    if (!ch) throw new Error('賃金変更履歴が見つかりません');
    ctx.change = ch;
  }
  if (d.type === 'santei') {
    ctx.year = String(Number(d.year) || Number(today_().slice(0, 4)));
    ctx.people = activeEmployees_(ctx.year + '-07').filter(function (e) { return e.social_insurance; }).map(function (e) { return { emp: e, pays: payRowsOf_(e.code) }; });
  }
  if (d.type === 'bonus_pay') {
    ctx.payDate = normalize_('date', d.payDate);
    ctx.bonuses = read_('bonus').filter(function (b) { return b.pay_date === ctx.payDate && b.status === '確定'; });
    if (!ctx.bonuses.length) throw new Error('この支給日の確定済み賞与がありません');
  }
  return Filings.buildFiling(d.type, ctx);
}

function filingHtml_(doc) {
  var secs = doc.sections.map(function (sec) {
    return '<h3>' + esc_(sec.title) + '</h3><table class="kvt">' + sec.rows.map(function (r) {
      var miss = !r.value && !r.optional;
      return '<tr' + (miss ? ' class="miss"' : '') + '><th>' + esc_(r.label) + '</th><td>' + (r.value ? esc_(r.value) : (miss ? '＿＿＿＿＿（要記入）' : '')) + (r.hint ? '<div class="hint">' + esc_(r.hint) + '</div>' : '') + '</td></tr>';
    }).join('') + '</table>';
  }).join('');
  var tbl = doc.table ? '<h3>' + esc_(doc.table.title) + '</h3><table class="grid"><tr>' + doc.table.head.map(function (h) { return '<th>' + esc_(h) + '</th>'; }).join('') + '</tr>' +
    (doc.table.rows.length ? doc.table.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc_(c) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + doc.table.head.length + '">データなし</td></tr>') + '</table>' : '';
  return '<div class="filing"><div class="stamp">記入内容シート（転記用）— この用紙はそのまま提出できません</div><h1>' + esc_(doc.title) + '</h1>' +
    '<table class="kvt meta"><tr><th>提出先・方法</th><td>' + esc_(doc.submitTo) + '</td></tr><tr><th>提出期限</th><td>' + esc_(doc.deadline) + '（' + esc_(doc.deadlineNote) + '）</td></tr><tr><th>作成日</th><td>' + esc_(today_()) + '</td></tr></table>' +
    (doc.missing.length ? '<div class="missing"><b>要記入の項目（' + doc.missing.length + '件）</b><br>' + doc.missing.map(esc_).join('<br>') + '</div>' : '') +
    secs + tbl + (doc.notes && doc.notes.length ? '<h3>注意事項</h3><ul>' + doc.notes.map(function (n) { return '<li>' + esc_(n) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
}

var FILING_CSS = '.filing{font-family:sans-serif;font-size:10.5pt}.filing h1{font-size:15pt;margin:6px 0 10px}.filing h3{font-size:11.5pt;margin:14px 0 4px;border-left:4px solid #2563eb;padding-left:6px}' +
  '.filing table{border-collapse:collapse;width:100%}.filing th,.filing td{border:1px solid #999;padding:4px 7px;text-align:left;vertical-align:top}.filing .kvt th{width:34%;background:#f3f4f6;font-weight:normal}' +
  '.filing .grid th{background:#f3f4f6}.filing .hint{font-size:8.5pt;color:#555;margin-top:2px}.filing tr.miss td{background:#fff7ed}.filing .stamp{border:2px solid #dc2626;color:#dc2626;display:inline-block;padding:2px 8px;font-size:9pt;font-weight:bold}' +
  '.filing .missing{border:1px solid #d97706;background:#fffbeb;padding:6px 10px;margin:8px 0;font-size:9.5pt}.filing .meta th{background:#eef2ff}';

ADM_ACTIONS.filingTargets = function () {
  var t = today_();
  return {
    types: Filings.TYPES,
    emps: employees_().map(function (e) { return { code: e.code, name: e.name, hire_date: e.hire_date, leave_date: e.leave_date }; }),
    changes: read_('changes').map(function (c) { return { code: c.code, name: c.name, eff: c.effective_ym, detail: c.detail, result: c.result }; }),
    bonusDates: ADM_ACTIONS.bonusList().filter(function (b) { return b.confirmed; }).map(function (b) { return b.date; }),
    year: t.slice(0, 4),
  };
};
ADM_ACTIONS.filing = function (d) {
  var doc = filingDoc_(d);
  return { title: doc.title, missing: doc.missing, html: filingHtml_(doc), css: FILING_CSS };
};
ADM_ACTIONS.filingPdf = function (d, sess) {
  var doc = filingDoc_(d);
  var who = d.code ? (employees_().filter(function (e) { return e.code === d.code; })[0] || {}).name : (d.payDate || d.year || '');
  var name = today_() + '_' + doc.title.replace(/[（）()\s]/g, '') + (who ? '_' + who : '') + '.pdf';
  var blob = Utilities.newBlob('<html><head><meta charset="utf-8"><style>body{margin:20px}' + FILING_CSS + '</style></head><body>' + filingHtml_(doc) + '</body></html>', 'text/html', 'f.html')
    .getAs('application/pdf').setName(name);
  var file = dataFolder_('届出書類').createFile(blob);
  admLog_(sess, '届出書類PDF作成', doc.title + (who ? '（' + who + '）' : ''));
  return { ok: true, url: file.getUrl(), name: name, missing: doc.missing.length };
};
