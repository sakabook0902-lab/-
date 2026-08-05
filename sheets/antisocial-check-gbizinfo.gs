/**
 * 反社チェック支援スプレッドシート用スクリプト
 *
 * A列に会社名、B列に都道府県または住所を入力すると、メニュー「自動反映を有効にする」を
 * 一度実行しておくだけで、以後は両方が入力された時点で自動的に
 * gBizINFO（経済産業省の無料API）から
 * 法人番号・本社所在地・代表者・資本金・従業員数・業種・設立年月日を取得して
 * 同じ行に書き込みます（メニューを毎回選ぶ必要はありません）。
 * 年商（売上高）は、有価証券報告書を提出している企業（主に上場企業等）に限り、
 * 財務情報として自動取得できます。
 *
 * B列（都道府県・住所）は同姓同名の会社を区別するための絞り込み条件です。都道府県名だけでなく
 * 住所全体を入力すると、会社名検索で複数ヒットした場合に住所同士を突き合わせて1社に確定します。
 * それでも複数社残る場合は、法人番号が分かっていれば
 * C列に直接入力し「法人番号から直接取得」を使うと確実に1社に絞れます。
 *
 * 連絡先・過去の行政処分の有無は無料の公的APIには存在しないため
 * 自動取得できません。手動確認して入力する欄を用意しています。
 */

const COL = {
  NAME: 1,               // A: 会社名（入力）
  PREFECTURE: 2,          // B: 都道府県・住所（絞り込み・任意入力。都道府県名だけでも住所全体でもOK）
  CORPORATE_NUMBER: 3,    // C: 法人番号（分かっていれば直接入力してもよい）
  ADDRESS: 4,              // D: 本社所在地
  REPRESENTATIVE: 5,      // E: 代表者
  CAPITAL: 6,               // F: 資本金
  EMPLOYEE_COUNT: 7,      // G: 従業員数
  BUSINESS_CATEGORY: 8,   // H: 業種
  ESTABLISHED_DATE: 9,    // I: 設立年月日
  ANNUAL_REVENUE_AUTO: 10, // J: 年商（自動・EDINET提出企業のみ）
  ANNUAL_REVENUE_MANUAL: 11, // K: 年商（手動確認・非上場企業等）
  CONTACT: 12,              // L: 連絡先（手動確認）
  SANCTION_STATUS: 13,    // M: 行政処分の有無（手動確認）
  NOTE: 14,                  // N: 備考
  LOOKED_UP_AT: 15,       // O: 情報取得日時
  GBIZINFO_URL: 16,       // P: gBizINFO詳細ページ（自動生成リンク）
  NEWS_SEARCH: 17,         // Q: 関連ニュースを検索（自動生成リンク・Googleニュース検索）
  OFFICIAL_SITE_SEARCH: 18, // R: 公式サイトを検索（自動生成リンク・Google検索）
};

const HEADERS = [
  '会社名（入力）', '都道府県・住所（絞り込み・任意）', '法人番号', '本社所在地', '代表者',
  '資本金', '従業員数', '業種', '設立年月日',
  '年商（自動・上場企業等のみ）', '年商（手動確認）', '連絡先（手動確認）',
  '行政処分の有無（手動確認）', '備考', '情報取得日時',
  'gBizINFO詳細ページ', '関連ニュースを検索', '公式サイトを検索',
];

const PREFECTURE_CODES = {
  '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04', '秋田県': '05', '山形県': '06',
  '福島県': '07', '茨城県': '08', '栃木県': '09', '群馬県': '10', '埼玉県': '11', '千葉県': '12',
  '東京都': '13', '神奈川県': '14', '新潟県': '15', '富山県': '16', '石川県': '17', '福井県': '18',
  '山梨県': '19', '長野県': '20', '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24',
  '滋賀県': '25', '京都府': '26', '大阪府': '27', '兵庫県': '28', '奈良県': '29', '和歌山県': '30',
  '鳥取県': '31', '島根県': '32', '岡山県': '33', '広島県': '34', '山口県': '35', '徳島県': '36',
  '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40', '佐賀県': '41', '長崎県': '42',
  '熊本県': '43', '大分県': '44', '宮崎県': '45', '鹿児島県': '46', '沖縄県': '47',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('反社チェック支援')
    .addItem('シートの初期設定（見出し作成）', 'setupSheet')
    .addSeparator()
    .addItem('自動反映を有効にする（A列+B列入力で自動実行）', 'installAutoFillTrigger')
    .addItem('自動反映を無効にする', 'disableAutoFillTrigger')
    .addSeparator()
    .addItem('この行を会社名で検索', 'fillSelectedRow')
    .addItem('この行を法人番号から直接取得（最も確実）', 'fillSelectedRowByCorporateNumber')
    .addItem('選択範囲を一括検索（会社名ベース）', 'fillSelectedRange')
    .addSeparator()
    .addItem('gBizINFO APIトークンを設定', 'setApiToken')
    .addToUi();
}

