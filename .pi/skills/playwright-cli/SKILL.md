---
name: playwright-cli
description: Playwright CLIによるブラウザ自動化スキル。ページ操作、フォーム入力、スクリーンショット、ネットワーク制御等を提供。コーディングエージェント向けのトークン効率的なワークフローをサポート。
license: MIT
tags: [browser, automation, testing, scraping, playwright]
metadata:
  skill-version: "2.0.0"
  created-by: pi-skill-system
---

# Playwright CLI

ブラウザ自動化を行うスキル。`playwright_cli`ツールを使用してplaywright-cliコマンドを実行する。

## Playwright CLI vs Playwright MCP

このパッケージはPlaywrightのCLIインターフェースを提供する。**コーディングエージェント**を使用する場合、これが最適な選択肢である。

| 機能 | CLI + SKILLs | Playwright MCP |
|--------|---------------|---------------|
| **トークン効率** | 高（大きなスキーマ読み込みなし） | 低（詳細なアクセシビリティツリー読み込み） |
| **用途** | 高スループットなコーディングエージェント、大規模コードベース、テスト | 探索的オートメーション、自己治癒テスト、長期自律ワークフロー |
| **推奨** | コンテキストウィンドウが制限される場合 | 持続的ブラウザ状態が重要な場合 |

