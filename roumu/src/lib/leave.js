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
