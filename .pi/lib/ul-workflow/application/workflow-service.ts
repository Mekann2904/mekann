/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/application/workflow-service.ts
 * role: ワークフロー操作のユースケース
 * why: ワークフローの開始、承認、中止などのビジネスルールを集約
 * related: ./interfaces.ts, ../domain/workflow-state.ts
 * public_api: WorkflowService
 * invariants: フェーズは順序通りに遷移する
 * side_effects: リポジトリ経由でファイルI/O
 * failure_modes: リポジトリエラー、所有権エラー
 * @abdd.explain
 * overview: ワークフローのアプリケーションサービス
 * what_it_does:
 *   - ワークフロー開始ユースケース
 *   - フェーズ承認ユースケース
 *   - 中止・再開ユースケース
 *   - ステータス取得ユースケース
 * why_it_exists: ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層、interfaces
 *   out: adapters層から呼び出される
 */

import { randomBytes } from "node:crypto";
import type { WorkflowState, WorkflowPhase } from "../domain/workflow-state.js";
import {
  advancePhase,
  getNextPhaseIndex,
  isTerminalPhase,
  getPhaseDescription,
} from "../domain/workflow-state.js";
import {
  getInstanceId,
  checkOwnership,
  claimOwnership,
  isOwnerProcessDead,
} from "../domain/ownership.js";
import { determineWorkflowPhases } from "../domain/execution-strategy.js";
import type {
  IWorkflowRepository,
  WorkflowServiceDependencies,
  StartWorkflowResult,
  ApprovePhaseResult,
} from "./interfaces.js";

/**
 * タスクIDを生成
 * @summary ID生成
 * @param description - タスク説明
 * @returns タスクID
 */
function generateTaskId(description: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const hash = description
    .slice(0, 30)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = randomBytes(4).toString("hex");
  return `${timestamp}-${hash}-${suffix}`;
}

/**
 * ワークフローサービス
 * @summary ワークフローユースケース
 */
export class WorkflowService {
  private repository: IWorkflowRepository;

  constructor(deps: WorkflowServiceDependencies) {
    this.repository = deps.repository;
  }

  /**
   * ワークフローを開始
   * @summary ワークフロー開始
   * @param task - タスク説明
   * @returns 開始結果
   */
  async start(task: string): Promise<StartWorkflowResult> {
    const trimmedTask = String(task || "").trim();

    // バリデーション
    if (!trimmedTask) {
      return {
        success: false,
        error: "empty_task",
        nextAction: "タスク説明を入力してください",
      };
    }

    if (trimmedTask.length < 5) {
      return {
        success: false,
        error: "task_too_short",
        nextAction: `少なくとも5文字以上の説明を入力してください（現在: ${trimmedTask.length}文字）`,
      };
    }

    const taskId = generateTaskId(trimmedTask);
    const now = new Date().toISOString();
    const instanceId = getInstanceId();
    const phases = determineWorkflowPhases(trimmedTask);

    const state: WorkflowState = {
      taskId,
      taskDescription: trimmedTask,
      phase: phases[0],
      phases,
      phaseIndex: 0,
      createdAt: now,
      updatedAt: now,
      approvedPhases: [],
      annotationCount: 0,
      ownerInstanceId: instanceId,
    };

    await this.repository.createTaskFile(taskId, trimmedTask);
    await this.repository.save(state);
    await this.repository.setCurrent(state);

    return {
      success: true,
      taskId,
      phases: phases.map((p) => p.toUpperCase()),
      nextAction: `ul_workflow_research({ task: "${trimmedTask}", task_id: "${taskId}" })`,
    };
  }

