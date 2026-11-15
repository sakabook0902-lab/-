// 引き継ぎ用パッケージを作る：勤怠・給与・労務システムに必要なファイルだけを1つのフォルダ（とzip）にまとめる
// 使い方: node roumu-sheets/scripts/export-handover.js [出力先フォルダ]
// 出力したフォルダを新しいGitリポジトリにすれば、別のアカウントのClaude Codeでそのまま作業を続けられる。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'dist-handover', 'roumu-system'));

function copy(src, dest, filter = () => true) {
  const s = path.join(repo, src);
  const d = path.join(out, dest || src);
  const st = fs.statSync(s);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(s)) if (filter(f)) copy(path.join(src, f), path.join(dest || src, f), filter);
  } else {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
  }
}
function write(dest, text) {
  fs.mkdirSync(path.dirname(path.join(out, dest)), { recursive: true });
  fs.writeFileSync(path.join(out, dest), text);
}

// 最新の dist/Code.gs を作ってからコピー
execFileSync(process.execPath, [path.join(repo, 'roumu-sheets', 'scripts', 'build.js')], { stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
const skip = (f) => !['node_modules', '.clasp.json', '.clasprc.json', 'handover', 'export-handover.js'].includes(f);
copy('roumu/src/lib');
copy('roumu/test', null, (f) => /^(calc|extra|filings)\.test\.js$/.test(f));
copy('roumu-sheets', null, skip);
for (const f of ['CLAUDE.md', 'README.md', 'docs/SPEC.md', 'docs/FIRST_PROMPT.md']) copy(`roumu-sheets/handover/${f}`, f);

write('roumu/package.json', JSON.stringify({ name: 'roumu-lib', private: true, description: '勤怠・給与・労務の計算ロジック（純粋関数）', scripts: { test: 'node --test test/*.test.js' }, engines: { node: '>=20' } }, null, 2) + '\n');
write('roumu/README.md', '# 計算ロジック\n\n勤怠・給与・源泉所得税・標準報酬月額・有給休暇・労務手続き・賞与・年末調整・全銀振込データ・届出書類の計算を行う純粋関数です。\nGoogle Apps Script版（`../roumu-sheets`）のビルドでそのまま同梱されます。テスト：`npm test`\n');
write('package.json', JSON.stringify({
  name: 'roumu-system', private: true, description: '勤怠・給与・労務システム（Googleスプレッドシート＋Apps Script）',
  scripts: { test: 'cd roumu && npm test && cd ../roumu-sheets && npm test', build: 'node roumu-sheets/scripts/build.js' },
  engines: { node: '>=20' },
}, null, 2) + '\n');
write('.gitignore', 'node_modules/\n.clasp.json\n.clasprc.json\n.env\n');

// 動作確認：出力先でテストが通ること
execFileSync('npm', ['test', '--silent'], { cwd: out, stdio: 'inherit' });

// zip（あれば）
const zipPath = out + '.zip';
fs.rmSync(zipPath, { force: true });
try {
  execFileSync('zip', ['-qr', zipPath, path.basename(out)], { cwd: path.dirname(out) });
  console.log(`\n引き継ぎパッケージを作成しました：\n  フォルダ: ${out}\n  zip: ${zipPath}`);
} catch (e) {
  console.log(`\n引き継ぎパッケージを作成しました：${out}（zipコマンドがないためzipは作成していません）`);
}