// --- 自動反映トリガーの有効化・無効化 ---
// A列（会社名）とB列（都道府県・住所）の両方が入力された行を検知して自動で情報を反映する。
// UrlFetchApp（外部API呼び出し）を伴うため、単純トリガー(onEdit)ではなく
// インストール型トリガーとして登録する必要がある（初回のみ権限の承認が必要）。
function installAutoFillTrigger() {
  const ui = SpreadsheetApp.getUi();
  removeAutoFillTrigger_();
  ScriptApp.newTrigger('onCompanyRowEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  ui.alert(
    '自動反映を有効にしました。\n' +
    '以後、A列（会社名）とB列（都道府県・住所）の両方が入力された行は、自動的に他の列が反映されます。'
  );
}

function disableAutoFillTrigger() {
  removeAutoFillTrigger_();
  SpreadsheetApp.getUi().alert('自動反映を無効にしました。');
}

function removeAutoFillTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCompanyRowEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// --- 自動反映トリガー本体 ---
// A列またはB列が編集された時に発火し、両方揃っていればその行を自動検索する。
function onCompanyRowEdit(e) {
  try {
    if (!e || !e.range) return;
    const range = e.range;
    const sheet = range.getSheet();
    const row = range.getRow();
    const col = range.getColumn();

    if (row === 1) return; // 見出し行は無視
    if (col !== COL.NAME && col !== COL.PREFECTURE) return; // 会社名・都道府県/住所以外の編集では発火しない

    const name = sheet.getRange(row, COL.NAME).getValue();
    const address = sheet.getRange(row, COL.PREFECTURE).getValue();
    if (!name || !address) return; // 両方揃うまでは何もしない

    sheet.getRange(row, COL.NOTE).setValue('検索中…');
    try {
      fillRow_(sheet, row);
    } catch (err) {
      sheet.getRange(row, COL.NOTE).setValue('エラー: ' + err.message);
    }
  } catch (outerErr) {
    // トリガー自体の想定外エラーは実行ログにのみ残し、編集操作自体は妨げない
    console.error(outerErr);
  }
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

  SpreadsheetApp.getUi().alert(
    'A列に会社名、任意でB列に都道府県または住所（例：群馬県前橋市...）を入力してください。\n' +
    '住所まで入力すると、同名の別会社との区別がより確実になります。\n' +
    '法人番号が分かっている場合はC列に直接入力し、「法人番号から直接取得」を使うと最も確実です。'
  );
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

function callGbizInfo_(url) {
  const token = getToken_();
  if (!token) {
    throw new Error('APIトークンが未設定です。メニューの「gBizINFO APIトークンを設定」から設定してください。');
  }
  const response = UrlFetchApp.fetch(url, {
    headers: { Accept: 'application/json', 'X-hojinInfo-api-token': token },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('gBizINFOへの問い合わせに失敗しました（HTTP ' + code + '）。トークンが正しいか確認してください。');
  }
  return JSON.parse(response.getContentText());
}

// B列には「群馬県」のような都道府県名だけでなく、「群馬県前橋市...」のような
// 住所全体が入力されるケースが多いため、先頭が都道府県名と一致すれば認識する。
// APIへの問い合わせを都道府県単位で粗く絞り込むための一次フィルタとして使う。
function extractPrefectureCode_(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const pref in PREFECTURE_CODES) {
    if (t.indexOf(pref) === 0) return PREFECTURE_CODES[pref];
  }
  return null;
}

// 住所の表記ゆれ（丁目・番地の書き方、スペースの有無、全角/半角ハイフン等）を
// 吸収するための簡易正規化。完全一致ではなく「どちらかがどちらかを含む」形で
// 比較することで、多少の表記差があっても一致とみなせるようにする。
function normalizeAddressText_(addr) {
  return String(addr || '')
    .replace(/[\s　]/g, '')
    .replace(/[−‐‑–—―ー]/g, '-')
    .replace(/丁目|番地|番|号/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
}

function addressesMatch_(a, b) {
  const na = normalizeAddressText_(a);
  const nb = normalizeAddressText_(b);
  if (!na || !nb) return false;
  return na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}

// --- 会社名＋住所で1社に確定できるかを試みる ---
// 1. まず会社名＋都道府県（住所の先頭から抽出）でAPIに問い合わせて候補を絞る
// 2. それでも複数残る場合は、B列の住所文字列と各候補の本社所在地を突き合わせて
//    1社に確定できるかを試みる（誤って別会社の情報を使わないよう、確定できない
//    場合は自動確定せず、法人番号での直接取得を案内する）
function searchCompanyByName_(name, address) {
  const prefectureCode = extractPrefectureCode_(address);
  let url = 'https://info.gbiz.go.jp/hojin/v1/hojin?name=' + encodeURIComponent(name);
  if (prefectureCode) url += '&prefecture=' + prefectureCode;

  const data = callGbizInfo_(url);
  const list = data['hojin-infos'] || [];

  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  // 複数ヒットした場合は、B列の住所とAPI側の所在地(location)を突き合わせて絞り込む
  if (address) {
    const filtered = list.filter(function (c) {
      return addressesMatch_(address, c.location);
    });
    if (filtered.length === 1) return filtered[0];
    if (filtered.length > 1) {
      throw new Error(
        filtered.length + '件が住所でも一致し、1社に確定できませんでした。法人番号での直接取得を使ってください。'
      );
    }
  }

  throw new Error(
    list.length + '件ヒットしましたが、B列の住所と一致する候補が見つかりませんでした。' +
    '住所の表記（市区町村・番地）を見直すか、法人番号での直接取得を使ってください。'
  );
}

// --- 法人番号を直接指定して1社を取得（最も確実） ---
function fetchCompanyByCorporateNumber_(corporateNumber) {
  const url = 'https://info.gbiz.go.jp/hojin/v1/hojin/' + encodeURIComponent(corporateNumber);
  const data = callGbizInfo_(url);
  const list = data['hojin-infos'] || [];
  return list.length ? list[0] : null;
}

// --- 財務情報（年商等）の取得。EDINET(有価証券報告書)ベースのため、
//     提出義務のある企業（主に上場企業等）以外はデータが存在しない ---
function fetchFinance_(corporateNumber) {
  const url = 'https://info.gbiz.go.jp/hojin/v1/hojin/' + encodeURIComponent(corporateNumber) + '/finance';
  const data = callGbizInfo_(url);
  const list = data['hojin-infos'] || data['finance'] || [];
  return Array.isArray(list) && list.length ? list[0] : null;
}

// Googleスプレッドシートの =HYPERLINK("url","表示文字") 形式の数式を安全に組み立てる。
// 数式内の " は "" にエスケープする必要があるため、値に " が含まれていても壊れないようにする。
function hyperlinkFormula_(url, label) {
  var esc = function (s) { return String(s).replace(/"/g, '""'); };
  return '=HYPERLINK("' + esc(url) + '","' + esc(label) + '")';
}

// --- 取得した基本情報をシートに書き込む共通処理 ---
function writeCompanyInfo_(sheet, row, info) {
  sheet.getRange(row, COL.NOTE).setValue(''); // 「検索中…」等の一時メッセージをクリア
  sheet.getRange(row, COL.CORPORATE_NUMBER).setValue(info.corporate_number || '');
  sheet.getRange(row, COL.ADDRESS).setValue(info.location || '');
  sheet.getRange(row, COL.REPRESENTATIVE).setValue(info.representative_name || '');
  sheet.getRange(row, COL.CAPITAL).setValue(info.capital_stock || '');
  sheet.getRange(row, COL.EMPLOYEE_COUNT).setValue(info.employee_number || '');
  sheet.getRange(row, COL.BUSINESS_CATEGORY).setValue(info.business_summary || '');
  sheet.getRange(row, COL.ESTABLISHED_DATE).setValue(info.date_of_establishment || '');
  sheet.getRange(row, COL.LOOKED_UP_AT).setValue(new Date());

  // 会社名・法人番号から機械的に生成できるリンク。
  // 「関連ニュース」「公式サイト」は無料の公的APIには存在しないため実際の記事内容までは取得できず、
  // Google検索・Googleニュース検索をワンクリックで開けるリンクとして案内する。
  // 会社名はA列の入力値を優先し、空の場合（法人番号のみで検索した場合）はAPIから取得した名称で補う。
  var name = sheet.getRange(row, COL.NAME).getValue() || info.name || '';
  if (info.corporate_number) {
    sheet.getRange(row, COL.GBIZINFO_URL).setFormula(
      hyperlinkFormula_('https://info.gbiz.go.jp/hojin/' + info.corporate_number, 'gBizINFOで見る')
    );
  }
  if (name) {
    sheet.getRange(row, COL.NEWS_SEARCH).setFormula(
      hyperlinkFormula_('https://www.google.com/search?q=' + encodeURIComponent(name) + '&tbm=nws', 'ニュース検索')
    );
    sheet.getRange(row, COL.OFFICIAL_SITE_SEARCH).setFormula(
      hyperlinkFormula_('https://www.google.com/search?q=' + encodeURIComponent(name + ' 公式サイト'), 'Google検索')
    );
  }

  // 財務情報（年商）は取得できる企業とできない企業があるため、失敗しても他の処理は止めない
  try {
    const finance = fetchFinance_(info.corporate_number);
    if (finance && finance.net_sales_summary_of_business_results) {
      sheet.getRange(row, COL.ANNUAL_REVENUE_AUTO).setValue(finance.net_sales_summary_of_business_results);
    } else {
      sheet.getRange(row, COL.ANNUAL_REVENUE_AUTO).setValue('');
      sheet.getRange(row, COL.NOTE).setValue('財務情報なし（非上場企業等。年商はK列に手動で確認結果を入力してください）');
    }
  } catch (e) {
    sheet.getRange(row, COL.ANNUAL_REVENUE_AUTO).setValue('');
  }
}

// --- 1行分：会社名（＋都道府県・住所）で検索して書き込む ---
function fillRow_(sheet, row) {
  const name = sheet.getRange(row, COL.NAME).getValue();
  if (!name) return;
  const address = sheet.getRange(row, COL.PREFECTURE).getValue();

  const info = searchCompanyByName_(String(name), address);
  if (!info) {
    sheet.getRange(row, COL.NOTE).setValue('該当なし（gBizINFO未登録、または表記ゆれの可能性。正式名称で再検索してください）');
    return;
  }
  writeCompanyInfo_(sheet, row, info);
}

// --- 1行分：法人番号（C列）から直接取得して書き込む ---
function fillRowByCorporateNumber_(sheet, row) {
  const corporateNumber = sheet.getRange(row, COL.CORPORATE_NUMBER).getValue();
  if (!corporateNumber) {
    throw new Error('C列（法人番号）が空です。先に法人番号を入力してください。');
  }
  const info = fetchCompanyByCorporateNumber_(String(corporateNumber).trim());
  if (!info) {
    sheet.getRange(row, COL.NOTE).setValue('該当なし（法人番号が正しいか確認してください）');
    return;
  }
  writeCompanyInfo_(sheet, row, info);
}

// --- メニュー：選択中の1行を会社名で検索 ---
function fillSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row === 1) {
    ui.alert('見出し行(1行目)は選択しないでください。');
    return;
  }
  try {
    fillRow_(sheet, row);
  } catch (e) {
    ui.alert(e.message);
  }
}

// --- メニュー：選択中の1行を法人番号から直接取得 ---
function fillSelectedRowByCorporateNumber() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row === 1) {
    ui.alert('見出し行(1行目)は選択しないでください。');
    return;
  }
  try {
    fillRowByCorporateNumber_(sheet, row);
  } catch (e) {
    ui.alert(e.message);
  }
}

// --- メニュー：選択範囲を複数行まとめて会社名で検索 ---
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
      sheet.getRange(row, COL.NOTE).setValue('エラー: ' + e.message);
      errorCount++;
    }
  }
  ui.alert('処理が完了しました。' + (errorCount ? errorCount + '件でエラーが発生しました（各行のN列に理由を記載）。' : ''));
}
