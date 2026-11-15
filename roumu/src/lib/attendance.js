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
