/**
 * @abdd.meta
 * path: .pi/lib/startup-context-types.ts
 * role: セッションスタートアップコンテキストの型定義モジュール
 * why: 環境情報の構造化と型安全性を確保するため
 * related: .pi/extensions/startup-context.ts, .pi/lib/startup-context-collectors.ts
 * public_api: SessionStartContext, UserPromptSubmitDelta, OnDemandTrigger
 * invariants:
 *   - metadata.captured_at は ISO 8601 形式
 *   - metadata.ttl_seconds は正の整数
 *   - マスク対象の秘密情報は含まない
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: セッション開始時・プロンプト送信時に収集する環境情報の型定義
 * what_it_does:
 *   - SessionStartContext: セッション開始時のベースライン情報（18層相当）
 *   - UserPromptSubmitDelta: プロンプト送信毎の差分情報
 *   - OnDemandTrigger: オンデマンド深掘りのトリガー条件
 * why_it_exists:
 *   - 環境情報の収集・利用における型安全性を確保
 *   - 収集ポリシーを明確化し、エージェントの重複実行を防止
 * scope:
 *   in: なし（型定義）
 *   out: 型定義のみ
 */

// ============================================================================
// Metadata Types
// ============================================================================

/** コンテキストのメタデータ */
export interface ContextMetadata {
  /** 収集日時（ISO 8601） */
  captured_at: string;
  /** 情報の有効期限（秒） */
  ttl_seconds: number;
  /** セッション開始からの経過時間（ミリ秒、UserPromptSubmitのみ） */
  session_elapsed_ms?: number;
}

// ============================================================================
// Layer 1: OS/Kernel/Host
// ============================================================================

/** OS・カーネル・ホスト情報 */
export interface OsInfo {
  /** uname -a の出力 */
  uname: string;
  /** ディストリビューション情報（/etc/os-release または sw_vers） */
  distro?: string;
  /** CPU アーキテクチャ */
  arch: string;
  /** ホスト名 */
  hostname: string;
}

// ============================================================================
// Layer 2: User/Permissions
// ============================================================================

/** 実行ユーザと権限境界 */
export interface UserInfo {
  /** 現在のユーザ名 */
  whoami: string;
  /** uid/gid 情報 */
  uid_gid: string;
  /** 所属グループ */
  groups: string;
  /** 現在の作業ディレクトリ */
  cwd: string;
}

// ============================================================================
// Layer 3: Shell/Session
// ============================================================================

/** シェルとセッション情報 */
export interface ShellInfo {
  /** 現在のシェル */
  shell: string;
  /** 端末タイプ */
  term: string;
  /** 親プロセス名 */
  parent_process: string;
  /** 対話的セッションかどうか */
  is_interactive: boolean;
  /** CI環境かどうか */
  is_ci: boolean;
}

// ============================================================================
// Layer 4: Environment Variables
// ============================================================================

/** 環境変数情報（サニタイズ済み） */
export interface EnvInfo {
  /** PATH の先頭3件 */
  path_summary: string;
  /** ホームディレクトリ */
  home: string;
  /** シェル */
  shell: string;
  /** 言語設定 */
  lang: string;
  /** 安全な環境変数（値含む） */
  safe_vars: Record<string, string>;
  /** マスクされた変数名のリスト */
  masked_keys: string[];
}

// ============================================================================
// Layer 5: Date/Time/Locale
// ============================================================================

/** 日時・タイムゾーン・ロケール情報 */
export interface DateTimeInfo {
  /** 現在日時（ISO 8601） */
  now: string;
  /** タイムゾーン */
  timezone: string;
  /** ロケール */
  locale: string;
}

// ============================================================================
// Layer 6: CPU/Memory/Disk
// ============================================================================

/** ディスク使用状況 */
export interface DiskUsage {
  /** パス */
  path: string;
  /** 使用率（%） */
  used_percent: number;
}

/** CPU・メモリ・ディスク情報（要約） */
export interface ResourceInfo {
  /** CPU コア数 */
  cpu_cores: number;
  /** 総メモリ */
  memory_total: string;
  /** 利用可能メモリ */
  memory_available: string;
  /** ルートディスク */
  disk_root: DiskUsage;
  /** プロジェクトディスク */
  disk_project: DiskUsage;
}

// ============================================================================
// Layer 7: Network (On-Demand)
// ============================================================================

/** ネットワーク基礎情報（オンデマンド） */
export interface NetworkInfo {
  /** プライマリIPアドレス */
  primary_ip?: string;
  /** デフォルトゲートウェイ */
  default_gateway?: string;
  /** 外部通信可否 */
  external_connectivity: boolean;
  /** LISTEN中のポート一覧 */
  listening_ports: string[];
}

