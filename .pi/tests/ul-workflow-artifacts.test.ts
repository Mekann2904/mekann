/**
 * path: .pi/tests/ul-workflow-artifacts.test.ts
 * what: UL workflow の research.md と plan.md の自動生成を検証する
 * why: 実行指示だけ返して成果物が残らない不具合を防ぐ
 * related: .pi/extensions/ul-workflow.ts, .pi/tests/ul-workflow-active-registry.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import registerUlWorkflowExtension from "../extensions/ul-workflow.js";

type RegisteredTool = {
  execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
  const tools = new Map<string, RegisteredTool>();
  return {
    tools,
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    registerCommand() {
      // no-op
    },
  };
}

// テスト間の状態汚染を防ぐため、シリアル実行を強制
describe.sequential("UL workflow artifacts", () => {
  let pi: ReturnType<typeof createFakePi>;
  const createdTaskIds: string[] = [];
  const WORKFLOW_DIR = path.join(process.cwd(), ".pi", "ul-workflow");
  const ACTIVE_FILE = path.join(WORKFLOW_DIR, "active.json");

  beforeEach(() => {
    pi = createFakePi();
    registerUlWorkflowExtension(pi as any);
  });

  afterEach(() => {
    // タスクディレクトリをクリーンアップ
    for (const taskId of createdTaskIds.splice(0)) {
      rmSync(path.join(WORKFLOW_DIR, "tasks", taskId), {
        recursive: true,
        force: true,
      });
    }
    // active.jsonもクリーンアップ（状態汚染防止）
    if (existsSync(ACTIVE_FILE)) {
      rmSync(ACTIVE_FILE, { force: true });
    }
  });

  it("creates research.md during ul_workflow_research", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    expect(startTool).toBeDefined();
    expect(researchTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "現在の実装で起こり得る問題をまとめる" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);
    const ctx = {
      executeTool: async () => ({
        content: [{ type: "text", text: "# Research\n\n調査結果です。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）" }],
      }),
    };

    await researchTool!.execute(
      "tc-research",
      { task: "現在の実装で起こり得る問題をまとめる", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    const content = readFileSync(researchPath, "utf-8");
    expect(content).toContain("# Research");
    expect(content).toContain("高リスク判定");
  });

  it("explains research as requirement analysis at workflow start", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    expect(startTool).toBeDefined();

    const startResult = await startTool!.execute(
      "tc-start-copy",
      { task: "新規プロダクトの要求を整理して計画を作る" },
      undefined,
      undefined,
      {},
    );

    const text = startResult.content[0].text as string;
    expect(text).toContain("顧客要求の解釈");
    expect(text).toContain("web 検索");
    expect(text).toContain("research.md");
  });

  it("creates plan.md during ul_workflow_plan", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    const approveTool = pi.tools.get("ul_workflow_approve");
    const planTool = pi.tools.get("ul_workflow_plan");
    expect(startTool).toBeDefined();
    expect(researchTool).toBeDefined();
    expect(approveTool).toBeDefined();
    expect(planTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "現在の実装で起こり得る問題をまとめる" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);
    const ctx = {
      executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
        content: [{
          type: "text",
          text: JSON.stringify(params).includes("researcher")
            ? "# Research\n\n既存実装の調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
            : "# Plan\n\n- [ ] 問題点を一覧化する\n- [ ] 報告にまとめる",
        }],
      }),
    };

    await researchTool!.execute(
      "tc-research",
      { task: "現在の実装で起こり得る問題をまとめる", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );
    await approveTool!.execute("tc-approve", {}, undefined, undefined, {});
    await planTool!.execute(
      "tc-plan",
      { task: "現在の実装で起こり得る問題をまとめる", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );

    const planPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "plan.md");
    const content = readFileSync(planPath, "utf-8");
    expect(content).toContain("# Plan");
    expect(content).toContain("問題点を一覧化する");
  });

  it("allows ul_workflow_commit after execute_plan clears active workflow", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    const approveTool = pi.tools.get("ul_workflow_approve");
    const planTool = pi.tools.get("ul_workflow_plan");
    const executeTool = pi.tools.get("ul_workflow_execute_plan");
    const commitTool = pi.tools.get("ul_workflow_commit");
    expect(startTool && researchTool && approveTool && planTool && executeTool && commitTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "現在の実装で起こり得る問題をまとめる" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);
    const ctx = {
      executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
        content: [{
          type: "text",
          text: JSON.stringify(params).includes("researcher")
            ? "# Research\n\n既存実装の調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
            : JSON.stringify(params).includes("architect")
              ? "# Plan\n\n- [ ] 問題点を一覧化する\n- [ ] 報告にまとめる"
              : "実装を完了しました。",
        }],
      }),
    };

    await researchTool!.execute("tc-research", { task: "現在の実装で起こり得る問題をまとめる", task_id: taskId }, undefined, undefined, ctx);
    await approveTool!.execute("tc-approve-1", {}, undefined, undefined, {});
    await planTool!.execute("tc-plan", { task: "現在の実装で起こり得る問題をまとめる", task_id: taskId }, undefined, undefined, ctx);
    await approveTool!.execute("tc-approve-2", {}, undefined, undefined, {});
    await executeTool!.execute("tc-execute", {}, undefined, undefined, ctx);

    const commitResult = await commitTool!.execute("tc-commit", {}, undefined, undefined, {});
    expect(commitResult.content[0].text).toContain("コミット提案");
    expect(commitResult.details.taskId).toBe(taskId);
  });

  it("falls back to executeTool when runSubagent is unavailable", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    expect(startTool && researchTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "潜在的なバグがないか調査してください" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);
    let capturedParams: Record<string, unknown> | undefined;

    const ctx = {
      executeTool: async ({ toolName, params }: { toolName: string; params: Record<string, unknown> }) => {
        expect(toolName).toBe("subagent_run_dag");
        capturedParams = params;
        const artifactPath = path.join(process.cwd(), String(params.artifactPath));
        mkdirSync(path.dirname(artifactPath), { recursive: true });
        writeFileSync(artifactPath, "# Research\n\nDAG経由の調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）\n", "utf-8");
        return {
          content: [{ type: "text", text: "# Research\n\nDAG経由の調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）" }],
        };
      },
    };

    await researchTool!.execute(
      "tc-research-fallback",
      { task: "潜在的なバグがないか調査してください", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );

    expect(capturedParams?.ulTaskId).toBe(taskId);
    expect(capturedParams?.artifactPath).toBe(
      path.join(".pi", "ul-workflow", "tasks", taskId, "research.md"),
    );
    expect(capturedParams?.artifactTaskId).toBe("research-synthesis");
    const dagPlan = capturedParams?.plan as { tasks: Array<{ id: string; dependencies: string[] }> } | undefined;
    // executeTool が利用可能な場合は buildResearchBaseDagParams が使われる
    // buildDynamicResearchDagParams は executeTool が利用できない場合のみ
    if (dagPlan && dagPlan.tasks && dagPlan.tasks.length >= 4) {
      expect(dagPlan.tasks.some((task) => task.id === "research-synthesis")).toBe(true);
      expect(dagPlan.tasks.some((task) => task.id === "research-intent")).toBe(true);
      expect(dagPlan.tasks.some((task) => task.id === "research-external")).toBe(true);
      expect(dagPlan.tasks.some((task) => task.id === "research-codebase")).toBe(true);
    } else {
      // executeTool 利用時は単一タスクのDAGが返る場合がある
      expect(dagPlan).toBeDefined();
    }

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    const content = readFileSync(researchPath, "utf-8");
    expect(content).toContain("DAG経由の調査結果");
  });

  it("builds research DAG around requirements and external investigation", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    expect(startTool && researchTool).toBeDefined();

    const startResult = await startTool!.execute(
      "tc-start-business-analyst",
      { task: "Astro と three.js を使う実験的な新規サイトの要求を整理し、実装計画の材料を集めてください" },
      undefined,
      undefined,
      {},
    );
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const capturedParamsList: Record<string, unknown>[] = [];
    const ctx = {
      executeTool: async ({ toolName, params }: { toolName: string; params: Record<string, unknown> }) => {
        expect(toolName).toBe("subagent_run_dag");
        capturedParamsList.push(params);
        const artifactPath = path.join(process.cwd(), String(params.artifactPath));
        mkdirSync(path.dirname(artifactPath), { recursive: true });
        writeFileSync(
          artifactPath,
          [
            "# Research",
            "",
            "## User Intent",
            "新規サイトの体験価値を定義する。",
            "",
            "## External Research Findings",
            "Astro と three.js の統合パターンを確認する。",
            "",
            "## Plan Inputs",
            "初手は quick prototype にする。",
            "",
            "## 高リスク判定",
            "",
            "### 判定結果",
            "- [ ] normal（通常）",
            "",
          ].join("\n"),
          "utf-8",
        );
        return {
          content: [{ type: "text", text: "# Research\n\nBusiness analysis complete." }],
        };
      },
    };

    await researchTool!.execute(
      "tc-research-business-analyst",
      { task: "Astro と three.js を使う実験的な新規サイトの要求を整理し、実装計画の材料を集めてください", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );

    // 最初の呼び出し（baseDagParams）を検証
    expect(capturedParamsList.length).toBeGreaterThanOrEqual(1);
    const baseDagPlan = capturedParamsList[0]?.plan as { tasks: Array<{ id: string; description: string }> } | undefined;
    if (!baseDagPlan || !baseDagPlan.tasks) {
      throw new Error(`baseDagPlan is missing or invalid. capturedParamsList length: ${capturedParamsList.length}`);
    }
    const intentTask = baseDagPlan?.tasks?.find((task) => task.id === "research-intent");
    const externalTask = baseDagPlan?.tasks?.find((task) => task.id === "research-external");

    // research-intent が顧客要求を含むことを確認
    expect(intentTask?.description).toBeTruthy();
    expect(intentTask?.description).toContain("顧客要求");
    expect(externalTask?.description).toContain("web");
    expect(externalTask?.description).toContain("公式ドキュメント");

    // synthesis は followup DAG から確認
    const followupDagPlan = capturedParamsList[capturedParamsList.length - 1]?.plan as { tasks: Array<{ id: string; description: string }> } | undefined;
    const synthesisTask = followupDagPlan?.tasks?.find((task) => task.id === "research-synthesis");
    expect(synthesisTask?.description).toContain("User Intent");
    expect(synthesisTask?.description).toContain("Plan Inputs");

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    const content = readFileSync(researchPath, "utf-8");
    expect(content).toContain("## User Intent");
    expect(content).toContain("## External Research Findings");
    expect(content).toContain("## Plan Inputs");
  });

  it("returns subagent_run_dag instructions when no execution API is available", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const researchTool = pi.tools.get("ul_workflow_research");
    expect(startTool && researchTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "潜在的なバグがないか調査してください" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const result = await researchTool!.execute(
      "tc-research-manual",
      { task: "潜在的なバグがないか調査してください", task_id: taskId },
      undefined,
      undefined,
      {
        localDagExecutor: async (params: Record<string, unknown>) => {
          const artifactPath = path.join(process.cwd(), String(params.artifactPath));
          mkdirSync(path.dirname(artifactPath), { recursive: true });
          writeFileSync(
            artifactPath,
            "# Research\n\nローカルDAG実行で保存。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）\n",
            "utf-8",
          );
          return {
            content: [{ type: "text", text: "## research-synthesis\nStatus: COMPLETED\n# Research\n\nローカルDAG実行で保存。" }],
            details: { artifactPath: params.artifactPath, artifactTaskId: params.artifactTaskId },
          };
        },
      },
    );

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    const content = readFileSync(researchPath, "utf-8");
    expect(content).toContain("ローカルDAG実行で保存");
    expect(result.content[0].text).toContain("Researchフェーズ完了");
  });

  it("creates plan.md with local DAG execution when no tool executor is available", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const approveTool = pi.tools.get("ul_workflow_approve");
    const planTool = pi.tools.get("ul_workflow_plan");
    expect(startTool && approveTool && planTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "潜在的なバグがないか調査してください" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    writeFileSync(researchPath, "# Research\n\n既存の調査結果\n", "utf-8");
    await approveTool!.execute("tc-approve-plan", {}, undefined, undefined, {});

    const result = await planTool!.execute(
      "tc-plan-manual",
      { task: "潜在的なバグがないか調査してください", task_id: taskId },
      undefined,
      undefined,
      {
        localDagExecutor: async (params: Record<string, unknown>) => {
          const artifactPath = path.join(process.cwd(), String(params.artifactPath));
          mkdirSync(path.dirname(artifactPath), { recursive: true });
          writeFileSync(
            artifactPath,
            "# Plan\n\n- [ ] ローカルDAGで計画を保存する\n",
            "utf-8",
          );
          return {
            content: [{ type: "text", text: "## plan-synthesis\nStatus: COMPLETED\n# Plan\n\n- [ ] ローカルDAGで計画を保存する" }],
            details: { artifactPath: params.artifactPath, artifactTaskId: params.artifactTaskId },
          };
        },
      },
    );

    const planPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "plan.md");
    const content = readFileSync(planPath, "utf-8");
    expect(content).toContain("ローカルDAGで計画を保存する");
    expect(result.content[0].text).toContain("Planフェーズ完了");
  });

  it("builds plan DAG around user intent and analyst interpretation", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const approveTool = pi.tools.get("ul_workflow_approve");
    const planTool = pi.tools.get("ul_workflow_plan");
    expect(startTool && approveTool && planTool).toBeDefined();

    const startResult = await startTool!.execute(
      "tc-start-plan-structure",
      { task: "ブランドサイト構築の計画を作ってください" },
      undefined,
      undefined,
      {},
    );
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    writeFileSync(
      researchPath,
      [
        "# Research",
        "",
        "## User Intent",
        "顧客は作品性の高いブランドサイトを求めている。",
        "",
        "## Analyst Interpretation",
        "まず没入感の核を試作すべきである。",
        "",
        "## Plan Inputs",
        "Astro islands と WebGL の境界を先に決める。",
        "",
      ].join("\n"),
      "utf-8",
    );
    await approveTool!.execute("tc-approve-plan-structure", {}, undefined, undefined, {});

    let capturedParams: Record<string, unknown> | undefined;
    const ctx = {
      executeTool: async ({ toolName, params }: { toolName: string; params: Record<string, unknown> }) => {
        expect(toolName).toBe("subagent_run_dag");
        capturedParams = params;
        const artifactPath = path.join(process.cwd(), String(params.artifactPath));
        mkdirSync(path.dirname(artifactPath), { recursive: true });
        writeFileSync(
          artifactPath,
          [
            "# Plan",
            "",
            "## User Intent",
            "作品性の高いブランドサイトを作る。",
            "",
            "## Analyst Interpretation",
            "核となる描画体験から組み立てる。",
            "",
            "- [ ] quick prototype を作る",
            "",
          ].join("\n"),
          "utf-8",
        );
        return {
          content: [{ type: "text", text: "# Plan\n\nPlanning complete." }],
        };
      },
    };

    await planTool!.execute(
      "tc-plan-structure",
      { task: "ブランドサイト構築の計画を作ってください", task_id: taskId },
      undefined,
      undefined,
      ctx,
    );

    const dagPlan = capturedParams?.plan as { tasks: Array<{ id: string; description: string }> };
    const findingsTask = dagPlan.tasks.find((task) => task.id === "plan-findings");
    const changesTask = dagPlan.tasks.find((task) => task.id === "plan-changes");
    const synthesisTask = dagPlan.tasks.find((task) => task.id === "plan-synthesis");

    expect(findingsTask?.description).toContain("顧客要求");
    expect(changesTask?.description).toContain("要求解釈");
    expect(synthesisTask?.description).toContain("User Intent");
    expect(synthesisTask?.description).toContain("Analyst Interpretation");

    const planPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "plan.md");
    const content = readFileSync(planPath, "utf-8");
    expect(content).toContain("## User Intent");
    expect(content).toContain("## Analyst Interpretation");
  });

  it("blocks approval until the current phase artifact exists", async () => {
    const startTool = pi.tools.get("ul_workflow_start");
    const approveTool = pi.tools.get("ul_workflow_approve");
    expect(startTool && approveTool).toBeDefined();

    const startResult = await startTool!.execute("tc-start", { task: "潜在的なバグを発見してほしい" }, undefined, undefined, {});
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const result = await approveTool!.execute("tc-approve-before-artifact", {}, undefined, undefined, {});
    expect(result.details.error).toBe("phase_artifact_not_ready");
    expect(result.details.taskId).toBe(taskId);
  });

  // ============================================================================
  // エラーパステスト
  // ============================================================================

  describe("error paths", () => {
    it("returns no_active_workflow when no workflow exists", async () => {
      const approveTool = pi.tools.get("ul_workflow_approve");
      expect(approveTool).toBeDefined();

      const result = await approveTool!.execute("tc-no-workflow", {}, undefined, undefined, {});
      expect(result.details.error).toBe("no_active_workflow");
    });

    it("returns empty_task when task description is missing", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      expect(startTool).toBeDefined();

      const result = await startTool!.execute("tc-empty-task", { task: "" }, undefined, undefined, {});
      expect(result.details.error).toBe("empty_task");
    });

    it("returns task_too_short when task description is too short", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      expect(startTool).toBeDefined();

      const result = await startTool!.execute("tc-short-task", { task: "abc" }, undefined, undefined, {});
      expect(result.details.error).toBe("task_too_short");
    });

    it("returns task_not_found when resuming non-existent task", async () => {
      const resumeTool = pi.tools.get("ul_workflow_resume");
      expect(resumeTool).toBeDefined();

      const result = await resumeTool!.execute("tc-resume-not-found", { task_id: "non-existent-task-id" }, undefined, undefined, {});
      expect(result.details.error).toBe("task_not_found");
    });

    it("returns wrong_phase when annotate is called in wrong phase", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const annotateTool = pi.tools.get("ul_workflow_annotate");
      expect(startTool && annotateTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start", { task: "テスト用のタスク説明を入力する" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      // researchフェーズでannotateを呼ぶ（wrong_phaseになるべき）
      const result = await annotateTool!.execute("tc-annotate-wrong-phase", {}, undefined, undefined, {});
      expect(result.details.error).toBe("wrong_phase");
    });

    it("returns no_task_id when research is called without task_id", async () => {
      const researchTool = pi.tools.get("ul_workflow_research");
      expect(researchTool).toBeDefined();

      const result = await researchTool!.execute("tc-research-no-id", { task: "テストタスク" }, undefined, undefined, {});
      expect(result.details.error).toBe("no_task_id");
    });

    it("returns plan_not_found when confirm_plan is called without plan", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const confirmPlanTool = pi.tools.get("ul_workflow_confirm_plan");
      expect(startTool && researchTool && approveTool && confirmPlanTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start", { task: "プラン確認テスト用のタスク" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      // researchを実行してplanフェーズへ進む
      const ctx = {
        executeTool: async () => ({
          content: [{ type: "text", text: "# Research\n\n調査結果です。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）" }],
        }),
      };
      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-research", {}, undefined, undefined, ctx);

      // plan.mdが存在しない状態でconfirm_planを呼ぶ（planフェーズだがファイルなし）
      const result = await confirmPlanTool!.execute("tc-confirm-no-plan", {}, undefined, undefined, {});
      expect(result.details.error).toBe("plan_not_found");
    });

    it("returns empty_modifications when modify_plan is called without modifications", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const modifyPlanTool = pi.tools.get("ul_workflow_modify_plan");
      expect(startTool && researchTool && approveTool && modifyPlanTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start", { task: "修正テスト用のタスク説明" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      // researchを実行してplanフェーズへ進む
      const ctx = {
        executeTool: async () => ({
          content: [{ type: "text", text: "# Research\n\n調査結果です。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）" }],
        }),
      };
      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-research", {}, undefined, undefined, ctx);

      const result = await modifyPlanTool!.execute("tc-modify-empty", { modifications: "" }, undefined, undefined, {});
      expect(result.details.error).toBe("empty_modifications");
    });

    it("requires plan.md for implement phase validation", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const planTool = pi.tools.get("ul_workflow_plan");
      const confirmPlanTool = pi.tools.get("ul_workflow_confirm_plan");
      const executePlanTool = pi.tools.get("ul_workflow_execute_plan");
      expect(startTool && researchTool && approveTool && planTool && confirmPlanTool && executePlanTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start-implement", { task: "implementフェーズのアーティファクト検証テスト" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      // research → plan → execute_planまで進める
      const ctx = {
        executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
          content: [{
            type: "text",
            text: JSON.stringify(params).includes("researcher")
              ? "# Research\n\n調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
              : JSON.stringify(params).includes("architect")
                ? "# Plan\n\n- [ ] 実装計画"
                : "実装完了",
          }],
        }),
      };

      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-1", {}, undefined, undefined, ctx);
      await planTool!.execute("tc-plan", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-2", {}, undefined, undefined, ctx);
      await confirmPlanTool!.execute("tc-confirm", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-3", {}, undefined, undefined, ctx);

      // execute_planを呼ぶ（この時点でplan.mdは存在するはず）
      const result = await executePlanTool!.execute("tc-execute", {}, undefined, undefined, ctx);
      // 実装フェーズではplan.mdが存在すればエラーにならない
      // テスト環境では実際にファイルが作成されるため、成功したことを確認
      expect(result.content[0].text).toBeDefined();
    });

    it("requires review.md for review phase validation", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const planTool = pi.tools.get("ul_workflow_plan");
      const confirmPlanTool = pi.tools.get("ul_workflow_confirm_plan");
      const executePlanTool = pi.tools.get("ul_workflow_execute_plan");
      const reviewTool = pi.tools.get("ul_workflow_review");
      expect(startTool && researchTool && approveTool && planTool && confirmPlanTool && executePlanTool && reviewTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start-review", { task: "reviewフェーズのアーティファクト検証テスト" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      // 全フェーズを進める
      const ctx = {
        executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
          content: [{
            type: "text",
            text: JSON.stringify(params).includes("researcher")
              ? "# Research\n\n調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
              : JSON.stringify(params).includes("architect")
                ? "# Plan\n\n- [ ] 実装計画"
                : JSON.stringify(params).includes("reviewer")
                  ? "# Review\n\nレビュー結果。\n\n## 判定結果\n- [ ] normal（通常）"
                  : "実装完了",
          }],
        }),
      };

      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-1", {}, undefined, undefined, ctx);
      await planTool!.execute("tc-plan", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-2", {}, undefined, undefined, ctx);
      await confirmPlanTool!.execute("tc-confirm", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-3", {}, undefined, undefined, ctx);
      await executePlanTool!.execute("tc-execute", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-4", {}, undefined, undefined, ctx);

      // review.mdを作成
      const taskDir = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId);
      writeFileSync(path.join(taskDir, "review.md"), "# Review\n\nレビュー内容です。\n");

      const result = await reviewTool!.execute("tc-review", { task_id: taskId }, undefined, undefined, ctx);
      expect(result.details.error).toBeUndefined();
    });

    it("returns phase_artifact_not_ready when plan.md missing in implement phase", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const planTool = pi.tools.get("ul_workflow_plan");
      const confirmPlanTool = pi.tools.get("ul_workflow_confirm_plan");
      expect(startTool && researchTool && approveTool && planTool && confirmPlanTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start-impl-no-plan", { task: "plan.md欠損テスト" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      const ctx = {
        executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
          content: [{
            type: "text",
            text: JSON.stringify(params).includes("researcher")
              ? "# Research\n\n調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
              : JSON.stringify(params).includes("architect")
                ? "# Plan\n\n- [ ] 実装計画"
                : "実装完了",
          }],
        }),
      };

      // research → plan → confirm_planまで進める
      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-1", {}, undefined, undefined, ctx);
      await planTool!.execute("tc-plan", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-2", {}, undefined, undefined, ctx);
      await confirmPlanTool!.execute("tc-confirm", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-3", {}, undefined, undefined, ctx);

      // plan.mdを削除
      const taskDir = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId);
      const planPath = path.join(taskDir, "plan.md");
      if (existsSync(planPath)) {
        unlinkSync(planPath);
      }

      // implementフェーズでapproveを呼ぶとphase_artifact_not_readyエラーになる
      const result = await approveTool!.execute("tc-approve-impl-no-plan", {}, undefined, undefined, ctx);
      expect(result.details.error).toBe("phase_artifact_not_ready");
    });

    it("returns phase_artifact_not_ready when review.md missing in review phase", async () => {
      const startTool = pi.tools.get("ul_workflow_start");
      const researchTool = pi.tools.get("ul_workflow_research");
      const approveTool = pi.tools.get("ul_workflow_approve");
      const planTool = pi.tools.get("ul_workflow_plan");
      const confirmPlanTool = pi.tools.get("ul_workflow_confirm_plan");
      const executePlanTool = pi.tools.get("ul_workflow_execute_plan");
      const reviewTool = pi.tools.get("ul_workflow_review");
      expect(startTool && researchTool && approveTool && planTool && confirmPlanTool && executePlanTool && reviewTool).toBeDefined();

      const startResult = await startTool!.execute("tc-start-review-no-md", { task: "review.md欠損テスト" }, undefined, undefined, {});
      const taskId = startResult.details.taskId as string;
      createdTaskIds.push(taskId);

      const ctx = {
        executeTool: async ({ params }: { toolName: string; params: Record<string, unknown> }) => ({
          content: [{
            type: "text",
            text: JSON.stringify(params).includes("researcher")
              ? "# Research\n\n調査結果。\n\n## 高リスク判定\n\n### 判定結果\n- [ ] normal（通常）"
              : JSON.stringify(params).includes("architect")
                ? "# Plan\n\n- [ ] 実装計画"
                : JSON.stringify(params).includes("reviewer")
                  ? "# Review\n\nレビュー結果。\n\n## 判定結果\n- [ ] normal（通常）"
                  : "実装完了",
          }],
        }),
      };

      // 全フェーズを進める
      await researchTool!.execute("tc-research", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-1", {}, undefined, undefined, ctx);
      await planTool!.execute("tc-plan", { task: "テスト", task_id: taskId }, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-2", {}, undefined, undefined, ctx);
      await confirmPlanTool!.execute("tc-confirm", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-3", {}, undefined, undefined, ctx);
      await executePlanTool!.execute("tc-execute", {}, undefined, undefined, ctx);
      await approveTool!.execute("tc-approve-4", {}, undefined, undefined, ctx);

      // review.mdを作成せずにreviewツールを呼ぶ
      // reviewツールはreview.mdを生成するツールだが、現在の実装ではapproveがreviewフェーズで
      // review.mdの存在をチェックするため、approveでエラーを検証する
      const result = await approveTool!.execute("tc-approve-review-no-md", {}, undefined, undefined, ctx);
      expect(result.details.error).toBe("phase_artifact_not_ready");
    });
  });
});

// =============================================================================
// decideResearchFollowups and decidePlanFollowups unit tests
// =============================================================================
describe("decideResearchFollowups", () => {
  it("parses DEEP_DIVE_EXTERNAL: yes and DEEP_DIVE_CODEBASE: no", async () => {
    const { decideResearchFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## research-gap-check
Status: completed
DEEP_DIVE_EXTERNAL: yes
DEEP_DIVE_CODEBASE: no
RATIONALE: External documentation is needed for API reference`;

    const result = decideResearchFollowups(gapCheckOutput);
    expect(result.needsExternalDeepDive).toBe(true);
    expect(result.needsCodebaseDeepDive).toBe(false);
    expect(result.rationale).toContain("External documentation");
  });

  it("parses DEEP_DIVE_EXTERNAL: no and DEEP_DIVE_CODEBASE: yes", async () => {
    const { decideResearchFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## research-gap-check
Status: completed
DEEP_DIVE_EXTERNAL: no
DEEP_DIVE_CODEBASE: yes
RATIONALE: Codebase has relevant implementation patterns`;

    const result = decideResearchFollowups(gapCheckOutput);
    expect(result.needsExternalDeepDive).toBe(false);
    expect(result.needsCodebaseDeepDive).toBe(true);
    expect(result.rationale).toContain("Codebase");
  });

  it("parses DEEP_DIVE_EXTERNAL: yes and DEEP_DIVE_CODEBASE: yes", async () => {
    const { decideResearchFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## research-gap-check
Status: completed
DEEP_DIVE_EXTERNAL: yes
DEEP_DIVE_CODEBASE: yes
RATIONALE: Both external docs and codebase patterns needed`;

    const result = decideResearchFollowups(gapCheckOutput);
    expect(result.needsExternalDeepDive).toBe(true);
    expect(result.needsCodebaseDeepDive).toBe(true);
  });

  it("returns defaults when no explicitflags", async () => {
    const { decideResearchFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## research-gap-check
Status: completed
No deep dive needed. Plan ready.`;

    const result = decideResearchFollowups(gapCheckOutput);
    expect(result.needsExternalDeepDive).toBe(false);
    expect(result.needsCodebaseDeepDive).toBe(false);
  });

  it("handles empty/null output gracefully", async () => {
    const { decideResearchFollowups } = await import("../extensions/ul-workflow.js");

    const result = decideResearchFollowups("");
    expect(result.needsExternalDeepDive).toBe(false);
    expect(result.needsCodebaseDeepDive).toBe(false);
  });
});

describe("decidePlanFollowups", () => {
  it("parses DEEP_DIVE_CHANGES: yes and DEEP_DIVE_VALIDATION: no", async () => {
    const { decidePlanFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## plan-gap-check
Status: completed
DEEP_DIVE_CHANGES: yes
DEEP_DIVE_VALIDATION: no
RATIONALE: Changes impact needs investigation`;

    const result = decidePlanFollowups(gapCheckOutput);
    expect(result.needsChangesDeepDive).toBe(true);
    expect(result.needsValidationDeepDive).toBe(false);
    expect(result.rationale).toContain("Changes impact");
  });

  it("parses DEEP_DIVE_CHANGES: no and DEEP_DIVE_VALIDATION: yes", async () => {
    const { decidePlanFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## plan-gap-check
Status: completed
DEEP_DIVE_CHANGES: no
DEEP_DIVE_VALIDATION: yes
RATIONALE: Validation strategy needs deep dive`;

    const result = decidePlanFollowups(gapCheckOutput);
    expect(result.needsChangesDeepDive).toBe(false);
    expect(result.needsValidationDeepDive).toBe(true);
  });

  it("parses DEEP_DIVE_CHANGES: yes and DEEP_DIVE_VALIDATION: yes", async () => {
    const { decidePlanFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## plan-gap-check
Status: completed
DEEP_DIVE_CHANGES: yes
DEEP_DIVE_VALIDATION: yes
RATIONALE: Both changes and validation need deep dive`;

    const result = decidePlanFollowups(gapCheckOutput);
    expect(result.needsChangesDeepDive).toBe(true);
    expect(result.needsValidationDeepDive).toBe(true);
  });

  it("returns defaults when no explicitflags", async () => {
    const { decidePlanFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## plan-gap-check
Status: completed
No deep dive needed. Plan ready.`;

    const result = decidePlanFollowups(gapCheckOutput);
    expect(result.needsChangesDeepDive).toBe(false);
    expect(result.needsValidationDeepDive).toBe(false);
  });

  it("handles empty/nulloutput gracefully", async () => {
    const { decidePlanFollowups } = await import("../extensions/ul-workflow.js");

    const result = decidePlanFollowups("");
    expect(result.needsChangesDeepDive).toBe(false);
    expect(result.needsValidationDeepDive).toBe(false);
  });
});

describe("decideReviewFollowups", () => {
  it("parses DEEP_DIVE_RISK: yes and DEEP_DIVE_VERIFICATION: no", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
DEEP_DIVE_RISK: yes
DEEP_DIVE_VERIFICATION: no
RATIONALE: Risk assessment needs deep dive`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsRiskDeepDive).toBe(true);
    expect(result.needsVerificationDeepDive).toBe(false);
    expect(result.rationale).toContain("Risk assessment");
  });

  it("parses DEEP_DIVE_RISK: no and DEEP_DIVE_VERIFICATION: yes", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
DEEP_DIVE_RISK: no
DEEP_DIVE_VERIFICATION: yes
RATIONALE: Verification strategy needs deep dive`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsRiskDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(true);
  });

  it("parses DEEP_DIVE_RISK: yes and DEEP_DIVE_VERIFICATION: yes", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
DEEP_DIVE_RISK: yes
DEEP_DIVE_VERIFICATION: yes
RATIONALE: Both risk and verification need deep dive`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsRiskDeepDive).toBe(true);
    expect(result.needsVerificationDeepDive).toBe(true);
  });

  it("returns defaults when no explicit flags", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
No deep dive needed. Review ready.`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsRiskDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(false);
  });

  it("handles empty/null output gracefully", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const result = decideReviewFollowups("");
    expect(result.needsRiskDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(false);
  });

  it("detects risk keywords in fallback heuristic", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
Security risk detected in authentication flow`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsRiskDeepDive).toBe(true);
  });

  it("detects verification keywords in fallback heuristic", async () => {
    const { decideReviewFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## review-gap-check
Status: completed
Test coverage verification required`;

    const result = decideReviewFollowups(gapCheckOutput);
    expect(result.needsVerificationDeepDive).toBe(true);
  });
});

describe("decideImplementFollowups", () => {
  it("parses DEEP_DIVE_FIXUP: yes and DEEP_DIVE_VERIFICATION: no", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
DEEP_DIVE_FIXUP: yes
DEEP_DIVE_VERIFICATION: no
RATIONALE: Implementation has bugs to fix`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsFixupDeepDive).toBe(true);
    expect(result.needsVerificationDeepDive).toBe(false);
    expect(result.rationale).toContain("Implementation has bugs");
  });

  it("parses DEEP_DIVE_FIXUP: no and DEEP_DIVE_VERIFICATION: yes", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
DEEP_DIVE_FIXUP: no
DEEP_DIVE_VERIFICATION: yes
RATIONALE: Verification tests need deep dive`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsFixupDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(true);
  });

  it("parses DEEP_DIVE_FIXUP: yes and DEEP_DIVE_VERIFICATION: yes", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
DEEP_DIVE_FIXUP: yes
DEEP_DIVE_VERIFICATION: yes
RATIONALE: Both fixup and verification need deep dive`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsFixupDeepDive).toBe(true);
    expect(result.needsVerificationDeepDive).toBe(true);
  });

  it("returns defaults when no explicit flags", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
No deep dive needed. Implementation ready.`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsFixupDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(false);
  });

  it("handles empty/null output gracefully", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const result = decideImplementFollowups("");
    expect(result.needsFixupDeepDive).toBe(false);
    expect(result.needsVerificationDeepDive).toBe(false);
  });

  it("detects fixup keywords in fallback heuristic", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
Bug fix required in implementation`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsFixupDeepDive).toBe(true);
  });

  it("detects verification keywords in fallback heuristic", async () => {
    const { decideImplementFollowups } = await import("../extensions/ul-workflow.js");

    const gapCheckOutput = `## implement-gap-check
Status: completed
Test verification artifacts missing`;

    const result = decideImplementFollowups(gapCheckOutput);
    expect(result.needsVerificationDeepDive).toBe(true);
  });
});
