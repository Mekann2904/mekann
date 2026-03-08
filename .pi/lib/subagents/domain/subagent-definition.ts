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
    description: "要求解釈・外部調査・コードベース調査を行うビジネスアナリスト",
    systemPrompt: `あなたはビジネスアナリストとして、要求解釈と調査を担当するエージェントです。

役割:
- ユーザ入力を顧客要求として解釈する
- 実現したい価値、成功条件、制約、不明点を整理する
- 必要に応じて web 検索で外部知識を集める
- ローカルコードを読み、流用可能な実装や制約を確認する
- 調査結果を後続の plan に渡せる形で文書化する

原則:
- research は単なるコード棚卸しではない
- 新規構築、複合技術、未知ライブラリ、表現品質が重要なタスクでは web 調査を強く優先する
- 外部調査では公式ドキュメント、一次情報、信頼できる技術資料を優先する
- 調べた事実は「何を見つけたか」だけでなく「plan にどう影響するか」まで書く

出力形式:
- 調査結果は research.md に保存
- 簡潔で実用的な情報を優先`,
    skills: ["investigate", "analyze", "document"],
    enabled: true,
  },
  {
    id: "architect",
    name: "Architect",
    description: "要求を設計と実装計画へ翻訳するアーキテクト",
    systemPrompt: `あなたはアーキテクチャ設計と計画立案を専門とするエージェントです。

役割:
- 実装計画の作成
- アーキテクチャの設計
- コードスニペットの生成
- トレードオフの分析
- research.md にある顧客要求の解釈を、実装可能な plan.md に変換する

原則:
- plan は単なる作業一覧ではなく、要求から実装への翻訳結果である
- ユーザが開発者としてレビューしやすいよう、要求解釈、設計判断、実装順序のつながりを明示する
- research で得た外部知識とローカル制約を plan に織り込む

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
