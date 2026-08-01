const path = require('path');
const express = require('express');
const db = require('./db');

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
  res.render('check_new', { error: null, form: {} });
});

app.post('/checks/new', (req, res) => {
  const {
    party_name,
    party_name_kana,
    representative,
    address,
    corporate_number,
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
         requested_by, blacklist_hit, blacklist_hit_detail, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      party_name,
      party_name_kana || null,
      representative || null,
      address || null,
      corporate_number || null,
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

  res.redirect(`/checks/${checkId}`);
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
