/**
 * @abdd.meta
 * path: .pi/core/domain/plan.ts
 * role: プランのドメインモデル（Enterprise Business Rules）
 * why: プランに関するビジネスルールを一箇所に集約し、他の層から独立させるため
 * related: application/use-cases/plan, adapters/repositories/plan-repository
 * public_api: Plan, PlanStep, PlanId, PlanStatus, StepStatus
 * invariants: PlanIdは空文字でない、StepIdはプラン内で一意である
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: プラン（タスク計画）のドメインモデルを定義する
 * what_it_does:
 *   - プランの識別子（PlanId）を定義する
 *   - プランステップ（PlanStep）を定義する
 *   - プラン状態（PlanStatus）を定義する
 *   - ステップ状態（StepStatus）を定義する
 *   - プラン集約（Plan）を定義する
 * why_it_exists:
 *   - ビジネスルールをインフラストラクチャから分離するため
 *   - プランに関する変更理由を一箇所に集約するため（CCP）
 * scope:
 *   in: なし（純粋なドメインモデル）
 *   out: application層、adapters層への型エクスポート
 */

// ============================================================================
// Value Objects (値オブジェクト)
// ============================================================================

/**
 * プラン識別子
 * @summary プランID
 */
export type PlanId = string & { readonly brand: unique symbol };

/**
 * プランIDを作成する
 * @summary ID作成
 * @param value - 識別子文字列
 * @returns PlanId
 */
export function createPlanId(value: string): PlanId {
  if (!value || value.trim() === "") {
    throw new Error("PlanId cannot be empty");
  }
  return value as PlanId;
}

/**
 * ステップ識別子
 * @summary ステップID
 */
export type StepId = string & { readonly brand: unique symbol };

/**
 * ステップIDを作成する
 * @summary ID作成
 * @param value - 識別子文字列
 * @returns StepId
 */
export function createStepId(value: string): StepId {
  if (!value || value.trim() === "") {
    throw new Error("StepId cannot be empty");
  }
  return value as StepId;
}

// ============================================================================
// Enums (列挙型)
// ============================================================================

/**
 * プランの状態
 * @summary プラン状態
 */
export type PlanStatus =
  | "draft"
  | "active"
  | "completed"
  | "cancelled"
  | "blocked";

/**
 * ステップの状態
 * @summary ステップ状態
 */
export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "skipped";

// ============================================================================
// Entities (エンティティ)
// ============================================================================

/**
 * プランステップ
 * @summary ステップ
 */
export interface PlanStep {
  /** ステップID */
  id: StepId;
  /** タイトル */
  title: string;
  /** 説明（オプション） */
  description?: string;
  /** 状態 */
  status: StepStatus;
  /** 依存ステップID */
  dependencies: StepId[];
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
  /** 完了日時（オプション） */
  completedAt?: Date;
  /** メモ（オプション） */
  notes?: string;
}

/**
 * プラン定義
 * @summary プラン定義
 */
export interface PlanDefinition {
  /** プランID */
  id: PlanId;
  /** 表示名 */
  name: string;
  /** 説明（オプション） */
  description?: string;
  /** 状態 */
  status: PlanStatus;
  /** ステップリスト */
  steps: PlanStep[];
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * プラン集約
 * @summary プラン集約
 *
 * プランに関するすべての情報を含む集約ルート。
 */
export interface Plan {
  /** 定義 */
  definition: PlanDefinition;
}

// ============================================================================
// Domain Services (ドメインサービス)
// ============================================================================

/**
 * ステップが実行可能かどうかを判定する
 * @summary 実行可能判定
 * @param step - ステップ
 * @param allSteps - 全ステップリスト
 * @returns 実行可能かどうか
 */
export function canExecuteStep(
  step: PlanStep,
  allSteps: PlanStep[]
): boolean {
  if (step.status !== "pending") {
    return false;
  }

  return step.dependencies.every((depId) => {
    const depStep = allSteps.find((s) => s.id === depId);
    return depStep?.status === "completed";
  });
}

/**
 * 実行可能なステップを取得する
 * @summary 実行可能ステップ取得
 * @param plan - プラン
 * @returns 実行可能なステップリスト
 */
export function getReadySteps(plan: Plan): PlanStep[] {
  return plan.definition.steps.filter((step) =>
    canExecuteStep(step, plan.definition.steps)
  );
}

/**
 * プランの進捗率を計算する
 * @summary 進捗率計算
 * @param plan - プラン
 * @returns 進捗率（0-100）
 */
export function calculateProgress(plan: Plan): number {
  const steps = plan.definition.steps;
  if (steps.length === 0) return 0;

  const completedCount = steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;

  return Math.round((completedCount / steps.length) * 100);
}

/**
 * プランが完了したかどうかを判定する
 * @summary 完了判定
 * @param plan - プラン
 * @returns 完了したかどうか
 */
export function isPlanCompleted(plan: Plan): boolean {
  return plan.definition.steps.every(
    (s) => s.status === "completed" || s.status === "skipped"
  );
}

/**
 * プランがブロックされているかどうかを判定する
 * @summary ブロック判定
 * @param plan - プラン
 * @returns ブロックされているかどうか
 */
export function isPlanBlocked(plan: Plan): boolean {
  return (
    plan.definition.status === "blocked" ||
    plan.definition.steps.some((s) => s.status === "blocked")
  );
}
