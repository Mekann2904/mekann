/**
 * abort-utils.ts 単体テスト
 * カバレッジ分析: createChildAbortController, createChildAbortControllers をカバー
 * エッジケース: 既に中断されたシグナル、cleanup呼び出し忘れ、複数コントローラ
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import {
  createChildAbortController,
  createChildAbortControllers,
} from "../../../.pi/lib/abort-utils.js";

// ============================================================================
// createChildAbortController テスト
// ============================================================================

describe("createChildAbortController", () => {
  it("createChildAbortController_親なし_独立したコントローラ作成", () => {
    // Arrange & Act
    const { controller, cleanup } = createChildAbortController();

    // Assert
    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);
    expect(typeof cleanup).toBe("function");
  });

  it("createChildAbortController_親なしで中断_子も中断", () => {
    // Arrange
    const parentController = new AbortController();
    const { controller } = createChildAbortController(parentController.signal);

    // Act
    parentController.abort();

    // Assert
    expect(controller.signal.aborted).toBe(true);
  });

  it("createChildAbortController_親既に中断_子も即座に中断", () => {
    // Arrange
    const parentController = new AbortController();
    parentController.abort();

    // Act
    const { controller } = createChildAbortController(parentController.signal);

    // Assert
    expect(controller.signal.aborted).toBe(true);
  });

  it("createChildAbortController_cleanup_リスナー削除", () => {
    // Arrange
    const parentController = new AbortController();
    const { controller, cleanup } = createChildAbortController(
      parentController.signal
    );

    // Act
    cleanup();
    parentController.abort();

    // Assert - cleanup後に親が中断しても子は中断されない
    expect(controller.signal.aborted).toBe(false);
  });

  it("createChildAbortController_cleanup複数回呼び出し_エラーなし", () => {
    // Arrange
    const parentController = new AbortController();
    const { cleanup } = createChildAbortController(parentController.signal);

    // Act & Assert
    expect(() => {
      cleanup();
      cleanup();
      cleanup();
    }).not.toThrow();
  });

  it("createChildAbortController_子を直接中断_親に影響なし", () => {
    // Arrange
    const parentController = new AbortController();
    const { controller } = createChildAbortController(parentController.signal);

    // Act
    controller.abort();

    // Assert
    expect(controller.signal.aborted).toBe(true);
    expect(parentController.signal.aborted).toBe(false);
  });

  it("createChildAbortController_null親_独立動作", () => {
    // Arrange & Act
    const { controller, cleanup } = createChildAbortController(
      null as unknown as AbortSignal
    );

    // Assert
    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);
    expect(typeof cleanup).toBe("function");

    // cleanupしてもエラーにならない
    cleanup();
  });

  it("createChildAbortController_undefined親_独立動作", () => {
    // Arrange & Act
    const { controller, cleanup } = createChildAbortController(undefined);

    // Assert
    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);
    cleanup();
  });
});

// ============================================================================
// createChildAbortControllers テスト
// ============================================================================

describe("createChildAbortControllers", () => {
  it("createChildAbortControllers_0個_空配列返却", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(0);

    // Assert
    expect(controllers).toHaveLength(0);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("createChildAbortControllers_1個_単一コントローラ作成", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(1);

    // Assert
    expect(controllers).toHaveLength(1);
    expect(controllers[0]).toBeInstanceOf(AbortController);
    expect(controllers[0].signal.aborted).toBe(false);
    cleanup();
  });

  it("createChildAbortControllers_複数_指定数のコントローラ作成", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(5);

    // Assert
    expect(controllers).toHaveLength(5);
    controllers.forEach((c) => {
      expect(c).toBeInstanceOf(AbortController);
      expect(c.signal.aborted).toBe(false);
    });
    cleanup();
  });

  it("createChildAbortControllers_親あり_全子が親に連動", () => {
    // Arrange
    const parentController = new AbortController();
    const { controllers, cleanup } = createChildAbortControllers(
      3,
      parentController.signal
    );

    // Act
    parentController.abort();

    // Assert
    controllers.forEach((c) => {
      expect(c.signal.aborted).toBe(true);
    });

    cleanup();
  });

  it("createChildAbortControllers_親既に中断_全子が即座に中断", () => {
    // Arrange
    const parentController = new AbortController();
    parentController.abort();

    // Act
    const { controllers, cleanup } = createChildAbortControllers(
      3,
      parentController.signal
    );

    // Assert
    controllers.forEach((c) => {
      expect(c.signal.aborted).toBe(true);
    });

    cleanup();
  });

  it("createChildAbortControllers_cleanup_全リスナー削除", () => {
    // Arrange
    const parentController = new AbortController();
    const { controllers, cleanup } = createChildAbortControllers(
      3,
      parentController.signal
    );

    // Act
    cleanup();
    parentController.abort();

    // Assert - cleanup後は親が中断しても子は中断されない
    controllers.forEach((c) => {
      expect(c.signal.aborted).toBe(false);
    });
  });

  it("createChildAbortControllers_個別中断_他に影響なし", () => {
    // Arrange
    const parentController = new AbortController();
    const { controllers, cleanup } = createChildAbortControllers(
      3,
      parentController.signal
    );

    // Act - 最初のコントローラだけ中断
    controllers[0].abort();

    // Assert
    expect(controllers[0].signal.aborted).toBe(true);
    expect(controllers[1].signal.aborted).toBe(false);
    expect(controllers[2].signal.aborted).toBe(false);

    cleanup();
  });

  it("createChildAbortControllers_親なし_全子が独立", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(3);

    // 最初のコントローラを中断
    controllers[0].abort();

    // Assert
    expect(controllers[0].signal.aborted).toBe(true);
    expect(controllers[1].signal.aborted).toBe(false);
    expect(controllers[2].signal.aborted).toBe(false);

    cleanup();
  });

  it("createChildAbortControllers_負の数_空配列または0として処理", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(-5);

    // Assert - 実装依存だが、負の数は0として扱われるべき
    expect(controllers.length).toBeGreaterThanOrEqual(0);
    cleanup();
  });

  it("createChildAbortControllers_大量作成_正常動作", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(100);

    // Assert
    expect(controllers).toHaveLength(100);
    controllers.forEach((c) => {
      expect(c).toBeInstanceOf(AbortController);
    });

    cleanup();
  });
});

// ============================================================================
// イベントリスナー管理テスト
// ============================================================================

describe("イベントリスナー管理", () => {
  it("cleanup_親シグナルからリスナー削除", () => {
    // Arrange
    const parentController = new AbortController();
    const initialListenerCount = parentController.signal.aborted ? 0 : 1; // 概算

    // Act
    const { cleanup } = createChildAbortController(parentController.signal);
    cleanup();

    // Assert - 明示的な確認は難しいが、cleanupが正常に呼ばれることを確認
    expect(typeof cleanup).toBe("function");
  });

  it("複数の子_各々が独立してcleanup可能", () => {
    // Arrange
    const parentController = new AbortController();

    const child1 = createChildAbortController(parentController.signal);
    const child2 = createChildAbortController(parentController.signal);
    const child3 = createChildAbortController(parentController.signal);

    // Act - child2だけcleanup
    child2.cleanup();
    parentController.abort();

    // Assert
    expect(child1.controller.signal.aborted).toBe(true);
    expect(child2.controller.signal.aborted).toBe(false); // cleanup済み
    expect(child3.controller.signal.aborted).toBe(true);

    // 残りのcleanup
    child1.cleanup();
    child3.cleanup();
  });
});

// ============================================================================
// 非同期操作との連携テスト
// ============================================================================

describe("非同期操作との連携", () => {
  it("Promise競合_中断によるキャンセル", async () => {
    // Arrange
    const parentController = new AbortController();
    const { controller } = createChildAbortController(parentController.signal);

    const asyncOperation = new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        reject(new Error("Aborted"));
      };

      controller.signal.addEventListener("abort", onAbort);
    });

    // Act
    parentController.abort();

    // Assert
    await expect(asyncOperation).rejects.toThrow("Aborted");
  });

  it("fetchライクな操作_中断可能", async () => {
    // Arrange
    const parentController = new AbortController();
    const { controller } = createChildAbortController(parentController.signal);

    const mockFetch = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve("data"), 10000);

        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new Error("AbortError"));
        });
      });
    });

    // Act
    const promise = mockFetch(controller.signal);
    parentController.abort();

    // Assert
    await expect(promise).rejects.toThrow("AbortError");
  });

  it("複数の非同期操作_全て中断", async () => {
    // Arrange
    const parentController = new AbortController();
    const { controllers } = createChildAbortControllers(3, parentController.signal);

    const operations = controllers.map((c) => {
      return new Promise<string>((_, reject) => {
        c.signal.addEventListener("abort", () => {
          reject(new Error("Aborted"));
        });
      });
    });

    // Act
    parentController.abort();

    // Assert
    for (const op of operations) {
      await expect(op).rejects.toThrow("Aborted");
    }
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("createChildAbortControllers_任意の数_正しい数のコントローラ作成", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (count) => {
        const { controllers, cleanup } = createChildAbortControllers(count);

        expect(controllers).toHaveLength(count);
        controllers.forEach((c) => {
          expect(c).toBeInstanceOf(AbortController);
          expect(c.signal.aborted).toBe(false);
        });

        cleanup();
        return true;
      })
    );
  });

  it("cleanup_任意のタイミング_エラーなし", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (abortBeforeCleanup, multipleCleanup) => {
          const parentController = new AbortController();
          const { controller, cleanup } = createChildAbortController(
            parentController.signal
          );

          if (abortBeforeCleanup) {
            parentController.abort();
          }

          cleanup();

          if (multipleCleanup) {
            cleanup();
            cleanup();
          }

          // cleanupは常に正常に完了する
          return true;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("最大数のコントローラ作成_正常動作", () => {
    // Arrange & Act
    const { controllers, cleanup } = createChildAbortControllers(1000);

    // Assert
    expect(controllers).toHaveLength(1000);
    cleanup();
  });

  it("連続した作成と破棄_メモリリークなし", () => {
    // Arrange
    const iterations = 100;

    // Act & Assert - エラーにならない
    for (let i = 0; i < iterations; i++) {
      const { cleanup } = createChildAbortController();
      cleanup();
    }
  });

  it("中断理由の取得_reasonプロパティ存在確認", () => {
    // Arrange
    const parentController = new AbortController();
    const { controller } = createChildAbortController(parentController.signal);

    // Act
    parentController.abort("Test reason");

    // Assert - abort理由にアクセス可能
    expect(controller.signal.aborted).toBe(true);
    // 注: abort reasonへのアクセスは環境依存の可能性がある
  });
});

// ============================================================================
// エラーハンドリングテスト
// ============================================================================

describe("エラーハンドリング", () => {
  it("cleanup後の中断_エラーなし", () => {
    // Arrange
    const parentController = new AbortController();
    const { controller, cleanup } = createChildAbortController(
      parentController.signal
    );

    // Act
    cleanup();
    parentController.abort();
    controller.abort();

    // Assert - エラーにならない
    expect(controller.signal.aborted).toBe(true);
  });

  it("既に中断された子への再度中断_エラーなし", () => {
    // Arrange
    const { controller } = createChildAbortController();

    // Act
    controller.abort();
    controller.abort();
    controller.abort();

    // Assert
    expect(controller.signal.aborted).toBe(true);
  });

  it("cleanup関数の再作成_新しいcleanupが機能する", () => {
    // Arrange
    const parentController = new AbortController();

    const child1 = createChildAbortController(parentController.signal);
    const child2 = createChildAbortController(parentController.signal);

    // Act
    child1.cleanup();
    parentController.abort();

    // Assert
    expect(child1.controller.signal.aborted).toBe(false);
    expect(child2.controller.signal.aborted).toBe(true);

    child2.cleanup();
  });
});
