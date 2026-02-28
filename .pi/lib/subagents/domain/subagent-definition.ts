/**
 * @abdd.meta
 * path: .pi/lib/subagents/domain/subagent-definition.ts
 * role: サブエージェント定義のドメイン型
 * why: サブエージェントの型定義を集約し、型安全性を確保するため
 * related: ./responsibility.ts, ./ownership.ts
 * public_api: SubagentDefinition, SubagentStorage, DEFAULT_SUBAGENTS
 * invariants: サブエージェントIDは一意である
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: サブエージェントのドメインモデル定義
 * what_it_does:
 *   - サブエージェント定義の型
 *   - サブエージェントストレージの型
 *   - デフォルトサブエージェント定義
 * why_it_exists: 型の一元管理と再利用性の向上
 * scope:
 *   in: なし
 *   out: application層、adapters層
 */

/**
 * サブエージェント定義
 * @summary サブエージェント定義
 */
export interface SubagentDefinition {
  /** サブエージェントID */
  id: string;
  /** 表示名 */
  name: string;
  /** 説明 */
  description: string;
  /** システムプロンプト */
  systemPrompt: string;
  /** スキル一覧 */
  skills?: string[];
  /** プロバイダー上書き（オプション） */
  provider?: string;
  /** モデル上書き（オプション） */
  model?: string;
  /** 有効フラグ */
  enabled?: boolean;
}

/**
 * サブエージェントストレージ
 * @summary サブエージェントストレージ
 */
export interface SubagentStorage {
  /** サブエージェント定義一覧 */
  subagents: SubagentDefinition[];
  /** デフォルトサブエージェントID */
  defaultSubagentId: string | null;
}

/**
 * サブエージェント実行履歴エントリ
 * @summary 実行履歴エントリ
 */
export interface SubagentRunRecord {
  /** 実行ID */
  runId: string;
  /** サブエージェントID */
  subagentId: string;
  /** タスク内容 */
  task: string;
  /** 開始時刻 (ISO 8601) */
  startedAt: string;
  /** 終了時刻 (ISO 8601) */
  completedAt?: string;
  /** 成功フラグ */
  success?: boolean;
  /** 出力テキスト */
  output?: string;
  /** エラーメッセージ */
  error?: string;
  /** トークン使用量 */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * デフォルトサブエージェント定義
 * @summary デフォルト定義
 */
export const DEFAULT_SUBAGENTS: SubagentDefinition[] = [
  {
    id: "researcher",
    name: "Researcher",
    description: "コードベース調査・分析専門",
    systemPrompt: `あなたはコードベースの調査・分析を専門とするエージェントです。

役割:
- コードベースの深い理解
- 関連コードの特定
- 依存関係の分析
- ドキュメントの作成

出力形式:
- 調査結果は research.md に保存
- 簡潔で実用的な情報を優先`,
    skills: ["investigate", "analyze", "document"],
    enabled: true,
  },
  {
    id: "architect",
    name: "Architect",
    description: "アーキテクチャ設計・計画立案専門",
    systemPrompt: `あなたはアーキテクチャ設計と計画立案を専門とするエージェントです。

役割:
- 実装計画の作成
- アーキテクチャの設計
- コードスニペットの生成
- トレードオフの分析

出力形式:
- 計画は plan.md に保存
- コードスニペットを含める`,
    skills: ["plan", "design", "architect"],
    enabled: true,
  },
  {
    id: "implementer",
    name: "Implementer",
    description: "コード実装専門",
    systemPrompt: `あなたはコードの実装を専門とするエージェントです。

役割:
- plan.md に基づく実装
- 型チェックの実行
- テストの実行（必要に応じて）

原則:
- plan.md を機械的に実装
- 創造的な判断は計画段階で完了
- 完了したら plan.md で完了マーク`,
    skills: ["implement", "code", "test"],
    enabled: true,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "コードレビュー専門",
    systemPrompt: `あなたはコードレビューを専門とするエージェントです。

役割:
- コード品質の確認
- ベストプラクティスの確認
- セキュリティの確認
- パフォーマンスの確認

出力形式:
- レビュー結果を報告
- 改善提案を含める`,
    skills: ["review", "audit", "verify"],
    enabled: true,
  },
  {
    id: "tester",
    name: "Tester",
    description: "テスト作成・実行専門",
    systemPrompt: `あなたはテストの作成と実行を専門とするエージェントです。

役割:
- テストケースの設計
- テストコードの作成
- テストの実行
- カバレッジの確認

出力形式:
- テスト結果を報告
- 失敗したテストの分析`,
    skills: ["test", "verify", "coverage"],
    enabled: true,
  },
];
