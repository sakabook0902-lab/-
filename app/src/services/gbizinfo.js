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

// 名称で検索し、候補一覧を返す（本社所在地・法人番号を含む簡易情報）
async function searchByName(name) {
  const url = `${BASE_URL}?name=${encodeURIComponent(name)}`;
  const data = await callApi(url);
  const list = data['hojin-infos'] || [];
  return list.map(normalize);
}

// 法人番号を指定して単体の詳細情報を取得
async function fetchByCorporateNumber(corporateNumber) {
  const url = `${BASE_URL}/${encodeURIComponent(corporateNumber)}`;
  const data = await callApi(url);
  const list = data['hojin-infos'] || [];
  return list.length ? normalize(list[0], data['hojin-infos'][0]) : null;
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

module.exports = { isConfigured, searchByName, fetchByCorporateNumber };
