// 労務手続きの「記入内容シート」を組み立てる（PDF化は呼び出し側で行う）
// 正式な様式そのものではなく、正式様式の項目順にシステムのデータを当てはめた転記用の資料。
// e-Gov・日本年金機構の届書作成プログラム・正式様式へ転記して提出する前提。
// マイナンバーは保持しないため、常に「本人確認書類から記入」となる。
const { addDays, nextMonth10th, ymAdd } = require('./dates');
const { lookupHealth, lookupPension, healthGradeOf } = require('./standardRemuneration');

const yen = (v) => (v === '' || v === null || v === undefined ? '' : `${Number(v).toLocaleString()}円`);
const jpDate = (d) => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日').replace(/^(\d{4})-(\d{2})$/, '$1年$2月') : '');

// 行 [項目, 値, 補足]。値が空なら要記入として扱う（optional: true は空でもよい）
function row(label, value, hint = '', optional = false) {
  return { label, value: value === null || value === undefined ? '' : String(value), hint, optional };
}

function companySection(c, kind) {
  const rows = [
    row('事業所名称', c.company_name),
    row('事業所所在地', c.company_address),
    row('事業主氏名', c.company_rep),
    row('電話番号', c.company_tel),
  ];
  if (kind === 'shakai') {
    rows.unshift(row('事業所整理記号', c.shakai_office_symbol), row('事業所番号', c.shakai_office_number));
  }
  if (kind === 'koyou') rows.unshift(row('雇用保険 適用事業所番号', c.koyou_office_number));
  if (kind === 'jumin') rows.unshift(row('法人番号', c.corporate_number), row('特別徴収義務者 指定番号', '', '市区町村ごとに異なる。通知書に記載'));
  return { title: '事業所（提出者）', rows };
}

function personRows(e, opts = {}) {
  const rows = [
    row('氏名', e.name),
    row('フリガナ', e.name_kana),
    row('生年月日', jpDate(e.birth_date)),
    row('性別', e.gender),
  ];
  if (opts.myNumber) rows.push(row(opts.myNumberLabel || '個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'));
  if (opts.address) rows.push(row('住所', e.address));
  return rows;
}

function monthlyFixed(e) {
  const n = (v) => Number(v || 0);
  return n(e.base_salary) + n(e.position_allowance) + n(e.commute_allowance) + n(e.fixed_ot_pay);
}

// 給与の行から「支給月・基礎日数・報酬」の表を作る
function remunerationTable(pays, months) {
  const rows = months.map((m) => {
    const p = pays.find((x) => x.pay_ym === m);
    return p ? [jpDate(m), `${p.base_days}日`, yen(p.remuneration), '0円', yen(p.remuneration)] : [jpDate(m), '（給与データなし）', '', '', ''];
  });
  return { head: ['支給月', '支払基礎日数', '通貨によるもの', '現物によるもの', '合計'], rows };
}

