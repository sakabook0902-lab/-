// roumu/src/lib の計算ロジック（Node版と共通）と src/Code.js・HTMLを、
// Apps Script に貼り付けられる1ファイル（dist/Code.gs）にまとめる。
// 使い方: node scripts/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const libDir = path.join(root, '..', 'roumu', 'src', 'lib');
const LIBS = ['dates', 'standardRemuneration', 'withholding', 'attendance', 'leave', 'payroll', 'procedures'];

let out = `// ============================================================
// 勤怠・給与計算・労務手続き管理（Googleスプレッドシート版）
// このファイルは scripts/build.js で自動生成しています。直接編集せず、
// roumu-sheets/src/ と roumu/src/lib/ を編集してからビルドしてください。
// 生成日時: ${new Date().toISOString()}
// ============================================================

// ---- 計算ロジック（Node版と共通のモジュールを読み込み順に依存しない形で登録） ----
var __mods = __mods || {};
var __cache = __cache || {};
function __req(name) {
  name = String(name).replace(/^.*\\//, '').replace(/\\.js$/, '');
  if (__cache[name]) return __cache[name].exports;
  if (!__mods[name]) throw new Error('module not found: ' + name);
  var m = { exports: {} };
  __cache[name] = m;
  __mods[name](m, m.exports, __req);
  return m.exports;
}
`;

for (const name of LIBS) {
  const src = fs.readFileSync(path.join(libDir, `${name}.js`), 'utf8');
  out += `\n// ---- lib/${name}.js ----\n__mods['${name}'] = function (module, exports, require) {\n${src}\n};\n`;
}

out += '\n// ---- 画面（HTML） ----\n';
for (const f of fs.readdirSync(path.join(root, 'src')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  out += `var HTML_${path.basename(f, '.html').toUpperCase()} = ${JSON.stringify(html)};\n`;
}

out += '\n' + fs.readFileSync(path.join(root, 'src', 'Code.js'), 'utf8');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'Code.gs'), out);
fs.copyFileSync(path.join(root, 'src', 'appsscript.json'), path.join(root, 'dist', 'appsscript.json'));
console.log(`dist/Code.gs を生成しました（${out.split('\n').length}行）`);
