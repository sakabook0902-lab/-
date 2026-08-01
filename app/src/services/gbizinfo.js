const BASE_URL = 'https://info.gbiz.go.jp/hojin/v1/hojin';

function isConfigured() {
  return Boolean(process.env.GBIZINFO_API_TOKEN);
}

async function callApi(url) {
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) {
    const err = new Error('GBIZINFO_API_TOKEN が未設定です');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-hojinInfo-api-token': token,
    },
  });
  if (!res.ok) {
    const err = new Error(`gBizINFO API エラー: HTTP ${res.status}`);
    err.code = 'API_ERROR';
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// 名称・都道府県・法人種別・資本金/従業員数レンジなどで絞り込み検索する。
// 同姓同名（同名企業）が多い場合は、都道府県や資本金レンジを指定して対象を絞り込む。
async function search(params) {
  const qs = new URLSearchParams();
  if (params.name) qs.set('name', params.name);
  if (params.prefecture) qs.set('prefecture', params.prefecture);
  if (params.corporateType) qs.set('corporate_type', params.corporateType);
  if (params.capitalFrom) qs.set('capital_stock_from', params.capitalFrom);
  if (params.capitalTo) qs.set('capital_stock_to', params.capitalTo);
  if (params.employeeFrom) qs.set('employee_number_from', params.employeeFrom);
  if (params.employeeTo) qs.set('employee_number_to', params.employeeTo);

  const url = `${BASE_URL}?${qs.toString()}`;
  const data = await callApi(url);
  const list = data['hojin-infos'] || [];
  return list.map(normalize);
}

// 法人番号（13桁）を指定して単体の詳細情報を取得する。
// 法人番号が分かっている場合、名称検索よりも確実に対象企業を一意に特定できる。
async function fetchByCorporateNumber(corporateNumber) {
  const url = `${BASE_URL}/${encodeURIComponent(corporateNumber)}`;
  const data = await callApi(url);
  const list = data['hojin-infos'] || [];
  return list.length ? normalize(list[0]) : null;
}

// 財務情報（年商等）を取得する。EDINET（金融庁 有価証券報告書）に基づくため、
// 有価証券報告書の提出義務がある企業（主に上場企業等）のみデータが存在する。
// 非上場の中小企業は基本的にデータが取得できない（gBizINFOの制約であり、本実装の制約ではない）。
async function fetchFinance(corporateNumber) {
  const url = `${BASE_URL}/${encodeURIComponent(corporateNumber)}/finance`;
  const data = await callApi(url);
  const list = data['hojin-infos'] || data['finance'] || [];
  const records = (Array.isArray(list) ? list : []).map(normalizeFinance);
  records.sort((a, b) => (b.settlementDate || '').localeCompare(a.settlementDate || ''));
  return records;
}

function normalizeAddressText(addr) {
  return String(addr || '')
    .replace(/[\s　]/g, '')
    .replace(/[−‐‑–—―ー]/g, '-')
    .replace(/丁目|番地|番|号/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
}

// 会社名＋住所で1社に確定できるかを試みる。
// 住所は表記ゆれ（丁目・番地の書き方、建物名の有無など）があるため、
// 「どちらかがどちらかを包含する」場合のみ一致とみなす、比較的保守的な判定にしている。
// 誤って別会社の情報を反映すると反社チェックの記録として重大な問題になるため、
// 少しでも判定が曖昧な場合（複数候補が残る場合）は自動確定せず、候補一覧を返す。
async function matchByNameAndAddress(name, address) {
  const candidates = await search({ name });

  if (!address) {
    if (candidates.length === 1) return { status: 'matched', company: candidates[0], candidates };
    if (candidates.length === 0) return { status: 'not_found', candidates: [] };
    return { status: 'ambiguous', candidates };
  }

  const na = normalizeAddressText(address);
  const filtered = candidates.filter((c) => {
    const ca = normalizeAddressText(c.address);
    if (!ca || !na) return false;
    return ca.includes(na) || na.includes(ca);
  });

  if (filtered.length === 1) return { status: 'matched', company: filtered[0], candidates };
  if (filtered.length > 1) return { status: 'ambiguous', candidates: filtered };
  if (candidates.length === 0) return { status: 'not_found', candidates: [] };
  // 住所で絞り込めなかった場合は、名称一致分をそのまま候補として提示する（自動確定はしない）
  return { status: 'ambiguous', candidates, addressMatchFailed: true };
}

// gBizINFOのレスポンスは項目の欠落・命名ゆれがあり得るため、
// 想定される代表的なキー名をいくつか試しつつ正規化する。
// 実際のレスポンス項目は取得したトークンで一度実データを確認して調整すること。
function normalize(raw) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    }
    return null;
  };
  return {
    corporateNumber: pick('corporate_number'),
    name: pick('name', 'corporate_name'),
    address: pick('location', 'address'),
    prefecture: pick('prefecture_name'),
    representative: pick('representative_name'),
    representativePosition: pick('representative_position'),
    capital: pick('capital_stock'),
    employeeCount: pick('employee_number'),
    businessCategory: pick('business_summary') ||
      (Array.isArray(raw.business_items) ? raw.business_items.map((b) => b.business_name || b).join('、') : null),
    establishedDate: pick('date_of_establishment'),
    updateDate: pick('update_date'),
    raw,
  };
}

function normalizeFinance(raw) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    }
    return null;
  };
  return {
    fiscalYear: pick('fiscal_year_cover_page', 'fiscal_year'),
    settlementDate: pick('date_of_settlement'),
    netSales: pick('net_sales_summary_of_business_results', 'net_sales'),
    operatingProfit: pick('operating_profit_summary_of_business_results'),
    ordinaryProfit: pick('ordinary_profit_summary_of_business_results'),
    netIncome: pick('net_income_loss_summary_of_business_results'),
    totalAssets: pick('total_assets_summary_of_business_results'),
    raw,
  };
}

module.exports = { isConfigured, search, fetchByCorporateNumber, fetchFinance, matchByNameAndAddress };
