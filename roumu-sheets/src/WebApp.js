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
