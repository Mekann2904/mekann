/**
 * @abdd.meta
 * path: .pi/lib/invariant/domain/types.ts
 * role: Invariant Pipelineのドメイン型定義
 * why: 仕様解析・コード生成の型を一元管理し、型安全性を確保するため
 * related: ../application/parser.ts, ../application/generators/*.ts
 * public_api: SpecState, SpecOperation, SpecInvariant, ParsedSpec, GenerationOutput, GenerationResult, VerifyQuintInput, GenerateMacrosInput, GenerateTestsInput, GenerateMBTInput
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: spec.mdパース結果とコード生成出力の型定義
 * what_it_does: 仕様記述の構造、生成結果、ツール入力の型を定義する
 * why_it_exists: ドメインロジックの型安全性とコードの一貫性を保つため
 * scope:
 *   in: なし（純粋な型定義）
 *   out: 型定義のエクスポート
 */

/**
 * 仕様の状態定義
 */
export interface SpecState {
  /** 状態名 */
  name: string;
  /** 状態の型 */
  type: string;
  /** 初期値 */
  initialValue?: unknown;
  /** 制約条件 */
  constraints?: string[];
}

/**
 * 仕様の操作定義
 */
export interface SpecOperation {
  /** 操作名 */
  name: string;
  /** パラメータ */
  parameters?: { name: string; type: string }[];
  /** 事前条件 */
  preconditions?: string[];
  /** 事後条件 */
  postconditions?: string[];
  /** 説明 */
  description?: string;
}

/**
 * 仕様の不変条件定義
 */
export interface SpecInvariant {
  /** 不変条件名 */
  name: string;
  /** 条件式 */
  condition: string;
  /** 説明 */
  description?: string;
}

/**
 * パース済み仕様
 */
export interface ParsedSpec {
  /** 仕様タイトル */
  title: string;
  /** 説明 */
  description?: string;
  /** 状態定義一覧 */
  states: SpecState[];
  /** 操作定義一覧 */
  operations: SpecOperation[];
  /** 不変条件一覧 */
  invariants: SpecInvariant[];
  /** 定数定義一覧 */
  constants: { name: string; type: string; value?: unknown }[];
}

/**
 * コード生成出力
 */
export interface GenerationOutput {
  /** 生成されたコード */
  content: string;
  /** 警告メッセージ */
  warnings: string[];
  /** エラーメッセージ */
  errors: string[];
}

/**
 * ファイル出力情報
 */
export interface FileOutput {
  /** 出力パス */
  path: string;
  /** ファイル内容 */
  content: string;
}

/**
 * 生成結果
 */
export interface GenerationResult {
  /** 成功フラグ */
  success: boolean;
  /** 出力ファイル一覧 */
  outputs: {
    quint?: FileOutput;
    macros?: FileOutput;
    tests?: FileOutput;
    mbt?: FileOutput;
  };
  /** エラーメッセージ */
  errors: string[];
  /** 警告メッセージ */
  warnings: string[];
}

/**
 * verify_quint_spec ツールの入力
 */
export interface VerifyQuintInput {
  /** Quintファイルへのパス */
  quint_path: string;
  /** インバリアントをチェックするか */
  check_invariants?: boolean;
  /** ライブネス性をチェックするか */
  check_liveness?: boolean;
}

/**
 * generate_invariant_macros ツールの入力
 */
export interface GenerateMacrosInput {
  /** spec.mdファイルへのパス */
  spec_path: string;
  /** 出力ファイルパス */
  output_path?: string;
  /** TypeScriptモデル名 */
  struct_name?: string;
}

/**
 * generate_property_tests ツールの入力
 */
export interface GenerateTestsInput {
  /** spec.mdファイルへのパス */
  spec_path: string;
  /** 出力ファイルパス */
  output_path?: string;
  /** テスト対象モデル名 */
  struct_name?: string;
  /** プロパティテストのテスト数 */
  test_count?: number;
}

/**
 * generate_mbt_driver ツールの入力
 */
export interface GenerateMBTInput {
  /** spec.mdファイルへのパス */
  spec_path: string;
  /** 出力ファイルパス */
  output_path?: string;
  /** TypeScriptモデルクラス名 */
  struct_name?: string;
  /** MBTの最大ステップ数 */
  max_steps?: number;
}
