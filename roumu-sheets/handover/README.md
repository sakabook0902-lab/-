# 勤怠・給与・労務システム

人事労務freeeのように、**従業員も管理者もブラウザの画面で使える**勤怠・給与計算・労務手続きの管理システムです。
Googleスプレッドシートにデータを保存し、Google Apps Script で動きます（サーバー代0円）。

- 機能・計算ルールの詳細：[docs/SPEC.md](docs/SPEC.md)
- スプレッドシートへの導入手順：[roumu-sheets/README.md](roumu-sheets/README.md)
- Claude Codeで作業するとき：[CLAUDE.md](CLAUDE.md)、最初の依頼文の例は [docs/FIRST_PROMPT.md](docs/FIRST_PROMPT.md)

## はじめての導入（約30分）
1. Googleドライブで新しいスプレッドシートを作る
2. 拡張機能 → Apps Script を開き、`roumu-sheets/dist/Code.gs` の中身を貼り付けて保存。プロジェクトの設定でタイムゾーンを「東京」にする
3. スプレッドシートを再読み込み → メニュー「労務 → 初期設定」（初回は権限を許可）→ もう一度「初期設定」
4. 動作確認だけなら「労務 → デモデータを投入」
5. Apps Script の「デプロイ → 新しいデプロイ → ウェブアプリ」（実行：自分／アクセス：組織内の全員 または Googleアカウントを持つ全員）→ 表示されたURLが従業員マイページと管理画面の共通URL
6. Googleアカウントで管理画面に入れない場合は「労務 → 管理者パスワードを設定」
7. 本番前に「労務 → データをすべて消去」でデモデータを消し、Webアプリの「設定」で会社情報・料率を入力する

詳しくは [roumu-sheets/README.md](roumu-sheets/README.md) を参照してください。
