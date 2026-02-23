/**
 * @abdd.meta
 * path: .pi/tests/e2e/loop-state-machine.test.ts
 * role: ループ処理のモデルベーステスト
 * why: ループ処理の状態遷移を体系的に検証するため
 * related: .pi/extensions/loop.ts, .pi/lib/task-scheduler.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、状態遷移は一意に定まる
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: ループ処理の状態遷移をモデルベーステストで検証
 * what_it_does:
 *   - 状態遷移モデルの定義
 *   - 全ての可能な状態遷移パスのテスト
 *   - 不変条件の検証
 * why_it_exists:
 *   - 状態遷移の完全性を保証するため
 *   - エッジケースを体系的に検出するため
 * scope:
 *   in: 状態遷移モデルの定義
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// モデル定義
// ============================================================================

/**
 * ループの状態
 */
type LoopState = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";

/**
 * ループのイベント
 */
type LoopEvent = "start" | "pause" | "resume" | "complete" | "fail" | "cancel" | "reset";

/**
 * 状態遷移ルール
 */
interface Transition {
  from: LoopState;
  event: LoopEvent;
  to: LoopState;
  guard?: () => boolean;
}

/**
 * 不変条件
 */
interface Invariant {
  name: string;
  check: (state: LoopState, context: LoopContext) => boolean;
}

/**
 * ループのコンテキスト
 */
interface LoopContext {
  iterationCount: number;
  maxIterations: number;
  errorCount: number;
  maxErrors: number;
}

// ============================================================================
// 状態遷移モデル
// ============================================================================

/**
 * 許可される状態遷移
 */
const TRANSITIONS: Transition[] = [
  // idle状態からの遷移
  { from: "idle", event: "start", to: "running" },

  // running状態からの遷移
  { from: "running", event: "pause", to: "paused" },
  { from: "running", event: "complete", to: "completed" },
  { from: "running", event: "fail", to: "failed" },
  { from: "running", event: "cancel", to: "cancelled" },

  // paused状態からの遷移
  { from: "paused", event: "resume", to: "running" },
  { from: "paused", event: "cancel", to: "cancelled" },

  // 終了状態からの遷移
  { from: "completed", event: "reset", to: "idle" },
  { from: "failed", event: "reset", to: "idle" },
  { from: "cancelled", event: "reset", to: "idle" },
];

/**
 * 不変条件
 */
const INVARIANTS: Invariant[] = [
  {
    name: "iterationCountは非負",
    check: (_, ctx) => ctx.iterationCount >= 0,
  },
  {
    name: "errorCountは非負",
    check: (_, ctx) => ctx.errorCount >= 0,
  },
  {
    name: "iterationCountはmaxIterations以下",
    check: (_, ctx) => ctx.iterationCount <= ctx.maxIterations,
  },
  {
    name: "errorCountはmaxErrors以下",
    check: (_, ctx) => ctx.errorCount <= ctx.maxErrors,
  },
];

// ============================================================================
// 状態遷移マシン（テスト用）
// ============================================================================

class LoopStateMachine {
  private state: LoopState = "idle";
  private context: LoopContext = {
    iterationCount: 0,
    maxIterations: 100,
    errorCount: 0,
    maxErrors: 10,
  };
  private stateHistory: LoopState[] = ["idle"];

  /**
   * 現在の状態を取得
   */
  getState(): LoopState {
    return this.state;
  }

  /**
   * 状態履歴を取得
   */
  getStateHistory(): LoopState[] {
    return [...this.stateHistory];
  }

  /**
   * コンテキストを取得
   */
  getContext(): LoopContext {
    return { ...this.context };
  }

  /**
   * イベントを処理
   */
  handleEvent(event: LoopEvent): { success: boolean; error?: string } {
    // 適切な遷移を探す
    const transition = TRANSITIONS.find(
      (t) => t.from === this.state && t.event === event
    );

    if (!transition) {
      return {
        success: false,
        error: `Invalid transition: ${this.state} -> ${event}`,
      };
    }

    // ガード条件のチェック
    if (transition.guard && !transition.guard()) {
      return {
        success: false,
        error: `Guard condition failed for transition: ${this.state} -> ${event}`,
      };
    }

    // 状態遷移
    this.state = transition.to;
    this.stateHistory.push(this.state);

    // コンテキストの更新
    this.updateContext(event);

    return { success: true };
  }