// ============================================================================
// Layer 8: Available Runtimes
// ============================================================================

/** ランタイム情報 */
export interface RuntimeInfo {
  /** 名前（node, python3, go, rustc, java等） */
  name: string;
  /** バージョン */
  version: string;
  /** 実行パス */
  path: string;
}

// ============================================================================
// Layer 9: Package Managers/Build Tools
// ============================================================================

/** ビルドツール情報 */
export interface ToolInfo {
  /** 名前（npm, pnpm, pip, cargo, make等） */
  name: string;
  /** バージョン */
  version: string;
  /** 利用可能かどうか */
  available: boolean;
}

// ============================================================================
// Layer 10: Python Environment
// ============================================================================

/** Python環境情報（軽量版） */
export interface PythonInfo {
  /** 実行可能ファイルパス */
  executable: string;
  /** バージョン */
  version: string;
  /** venv/poetry/conda がアクティブか */
  venv_active: boolean;
  /** venvパス（アクティブな場合） */
  venv_path?: string;
  /** pyproject.toml の存在 */
  has_pyproject: boolean;
  /** requirements.txt の存在 */
  has_requirements: boolean;
}

/** Python依存詳細（オンデマンド） */
export interface PythonDepsInfo {
  /** pip list の出力（要約） */
  packages: string[];
  /** site-packages のパス */
  site_packages: string;
}

// ============================================================================
// Layer 11: Git Repository
// ============================================================================

/** Gitリポジトリ情報 */
export interface GitInfo {
  /** Gitリポジトリかどうか */
  is_repo: boolean;
  /** リポジトリルート */
  root?: string;
  /** 現在のブランチ */
  branch?: string;
  /** リモートURL */
  remote?: string;
  /** ステータス要約（staged, modified, untracked count） */
  status_summary: string;
  /** 直近のコミット（5件） */
  recent_commits: string[];
  /** dirty 状態かどうか */
  is_dirty: boolean;
}

// ============================================================================
// Layer 12: Directory Structure
// ============================================================================

/** ディレクトリ構造要約 */
export interface StructureInfo {
  /** ルート直下のエントリ（最大20件） */
  root_entries: string[];
  /** README.md へのパス */
  readme?: string;
  /** 設定ファイル一覧 */
  config_files: string[];
  /** CI設定のパス */
  ci_config?: string;
}

// ============================================================================
// Layer 13: Running Processes (On-Demand)
// ============================================================================

/** プロセス情報（オンデマンド） */
export interface ProcessInfo {
  /** 関連プロセス一覧 */
  processes: Array<{
    pid: number;
    name: string;
    command: string;
  }>;
  /** 開発サーバープロセス */
  dev_servers: string[];
}

// ============================================================================
// Layer 14: Container/VM/CI Platform
// ============================================================================

/** 実行プラットフォーム情報 */
export interface PlatformInfo {
  /** Docker環境内かどうか */
  is_docker: boolean;
  /** WSLかどうか */
  is_wsl: boolean;
  /** Kubernetes環境内かどうか */
  is_kubernetes: boolean;
  /** CIプラットフォーム名 */
  ci_platform?: string;
}

// ============================================================================
// Layer 15: Security Constraints
// ============================================================================

/** セキュリティ制約情報 */
export interface SecurityInfo {
  /** ulimit ソフトリミット */
  ulimit_soft: string;
  /** ulimit ハードリミット */
  ulimit_hard: string;
  /** SELinux状態（Enforcing/Permissive/Disabled） */
  selinux?: string;
  /** 読み取り専用マウントポイント */
  read_only_mounts: string[];
}

// ============================================================================
// Layer 16: Test/Build/Run Entry Points
// ============================================================================

/** エントリポイント情報 */
export interface EntryPointsInfo {
  /** テストコマンド */
  test_command?: string;
  /** ビルドコマンド */
  build_command?: string;
  /** 実行コマンド */
  run_command?: string;
  /** 検出元（"package.json#scripts.test" 等） */
  detected_from: string;
}

// ============================================================================
// Layer 17: Dependency Services (On-Demand)
// ============================================================================

/** 依存サービス情報（オンデマンド） */
export interface DependencyServicesInfo {
  /** データベース接続先 */
  databases: Array<{
    type: string;
    host: string;
    port?: number;
  }>;
  /** Redis接続先 */
  redis?: {
    host: string;
    port?: number;
  };
  /** その他のサービス */
  other_services: Array<{
    name: string;
    type: string;
  }>;
}

// ============================================================================
// Layer 18: Failure Traces (On-Demand)
// ============================================================================

