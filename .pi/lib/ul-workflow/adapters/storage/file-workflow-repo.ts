/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/storage/file-workflow-repo.ts
 * role: ファイルシステムベースのワークフローリポジトリ実装
 * why: IWorkflowRepositoryインターフェースの具体的実装を提供
 * related: ../../application/interfaces.ts
 * public_api: FileWorkflowRepository
 * invariants: ファイル操作は原子的に行う
 * side_effects: ファイルI/O
 * failure_modes: ファイル権限エラー、ディスク容量不足
 * @abdd.explain
 * overview: ファイルシステムを使った状態永続化
 * what_it_does:
 *   - JSONファイルへの状態保存
 *   - ファイルロックによる競合回避
 *   - タスクファイルの作成
 * plan.mdの読み込み
 * why_it_exists: インフラストラクチャの詳細をカプセル化
 * scope:
 *   in: application/interfaces.ts
 *   out: tools層から使用される
 */

import * as fs from "fs";
import * as path from "path";
import { promises as fsPromises } from "fs";
import type { WorkflowState, ActiveWorkflowRegistry } from "../../domain/workflow-state.js";
import type { IWorkflowRepository } from "../../application/interfaces.js";
import { withFileLock, atomicWriteTextFile } from "../../../storage/storage-lock.js";

// ディレクトリパス
const WORKFLOW_DIR = ".pi/ul-workflow";
const TASKS_DIR = path.join(WORKFLOW_DIR, "tasks");
const ACTIVE_FILE = path.join(WORKFLOW_DIR, "active.json");

/**
 * タスクディレクトリのパスを取得
 * @summary タスクディレクトリ取得
 * @param taskId - タスクID
 * @returns ディレクトリパス
 */
function getTaskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId);
}

/**
 * ファイルシステムベースのワークフローリポジトリ
 * @summary ファイルリポジトリ
 */
export class FileWorkflowRepository implements IWorkflowRepository {
  /**
   * 状態を保存
   * @summary 状態保存
   * @param state - ワークフロー状態
   */
  async save(state: WorkflowState): Promise<void> {
    const taskDir = getTaskDir(state.taskId);
    const statusPath = path.join(taskDir, "status.json");

    await fsPromises.mkdir(taskDir, { recursive: true });
    await fsPromises.writeFile(statusPath, JSON.stringify(state, null, 2), "utf-8");
  }

  /**
   * 状態を読み込む
   * @summary 状態読み込み
   * @param taskId - タスクID
   * @returns ワークフロー状態（存在しない場合はnull）
   */
  async load(taskId: string): Promise<WorkflowState | null> {
    const statusPath = path.join(getTaskDir(taskId), "status.json");
    try {
      const content = await fsPromises.readFile(statusPath, "utf-8");
      return JSON.parse(content) as WorkflowState;
    } catch {
      return null;
    }
  }

  /**
   * 現在のアクティブワークフローを取得
   * @summary アクティブ取得
   * @returns ワークフロー状態（ない場合はnull）
   */
  async getCurrent(): Promise<WorkflowState | null> {
    try {
      if (!fs.existsSync(ACTIVE_FILE)) return null;
      const raw = await fsPromises.readFile(ACTIVE_FILE, "utf-8");
      const registry: ActiveWorkflowRegistry = JSON.parse(raw);
      if (!registry.activeTaskId) return null;
      return this.load(registry.activeTaskId);
    } catch {
      return null;
    }
  }

  /**
   * アクティブワークフローを設定
   * @summary アクティブ設定
   * @param state - ワークフロー状態（nullでクリア）
   */
  async setCurrent(state: WorkflowState | null): Promise<void> {
    if (!fs.existsSync(WORKFLOW_DIR)) {
      await fsPromises.mkdir(WORKFLOW_DIR, { recursive: true });
    }

    const registry: ActiveWorkflowRegistry = state
      ? {
          activeTaskId: state.taskId,
          ownerInstanceId: state.ownerInstanceId,
          updatedAt: new Date().toISOString(),
        }
      : {
          activeTaskId: null,
          ownerInstanceId: null,
          updatedAt: new Date().toISOString(),
        };

    await atomicWriteTextFile(ACTIVE_FILE, JSON.stringify(registry, null, 2));
  }

  /**
   * タスクファイルを作成
   * @summary タスクファイル作成
   * @param taskId - タスクID
   * @param description - タスク説明
   */
  async createTaskFile(taskId: string, description: string): Promise<void> {
    const taskDir = getTaskDir(taskId);
    const taskPath = path.join(taskDir, "task.md");

    await fsPromises.mkdir(taskDir, { recursive: true });

    const content = `# Task Definition

---
task_id: ${taskId}
created_at: ${new Date().toISOString()}
---

## Description

${description}
`;

    await fsPromises.writeFile(taskPath, content, "utf-8");
  }

  /**
   * plan.mdを読み込む
   * @summary plan読み込み
   * @param taskId - タスクID
   * @returns plan.mdの内容（存在しない場合は空文字）
   */
  async readPlanFile(taskId: string): Promise<string> {
    const planPath = path.join(getTaskDir(taskId), "plan.md");
    try {
      return await fsPromises.readFile(planPath, "utf-8");
    } catch {
      return "";
    }
  }

  /**
   * 同期版: 現在のアクティブワークフローを取得
   * @summary 同期アクティブ取得
   * @returns ワークフロー状態（ない場合はnull）
   */
  getCurrentSync(): WorkflowState | null {
    try {
      if (!fs.existsSync(ACTIVE_FILE)) return null;
      const raw = fs.readFileSync(ACTIVE_FILE, "utf-8");
      const registry: ActiveWorkflowRegistry = JSON.parse(raw);
      if (!registry.activeTaskId) return null;
      return this.loadSync(registry.activeTaskId);
    } catch {
      return null;
    }
  }

  /**
   * 同期版: 状態を読み込む
   * @summary 同期状態読み込み
   * @param taskId - タスクID
   * @returns ワークフロー状態（存在しない場合はnull）
   */
  loadSync(taskId: string): WorkflowState | null {
    const statusPath = path.join(getTaskDir(taskId), "status.json");
    try {
      const content = fs.readFileSync(statusPath, "utf-8");
      return JSON.parse(content) as WorkflowState;
    } catch {
      return null;
    }
  }

  /**
   * 同期版: 状態を保存
   * @summary 同期状態保存
   * @param state - ワークフロー状態
   */
  saveSync(state: WorkflowState): void {
    const taskDir = getTaskDir(state.taskId);
    const statusPath = path.join(taskDir, "status.json");

    withFileLock(statusPath, () => {
      if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });
      }
      atomicWriteTextFile(statusPath, JSON.stringify(state, null, 2));
    });
  }
}