  /**
   * 不変条件をチェック
   */
  checkInvariants(): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const invariant of INVARIANTS) {
      if (!invariant.check(this.state, this.context)) {
        violations.push(invariant.name);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * コンテキストを更新
   */
  private updateContext(event: LoopEvent): void {
    switch (event) {
      case "start":
      case "resume":
        // 実行開始時にイテレーションをインクリメント
        this.context.iterationCount++;
        break;
      case "fail":
        this.context.errorCount++;
        break;
      case "reset":
        this.context.iterationCount = 0;
        this.context.errorCount = 0;
        break;
    }
  }

  /**
   * リセット
   */
  reset(): void {
    this.state = "idle";
    this.context = {
      iterationCount: 0,
      maxIterations: 100,
      errorCount: 0,
      maxErrors: 10,
    };
    this.stateHistory = ["idle"];
  }
}

// ============================================================================
// モデルベーステスト
// ============================================================================

describe("モデルベーステスト: ループ状態遷移", () => {
  let machine: LoopStateMachine;

  beforeEach(() => {
    machine = new LoopStateMachine();
  });

  // ==========================================================================
  // 基本的な状態遷移
  // ==========================================================================
  describe("基本的な状態遷移", () => {
    it("idle状態から開始する", () => {
      expect(machine.getState()).toBe("idle");
      expect(machine.getStateHistory()).toEqual(["idle"]);
    });

    it("idle -> start -> running に遷移できる", () => {
      const result = machine.handleEvent("start");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("running");
      expect(machine.getStateHistory()).toEqual(["idle", "running"]);
    });

    it("running -> pause -> paused に遷移できる", () => {
      machine.handleEvent("start");
      const result = machine.handleEvent("pause");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("paused");
    });

    it("paused -> resume -> running に遷移できる", () => {
      machine.handleEvent("start");
      machine.handleEvent("pause");
      const result = machine.handleEvent("resume");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("running");
    });

    it("running -> complete -> completed に遷移できる", () => {
      machine.handleEvent("start");
      const result = machine.handleEvent("complete");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("completed");
    });

    it("running -> fail -> failed に遷移できる", () => {
      machine.handleEvent("start");
      const result = machine.handleEvent("fail");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("failed");
    });

    it("running -> cancel -> cancelled に遷移できる", () => {
      machine.handleEvent("start");
      const result = machine.handleEvent("cancel");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("cancelled");
    });
  });

  // ==========================================================================
  // 無効な遷移
  // ==========================================================================
  describe("無効な遷移", () => {
    it("idle状態からpauseは無効", () => {
      const result = machine.handleEvent("pause");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
      expect(machine.getState()).toBe("idle");
    });

    it("idle状態からcompleteは無効", () => {
      const result = machine.handleEvent("complete");

      expect(result.success).toBe(false);
      expect(machine.getState()).toBe("idle");
    });

    it("completed状態からstartは無効", () => {
      machine.handleEvent("start");
      machine.handleEvent("complete");
      const result = machine.handleEvent("start");

      expect(result.success).toBe(false);
      expect(machine.getState()).toBe("completed");
    });

    it("paused状態からcompleteは無効", () => {
      machine.handleEvent("start");
      machine.handleEvent("pause");
      const result = machine.handleEvent("complete");

      expect(result.success).toBe(false);
      expect(machine.getState()).toBe("paused");
    });
  });

  // ==========================================================================
  // リセット
  // ==========================================================================
  describe("リセット", () => {
    it("completed状態からreset -> idleに遷移できる", () => {
      machine.handleEvent("start");
      machine.handleEvent("complete");
      const result = machine.handleEvent("reset");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("idle");
    });

    it("failed状態からreset -> idleに遷移できる", () => {
      machine.handleEvent("start");
      machine.handleEvent("fail");
      const result = machine.handleEvent("reset");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("idle");
    });

    it("cancelled状態からreset -> idleに遷移できる", () => {
      machine.handleEvent("start");
      machine.handleEvent("cancel");
      const result = machine.handleEvent("reset");

      expect(result.success).toBe(true);
      expect(machine.getState()).toBe("idle");
    });
  });

  // ==========================================================================
  // 不変条件
  // ==========================================================================
  describe("不変条件", () => {
    it("初期状態で全ての不変条件が満たされる", () => {
      const result = machine.checkInvariants();

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("状態遷移後も不変条件が満たされる", () => {
      machine.handleEvent("start");
      const result = machine.checkInvariants();

      expect(result.valid).toBe(true);
    });

    it("失敗後も不変条件が満たされる", () => {
      machine.handleEvent("start");
      machine.handleEvent("fail");
      const result = machine.checkInvariants();

      expect(result.valid).toBe(true);
    });

    it("リセット後も不変条件が満たされる", () => {
      machine.handleEvent("start");
      machine.handleEvent("fail");
      machine.handleEvent("reset");
      const result = machine.checkInvariants();

      expect(result.valid).toBe(true);
      expect(machine.getContext().iterationCount).toBe(0);
      expect(machine.getContext().errorCount).toBe(0);
    });
  });

  // ==========================================================================
  // 状態遷移パス（パスカバレッジ）
  // ==========================================================================
  describe("状態遷移パス", () => {
    it("パス1: idle -> running -> completed -> idle", () => {
      machine.handleEvent("start");
      machine.handleEvent("complete");
      machine.handleEvent("reset");

      expect(machine.getState()).toBe("idle");
      expect(machine.getStateHistory()).toEqual([
        "idle",
        "running",
        "completed",
        "idle",
      ]);
    });

    it("パス2: idle -> running -> paused -> running -> completed", () => {
      machine.handleEvent("start");
      machine.handleEvent("pause");
      machine.handleEvent("resume");
      machine.handleEvent("complete");

      expect(machine.getState()).toBe("completed");
    });

    it("パス3: idle -> running -> failed -> idle -> running -> completed", () => {
      // 1回目の実行（失敗）
      machine.handleEvent("start");
      machine.handleEvent("fail");
      expect(machine.getState()).toBe("failed");
      expect(machine.getContext().errorCount).toBe(1);

      // リセットして再実行
      machine.handleEvent("reset");
      machine.handleEvent("start");
      machine.handleEvent("complete");
      expect(machine.getState()).toBe("completed");
      expect(machine.getContext().errorCount).toBe(0);
    });

    it("パス4: idle -> running -> paused -> cancelled -> idle", () => {
      machine.handleEvent("start");
      machine.handleEvent("pause");
      machine.handleEvent("cancel");
      machine.handleEvent("reset");

      expect(machine.getState()).toBe("idle");
    });
  });

  // ==========================================================================
  // コンテキストの更新
  // ==========================================================================
  describe("コンテキストの更新", () => {
    it("startでiterationCountが増加する", () => {
      expect(machine.getContext().iterationCount).toBe(0);

      machine.handleEvent("start");
      expect(machine.getContext().iterationCount).toBe(1);
    });

    it("resumeでiterationCountが増加する", () => {
      machine.handleEvent("start");
      machine.handleEvent("pause");
      const countBefore = machine.getContext().iterationCount;

      machine.handleEvent("resume");
      expect(machine.getContext().iterationCount).toBe(countBefore + 1);
    });

    it("failでerrorCountが増加する", () => {
      expect(machine.getContext().errorCount).toBe(0);

      machine.handleEvent("start");
      machine.handleEvent("fail");
      expect(machine.getContext().errorCount).toBe(1);
    });

    it("resetでカウンタがリセットされる", () => {
      machine.handleEvent("start");
      machine.handleEvent("fail");
      machine.handleEvent("reset");

      expect(machine.getContext().iterationCount).toBe(0);
      expect(machine.getContext().errorCount).toBe(0);
    });
  });
});
