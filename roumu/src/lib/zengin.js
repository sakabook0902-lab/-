// 全銀協フォーマット（総合振込・種別コード21）のデータ作成
// 1レコード120桁（半角）。文字は半角カナ・英大文字・数字・一部記号。出力時に Shift_JIS・CRLF にすること。

const FULL = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴー';
const HALF = ['ｱ', 'ｱ', 'ｲ', 'ｲ', 'ｳ', 'ｳ', 'ｴ', 'ｴ', 'ｵ', 'ｵ', 'ｶ', 'ｶﾞ', 'ｷ', 'ｷﾞ', 'ｸ', 'ｸﾞ', 'ｹ', 'ｹﾞ', 'ｺ', 'ｺﾞ', 'ｻ', 'ｻﾞ', 'ｼ', 'ｼﾞ', 'ｽ', 'ｽﾞ', 'ｾ', 'ｾﾞ', 'ｿ', 'ｿﾞ',
  'ﾀ', 'ﾀﾞ', 'ﾁ', 'ﾁﾞ', 'ﾂ', 'ﾂ', 'ﾂﾞ', 'ﾃ', 'ﾃﾞ', 'ﾄ', 'ﾄﾞ', 'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾉ', 'ﾊ', 'ﾊﾞ', 'ﾊﾟ', 'ﾋ', 'ﾋﾞ', 'ﾋﾟ', 'ﾌ', 'ﾌﾞ', 'ﾌﾟ', 'ﾍ', 'ﾍﾞ', 'ﾍﾟ', 'ﾎ', 'ﾎﾞ', 'ﾎﾟ',
  'ﾏ', 'ﾐ', 'ﾑ', 'ﾒ', 'ﾓ', 'ﾔ', 'ﾔ', 'ﾕ', 'ﾕ', 'ﾖ', 'ﾖ', 'ﾗ', 'ﾘ', 'ﾙ', 'ﾚ', 'ﾛ', 'ﾜ', 'ﾜ', 'ｲ', 'ｴ', 'ｦ', 'ﾝ', 'ｳﾞ', 'ｰ'];
// 振込データでは小書き文字（ｧ、ｯ等）は使えないため大文字に置き換える（上の対応表で処理済み）

function toZenginKana(str) {
  let s = String(str || '').normalize('NFKC'); // 半角カナ→全角、全角英数→半角
  s = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); // ひらがな→カタカナ
  let out = '';
  for (const c of s) {
    const i = FULL.indexOf(c);
    if (i >= 0) out += HALF[i];
    else if (/[A-Za-z0-9]/.test(c)) out += c.toUpperCase();
    else if (c === ' ' || c === '　') out += ' ';
    else if ('()-./'.includes(c)) out += c;
    else if (c === '（') out += '(';
    else if (c === '）') out += ')';
    else if (c === '・') out += '.';
    // それ以外（漢字など）は使えないため除外
  }
  return out;
}

function padText(v, len) {
  const s = toZenginKana(v);
  return (s + ' '.repeat(len)).slice(0, len);
}

function padNum(v, len) {
  const s = String(Math.floor(Number(v) || 0));
  if (s.length > len) throw new Error(`桁数オーバー: ${s}（${len}桁まで）`);
  return s.padStart(len, '0');
}

function digits(v, len, label) {
  const s = String(v || '').replace(/\D/g, '');
  if (!s) throw new Error(`${label}が未入力です`);
  if (s.length > len) throw new Error(`${label}の桁数が多すぎます（${len}桁まで）: ${v}`);
  return s.padStart(len, '0');
}

const TYPE = { 普通: '1', 当座: '2', 貯蓄: '4' };

/**
 * @param company { clientCode, clientName, bankCode, bankName, branchCode, branchName, accountType, accountNumber }
 * @param payDate 'YYYY-MM-DD'（振込指定日）
 * @param items [{ bankCode, bankName, branchCode, branchName, accountType, accountNumber, holderName, amount, customerCode }]
 * @returns { text, count, total, errors }
 */
function buildTransferFile(company, payDate, items) {
  const errors = [];
  const lines = [];
  const mmdd = payDate.slice(5, 7) + payDate.slice(8, 10);
  try {
    lines.push('1' + '21' + '0' + digits(company.clientCode, 10, '委託者コード') + padText(company.clientName, 40) + mmdd
      + digits(company.bankCode, 4, '会社の銀行番号') + padText(company.bankName, 15) + digits(company.branchCode, 3, '会社の支店番号')
      + padText(company.branchName, 15) + (TYPE[company.accountType] || '1') + digits(company.accountNumber, 7, '会社の口座番号') + ' '.repeat(17));
  } catch (e) {
    errors.push('会社情報：' + e.message);
  }
  let total = 0, count = 0;
  for (const it of items) {
    if (!(Number(it.amount) > 0)) continue;
    try {
      const holder = toZenginKana(it.holderName);
      if (!holder.trim()) throw new Error('受取人名（カナ）が未入力です');
      lines.push('2' + digits(it.bankCode, 4, '銀行番号') + padText(it.bankName, 15) + digits(it.branchCode, 3, '支店番号') + padText(it.branchName, 15)
        + ' '.repeat(4) + (TYPE[it.accountType] || '1') + digits(it.accountNumber, 7, '口座番号') + padText(holder, 30) + padNum(it.amount, 10)
        + '0' + padText(it.customerCode || '', 10) + ' '.repeat(10) + ' ' + ' ' + ' '.repeat(7));
      total += Math.floor(Number(it.amount));
      count++;
    } catch (e) {
      errors.push(`${it.label || it.holderName}：${e.message}`);
    }
  }
  lines.push('8' + padNum(count, 6) + padNum(total, 12) + ' '.repeat(101));
  lines.push('9' + ' '.repeat(119));
  return { text: lines.join('\r\n') + '\r\n', lines, count, total, errors };
}

module.exports = { buildTransferFile, toZenginKana };
