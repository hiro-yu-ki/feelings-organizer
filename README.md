> 公開用スナップショットです。実データ、認証情報、運用環境の識別子は含めていません。

# 余白 — 気持ち整理

二人の人間関係の対話で、AIが勝敗や正誤を決めず、双方の表現機会を支える mobile-first Web アプリです。医療、心理療法、カウンセリング、緊急対応サービスではありません。

## ローカル起動

Node.js 20 以上だけで動きます。外部パッケージのインストールは不要です。

```sh
cp .env.example .env
npm start
```

Windows PowerShell で npm スクリプト実行が制限される場合は `npm.cmd start` または `node src/server.js` を使い、`http://localhost:3000` を開きます。標準は `AI_PROVIDER=mock` です。開発データは `data/app.json` に保存され、Git 対象外です。

```sh
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run e2e
```

## ローカル AI（Ollama）

Ollama を利用すると、会話の分析、話題の導入、司会の発言、終了時の整理をローカルモデルで生成できます。Windows では [公式ダウンロード](https://ollama.com/download/windows) から導入し、`ollama pull qwen3:4b-instruct` でモデルを取得します。`.env.example` を `.env` にコピーして `AI_PROVIDER=ollama` に変更すると、`npm start` でローカル API に接続します。必要なら `OLLAMA_MODEL` を変更できます。モデルはこの PC で動き、アプリは `127.0.0.1:11434` にだけ接続します。モデルが応答しない操作は固定の案内へ切り替わります。

話し合いは、各自の非公開入力と AI の理解の確認、共有候補の承認を経て始まります。二人の確認後に「話題を整理する」を押すと、セッションの目的と承認済み共有内容から話題候補と最初の問いを作ります。非公開の原文は導入や司会の共有発言へ渡しません。

## Gemini API に切り替える

1. [Google AI Studio の API Keys](https://aistudio.google.com/api-keys) で本人の Google アカウントから Gemini API キーを作成します。利用規約やプロジェクトの Free Tier 表示を確認してください。キーをチャットや Git に貼らないでください。
2. このプロジェクトの `.env` を開き、`AI_PROVIDER=gemini` と `APP_GEMINI_MODEL=gemini-3.6-flash` を設定します。OS の環境変数にキーがある場合は、そのまま利用できます。ない場合は `.env` に `GEMINI_API_KEY=取得したキー` を設定します。すでに OS の `GEMINI_MODEL` が設定されていても、このプロジェクトの `APP_GEMINI_MODEL` が優先されます。`.env` は Git の対象外です。
3. アプリを再起動してログインし、画面右上に `Gemini · gemini-3.6-flash` と表示されることを確認します。新しいセッションで「AIと整理する」を試してください。既存の分析や要約は自動で作り直されません。

切り替え前の接続検査は `npm.cmd run ai:check` で実行できます。架空の話題で Gemini API を呼び、キーやモデル名を画面に漏らさず成否を表示します。プロジェクトの料金プランは API キーだけでは判定できないため、[Google AI Studio の API Keys](https://aistudio.google.com/api-keys) で該当キーの `Plan` を確認してください。無料利用を希望する場合は `Free` のプロジェクトのキーを使います。

キーはサーバーからのみ送信し、ブラウザや DB へ保存しません。無料枠にはモデルごとの回数・トークン制限があり、上限は Google AI Studio で確認します。Gemini 3.5 Flash の無料枠では送信データが Google の製品改善に利用される場合があります。非公開の原文も分析時に Google へ送信されるため、実在人物の機微な会話を扱う前に当事者同士で確認してください。API が応答しないときは固定の案内に切り替わり、その旨を分析・導入・要約の画面に表示します。

ブラウザ音声認識 (`SpeechRecognition`) を第一候補にし、非対応、権限拒否、ネットワーク失敗、低品質時はテキストへ戻します。AI発言の読み上げは `speechSynthesis` です。Gemini Live 接続は利用せず、通常の Gemini API で文字起こし後のテキストを処理します。

## 主な画面

登録・ログイン、セッション一覧/作成/参加、本人だけの事前入力と分析の確認、共有候補承認、開始前の話題整理、二人用ライブ対話、AI介入、終了サマリーがあります。招待は作成者にだけコードと URL を表示します。SSE は切断時にブラウザが自動再接続します。

詳細は [architecture](docs/ARCHITECTURE.md)、[mediation policy](docs/MEDIATION_POLICY.md)、[privacy](docs/PRIVACY.md)、[security](SECURITY.md)、[handover](HANDOVER.md) を参照してください。

## Cloudflare 公開版

公開 URL: https://your-worker.example

ブラウザで URL を開いて新規登録すれば利用できます。2人目にはアプリの招待 URL を送ってください。公開構成と保守方法は [Cloudflare 公開版](docs/CLOUDFLARE.md) を参照してください。

対話を作成すると固有の招待リンクが発行されます。「招待リンクを送る」からLINEやメールなどで相手へ送り、相手は自分の端末とアカウントで参加します。
