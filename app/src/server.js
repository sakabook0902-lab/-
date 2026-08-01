const path = require('path');
const express = require('express');
const db = require('./db');
const gbizinfo = require('./services/gbizinfo');
const prefectures = require('./services/prefectures');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function logAudit(checkId, action, actor, detail) {
  db.prepare(
    `INSERT INTO audit_logs (check_id, action, actor, detail) VALUES (?, ?, ?, ?)`
  ).run(checkId, action, actor, detail || null);
}

function matchBlacklist(name) {
  if (!name) return [];
  const entries = db.prepare(`SELECT * FROM blacklist`).all();
  const target = name.trim();
  return entries.filter((b) => {
    if (!b.name) return false;
    return target.includes(b.name.trim()) || b.name.trim().includes(target);
  });
}

// --- Dashboard ---
app.get('/', (req, res) => {
  const checks = db
    .prepare(`SELECT * FROM checks ORDER BY created_at DESC`)
    .all();
  const today = todayStr();
  const overdue = checks.filter(
    (c) => c.decision === '承認' && c.next_check_due && c.next_check_due <= today
  );
  const stats = {
    total: checks.length,
    pending: checks.filter((c) => !c.decision).length,
    approved: checks.filter((c) => c.decision === '承認').length,
    rejected: checks.filter((c) => c.decision === '否認').length,
    hold: checks.filter((c) => c.decision === '保留').length,
    blacklistHits: checks.filter((c) => c.blacklist_hit).length,
    overdue: overdue.length,
  };
  res.render('dashboard', { checks, stats, overdue, today });
});

// --- New check request ---
app.get('/checks/new', (req, res) => {
  res.render('check_new', { error: null, form: req.query || {} });
});

