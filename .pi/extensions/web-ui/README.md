# pi Web UI Dashboard

Preact + ViteベースのWeb UIダッシュボード拡張機能。

## 機能

- **Status**: モデル、作業ディレクトリ、コンテキスト使用量、トークン数、コスト表示
- **Metrics**: ツール呼び出し数、エラー率、平均応答時間
- **Config**: 設定の確認と変更

## セットアップ

```bash
cd .pi/extensions/web-ui
npm install
npm run build
```

## 使用方法

### 手動起動

```bash
pi
/web-ui          # デフォルトポート3000で起動
/web-ui 8080     # ポート指定で起動
/web-ui          # 再度実行で停止
```

### 自動起動

```bash
pi --web-ui      # セッション開始時に自動起動
```

## 開発

```bash
npm run dev      # 開発サーバー起動（HMR有効）
npm run build    # 本番ビルド
```

## アーキテクチャ

```
web-ui/
├── index.ts           # 拡張機能エントリーポイント
├── server.ts          # Express HTTPサーバー
├── web/               # Preactアプリケーション
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── app.tsx
│   │   └── components/
│   └── styles/
│       └── main.css
├── dist/              # ビルド出力（配布用）
├── package.json
└── vite.config.ts
```

## 配布

npmパッケージとして公開可能。ビルド済みdistを含める。

```bash
npm run build
npm publish
```

## ライセンス

MIT
