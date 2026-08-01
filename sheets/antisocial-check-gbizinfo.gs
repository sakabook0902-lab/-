/**
 * 反社チェック支援スプレッドシート用スクリプト
 *
 * A列に会社名を入力し、メニューから実行すると、
 * gBizINFO（経済産業省の無料API）から
 * 法人番号・本社所在地・代表者・資本金・従業員数・業種・設立年月日を自動取得して
 * 同じ行のB列以降に書き込みます。
 *
 * 年商・連絡先・過去の行政処分の有無は無料の公的APIには存在しないため
 * 自動取得できません。I〜K列は手動確認して入力する欄として用意しています。
 */

const COL = {
  NAME: 1,             // A: 会社名（入力）
  CORPORATE_NUMBER: 2, // B: 法人番号
  ADDRESS: 3,           // C: 本社所在地
  REPRESENTATIVE: 4,    // D: 代表者
  CAPITAL: 5,            // E: 資本金
  EMPLOYEE_COUNT: 6,    // F: 従業員数
  BUSINESS_CATEGORY: 7, // G: 業種
  ESTABLISHED_DATE: 8,  // H: 設立年月日
  ANNUAL_REVENUE: 9,    // I: 年商（手動確認）
  CONTACT: 10,           // J: 連絡先（手動確認）
  SANCTION_STATUS: 11,  // K: 行政処分の有無（手動確認）
  NOTE: 12,               // L: 備考
  LOOKED_UP_AT: 13,     // M: 情報取得日時
};

const HEADERS = [
  '会社名（入力）', '法人番号', '本社所在地', '代表者', '資本金', '従業員数',
  '業種', '設立年月日', '年商（手動確認）', '連絡先（手動確認）',
  '行政処分の有無（手動確認）', '備考', '情報取得日時',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('反社チェック支援')
    .addItem('シートの初期設定（見出し作成）', 'setupSheet')
    .addSeparator()
    .addItem('この行の会社情報を検索', 'fillSelectedRow')
    .addItem('選択範囲を一括検索', 'fillSelectedRange')
    .addSeparator()
    .addItem('gBizINFO APIトークンを設定', 'setApiToken')
    .addToUi();
}

// --- 初期設定：見出し行の作成、行政処分列のプルダウン設定 ---
function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#f0f2f5');
  sheet.setFrozenRows(1);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['未確認', 'なし', 'あり'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL.SANCTION_STATUS, 500, 1).setDataValidation(rule);

  SpreadsheetApp.getUi().alert('見出しを作成しました。A列に会社名を入力してください。');
}

// --- APIトークンの設定・保存（スクリプトのプロパティに保存され、シートには表示されません） ---
function setApiToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    'gBizINFO APIトークンを入力してください',
    'https://info.gbiz.go.jp/hojin/APIManual から無料で取得したトークンを貼り付けてください。',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim();
  if (!token) {
    ui.alert('トークンが空です。');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GBIZINFO_TOKEN', token);
  ui.alert('保存しました。');
}

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('GBIZINFO_TOKEN');
}

// --- gBizINFOへの問い合わせ本体 ---
function searchCompanyByName_(name) {
  const token = getToken_();
  if (!token) {
    throw new Error('APIトークンが未設定です。メニューの「gBizINFO APIトークンを設定」から設定してください。');
  }
  const url = 'https://info.gbiz.go.jp/hojin/v1/hojin?name=' + encodeURIComponent(name);
  const response = UrlFetchApp.fetch(url, {
    headers: { Accept: 'application/json', 'X-hojinInfo-api-token': token },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('gBizINFOへの問い合わせに失敗しました（HTTP ' + code + '）。トークンが正しいか確認してください。');
  }
  const data = JSON.parse(response.getContentText());
  const list = data['hojin-infos'] || [];
  return list.length ? list[0] : null;
}

// --- 1行分の書き込み ---
function fillRow_(sheet, row) {
  const name = sheet.getRange(row, COL.NAME).getValue();
  if (!name) return;

  const info = searchCompanyByName_(String(name));
  if (!info) {
    sheet.getRange(row, COL.NOTE).setValue('該当なし（gBizINFO未登録、または表記ゆれの可能性。正式名称で再検索してください）');
    return;
  }

  // gBizINFOの実際のレスポンス項目名は公開情報を元にしています。
  // 想定と異なる場合は、Apps Scriptの実行ログ（表示 > ログ）で
  // JSON.stringify(info) を出力して実際のキー名を確認し、下記を調整してください。
  sheet.getRange(row, COL.CORPORATE_NUMBER).setValue(info.corporate_number || '');
  sheet.getRange(row, COL.ADDRESS).setValue(info.location || '');
  sheet.getRange(row, COL.REPRESENTATIVE).setValue(info.representative_name || '');
  sheet.getRange(row, COL.CAPITAL).setValue(info.capital_stock || '');
  sheet.getRange(row, COL.EMPLOYEE_COUNT).setValue(info.employee_number || '');
  sheet.getRange(row, COL.BUSINESS_CATEGORY).setValue(info.business_summary || '');
  sheet.getRange(row, COL.ESTABLISHED_DATE).setValue(info.date_of_establishment || '');
  sheet.getRange(row, COL.LOOKED_UP_AT).setValue(new Date());
}

// --- メニュー：選択中の1行だけ検索 ---
function fillSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row === 1) {
    ui.alert('見出し行(1行目)は選択しないでください。会社名を入力した行のセルを選んでから実行してください。');
    return;
  }
  try {
    fillRow_(sheet, row);
  } catch (e) {
    ui.alert(e.message);
  }
}

// --- メニュー：選択範囲を複数行まとめて検索 ---
function fillSelectedRange() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  const startRow = range.getRow();
  const numRows = range.getNumRows();
  let errorCount = 0;

  for (let i = 0; i < numRows; i++) {
    const row = startRow + i;
    if (row === 1) continue;
    try {
      fillRow_(sheet, row);
      Utilities.sleep(300); // 連続リクエストの負荷を抑えるための簡易ウェイト
    } catch (e) {
      errorCount++;
    }
  }
  ui.alert('処理が完了しました。' + (errorCount ? errorCount + '件でエラーが発生しました。' : ''));
}
