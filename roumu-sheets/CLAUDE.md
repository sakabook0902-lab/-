# CLAUDE.md — 勤怠・給与・労務（Googleスプレッドシート / Apps Script版）

Googleスプレッドシートにバインドした Apps Script（V8）。人事労務freeeのような**Webアプリ（`doGet` + `src/app.html`）**で、従業員マイページと管理画面を1つのURLで提供する。スプレッドシートはデータの保存場所（「労務」メニューは補助）。
画面・メッセージ・コメントはすべて日本語。利用者はITに詳しくない総務担当者と従業員。

## 構成
- `src/Code.js`：本体（シート定義 `SHEETS`、シート入出力、メニュー、打刻、給与計算、明細PDF、労務タスク、ダッシュボード、通知、onEdit の証跡）
- `src/WebApp.js`：Webアプリのサーバー側。画面からは `api({token, action, data})` だけを呼ぶ。`auth.*`（ログイン）／`me.*`（従業員本人のデータのみ）／`adm.*`（管理者のみ）。セッションは CacheService（6時間）
- `src/app.html`：画面（1ページのアプリ。ビルド時に `HTML_APP` 変数として埋め込む）。表示する値は必ず `esc()` でエスケープする
- 賞与（`roumu/src/lib/bonus.js`）・年末調整（`yearEnd.js`）・全銀振込データ（`zengin.js`）も共通ライブラリ
- 届出書類の記入内容シート（`roumu/src/lib/filings.js`）：正式様式ではなく転記用。届出書類の作成・提出の主体は会社自身（報酬を得て代行するのは社労士の独占業務）。タスクの管理キーから書類を判定（`filingForTask_`）
- `src/appsscript.json`：マニフェスト（タイムゾーン Asia/Tokyo、Webアプリは「自分として実行」）
- **計算ロジック**：`../roumu/src/lib/*.js`（勤怠・給与・源泉税・標準報酬・有給・手続き・賞与・年末調整・振込・届出書類）。純粋関数でテスト可能。`scripts/build.js` がモジュール登録形式（`__req('payroll')`）で `dist/Code.gs` に同梱する。**計算の修正は `roumu/src/lib` 側で行う**（`roumu/test` のテストも通すこと）
- `dist/Code.gs`：利用者が Apps Script に貼り付ける1ファイル（生成物。直接編集しない）
- `test/gas-mock.js`：SpreadsheetApp 等の最小モック。`test/flow.test.js`（メニュー操作）と `test/webapp.test.js`（Webアプリの api）で主要フローを検証

## コマンド
- `npm run build` → `dist/Code.gs` を生成
- `npm test` → ビルドしてモック上でフローテスト
- `npm run push` → ビルドして clasp で Apps Script に反映（`.clasp.json` が必要。`.clasp.json.example` 参照）

## 実装ルール
- シートは**見出し名で列を対応付ける**（`read_` / `toRow_`）。列の追加は `SHEETS` に追記し、利用者には「初期設定」を再実行してもらう（不足列を末尾に追加する）
- 日付・時刻・番号は文字列で保持する。書き込み時は先頭に `'` を付ける（`toRow_`）。読み込み時は `normalize_` で Date 型も吸収する（`instanceof Date` ではなく `isDate_` を使う）
- 打刻は `LockService` で排他。PIN失敗は `CacheService` で5回/15分ロック
- 確定済み（状態=確定）の給与は再計算しない。操作は `log_()` で「操作ログ」に残す
- タスクは「管理キー」で重複作成を防ぐ（`upsertTasks_`）
- マイナンバーは扱わない。届出書類の作成・提出の代行機能は作らない（社労士法27条）
- Apps Script の実行時間上限（6分）・トリガー（30秒：onEdit）を超えないよう、シートの読み書きはまとめて行う

## 毎年の保守
| 時期 | 作業 |
|---|---|
| 12月頃 | 翌年分の源泉所得税：国税庁「電子計算機等を使用して源泉徴収税額を計算する方法」の翌年分を確認し、`roumu/src/lib/withholding.js` の `PARAMS` に年分を追加（テストも追加） |
| 11月頃 | 年末調整：`roumu/src/lib/yearEnd.js` の `PARAMS` をその年分の「年末調整のしかた」と照合 |
| 2〜3月 | 協会けんぽ（都道府県支部）の健康保険料率・介護保険料率（3月分〜）を確認し、Webアプリの「設定」で更新 |
| 3〜4月 | 雇用保険料率（4月〜）、子ども・子育て支援金率を確認し、「設定」で更新 |
| 随時 | 標準報酬月額表の等級改定があれば `roumu/src/lib/standardRemuneration.js` を更新 |

計算ロジックを更新したら `npm run build` → `dist/Code.gs` を貼り直す（または `npm run push`）→ Webアプリを新バージョンでデプロイ。