/** 失敗痕跡情報（オンデマンド） */
export interface FailureTracesInfo {
  /** 失敗シグナル検出 */
  signals_detected: boolean;
  /** 検出された失敗シグナル */
  signals: Array<{
    type: string;
    path: string;
    timestamp?: string;
  }>;
  /** 最新ログの末尾（要約） */
  recent_log_tail?: string;
}

// ============================================================================
// Layer 19: Project-Specific Assumptions
// ============================================================================

/** プロジェクト固有前提 */
export interface ProjectContextInfo {
  /** モノレポかどうか */
  monorepo?: boolean;
  /** パッケージマネージャ */
  package_manager?: string;
  /** コード生成が必要か */
  code_generation_required?: boolean;
  /** DBマイグレーションが必要か */
  db_migration_required?: boolean;
  /** 必須SDK */
  required_sdks?: string[];
  /** agent-first workflow が存在するか */
  workflow_defined?: boolean;
  /** workflow の entrypoints */
  workflow_entrypoints?: string[];
  /** workpad 件数 */
  workpad_count?: number;
  /** 最新 workpad の更新時刻 */
  latest_workpad_updated_at?: string;
  /** カスタムノート */
  custom_notes?: string[];
  /** 情報源（"explicit" | "inferred" | "mixed"） */
  source: "explicit" | "inferred" | "mixed";
}

// ============================================================================
// Layer 20: Collection Policy
// ============================================================================

/** 収集ポリシー */
export interface CollectionPolicyInfo {
  /** SessionStart で収集する層 */
  session_start_layers: number[];
  /** UserPromptSubmit で収集する層 */
  user_prompt_layers: number[];
  /** オンデマンド収集の層 */
  on_demand_layers: number[];
  /** マスク対象パターン */
  mask_patterns: string[];
  /** 各セクションの最大行数 */
  max_lines_per_section: Record<string, number>;
}

// ============================================================================
// Main Context Types
// ============================================================================

/** SessionStart ベースラインコンテキスト */
export interface SessionStartContext {
  /** メタデータ */
  metadata: ContextMetadata;
  /** 層1: OS/Kernel/Host */
  os: OsInfo;
  /** 層2: User/Permissions */
  user: UserInfo;
  /** 層3: Shell/Session */
  shell: ShellInfo;
  /** 層4: Environment Variables */
  env: EnvInfo;
  /** 層5: Date/Time/Locale */
  datetime: DateTimeInfo;
  /** 層6: CPU/Memory/Disk */
  resources: ResourceInfo;
  /** 層8: Available Runtimes */
  runtimes: RuntimeInfo[];
  /** 層9: Package Managers/Build Tools */
  tools: ToolInfo[];
  /** 層10a: Python Environment (conditional) */
  python?: PythonInfo;
  /** 層11: Git Repository */
  git?: GitInfo;
  /** 層12: Directory Structure */
  structure: StructureInfo;
  /** 層14: Container/VM/CI Platform */
  platform: PlatformInfo;
  /** 層15: Security Constraints */
  security: SecurityInfo;
  /** 層16: Test/Build/Run Entry Points */
  entry_points: EntryPointsInfo;
  /** 層19: Project-Specific Assumptions */
  project_context?: ProjectContextInfo;
  /** 層20: Collection Policy */
  policy: CollectionPolicyInfo;
}

/** UserPromptSubmit 差分コンテキスト */
export interface UserPromptSubmitDelta {
  /** メタデータ */
  metadata: ContextMetadata;
  /** 層2: 現在ディレクトリ（変更時のみ） */
  cwd_changed?: {
    from: string;
    to: string;
  };
  /** 層4: 重要環境変数の差分 */
  env_delta?: {
    changed: Record<string, { old?: string; new: string }>;
    added: string[];
    removed: string[];
  };
  /** 層5: 現在時刻 */
  datetime: DateTimeInfo;
  /** 層11: Git差分要約 */
  git_delta?: {
    branch_changed?: { from: string; to: string };
    dirty_state: {
      staged: number;
      modified: number;
      untracked: number;
    };
    commits_since_last: number;
  };
  /** 層18トリガー: 失敗シグナル検出 */
  failure_signals?: {
    detected: boolean;
    signals: string[];
  };
}

/** オンデマンド深掘りコンテキスト */
export interface OnDemandContext {
  /** メタデータ */
  metadata: ContextMetadata;
  /** 層7: ネットワーク */
  network?: NetworkInfo;
  /** 層10b: Python依存詳細 */
  python_deps?: PythonDepsInfo;
  /** 層13: プロセス詳細 */
  processes?: ProcessInfo;
  /** 層17: 依存サービス */
  dependencies?: DependencyServicesInfo;
  /** 層18: 失敗痕跡 */
  failure_traces?: FailureTracesInfo;
  /** 層19: 自動推論詳細 */
  project_inference?: ProjectContextInfo;
}

