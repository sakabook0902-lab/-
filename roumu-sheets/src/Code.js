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