const BUILDERS = {
  // ---------- 健康保険・厚生年金保険 被保険者資格取得届 ----------
  shakai_get({ emp: e, company }) {
    const fixed = monthlyFixed(e);
    return {
      title: '健康保険・厚生年金保険 被保険者資格取得届',
      submitTo: '日本年金機構（管轄の年金事務所）／e-Gov電子申請',
      deadline: addDays(e.hire_date, 5),
      deadlineNote: '資格取得日（入社日）から5日以内',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          ...personRows(e, { myNumber: true, myNumberLabel: '個人番号（マイナンバー）または基礎年金番号' }),
          row('住所', e.address, 'マイナンバーを記入しない場合に必要', true),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('被扶養者', '', '健康保険の被扶養者がいれば「有」とし、被扶養者（異動）届を同時に提出（源泉の扶養人数とは基準が異なる）'),
        ] },
        { title: '報酬月額', rows: [
          row('通貨によるもの', yen(fixed), '基本給＋役職手当＋通勤手当＋固定残業代。固定残業代を超える残業・インセンティブの見込額があれば加算'),
          row('現物によるもの', '0円', '社宅・食事の支給などがあれば記入', true),
          row('合計', yen(fixed)),
          row('（参考）見込みの標準報酬月額', `健保 ${yen(lookupHealth(fixed).standard)}（${lookupHealth(fixed).grade}等級）／厚年 ${yen(lookupPension(fixed).standard)}（${lookupPension(fixed).grade}等級）`, '決定は年金事務所が行う', true),
        ] },
        { title: '備考', rows: [
          row('雇用形態', e.employment_type, '短時間労働者・契約社員などは備考欄の該当項目を確認', true),
          row('70歳以上被用者該当', '', '該当する場合のみ', true),
        ] },
      ],
      notes: ['資本金1億円を超える法人（特定の法人）は、資格取得届も含めて電子申請が推奨されます。', '決定通知書が届いたら、標準報酬月額を従業員情報に登録してください。'],
    };
  },

  // ---------- 健康保険・厚生年金保険 被保険者資格喪失届 ----------
  shakai_loss({ emp: e, company }) {
    const lossDate = addDays(e.leave_date, 1);
    return {
      title: '健康保険・厚生年金保険 被保険者資格喪失届',
      submitTo: '日本年金機構（管轄の年金事務所）／e-Gov電子申請',
      deadline: addDays(e.leave_date, 5),
      deadlineNote: '資格喪失日（退職日の翌日）から5日以内',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          row('被保険者整理番号', e.insured_number, '資格取得時の決定通知書・保険証に記載'),
          ...personRows(e, { myNumber: true, myNumberLabel: '個人番号（マイナンバー）または基礎年金番号' }),
          row('喪失年月日', jpDate(lossDate), '退職日の翌日'),
          row('喪失（不該当）原因', `退職等（${jpDate(e.leave_date)} 退職）`),
          row('保険証（資格確認書）の回収', '', '回収した枚数／添付できない枚数を記入（マイナ保険証のみの場合は不要）'),
          row('70歳以上被用者不該当', '', '該当する場合のみ', true),
        ] },
      ],
      notes: ['最終給与で控除する社会保険料は「喪失日の属する月の前月分まで」です。月末退職の場合は退職月分まで控除します。'],
    };
  },

  // ---------- 雇用保険 被保険者資格取得届 ----------
  koyou_get({ emp: e, company }) {
    const wage = monthlyFixed(e);
    const fixedTerm = /契約|パート|アルバイト/.test(e.employment_type || '');
    return {
      title: '雇用保険 被保険者資格取得届',
      submitTo: '管轄のハローワーク／e-Gov電子申請',
      deadline: nextMonth10th(e.hire_date),
      deadlineNote: '資格取得日（入社日）の属する月の翌月10日まで',
      sections: [
        companySection(company, 'koyou'),
        { title: '被保険者', rows: [
          row('個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'),
          row('被保険者番号', e.koyou_number, '前職で雇用保険に加入していた場合は雇用保険被保険者証の番号。初めての場合は空欄', true),
          row('取得区分', e.koyou_number ? '再取得' : '新規', '過去7年以内に加入歴があれば「再取得」'),
          ...personRows(e),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('被保険者となったことの原因', '', '新規学卒／新規（その他）／日雇からの切替／その他 から選択'),
        ] },
        { title: '雇用条件', rows: [
          row('賃金（支払の態様）', '月給'),
          row('賃金月額', `${Math.floor(wage / 1000)}千円`, `${yen(wage)}（基本給・手当・通勤手当・固定残業代の合計。千円未満切捨て）`),
          row('雇用形態', e.employment_type),
          row('職種', e.job),
          row('就職経路', '', '安定所紹介／自己就職／民間紹介 など'),
          row('1週間の所定労働時間', e.weekly_hours ? `${e.weekly_hours}時間` : '', '就業規則・雇用契約書の時間'),
          row('契約期間の定め', fixedTerm ? '有（期間・更新の有無を記入）' : '無'),
        ] },
      ],
      notes: ['手続き後に交付される「雇用保険被保険者証」「資格取得等確認通知書（被保険者通知用）」は本人に渡してください。', '被保険者番号を従業員情報に登録しておくと、退職時の書類に自動で入ります。'],
    };
  },

  // ---------- 雇用保険 被保険者資格喪失届（＋離職証明書の賃金の参考） ----------
  koyou_loss({ emp: e, company, pays = [] }) {
    const companyReason = /会社都合/.test(e.leave_reason || '');
    const months = [];
    for (let i = 0; i < 13; i++) months.push(ymAdd(e.leave_date.slice(0, 7), -i));
    const wageRows = months.map((m) => {
      const p = pays.find((x) => x.ym === m);
      return p ? [jpDate(m) + '勤怠分（' + jpDate(p.pay_ym) + '支給）', `${p.base_days}日`, yen(p.gross)] : null;
    }).filter(Boolean);
    return {
      title: '雇用保険 被保険者資格喪失届（離職証明書の作成資料付き）',
      submitTo: '管轄のハローワーク／e-Gov電子申請',
      deadline: addDays(e.leave_date, 11),
      deadlineNote: '被保険者でなくなった日（退職日の翌日）の翌日から10日以内',
      sections: [
        companySection(company, 'koyou'),
        { title: '被保険者', rows: [
          row('個人番号（マイナンバー）', '', '本システムでは保持していません。本人確認書類から記入'),
          row('被保険者番号', e.koyou_number),
          ...personRows(e),
          row('資格取得年月日', jpDate(e.hire_date)),
          row('離職等年月日', jpDate(e.leave_date)),
          row('喪失原因', companyReason ? '3（事業主の都合による離職）' : '2（3以外の離職：自己都合・契約満了等）', `退職事由：${e.leave_reason || '未登録'}。区分は離職理由に応じて確認`),
          row('離職票の交付希望', '', '本人に確認（59歳以上は希望がなくても離職証明書の提出が必要）'),
          row('1週間の所定労働時間', e.weekly_hours ? `${e.weekly_hours}時間` : ''),
          row('補充採用予定の有無', '', '有／無'),
        ] },
      ],
      table: { title: '離職証明書「賃金支払状況」の作成資料（確定済み給与より）', head: ['賃金支払対象期間', '基礎日数', '賃金額（総支給）'], rows: wageRows },
      notes: ['離職証明書は離職日以前の賃金締切日ごとに記入します。上の表は本システムの確定済み給与からの参考値で、基礎日数11日以上（または80時間以上）の月を12ヶ月分さかのぼって記入します。'],
    };
  },

  // ---------- 月額変更届（随時改定） ----------
  getsuhen({ emp: e, company, change, pays = [] }) {
    const months = [0, 1, 2].map((i) => ymAdd(change.effective_ym, i));
    const rows = months.map((m) => pays.find((p) => p.pay_ym === m));
    const total = rows.reduce((s, p) => s + (p ? p.remuneration : 0), 0);
    const avg = rows.every(Boolean) ? Math.floor(total / 3) : '';
    const curGrade = healthGradeOf(e.health_std);
    const nh = avg ? lookupHealth(avg) : null;
    const np = avg ? lookupPension(avg) : null;
    return {
      title: '健康保険・厚生年金保険 被保険者報酬月額変更届（随時改定）',
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: `${ymAdd(change.effective_ym, 3)}-10`,
      deadlineNote: '固定的賃金の変動後3ヶ月分の報酬が確定したら速やかに',
      sections: [
        companySection(company, 'shakai'),
        { title: '被保険者', rows: [
          row('被保険者整理番号', e.insured_number),
          row('氏名', e.name), row('生年月日', jpDate(e.birth_date)),
          row('改定年月', jpDate(ymAdd(change.effective_ym, 3))),
          row('従前の標準報酬月額', `健保 ${yen(e.health_std)}（${curGrade || '-'}等級）／厚年 ${yen(e.pension_std)}`),
          row('従前の改定月', '', '直近の決定通知書で確認'),
          row('昇（降）給', `${jpDate(change.effective_ym)}支給分から：${change.detail || ''}`),
          row('遡及支払額', '', 'ない場合は空欄', true),
        ] },
        { title: '報酬（変動後3ヶ月）', rows: [
          row('総計', yen(total)),
          row('平均額', yen(avg)),
          row('修正平均額', '', '遡及支払がある場合のみ', true),
          row('（参考）新しい標準報酬月額', nh ? `健保 ${yen(nh.standard)}（${nh.grade}等級）／厚年 ${yen(np.standard)}（${np.grade}等級）` : '', '決定は年金事務所が行う', true),
        ] },
      ],
      table: { title: '報酬月額', ...remunerationTable(pays, months) },
      notes: ['3ヶ月とも支払基礎日数17日以上で、従前と2等級以上の差がある場合に届出が必要です。'],
    };
  },

  // ---------- 算定基礎届（定時改定） ----------
  santei({ company, year, people = [] }) {
    const months = ['04', '05', '06'].map((m) => `${year}-${m}`);
    const rows = people.map(({ emp: e, pays }) => {
      const r = months.map((m) => pays.find((p) => p.pay_ym === m));
      const valid = r.filter((p) => p && p.base_days >= 17);
      const total = valid.reduce((s, p) => s + p.remuneration, 0);
      const avg = valid.length ? Math.floor(total / valid.length) : 0;
      const nh = avg ? lookupHealth(avg) : null;
      return [e.insured_number || '（要記入）', e.name, jpDate(e.birth_date), `${yen(e.health_std)}`,
        ...r.map((p) => (p ? `${p.base_days}日 ${yen(p.remuneration)}` : '-')),
        yen(total), yen(avg), nh ? `${yen(nh.standard)}（${nh.grade}等級）` : '-'];
    });
    return {
      title: `健康保険・厚生年金保険 被保険者報酬月額算定基礎届（${year}年 定時決定）`,
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: `${year}-07-10`,
      deadlineNote: '7月1日〜7月10日',
      sections: [companySection(company, 'shakai')],
      table: { title: '4〜6月に支払った報酬（確定済み給与より）', head: ['整理番号', '氏名', '生年月日', '従前の標準報酬', '4月支給', '5月支給', '6月支給', '総計（17日以上の月）', '平均額', '（参考）新しい健保標準報酬'], rows },
      notes: ['支払基礎日数17日未満の月は除いて平均します（短時間労働者は別基準）。', '7月〜9月に随時改定が予定される人は算定基礎届の対象外です。', '9月分の保険料（10月支給の給与）から新しい標準報酬月額で控除します。'],
    };
  },

  // ---------- 賞与支払届 ----------
  bonus_pay({ company, payDate, bonuses = [], emps = [] }) {
    const rows = bonuses.map((b) => {
      const e = emps.find((x) => x.code === b.code) || {};
      return [e.insured_number || '（要記入）', b.name, jpDate(e.birth_date), yen(b.amount), '0円', yen(b.amount), yen(b.std)];
    });
    return {
      title: '健康保険・厚生年金保険 被保険者賞与支払届',
      submitTo: '日本年金機構／e-Gov電子申請（資本金1億円超の法人は電子申請が義務）',
      deadline: addDays(payDate, 5),
      deadlineNote: '賞与支払日から5日以内',
      sections: [companySection(company, 'shakai'), { title: '賞与', rows: [row('賞与支払年月日', jpDate(payDate))] }],
      table: { title: '被保険者ごとの賞与額', head: ['整理番号', '氏名', '生年月日', '通貨', '現物', '合計', '標準賞与額（千円未満切捨て）'], rows },
      notes: ['標準賞与額の上限：健康保険は年度累計573万円、厚生年金は1回150万円。'],
    };
  },

  // ---------- 住民税 特別徴収への切替届出（依頼）書 ----------
  jumin_tokucho({ emp: e, company, today }) {
    const startYm = ymAdd(today.slice(0, 7), 1);
    return {
      title: '住民税 特別徴収への切替届出（依頼）書',
      submitTo: '従業員の住所地（1月1日時点）の市区町村 住民税担当課（eLTAX可）',
      deadline: addDays(today, 14),
      deadlineNote: '特別徴収を開始したい月の前月中旬までが目安（市区町村により異なる）',
      sections: [
        companySection(company, 'jumin'),
        { title: '給与所得者', rows: [
          ...personRows(e, { address: true }),
          row('1月1日時点の住所', '', '現住所と異なる場合のみ', true),
          row('宛名番号（個人番号）', '', '本人の納税通知書・本人確認書類から記入'),
          row('入社年月日', jpDate(e.hire_date)),
        ] },
        { title: '特別徴収の内容', rows: [
          row('特別徴収開始月', jpDate(startYm), '給与から控除を始める月'),
          row('切替の理由', '中途入社のため（普通徴収からの切替）'),
          row('普通徴収の納期限が過ぎていない期別', '', '本人の納税通知書で確認（納期限が過ぎた分は切替できない）'),
          row('月割額', '', '市区町村から届く税額変更通知書の金額を従業員情報に登録'),
        ] },
      ],
      notes: ['様式は市区町村ごとに異なります。各市区町村のホームページの様式に転記してください。', '前職で特別徴収されていた場合は、前職が提出する「給与所得者異動届出書」の下段に記入して引き継ぐ方法もあります。'],
    };
  },

  // ---------- 住民税 給与所得者異動届出書（退職：普通徴収・一括徴収） ----------
  jumin_ido({ emp: e, company, pays = [] }) {
    const ld = e.leave_date;
    const m = Number(ld.slice(5, 7));
    const y = Number(ld.slice(0, 4));
    const fyStart = `${m >= 6 ? y : y - 1}-06`;
    const fyEnd = ymAdd(fyStart, 11);
    const annual = Number(e.resident_tax_june || 0) + Number(e.resident_tax_monthly || 0) * 11;
    const collected = pays.filter((p) => p.pay_ym >= fyStart && p.pay_ym <= fyEnd).reduce((s, p) => s + Number(p.resident || 0), 0);
    const remaining = Math.max(0, annual - collected);
    const janToApr = m >= 1 && m <= 4;
    return {
      title: '住民税 給与所得者異動届出書（退職）',
      submitTo: '従業員の住所地（1月1日時点）の市区町村 住民税担当課（eLTAX可）',
      deadline: nextMonth10th(ld),
      deadlineNote: '異動（退職）があった月の翌月10日まで',
      sections: [
        companySection(company, 'jumin'),
        { title: '給与所得者', rows: [
          ...personRows(e, { address: true }),
          row('宛名番号（個人番号）', '', '特別徴収税額決定通知書に記載'),
          row('異動年月日', jpDate(ld)),
          row('異動事由', '退職'),
        ] },
        { title: '税額', rows: [
          row('特別徴収税額（年税額）', yen(annual), `6月分 ${yen(e.resident_tax_june)}＋7月〜翌5月分 ${yen(e.resident_tax_monthly)}×11`),
          row('徴収済額', yen(collected), `${jpDate(fyStart)}〜${jpDate(fyEnd)}支給の確定済み給与から集計（最終給与を確定してから出力）`),
          row('未徴収税額', yen(remaining)),
          row('未徴収税額の徴収方法', janToApr ? '一括徴収（1月1日〜4月30日の退職は、最後の給与等で未徴収税額を上回る場合は一括徴収が必要）' : '普通徴収（本人の申出があれば一括徴収も可）', '本人の希望・最終給与の額で確認'),
          row('一括徴収する場合の徴収月', '', '一括徴収の場合のみ', true),
        ] },
      ],
      notes: ['様式は市区町村ごとに異なります（総務省の標準様式に準じたものが多い）。', '転職先が決まっていて特別徴収を継続する場合は「転勤（転職）等による特別徴収継続」欄に転職先を記入します。'],
    };
  },
};

const TYPES = {
  shakai_get: '健康保険・厚生年金保険 資格取得届',
  shakai_loss: '健康保険・厚生年金保険 資格喪失届',
  koyou_get: '雇用保険 資格取得届',
  koyou_loss: '雇用保険 資格喪失届（離職証明書の資料付き）',
  getsuhen: '月額変更届（随時改定）',
  santei: '算定基礎届（定時改定）',
  bonus_pay: '賞与支払届',
  jumin_tokucho: '住民税 特別徴収への切替届出書',
  jumin_ido: '住民税 給与所得者異動届出書（退職）',
};

function buildFiling(type, ctx) {
  const fn = BUILDERS[type];
  if (!fn) throw new Error(`不明な書類です: ${type}`);
  const doc = fn(ctx);
  doc.type = type;
  doc.missing = [];
  for (const sec of doc.sections) for (const r of sec.rows) if (!r.value && !r.optional) doc.missing.push(`${sec.title}：${r.label}`);
  return doc;
}

module.exports = { buildFiling, TYPES };
