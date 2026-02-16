# 動的ツール生成システム - デプロイ・実装手順書

本ドキュメントでは、動的ツール生成システムのインストール、設定、デプロイ手順について説明します。

## 目次

1. [インストール](#インストール)
2. [初期設定](#初期設定)
3. [デプロイ手順](#デプロイ手順)
4. [設定変更](#設定変更)
5. [アップグレード](#アップグレード)
6. [アンインストール](#アンインストール)
7. [環境移行](#環境移行)

---

## インストール

### 前提条件

| 項目 | 要件 | 確認コマンド |
|------|------|-------------|
| Node.js | v18.0.0以上 | `node --version` |
| TypeScript | v5.0.0以上 | `tsc --version` |
| pi-coding-agent | 最新版 | `pi --version` |

### インストール手順

#### ステップ1: プロジェクトへの追加

動的ツール生成システムは、pi-coding-agentの拡張機能として動作します。以下のファイル構造が必要です:

```
.pi/
├── extensions/
│   └── dynamic-tools.ts       # メイン拡張機能
├── lib/
│   └── dynamic-tools/
│       ├── index.ts           # エクスポート統合
│       ├── types.ts           # 型定義
│       ├── registry.ts        # ツール登録・管理
│       ├── safety.ts          # 安全性解析
│       ├── quality.ts         # 品質評価
│       ├── audit.ts           # 監査ログ
│       └── reflection.ts      # リフレクション
└── docs/
    └── dynamic-tools/
        ├── README.md
        ├── API.md
        ├── SAFETY.md
        └── OPERATIONS.md
```

#### ステップ2: 自動ディレクトリ作成の確認

初回起動時に以下のディレクトリが自動作成されます:

```bash
# 起動後に確認
ls -la .pi/tools/
ls -la .pi/logs/
```

自動作成されない場合は手動で作成:

```bash
mkdir -p .pi/tools
mkdir -p .pi/logs
```

#### ステップ3: 動作確認

```typescript
// pi内で実行
list_dynamic_tools({})
```

期待される出力:
```
動的ツールは登録されていません。
```

---

## 初期設定

### デフォルト設定の確認

システムは以下のデフォルト設定で動作します:

```typescript
// .pi/lib/dynamic-tools/types.ts
const DEFAULT_DYNAMIC_TOOLS_CONFIG = {
  enabled: true,
  autoCreateEnabled: true,
  autoVerificationEnabled: true,
  maxTools: 100,
  defaultTimeoutMs: 30000,
  auditLogEnabled: true,
  autoConvertToSkill: false,
  allowedOperations: {
    allowedModules: [
      "node:fs",
      "node:path",
      "node:os",
      "node:util",
      "node:crypto",
    ],
    allowedCommands: [
      "ls", "cat", "grep", "find", "head", "tail",
      "wc", "sort", "uniq", "cut", "echo", "pwd",
      "which", "dirname", "basename",
    ],
    allowedFilePaths: ["./**", "../**"],
    allowedDomains: [],
    maxExecutionTimeMs: 30000,
    maxOutputSizeBytes: 1048576, // 1MB
  },
};
```

### カスタム設定の適用

設定をカスタマイズする場合、以下の手順を実施します:

#### 方法1: 環境変数での設定

```bash
# .envファイルまたはシェルで設定
export PI_DYNAMIC_TOOLS_MAX_TOOLS=200
export PI_DYNAMIC_TOOLS_TIMEOUT_MS=60000
export PI_DYNAMIC_TOOLS_AUDIT_ENABLED=true
```

#### 方法2: 設定ファイルの作成

```typescript
// .pi/config/dynamic-tools.ts
export const customConfig = {
  maxTools: 200,
  defaultTimeoutMs: 60000,
  auditLogEnabled: true,
  allowedOperations: {
    allowedDomains: ["api.example.com"],
  },
};
```

### 許可リストの設定

安全性解析の許可リストをカスタマイズする場合:

```typescript
// .pi/lib/dynamic-tools/safety.ts
export const CUSTOM_ALLOWLIST: string[] = [
  "file-system-read",
  "file-system-write",
  // "file-system-delete",  // 削除は許可しない
  // "process-spawn",       // プロセス実行は許可しない
  "network-access",         // ネットワークアクセスを許可
];
```

---

## デプロイ手順

### 開発環境へのデプロイ

```bash
# 1. 最新コードを取得
git pull origin main

# 2. 依存関係をインストール（必要な場合）
npm install

# 3. TypeScriptをビルド（必要な場合）
npm run build

# 4. piを起動
pi
```

### 本番環境へのデプロイ

```bash
# 1. 事前チェック
## テストを実行（テストがある場合）
npm test

## 既存のツール定義をバックアップ
cp -r .pi/tools .pi/tools.backup.$(date +%Y%m%d)

## 監査ログをバックアップ
cp .pi/logs/dynamic-tools-audit.jsonl .pi/logs/dynamic-tools-audit.jsonl.backup.$(date +%Y%m%d)

# 2. デプロイ実行
## 最新コードを取得
git pull origin main

## 依存関係をインストール
npm install --production

## TypeScriptをビルド
npm run build

# 3. デプロイ後確認
## システムの起動確認
pi -c "list_dynamic_tools({})"

## 既存ツールの整合性確認
ls -la .pi/tools/

# 4. ロールバック準備
## 問題がある場合は以下でロールバック
# cp -r .pi/tools.backup.YYYYMMDD/* .pi/tools/
```

### デプロイチェックリスト

- [ ] テストがすべて成功している
- [ ] 既存ツールのバックアップが完了している
- [ ] 監査ログのバックアップが完了している
- [ ] 最新コードがデプロイされている
- [ ] 依存関係がインストールされている
- [ ] TypeScriptがビルドされている
- [ ] システムが正常に起動している
- [ ] 既存ツールが正常に動作している

---

## 設定変更

### 最大ツール数の変更

```typescript
// デフォルト: 100ツール
// 変更方法: types.ts の DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools を編集

// 変更後の確認
list_dynamic_tools({})
// 最大ツール数に達している場合のエラーメッセージで確認
```

### タイムアウト時間の変更

```typescript
// デフォルト: 30000ms (30秒)
// 変更方法1: types.ts の defaultTimeoutMs を編集

// 変更方法2: 実行時に指定
run_dynamic_tool({
  tool_name: "slow_tool",
  parameters: {},
  timeout_ms: 60000  // 60秒に延長
})
```

### 許可モジュールの追加

```typescript
// .pi/lib/dynamic-tools/types.ts
allowedOperations: {
  allowedModules: [
    "node:fs",
    "node:path",
    "node:os",
    "node:util",
    "node:crypto",
    "node:zlib",    // 追加
    "node:stream",  // 追加
  ],
  // ...
}
```

### 監査ログの無効化

```typescript
// .pi/lib/dynamic-tools/types.ts
const DEFAULT_DYNAMIC_TOOLS_CONFIG = {
  // ...
  auditLogEnabled: false,  // true から false に変更
  // ...
};
```

**注意**: 監査ログを無効化すると、トラブルシューティングが困難になります。本番環境では無効化しないことを推奨します。

---

## アップグレード

### アップグレード前の準備

```bash
# 1. 現在のバージョンを確認
git log -1 --format="%H %s"

# 2. 全データのバックアップ
backup_dir=".pi/backup/pre-upgrade-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -r .pi/tools "$backup_dir/"
cp -r .pi/logs "$backup_dir/"
cp -r .pi/lib/dynamic-tools "$backup_dir/"

# 3. バックアップの確認
ls -la "$backup_dir/"
```

### アップグレード実行

```bash
# 1. 最新コードを取得
git fetch origin
git checkout main
git pull origin main

# 2. 変更内容の確認
git log --oneline -10

# 3. 破壊的変更の確認
git diff HEAD@{1} -- .pi/lib/dynamic-tools/types.ts

# 4. 依存関係の更新
npm install

# 5. TypeScriptのビルド
npm run build
```

### アップグレード後の確認

```bash
# 1. システムの起動確認
pi -c "list_dynamic_tools({})"

# 2. 既存ツールの動作確認
pi -c "run_dynamic_tool({ tool_name: 'existing_tool', parameters: {} })"

# 3. 監査ログの確認
tail -20 .pi/logs/dynamic-tools-audit.jsonl
```

### ロールバック手順

アップグレードに問題がある場合:

```bash
# 1. サービスを停止

# 2. バックアップから復元
backup_dir=".pi/backup/pre-upgrade-YYYYMMDD-HHMMSS"
cp -r "$backup_dir/tools/*" .pi/tools/
cp -r "$backup_dir/logs/*" .pi/logs/
cp -r "$backup_dir/dynamic-tools/*" .pi/lib/dynamic-tools/

# 3. 以前のバージョンに切り替え
git checkout <previous-commit-hash>

# 4. 再ビルド
npm run build

# 5. 動作確認
pi -c "list_dynamic_tools({})"
```

---

## アンインストール

### データのバックアップ

```bash
# 全データをバックアップ
backup_dir=".pi/backup/uninstall-$(date +%Y%m%d)"
mkdir -p "$backup_dir"
cp -r .pi/tools "$backup_dir/" 2>/dev/null || true
cp -r .pi/logs "$backup_dir/" 2>/dev/null || true
```

### 拡張機能の無効化

```typescript
// .pi/extensions/dynamic-tools.ts の名前を変更
mv .pi/extensions/dynamic-tools.ts .pi/extensions/dynamic-tools.ts.disabled
```

### ファイルの削除

```bash
# 拡張機能とライブラリを削除
rm .pi/extensions/dynamic-tools.ts.disabled
rm -rf .pi/lib/dynamic-tools

# ツール定義を削除（バックアップ後に実施）
rm -rf .pi/tools

# 監査ログを削除（バックアップ後に実施）
rm -rf .pi/logs/dynamic-tools-*.jsonl

# ドキュメントを削除
rm -rf .pi/docs/dynamic-tools
```

---

## 環境移行

### 開発環境からステージング環境への移行

```bash
# 1. 開発環境でデータをエクスポート
## ツール定義のエクスポート
tar -czf tools-export.tar.gz -C .pi tools

## 監査ログのエクスポート（必要な場合）
tar -czf logs-export.tar.gz -C .pi/logs dynamic-tools-audit.jsonl

# 2. ステージング環境でインポート
## ファイルを転送
scp tools-export.tar.gz user@staging:/path/to/project/
scp logs-export.tar.gz user@staging:/path/to/project/

## インポート
ssh user@staging "cd /path/to/project && tar -xzf tools-export.tar.gz"
ssh user@staging "cd /path/to/project && tar -xzf logs-export.tar.gz"

# 3. 動作確認
ssh user@staging "cd /path/to/project && pi -c 'list_dynamic_tools({})'"
```

### ステージング環境から本番環境への移行

```bash
# 1. ステージング環境で最終確認
pi -c "list_dynamic_tools({})"

# 2. 本番環境へ移行
## コードの同期
git push origin main
ssh user@production "cd /path/to/project && git pull origin main"

## ツール定義の同期（必要な場合）
## 注意: 本番環境の既存ツールとの競合に注意
scp -r .pi/tools user@production:/path/to/project/.pi/

# 3. 本番環境でのビルド
ssh user@production "cd /path/to/project && npm install && npm run build"

# 4. 本番環境での確認
ssh user@production "cd /path/to/project && pi -c 'list_dynamic_tools({})'"
```

### 移行チェックリスト

- [ ] 移行元環境でのデータエクスポートが完了している
- [ ] 移行先環境の前提条件を満たしている
- [ ] データの転送が完了している
- [ ] データのインポートが完了している
- [ ] 移行先環境での動作確認が完了している
- [ ] 移行元環境のバックアップを保持している

---

## 関連ドキュメント

- [README](./README.md) - システム概要、トラブルシューティング、FAQ
- [APIリファレンス](./API.md) - 各ツールの詳細な仕様
- [安全性ガイド](./SAFETY.md) - 安全性解析の仕組みと危険パターン一覧
- [運用手順書](./OPERATIONS.md) - 日常運用、保守、監視手順

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2026-02-16 | 1.0.0 | 初版作成 |