  /**
   * 現在のフェーズを承認して次へ進む
   * @summary フェーズ承認
   * @returns 承認結果
   */
  async approve(): Promise<ApprovePhaseResult> {
    const state = await this.repository.getCurrent();

    if (!state) {
      return {
        success: false,
        error: "no_active_workflow",
        nextAction: "ul_workflow_start({ task: \"タスク説明\" })",
      };
    }

    const ownership = checkOwnership(state);
    if (!ownership.owned) {
      return {
        success: false,
        error: ownership.error,
      };
    }

    if (isTerminalPhase(state.phase)) {
      return {
        success: false,
        error: `workflow_already_${state.phase}`,
        previousPhase: state.phase,
      };
    }

    const previousPhase = state.phase;

    // planが承認されていない場合は実装フェーズに進めない
    if (
      previousPhase === "annotate" &&
      !state.approvedPhases.includes("plan")
    ) {
      return {
        success: false,
        error: "plan_not_approved",
        nextAction: "先に plan.md を承認してください",
      };
    }

    // 状態更新
    state.approvedPhases.push(previousPhase);
    state.updatedAt = new Date().toISOString();

    await this.repository.save(state);

    const nextPhase = advancePhase(state);
    state.phase = nextPhase;
    state.phaseIndex = getNextPhaseIndex(state);

    await this.repository.save(state);
    await this.repository.setCurrent(state);

    let nextAction = "";
    if (nextPhase === "plan") {
      nextAction = `ul_workflow_plan({ task: "${state.taskDescription}", task_id: "${state.taskId}" })`;
    } else if (nextPhase === "implement") {
      nextAction = `ul_workflow_implement({ task_id: "${state.taskId}" })`;
    } else if (nextPhase === "completed") {
      nextAction = "ul_workflow_commit()";
    }

    return {
      success: true,
      previousPhase,
      nextPhase,
      nextAction,
    };
  }

  /**
   * ワークフローを中止
   * @summary ワークフロー中止
   * @returns 成功したか
   */
  async abort(): Promise<{ success: boolean; error?: string; taskId?: string }> {
    const state = await this.repository.getCurrent();

    if (!state) {
      return { success: false, error: "no_active_workflow" };
    }

    const ownership = checkOwnership(state);
    if (!ownership.owned) {
      return { success: false, error: ownership.error };
    }

    const taskId = state.taskId;
    state.phase = "aborted";
    state.updatedAt = new Date().toISOString();

    await this.repository.save(state);
    await this.repository.setCurrent(null);

    return { success: true, taskId };
  }

  /**
   * 中止したワークフローを再開
   * @summary ワークフロー再開
   * @param taskId - タスクID
   * @returns 成功したか
   */
  async resume(taskId: string): Promise<{ success: boolean; error?: string; phase?: string }> {
    const existingWorkflow = await this.repository.getCurrent();
    if (existingWorkflow && !isTerminalPhase(existingWorkflow.phase)) {
      return {
        success: false,
        error: `workflow_already_active: ${existingWorkflow.taskId}`,
      };
    }

    const state = await this.repository.load(taskId);
    if (!state) {
      return { success: false, error: "task_not_found" };
    }

    // 所有権チェック
    const ownership = checkOwnership(state, { autoClaim: true });
    if (!ownership.owned) {
      return { success: false, error: ownership.error };
    }

    // 所有権を更新
    claimOwnership(state);
    await this.repository.save(state);
    await this.repository.setCurrent(state);

    return { success: true, phase: state.phase };
  }

  /**
   * 現在のワークフロー状態を取得
   * @summary 状態取得
   * @returns ワークフロー状態（ない場合はnull）
   */
  async getStatus(): Promise<WorkflowState | null> {
    return this.repository.getCurrent();
  }

  /**
   * 所有権を強制的に取得
   * @summary 所有権強制取得
   * @returns 成功したか
   */
  async forceClaim(): Promise<{
    success: boolean;
    error?: string;
    previousOwner?: string;
    newOwner?: string;
  }> {
    const state = await this.repository.getCurrent();

    if (!state) {
      return { success: false, error: "no_active_workflow" };
    }

    const instanceId = getInstanceId();

    if (state.ownerInstanceId === instanceId) {
      return { success: true, newOwner: instanceId };
    }

    const previousOwner = state.ownerInstanceId;

    // 所有者のプロセスが生存している場合は拒否
    if (!isOwnerProcessDead(previousOwner)) {
      return {
        success: false,
        error: "owner_still_alive",
        previousOwner,
      };
    }

    // 所有権を移転
    claimOwnership(state);
    await this.repository.save(state);
    await this.repository.setCurrent(state);

    return {
      success: true,
      previousOwner,
      newOwner: instanceId,
    };
  }
}
