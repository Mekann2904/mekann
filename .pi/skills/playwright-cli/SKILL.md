---
name: playwright-cli
description: Playwright CLIによるブラウザ自動化スキル。ページ操作、フォーム入力、スクリーンショット、ネットワーク制御等を提供。
license: MIT
tags: [browser, automation, testing, scraping, playwright]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
---

# Playwright CLI

ブラウザ自動化を行うスキル。`playwright_cli`ツールを使用してplaywright-cliコマンドを実行する。

## 必須ルール

### 実行ルール

`playwright_cli`ツールを通じてコマンドを実行すること。

```typescript
{
  command: "open",           // サブコマンド名
  args: ["--headed", "https://example.com"],  // 引数（デフォルトでヘッドモード）
  session: "my-session",     // セッション名（任意）
  timeout_ms: 60000          // タイムアウト（任意）
}
```

### デフォルト設定

- **ヘッドモード**: `open`コマンド実行時、`args`に`--headed`を含めること（ブラウザを表示するため）
- **help確認**: 不明なコマンドを使用する前は、`playwright-cli --help`または`playwright-cli <command> --help`でオプションを確認すること

## コマンド一覧

### 基本

| コマンド | 説明 |
|----------|------|
| `open <url>` | ブラウザでURLを開く |
| `goto <url>` | 現在のページでURLに移動 |
| `close` | ブラウザを閉じる |
| `snapshot` | アクセシビリティツリーを表示 |
| `screenshot [path]` | スクリーンショットを保存 |
| `eval <expression>` | JavaScriptを実行 |

### ページ操作

| コマンド | 説明 |
|----------|------|
| `click <selector>` | 要素をクリック |
| `fill <selector> <value>` | テキストフィールドに入力 |
| `type <text>` | キーボードで文字を入力 |
| `select <selector> <value>` | セレクトボックスを選択 |
| `check <selector>` | チェックボックスをオン |
| `hover <selector>` | 要素にホバー |
| `upload <file>` | ファイルをアップロード |
| `drag <source> <target>` | ドラッグ＆ドロップ |

### ナビゲーション・キーボード

| コマンド | 説明 |
|----------|------|
| `go-back` | 前のページに戻る |
| `go-forward` | 次のページに進む |
| `reload` | ページをリロード |
| `press <key>` | キーを押して離す |

### タブ・ストレージ

| コマンド | 説明 |
|----------|------|
| `tab-list` | タブ一覧を表示 |
| `tab-new [url]` | 新しいタブを開く |
| `tab-close` | 現在のタブを閉じる |
| `tab-select <index>` | タブを選択 |
| `state-save [path]` | ブラウザ状態を保存 |
| `state-load <path>` | ブラウザ状態を復元 |

### ネットワーク・デバッグ

| コマンド | 説明 |
|----------|------|
| `route <pattern>` | リクエストをインターセプト |
| `console` | コンソールメッセージを表示 |
| `network` | ネットワークログを表示 |
| `tracing start` | トレーシングを開始 |
| `tracing stop <path>` | トレーシングを停止・保存 |

## 使用例

```bash
# 基本的なフォーム操作（ヘッドモードで実行）
playwright-cli open --headed https://example.com/login
playwright-cli fill "#email" "user@example.com"
playwright-cli fill "#password" "secret"
playwright-cli click "button[type='submit']"
playwright-cli screenshot result.png
playwright-cli close
```

## 起動オプション

```bash
--browser=firefox    # ブラウザ指定
--device="iPhone 13" # デバイスエミュレート
--headed             # ブラウザを表示
--proxy=<url>        # プロキシ設定
```

## ヘルプ確認

コマンドやオプションが不明な場合は、必ずヘルプを確認してください：

```bash
# 全体ヘルプ
playwright-cli --help

# 特定コマンドのヘルプ
playwright-cli open --help
playwright-cli click --help
```

## リファレンス

- 実装: `.pi/extensions/playwright-cli.ts`
- 公式: https://github.com/microsoft/playwright-cli
