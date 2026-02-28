/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/application/interfaces.ts
 * role: Application層のインターフェース定義
 * why: 依存関係逆転の原則（DIP）に従い、詳細に依存しないため
 * related: ./workflow-service.ts
 * public_api: IWorkflowRepository, ISubagentRunner, IQuestionUI
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Application層のポート（インターフェース）
 * what_it_does:
 *   - リポジトリインターフェース定義
 *   - サブエージェント実行インターフェース
 *   - UIインターフェース
 * why_it_exists: DIPにより、ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層
 *   out: adapters層の実装
 */

import type {
  WorkflowState,
  ActiveWorkflowRegistry,
} from "../domain/workflow-state.js";

/**
 * ワークフローリポジトリインターフェース
 * @summary リポジトリIF
 */
export interface IWorkflowRepository {
  /**
   * 状態を保存
   * @param state - ワークフロー状態
   */
  save(state: WorkflowState): Promise<void>;

  /**
   * 状態を読み込む
   * @param taskId - タスクID
   */
  load(taskId: string): Promise<WorkflowState | null>;

  /**
   * 現在のアクティブワークフローを取得
   */
  getCurrent(): Promise<WorkflowState | null>;

  /**
   * アクティブワークフローを設定
   * @param state - ワークフロー状態（nullでクリア）
   */
  setCurrent(state: WorkflowState | null): Promise<void>;

  /**
   * タスクファイルを作成
   * @param taskId - タスクID
   * @param description - タスク説明
   */
  createTaskFile(taskId: string, description: string): Promise<void>;

  /**
   * plan.mdを読み込む
   * @param taskId - タスクID
   */
  readPlanFile(taskId: string): Promise<string>;
}

/**
 * サブエージェント実行結果
 * @summary サブエージェント結果
 */
export interface SubagentResult {
  /** 出力テキスト */
  text: string;
  /** 成功したか */
  success: boolean;
  /** エラーメッセージ */
  error?: string;
}

/**
 * サブエージェント実行インターフェース
 * @summary サブエージェントIF
 */
export interface ISubagentRunner {
  /**
   * サブエージェントを実行
   * @param subagentId - サブエージェントID
   * @param task - タスク内容
   * @param extraContext - 追加コンテキスト
   */
  run(
    subagentId: string,
    task: string,
    extraContext?: string
  ): Promise<SubagentResult>;
}

/**
 * 質問オプション
 * @summary 質問オプション
 */
export interface QuestionOption {
  label: string;
  description: string;
}

/**
 * 質問結果
 * @summary 質問結果
 */
export interface QuestionResult {
  /** 選択されたラベル（複数可） */
  selected: string[];
  /** カスタム入力（ある場合） */
  customInput?: string;
  /** キャンセルされたか */
  cancelled: boolean;
}

/**
 * 質問UIインターフェース
 * @summary 質問UI IF
 */
export interface IQuestionUI {
  /**
   * 単一選択の質問を表示
   * @param question - 質問文
   * @param header - ヘッダー
   * @param options - 選択肢
   * @param allowCustom - カスタム入力を許可
   */
  askSingle(
    question: string,
    header: string,
    options: QuestionOption[],
    allowCustom?: boolean
  ): Promise<QuestionResult>;
}

/**
 * ワークフローサービスの依存関係
 * @summary サービス依存
 */
export interface WorkflowServiceDependencies {
  repository: IWorkflowRepository;
  subagentRunner?: ISubagentRunner;
  questionUI?: IQuestionUI;
}

/**
 * ワークフロー開始結果
 * @summary 開始結果
 */
export interface StartWorkflowResult {
  success: boolean;
  taskId?: string;
  phases?: string[];
  error?: string;
  nextAction?: string;
}

/**
 * フェーズ承認結果
 * @summary 承認結果
 */
export interface ApprovePhaseResult {
  success: boolean;
  previousPhase?: string;
  nextPhase?: string;
  error?: string;
  nextAction?: string;
}