app.post('/checks/new', (req, res) => {
  const {
    party_name,
    party_name_kana,
    representative,
    address,
    corporate_number,
    capital,
    employee_count,
    business_category,
    established_date,
    registry_source,
    annual_revenue,
    requested_by,
  } = req.body;

  if (!party_name || !requested_by) {
    return res.render('check_new', {
      error: '取引先名称と申請者は必須です。',
      form: req.body,
    });
  }

  const hits = matchBlacklist(party_name);
  const blacklistHit = hits.length > 0 ? 1 : 0;
  const blacklistDetail = hits.length
    ? hits.map((h) => `${h.name}（理由: ${h.reason || '未記載'}）`).join(' / ')
    : null;

  const info = db
    .prepare(
      `INSERT INTO checks
        (party_name, party_name_kana, representative, address, corporate_number,
         capital, employee_count, business_category, established_date,
         registry_source, registry_looked_up_at, annual_revenue,
         requested_by, blacklist_hit, blacklist_hit_detail, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      party_name,
      party_name_kana || null,
      representative || null,
      address || null,
      corporate_number || null,
      capital ? Number(capital) || null : null,
      employee_count ? Number(employee_count) || null : null,
      business_category || null,
      established_date || null,
      registry_source || null,
      registry_source ? new Date().toISOString() : null,
      annual_revenue || null,
      requested_by,
      blacklistHit,
      blacklistDetail,
      '一次スクリーニング済み'
    );

  const checkId = info.lastInsertRowid;
  logAudit(
    checkId,
    '申請・自動一次スクリーニング実施',
    requested_by,
    blacklistHit
      ? `自社ブラックリストに一致: ${blacklistDetail}`
      : '自社ブラックリスト該当なし'
  );
  if (registry_source) {
    logAudit(checkId, '企業情報検索の結果を取り込み', requested_by, `取得元: ${registry_source}`);
  }

  res.redirect(`/checks/${checkId}`);
});

// --- Company lookup (gBizINFO) ---
app.get('/companies/lookup', (req, res) => {
  res.render('company_lookup', {
    configured: gbizinfo.isConfigured(),
    form: {},
    results: null,
    error: null,
    prefectures,
  });
});

app.post('/companies/lookup', async (req, res) => {
  const form = req.body;
  if (!gbizinfo.isConfigured()) {
    return res.render('company_lookup', { configured: false, form, results: null, error: null, prefectures });
  }
  if (!form.name) {
    return res.render('company_lookup', {
      configured: true,
      form,
      results: null,
      error: '企業名を入力してください。都道府県・資本金・従業員数の条件を追加すると、同名の別会社と区別しやすくなります。',
      prefectures,
    });
  }
  try {
    const results = await gbizinfo.search({
      name: form.name,
      prefecture: form.prefecture || null,
      corporateType: form.corporate_type || null,
      capitalFrom: form.capital_from || null,
      capitalTo: form.capital_to || null,
      employeeFrom: form.employee_from || null,
      employeeTo: form.employee_to || null,
    });
    res.render('company_lookup', { configured: true, form, results, error: null, prefectures });
  } catch (e) {
    res.render('company_lookup', {
      configured: true,
      form,
      results: null,
      error: `検索に失敗しました（${e.message}）`,
      prefectures,
    });
  }
});

// 法人番号が分かっている場合、名称検索を経由せず直接1社に絞り込む
app.get('/companies/goto', (req, res) => {
  const corporateNumber = (req.query.corporate_number || '').trim();
  if (!corporateNumber) return res.redirect('/companies/lookup');
  res.redirect(`/companies/${encodeURIComponent(corporateNumber)}`);
});

app.get('/companies/:corporateNumber', async (req, res) => {
  if (!gbizinfo.isConfigured()) {
    return res.render('company_detail', { configured: false, company: null, finance: null, error: null });
  }
  try {
    const company = await gbizinfo.fetchByCorporateNumber(req.params.corporateNumber);
    let finance = [];
    try {
      finance = await gbizinfo.fetchFinance(req.params.corporateNumber);
    } catch (financeErr) {
      finance = []; // 財務情報がない（非上場企業等）場合はここに来る想定
    }
    res.render('company_detail', { configured: true, company, finance, error: null });
  } catch (e) {
    res.render('company_detail', {
      configured: true,
      company: null,
      finance: null,
      error: `取得に失敗しました（${e.message}）`,
    });
  }
});

// --- Check detail ---
app.get('/checks/:id', (req, res) => {
  const check = db.prepare(`SELECT * FROM checks WHERE id = ?`).get(req.params.id);
  if (!check) return res.status(404).send('チェック案件が見つかりません。');
  const logs = db
    .prepare(`SELECT * FROM audit_logs WHERE check_id = ? ORDER BY created_at ASC`)
    .all(check.id);
  res.render('check_detail', { check, logs, error: null });
});

// --- Record external check result (SafeBiz / 官報 / 都道府県公表情報 等) ---
app.post('/checks/:id/external', (req, res) => {
  const check = db.prepare(`SELECT * FROM checks WHERE id = ?`).get(req.params.id);
  if (!check) return res.status(404).send('チェック案件が見つかりません。');

  const { external_source, external_result, external_note, external_checked_by } = req.body;
  if (!external_source || !external_result || !external_checked_by) {
    const logs = db
      .prepare(`SELECT * FROM audit_logs WHERE check_id = ? ORDER BY created_at ASC`)
      .all(check.id);
    return res.render('check_detail', {
      check,
      logs,
      error: '照会先・結果・確認者は必須です。',
    });
  }

  db.prepare(
    `UPDATE checks SET
       external_source = ?, external_result = ?, external_note = ?,
       external_checked_by = ?, external_checked_at = datetime('now','localtime'),
       status = '外部チェック済み', updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(external_source, external_result, external_note || null, external_checked_by, check.id);

  logAudit(
    check.id,
    '外部データ照会結果を記録',
    external_checked_by,
    `照会先: ${external_source} / 結果: ${external_result}${external_note ? ' / 備考: ' + external_note : ''}`
  );

  res.redirect(`/checks/${check.id}`);
});

// --- Record manually-verified attributes (年商・連絡先・行政処分の有無) ---
app.post('/checks/:id/company-attributes', (req, res) => {
  const check = db.prepare(`SELECT * FROM checks WHERE id = ?`).get(req.params.id);
  if (!check) return res.status(404).send('チェック案件が見つかりません。');

  const {
    annual_revenue,
    contact_phone,
    admin_sanction_status,
    admin_sanction_note,
    admin_sanction_checked_by,
  } = req.body;

  if (!admin_sanction_status || !admin_sanction_checked_by) {
    const logs = db
      .prepare(`SELECT * FROM audit_logs WHERE check_id = ? ORDER BY created_at ASC`)
      .all(check.id);
    return res.render('check_detail', {
      check,
      logs,
      error: '行政処分の有無・確認者は必須です。',
    });
  }

  db.prepare(
    `UPDATE checks SET
       annual_revenue = ?, contact_phone = ?,
       admin_sanction_status = ?, admin_sanction_note = ?,
       admin_sanction_checked_by = ?, admin_sanction_checked_at = datetime('now','localtime'),
       updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    annual_revenue || null,
    contact_phone || null,
    admin_sanction_status,
    admin_sanction_note || null,
    admin_sanction_checked_by,
    check.id
  );

  logAudit(
    check.id,
    '企業属性・行政処分の有無を手動確認',
    admin_sanction_checked_by,
    `行政処分: ${admin_sanction_status}${admin_sanction_note ? ' / 備考: ' + admin_sanction_note : ''}` +
      `${annual_revenue ? ` / 年商: ${annual_revenue}` : ''}${contact_phone ? ` / 連絡先: ${contact_phone}` : ''}`
  );

  res.redirect(`/checks/${check.id}`);
});

// --- Decision (承認 / 否認 / 保留) ---
app.post('/checks/:id/decision', (req, res) => {
  const check = db.prepare(`SELECT * FROM checks WHERE id = ?`).get(req.params.id);
  if (!check) return res.status(404).send('チェック案件が見つかりません。');

  const { decision, decided_by } = req.body;
  const allowed = ['承認', '否認', '保留'];
  if (!allowed.includes(decision) || !decided_by) {
    const logs = db
      .prepare(`SELECT * FROM audit_logs WHERE check_id = ? ORDER BY created_at ASC`)
      .all(check.id);
    return res.render('check_detail', {
      check,
      logs,
      error: '判定内容・承認者は必須です。',
    });
  }

  const nextCheckDue = decision === '承認' ? addYears(todayStr(), 1) : null;

  db.prepare(
    `UPDATE checks SET
       decision = ?, decided_by = ?, decided_at = datetime('now','localtime'),
       next_check_due = ?, status = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(decision, decided_by, nextCheckDue, decision, check.id);

  logAudit(
    check.id,
    '最終判定',
    decided_by,
    `判定: ${decision}${nextCheckDue ? ` / 次回再チェック期限: ${nextCheckDue}` : ''}`
  );

  res.redirect(`/checks/${check.id}`);
});

// --- Re-check reminders ---
app.get('/rechecks', (req, res) => {
  const today = todayStr();
  const checks = db
    .prepare(
      `SELECT * FROM checks WHERE decision = '承認' AND next_check_due IS NOT NULL
       ORDER BY next_check_due ASC`
    )
    .all();
  res.render('rechecks', { checks, today });
});

// --- Blacklist management ---
app.get('/blacklist', (req, res) => {
  const entries = db.prepare(`SELECT * FROM blacklist ORDER BY created_at DESC`).all();
  res.render('blacklist', { entries, error: null });
});

app.post('/blacklist', (req, res) => {
  const { name, reason, added_by } = req.body;
  if (!name || !added_by) {
    const entries = db.prepare(`SELECT * FROM blacklist ORDER BY created_at DESC`).all();
    return res.render('blacklist', {
      entries,
      error: '名称・登録者は必須です。',
    });
  }
  db.prepare(`INSERT INTO blacklist (name, reason, added_by) VALUES (?, ?, ?)`).run(
    name,
    reason || null,
    added_by
  );
  res.redirect('/blacklist');
});

app.listen(PORT, () => {
  console.log(`反社チェックシステム起動: http://localhost:${PORT}`);
});
