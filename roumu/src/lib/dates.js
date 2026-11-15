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