/** オンデマンドトリガー条件 */
export interface OnDemandTrigger {
  /** ネットワーク調査トリガー */
  network: string[];
  /** Python依存調査トリガー */
  python_deps: string[];
  /** プロセス調査トリガー */
  processes: string[];
  /** 依存サービス調査トリガー */
  dependencies: string[];
  /** 失敗痕跡調査トリガー */
  failure_traces: string[];
  /** プロジェクト推論トリガー */
  project_inference: string[];
}

/** 失敗シグナル自動昇格ルール */
export interface FailureAutoPromoteRules {
  /** ユーザーリクエストキーワード */
  user_request_keywords: string[];
  /** 検出対象ファイル */
  detected_files: string[];
  /** Gitステータスヒント */
  git_status_hints: string[];
}

// ============================================================================
// Output Format Types
// ============================================================================

/** セクションごとの省略ポリシー */
export interface SectionTruncationInfo {
  /** 切り詰められたかどうか */
  truncated: boolean;
  /** 最大行数 */
  max_lines?: number;
  /** 実際の行数 */
  actual_lines?: number;
  /** 秘密情報のマスク有無 */
  secrets_masked: boolean;
  /** マスクされたキー数 */
  masked_count?: number;
}

/** コンテキスト出力セクション */
export interface ContextOutputSection {
  /** 層番号と名前 */
  title: string;
  /** シェルコマンド形式の内容 */
  content: string;
  /** メタデータ */
  metadata: {
    captured_at: string;
    ttl_seconds: number;
  };
  /** 省略情報 */
  truncation: SectionTruncationInfo;
}

// ============================================================================
// Delta Types
// ============================================================================

/** UserPromptSubmit 差分コンテキスト */
export interface UserPromptSubmitDelta {
  /** メタデータ */
  metadata: ContextMetadata;
  /** 層2: 現在ディレクトリ（変更時のみ） */
  cwd_changed?: {
    from: string;
    to: string;
  };
  /** 層4: 重要環境変数の差分 */
  env_delta?: {
    changed: Record<string, { old?: string; new: string }>;
    added: string[];
    removed: string[];
  };
  /** 層5: 現在時刻 */
  datetime: DateTimeInfo;
  /** 層11: Git差分要約 */
  git_delta?: {
    branch_changed?: { from: string; to: string };
    dirty_state: {
      staged: number;
      modified: number;
      untracked: number;
    };
    commits_since_last: number;
  };
  /** 層18トリガー: 失敗シグナル検出 */
  failure_signals?: {
    detected: boolean;
    signals: string[];
  };
}

/** 失敗シグナル自動昇格ルール */
export interface FailureAutoPromoteRules {
  /** ユーザーリクエストキーワード */
  user_request_keywords: string[];
  /** 検出対象ファイル */
  detected_files: string[];
  /** Gitステータスヒント */
  git_status_hints: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** マスク対象のパターン（正規表現） */
export const MASK_PATTERNS = [
  /KEY/i,
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /CREDENTIAL/i,
  /API_KEY/i,
  /PRIVATE/i,
  /AUTH/i,
  /SESSION/i,
  /COOKIE/i,
] as const;

/** 安全な環境変数名（値を表示してもよい） */
export const SAFE_ENV_VARS = [
  "HOME",
  "SHELL",
  "LANG",
  "TERM",
  "USER",
  "LOGNAME",
  "PWD",
  "OLDPWD",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "NODE_ENV",
  "NVM_DIR",
  "NVM_INC",
  "NVM_BIN",
  "JAVA_HOME",
  "GOPATH",
  "GOROOT",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "PYTHONPATH",
  "PYTHONDONTWRITEBYTECODE",
] as const;

/** CI環境を判定する環境変数 */
export const CI_ENV_VARS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "JENKINS_URL",
  "BUILDKITE",
  "DRONE",
  "TEAMCITY_VERSION",
] as const;

/** 失敗シグナル検出ファイル */
export const FAILURE_SIGNAL_FILES = [
  "junit.xml",
  "test-results.xml",
  "pytest-cache/lastfailed",
  "npm-debug.log",
  "pnpm-debug.log",
  "yarn-error.log",
  "build/reports/tests",
  "target/surefire-reports",
  "coverage/lcov-report",
  ".pytest_cache/v/cache/lastfailed",
] as const;

/** SessionStart の TTL（秒） */
export const SESSION_START_TTL_SECONDS = 300;

/** UserPromptSubmit の TTL（秒） */
export const USER_PROMPT_TTL_SECONDS = 10;
