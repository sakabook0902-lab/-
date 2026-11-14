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