**要点**: CLI + SKILLsは、トークンコストを気にする必要がある高スループットなコーディングエージェントに適している。詳細は[Playwright MCP](https://github.com/microsoft/playwright-mcp)を参照。

## Key Features

- **トークン効率**: ページデータをLLMに強制的に読み込まない
- **コーディングエージェント最適化**: 簡潔な目的別コマンドによる操作
- **スキル統合**: ローカルインストールされたスキルを使用可能

## Requirements

- Node.js 18以降
- Claude Code, GitHub Copilot、またはその他のコーディングエージェント

## Installation

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
```

### Installing skills

Claude Code, GitHub Copilotおよびその他のエージェントは、ローカルにインストールされたスキルを使用する。

```bash
playwright-cli install --skills
```

### Skills-less operation

エージェントをCLIに向けて、CLI自身が`playwright-cli --help`からスキルを読み取れるようにする：

```
Test the "add todo" flow on https://demo.playwright.dev/todomvc using playwright-cli.
Check playwright-cli --help for available commands.
```

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

## Getting Started

### デモ

```
> Use playwright skills to test https://demo.playwright.dev/todomvc/.
  Take screenshots for all successful and failing scenarios.
```

エージェントがコマンドを実行するが、手動で操作することも可能：

```bash
playwright-cli open https://demo.playwright.dev/todomvc/ --headed
playwright-cli type "Buy groceries"
playwright-cli press Enter
playwright-cli type "Water flowers"
playwright-cli press Enter
playwright-cli check e21
playwright-cli check e35
playwright-cli screenshot
```

### ヘッドモード操作

Playwright CLIはデフォルトでヘッドレス。ブラウザを表示するには`--headed`を`open`に渡す：

```bash
playwright-cli open https://playwright.dev --headed
```

## セッション管理

Playwright CLIはデフォルトでブラウザプロファイルをメモリに保持する。Cookieとストレージ状態はCLI呼び出し間で保持されるが、ブラウザ閉じ時に失われる。`--persistent`でディスクに保存して永続化する。

### セッション名の使用

異なるプロジェクトで異なるブラウザインスタンスを使用するには`-s=`を指定：

```bash
playwright-cli open https://playwright.dev
playwright-cli -s=example open https://example.com --persistent
playwright-cli list
```

### 環境変数でのセッション指定

`PLAYWRIGHT_CLI_SESSION`環境変数でエージェントを実行：

```bash
PLAYWRIGHT_CLI_SESSION=todo-app claude .
```

または、呼び出しに`-s=`を付けるよう指示する。

### セッション管理コマンド

```bash
playwright-cli list                     # すべてのセッション一覧
playwright-cli close-all                # すべてのブラウザを閉じる
playwright-cli kill-all                 # すべてのブラウザプロセスを強制終了
```

## Monitoring

`playwright-cli show`で視覚的ダッシュボードを開き、実行中のブラウザセッションを確認・制御できる。エージェントがバックグラウンドでブラウザ自動化を実行中、進行状況を観察したり手助けしたりするのに便利。

```bash
playwright-cli show
```

ダッシュボードは2つのビューを提供：

- **セッショングリッド** — ワークスペースごとのアクティブセッションをライブスクリーンキャストプレビュー、セッション名、現在のURL、ページタイトルで表示。クリックでズームイン
- **セッション詳細** — 選択したセッションのライブビューとタブバー、ナビゲーション制御（戻る、進む、リロード、アドレスバー）、フルリモート制御。ビューポート内をクリックでマウスとキーボード入力を引き継ぐ、Escapeで解放

グリッドから実行中のセッションを閉じたり、非アクティブなもののデータを削除したりもできる。

## コマンド一覧

### Core（基本）

| コマンド | 説明 |
|----------|------|
| `open [url]` | ブラウザを開き、オプションでURLに移動 |
| `goto <url>` | URLに移動 |
| `close` | ページを閉じる |
| `type <text>` | 編集可能な要素にテキストを入力 |
| `click <ref> [button]` | ウェブページ上でクリック |
| `dblclick <ref> [button]` | ウェブページ上でダブルクリック |
| `fill <ref> <text>` | 編集可能な要素にテキストを入力 |
| `drag <startRef> <endRef>` | 要素間でドラッグ＆ドロップ |
| `hover <ref>` | 要素にホバー |
| `select <ref> <val>` | ドロップダウンでオプションを選択 |
| `upload <file>` | 1つ以上のファイルをアップロード |
| `check <ref>` | チェックボックスまたはラジオボタンをチェック |
| `uncheck <ref>` | チェックボックスまたはラジオボタンをチェック外し |
| `snapshot` | 要素参照を取得するためにページスナップショットをキャプチャ |
| `snapshot --filename=f` | スナップショットを特定ファイルに保存 |
| `eval <func> [ref]` | ページまたは要素でJavaScript式を評価 |
| `dialog-accept [prompt]` | ダイアログを受け入れる |
| `dialog-dismiss` | ダイアログを却下 |
| `resize <w> <h>` | ブラウザウィンドウをリサイズ |

### Navigation（ナビゲーション）

| コマンド | 説明 |
|----------|------|
| `go-back` | 前のページに戻る |
| `go-forward` | 次のページに進む |
| `reload` | 現在のページをリロード |

### Keyboard（キーボード）

| コマンド | 説明 |
|----------|------|
| `press <key>` | キーボードでキーを押す（`a`, `arrowleft`等） |
| `keydown <key>` | キーボードでキーを押し下げる |
| `keyup <key>` | キーボードでキーを押し上げる |

### Mouse（マウス）

| コマンド | 説明 |
|----------|------|
| `mousemove <x> <y>` | 指定位置にマウスを移動 |
| `mousedown [button]` | マウスを押し下げる |
| `mouseup [button]` | マウスを押し上げる |
| `mousewheel <dx> <dy>` | マウスホイールをスクロール |

### Save as（保存）

| コマンド | 説明 |
|----------|------|
| `screenshot [ref]` | 現在のページまたは要素のスクリーンショット |
| `screenshot --filename=f` | 特定ファイル名でスクリーンショット保存 |
| `pdf` | ページをPDFとして保存 |
| `pdf --filename=page.pdf` | 特定ファイル名でPDF保存 |

### Tabs（タブ）

| コマンド | 説明 |
|----------|------|
| `tab-list` | すべてのタブを一覧表示 |
| `tab-new [url]` | 新しいタブを作成 |
| `tab-close [index]` | ブラウザタブを閉じる |
| `tab-select <index>` | ブラウザタブを選択 |

### Storage（ストレージ）

| コマンド | 説明 |
|----------|------|
| `state-save [filename]` | ストレージ状態を保存 |
| `state-load <filename>` | ストレージ状態をロード |
| `cookie-list [--domain]` | Cookieを一覧表示 |
| `cookie-get <name>` | 特定のCookieを取得 |
| `cookie-set <name> <val>` | Cookieを設定 |
| `cookie-delete <name>` | Cookieを削除 |
| `cookie-clear` | すべてのCookieをクリア |
| `localstorage-list` | LocalStorageエントリを一覧表示 |
| `localstorage-get <key>` | LocalStorage値を取得 |
| `localstorage-set <k> <v>` | LocalStorage値を設定 |
| `localstorage-delete <k>` | LocalStorageエントリを削除 |
| `localstorage-clear` | すべてのLocalStorageをクリア |
| `sessionstorage-list` | SessionStorageエントリを一覧表示 |
| `sessionstorage-get <k>` | SessionStorage値を取得 |
| `sessionstorage-set <k> <v>` | SessionStorage値を設定 |
| `sessionstorage-delete <k>` | SessionStorageエントリを削除 |
| `sessionstorage-clear` | すべてのSessionStorageをクリア |

### Network（ネットワーク）

| コマンド | 説明 |
|----------|------|
| `route <pattern> [opts]` | ネットワークリクエストをモック |
| `route-list` | アクティブルートを一覧表示 |
| `unroute [pattern]` | ルートを削除 |

### DevTools

| コマンド | 説明 |
|----------|------|
| `console [min-level]` | コンソールメッセージを一覧表示 |
| `network` | ページ読み込み以降のすべてのネットワークリクエストを一覧 |
| `run-code <code>` | Playwrightコードスニペットを実行 |
| `tracing-start` | トレース記録を開始 |
| `tracing-stop` | トレース記録を停止 |
| `video-start` | ビデオ記録を開始 |
| `video-stop [filename]` | ビデオ記録を停止 |

### Open parameters（openパラメータ）

| パラメータ | 説明 |
|----------|------|
| `--browser=chrome` | 特定ブラウザを使用 |
| `--extension` | ブラウザ拡張経由で接続 |
| `--persistent` | 永続プロファイルを使用 |
| `--profile=<path>` | カスタムプロファイルディレクトリを使用 |
| `--config=file.json` | 設定ファイルを使用 |
| `--headed` | ヘッドモードでブラウザ表示 |
| `close` | ブラウザを閉じる |
| `delete-data` | デフォルトセッションのユーザーデータを削除 |

## Snapshots（スナップショット）

各コマンド後、playwright-cliは現在のブラウザ状態のスナップショットを提供する：

```bash
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

オンデマンドでも`playwright-cli snapshot`でスナップショット取得可能。

`--filename`が提供されない場合、タイムスタンプ付きで新しいスナップショットファイルが作成される。アーティファクトがワークフロー結果の一部である場合、自動ファイル命名のデフォルトで`--filename=`を使用する。

## Local installation（ローカルインストール）

場合によってはplaywright-cliをローカルにインストールしたいこともある。グローバル利用可能な`playwright-cli`バイナリが失敗する場合、`npx playwright-cli`でコマンドを実行する：

```bash
npx playwright-cli open https://example.com
npx playwright-cli click e1
```

## Configuration file（設定ファイル）

Playwright CLIはJSON設定ファイルで設定可能。`--config`コマンドラインオプションで設定ファイルを指定：

```bash
playwright-cli --config path/to/config.json open example.com
```

デフォルトで`.playwright/cli.config.json`から設定をロードするため、毎回指定する必要がない。

<details>
<summary>Configuration file schema</summary>

```typescript
{
  /**
   * The browser to use.
   */
  browser?: {
    /**
     * The type of browser to use.
     */
    browserName?: 'chromium' | 'firefox' | 'webkit';

    /**
     * Keep browser profile in memory, do not save it to disk.
     */
    isolated?: boolean;

    /**
     * Path to a user data directory for browser profile persistence.
     * Temporary directory is created by default.
     */
    userDataDir?: string;

    /**
     * Launch options passed to
     * @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
     *
     * This is useful for settings options like `channel`, `headless`, `executablePath`, etc.
     */
    launchOptions?: playwright.LaunchOptions;

    /**
     * Context options for the browser context.
     *
     * This is useful for settings options like `viewport`.
     */
    contextOptions?: playwright.BrowserContextOptions;

    /**
     * Chrome DevTools Protocol endpoint to connect to an existing browser instance in case of Chromium family browsers.
     */
    cdpEndpoint?: string;

    /**
     * CDP headers to send with connect request.
     */
    cdpHeaders?: Record<string, string>;

    /**
     * Timeout in milliseconds for connecting to CDP endpoint. Defaults to 30000 (30 seconds). Pass 0 to disable timeout.
     */
    cdpTimeout?: number;

    /**
     * Remote endpoint to connect to an existing Playwright server.
     */
    remoteEndpoint?: string;

    /**
     * Paths to TypeScript files to add as initialization scripts for Playwright page.
     */
    initPage?: string[];

    /**
     * Paths to JavaScript files to add as initialization scripts.
     * The scripts will be evaluated in every page before any of the page's scripts.
     */
    initScript?: string[];
  },

  /**
   * If specified, saves Playwright video of session into output directory.
   */
  saveVideo?: {
    width: number;
    height: number;
  };

  /**
   * The directory to save output files.
   */
  outputDir?: string;

  /**
   * Whether to save snapshots, console messages, network logs and other session logs to a file or to standard output. Defaults to "stdout".
   */
  outputMode?: 'file' | 'stdout';

  console?: {
    /**
     * The level of console messages to return. Each level includes messages of more severe levels. Defaults to "info".
     */
    level?: 'error' | 'warning' | 'info' | 'debug';
  },

  network?: {
    /**
     * List of origins to allow browser to request. Default is to allow all. Origins matching both `allowedOrigins` and `blockedOrigins` will be blocked.
     */
    allowedOrigins?: string[];

    /**
     * List of origins to block browser to request. Origins matching both `allowedOrigins` and `blockedOrigins` will be blocked.
     */
    blockedOrigins?: string[];
  };

  /**
   * Specify attribute to use for test ids, defaults to "data-testid".
   */
  testIdAttribute?: string;

  timeouts?: {
    /*
     * Configures default action timeout: https://playwright.dev/docs/api/class-page#page-set-default-timeout. Defaults to 5000ms.
     */
    action?: number;

    /*
     * Configures default navigation timeout: https://playwright.dev/docs/api/class-page#page-set-default-navigation-timeout. Defaults to 60000ms.
     */
    navigation?: number;
  };

  /**
   * Whether to allow file uploads from anywhere on the file system.
   * By default (false), file uploads are restricted to paths within MCP roots only.
   */
  allowUnrestrictedFileAccess?: boolean;

  /**
   * Specify language to use for code generation.
   */
  codegen?: 'typescript' | 'none';
}
```

</details>

## Configuration via env（環境変数での設定）

| 環境変数 | 説明 |
|------------|------|
| `PLAYWRIGHT_MCP_ALLOWED_HOSTS` | このサーバーが提供を許可するホストのカンマ区切りリスト。デフォルトはサーバーがバインドされているホスト。`'*'`でホストチェックを無効化 |
| `PLAYWRIGHT_MCP_ALLOWED_ORIGINS` | ブラウザがリクエストを許可する信頼済みオリジンのセミコロン区切りリスト。デフォルトはすべて許可。重要：セキュリティ境界として機能せず、リダイレクトに影響しない |
| `PLAYWRIGHT_MCP_ALLOW_UNRESTRICTED_FILE_ACCESS` | ワークスペースルート外のファイルアクセスを許可。また、`file://` URLsへの無制限アクセスも許可。デフォルトはワークスペースルートディレクトリ（または設定がない場合はcwd）のみにアクセス制限、`file://`へのナビゲーションはブロック |
| `PLAYWRIGHT_MCP_BLOCKED_ORIGINS` | ブラウザからリクエストをブロックするオリジンのセミコロン区切りリスト。ブロックリストは許可リスト前に評価。許可リストなしで使用すると、ブロックリストに一致しないリクエストはまだ許可される。重要：セキュリティ境界として機能せず、リダイレクトに影響しない |
| `PLAYWRIGHT_MCP_BLOCK_SERVICE_WORKERS` | サービスワーカーをブロック |
| `PLAYWRIGHT_MCP_BROWSER` | 使用するブラウザまたはchromeチャネル。可能値：`chrome`, `firefox`, `webkit`, `msedge` |
| `PLAYWRIGHT_MCP_CAPS` | 有効にする追加機能のカンマ区切りリスト。可能値：`vision`, `pdf` |
| `PLAYWRIGHT_MCP_CDP_ENDPOINT` | 接続するCDPエンドポイント |
| `PLAYWRIGHT_MCP_CDP_HEADER` | 接続リクエストで送信するCDPヘッダー。複数指定可能 |
| `PLAYWRIGHT_MCP_CODEGEN` | コード生成に使用する言語。可能値：`"typescript"`, `"none"`。デフォルトは`"typescript"` |
| `PLAYWRIGHT_MCP_CONFIG` | 設定ファイルのパス |
| `PLAYWRIGHT_MCP_CONSOLE_LEVEL` | 返すコンソールメッセージのレベル：`"error"`, `"warning"`, `"info"`, `"debug"`。各レベルはより深刻なレベルのメッセージを含む |
| `PLAYWRIGHT_MCP_DEVICE` | エミュレートするデバイス。例：`"iPhone 15"` |
| `PLAYWRIGHT_MCP_EXECUTABLE_PATH` | ブラウザ実行ファイルのパス |
| `PLAYWRIGHT_MCP_EXTENSION` | 実行中のブラウザインスタンスに接続。Playwright MCP Bridgeブラウザ拡張のインストールが必要 |
| `PLAYWRIGHT_MCP_GRANT_PERMISSIONS` | ブラウザコンテキストに付与する権限のリスト。例：`"geolocation"`, `"clipboard-read"`, `"clipboard-write"` |
| `PLAYWRIGHT_MCP_HEADLESS` | ヘッドレスモードでブラウザ実行。デフォルトはヘッドモード |
| `PLAYWRIGHT_MCP_HOST` | サーバーをバインドするホスト。デフォルトはlocalhost。すべてのインターフェースにバインドするには`0.0.0.0`を使用 |
| `PLAYWRIGHT_MCP_IGNORE_HTTPS_ERRORS` | HTTPSエラーを無視 |
| `PLAYWRIGHT_MCP_INIT_PAGE` | Playwright pageオブジェクトで評価するTypeScriptファイルのパス |
| `PLAYWRIGHT_MCP_INIT_SCRIPT` | 初期化スクリプトとして追加するJavaScriptファイルのパス。スクリプトはページのスクリプトの前にすべてのページで評価される。複数回指定可能 |
| `PLAYWRIGHT_MCP_ISOLATED` | ブラウザプロファイルをメモリに保持、ディスクに保存しない |
| `PLAYWRIGHT_MCP_IMAGE_RESPONSES` | 画像レスポンスをクライアントに送信するか。`"allow"`または`"omit"`。デフォルトは`"allow"` |
| `PLAYWRIGHT_MCP_NO_SANDBOX` | 通常サンドボックスされるすべてのプロセスタイプでサンドボックスを無効化 |
| `PLAYWRIGHT_MCP_OUTPUT_DIR` | 出力ファイルのディレクトリパス |
| `PLAYWRIGHT_MCP_OUTPUT_MODE` | スナップショット、コンソールメッセージ、ネットワークログをファイルまたは標準出力に保存するか。`"file"`または`"stdout"`。デフォルトは`"stdout"` |
| `PLAYWRIGHT_MCP_PORT` | SSE転送でリッスンするポート |
| `PLAYWRIGHT_MCP_PROXY_BYPASS` | プロキシをバイパスするドメインのカンマ区切りリスト。例：`.com,chromium.org,.domain.com` |
| `PLAYWRIGHT_MCP_PROXY_SERVER` | プロキシサーバーを指定。例：`"http://myproxy:3128"`または`"socks5://myproxy:8080"` |
| `PLAYWRIGHT_MCP_SAVE_SESSION` | Playwright MCPセッションを出力ディレクトリに保存するか |
| `PLAYWRIGHT_MCP_SAVE_TRACE` | Playwright Traceをセッションから出力ディレクトリに保存するか |
| `PLAYWRIGHT_MCP_SAVE_VIDEO` | セッションのビデオを出力ディレクトリに保存するか。例：`"--save-video=800x600"` |
| `PLAYWRIGHT_MCP_SECRETS` | dotenv形式でシークレットを含むファイルのパス |
| `PLAYWRIGHT_MCP_SHARED_BROWSER_CONTEXT` | 接続されたすべてのHTTPクライアント間で同じブラウザコンテキストを再利用 |
| `PLAYWRIGHT_MCP_SNAPSHOT_MODE` | レスポンスのスナップショット取得時に使用するモード。`"incremental"`, `"full"`, `"none"`。デフォルトはincremental |
| `PLAYWRIGHT_MCP_STORAGE_STATE` | 分離セッションのストレージ状態ファイルのパス |
| `PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE` | テストIDに使用する属性を指定。デフォルトは`"data-testid"` |
| `PLAYWRIGHT_MCP_TIMEOUT_ACTION` | アクションタイムアウトをミリ秒で指定。デフォルトは5000ms |
| `PLAYWRIGHT_MCP_TIMEOUT_NAVIGATION` | ナビゲーションタイムアウトをミリ秒で指定。デフォルトは60000ms |
| `PLAYWRIGHT_MCP_USER_AGENT` | ユーザーエージェント文字列を指定 |
| `PLAYWRIGHT_MCP_USER_DATA_DIR` | ユーザーデータディレクトリのパス。指定がない場合、一時ディレクトリが作成される |
| `PLAYWRIGHT_MCP_VIEWPORT_SIZE` | ブラウザビューポートサイズをピクセルで指定。例：`"1280x720"` |

## Specific tasks（特定のタスク）

インストールされたスキルには、一般的なタスクの詳細なリファレンスガイドが含まれる：

- **Request mocking** — ネットワークリクエストをインターセプト・モック
- **Running Playwright code** — 任意のPlaywrightスクリプトを実行
- **Browser session management** — 複数のブラウザセッションを管理
- **Storage state (cookies, localStorage)** — ブラウザ状態を永続化・復元
- **Test generation** — 操作からPlaywrightテストを生成
- **Tracing** — 実行トレースを記録・検査
- **Video recording** — ブラウザセッションビデオをキャプチャ

## 使用例

### 基本的なフォーム操作

```bash
# ヘッドモードで実行
playwright-cli open --headed https://example.com/login
playwright-cli fill "#email" "user@example.com"
playwright-cli fill "#password" "secret"
playwright-cli click "button[type='submit']"
playwright-cli screenshot result.png
playwright-cli close
```

### セッション管理

```bash
# 複数プロジェクトでセッションを使用
playwright-cli -s=project-a open https://project-a.com --persistent
playwright-cli -s=project-b open https://project-b.com --persistent
playwright-cli list
```

### ストレージ永続化

```bash
# ログイン状態を保存
playwright-cli open https://example.com/login --headed
playwright-cli fill "#email" "user@example.com"
playwright-cli fill "#password" "secret"
playwright-cli click "button[type='submit']"
playwright-cli state-save login-state.json
playwright-cli close

# 後で復元
playwright-cli open https://example.com/dashboard
playwright-cli state-load login-state.json
```

### ネットワークモック

```bash
# APIリクエストをモック
playwright-cli open https://example.com --headed
playwright-cli route "**/api/**" --status=200 --body='{"success":true}'
```

## リファレンス

- 実装: `.pi/extensions/playwright-cli.ts`
- 公式ドキュメント: https://github.com/microsoft/playwright-cli
- Playwright MCP: https://github.com/microsoft/playwright-mcp
