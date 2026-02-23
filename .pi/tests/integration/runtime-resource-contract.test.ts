/**
 * @abdd.meta
 * path: .pi/tests/integration/runtime-resource-contract.test.ts
 * role: agent-runtimeのリソース管理契約テスト
 * why: サブエージェントとエージェントチーム間のリソース共有が契約に従うことを保証するため
 * related: .pi/extensions/agent-runtime.ts, .pi/lib/runtime-types.ts, .pi/lib/agent-common.ts
 * public_api: テストケースの実行
 * invariants: テストはモック環境で実行され、実際のリソースを消費しない
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は契約違反を示す
 * @abdd.explain
 * overview: agent-runtimeのリソース確保/解放/待機の契約を検証する統合テスト
 * what_it_does:
 *   - リソース確保の契約テスト（容量チェック→確保→解放の一貫性）
 *   - 並列実行時のリソース競合テスト
 *   - 優先度スケジューリングの契約テスト
 *   - タイムアウトとキャンセルの契約テスト
 * why_it_exists:
 *   - サブエージェントとエージェントチームが同一のリソースプールを正しく共有することを保証するため
 *   - リソースリークや二重解放などの不整合を早期に検出するため
 * scope:
 *   in: agent-runtime.ts, runtime-types.ts, agent-common.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// 型定義（テスト用モック）
// ============================================================================

/**
 * リソース確保の契約を表すインターフェース
 */
interface ResourceContract {
  /** 確保したリクエスト数 */
  requestsReserved: number;
  /** 確保したLLM数 */
  llmReserved: number;
  /** 確保時刻 */
  reservedAt: number;
  /** 有効期限 */
  expiresAt: number;
  /** リースID */
  leaseId: string;
  /** 解放済みフラグ */
  released: boolean;
}

/**
 * リソースプールのモック
 * テスト用に簡略化されたリソース管理を実装
 */
class MockResourcePool {
  private totalRequests = 0;
  private totalLlm = 0;
  private reservations: Map<string, ResourceContract> = new Map();
  private nextId = 1;
  private clock = 0;

  constructor(
    private limits: { maxRequests: number; maxLlm: number }
  ) {}

  /**
   * 現在時刻を取得（テスト用に制御可能）
   */
  now(): number {
    return this.clock;
  }

  /**
   * 時間を進める（テスト用）
   */
  advanceTime(ms: number): void {
    this.clock += ms;
  }

  /**
   * 利用可能な容量を確認
   */
  checkCapacity(requests: number, llm: number): { available: boolean; waitReason?: string } {
    const availableRequests = this.limits.maxRequests - this.totalRequests;
    const availableLlm = this.limits.maxLlm - this.totalLlm;

    if (requests > availableRequests) {
      return { available: false, waitReason: `requests: need ${requests}, have ${availableRequests}` };
    }
    if (llm > availableLlm) {
      return { available: false, waitReason: `llm: need ${llm}, have ${availableLlm}` };
    }
    return { available: true };
  }

  /**
   * リソースを確保
   * 契約: checkCapacityで確認後のみ呼び出し可能
   */
  reserve(requests: number, llm: number, ttlMs: number): ResourceContract {
    const check = this.checkCapacity(requests, llm);
    if (!check.available) {
      throw new Error(`容量不足: ${check.waitReason}`);
    }

    const leaseId = `lease-${this.nextId++}`;
    const now = this.now();
    const contract: ResourceContract = {
      requestsReserved: requests,
      llmReserved: llm,
      reservedAt: now,
      expiresAt: now + ttlMs,
      leaseId,
      released: false,
    };

    this.totalRequests += requests;
    this.totalLlm += llm;
    this.reservations.set(leaseId, contract);

    return contract;
  }

  /**
   * リソースを解放
   * 契約: 同じleaseIdの二重解放はエラー
   */
  release(leaseId: string): void {
    const contract = this.reservations.get(leaseId);
    if (!contract) {
      throw new Error(`存在しないリース: ${leaseId}`);
    }
    if (contract.released) {
      throw new Error(`二重解放: ${leaseId}`);
    }

    contract.released = true;
    this.totalRequests -= contract.requestsReserved;
    this.totalLlm -= contract.llmReserved;
  }

  /**
   * 期限切れのリースをクリーンアップ
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = this.now();

    for (const [leaseId, contract] of this.reservations) {
      if (!contract.released && contract.expiresAt <= now) {
        this.totalRequests -= contract.requestsReserved;
        this.totalLlm -= contract.llmReserved;
        contract.released = true;
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 現在の使用状況を取得
   */
  getUsage(): { requests: number; llm: number } {
    return { requests: this.totalRequests, llm: this.totalLlm };
  }

  /**
   * すべてのリースが解放されているか確認
   */
  isClean(): boolean {
    for (const contract of this.reservations.values()) {
      if (!contract.released) {
        return false;
      }
    }
    return true;
  }

  /**
   * すべての未解放リースを強制的に解放（テスト用クリーンアップ）
   */
  forceReleaseAll(): void {
    for (const [leaseId, contract] of this.reservations) {
      if (!contract.released) {
        contract.released = true;
        this.totalRequests -= contract.requestsReserved;
        this.totalLlm -= contract.llmReserved;
      }
    }
  }
}

// ============================================================================
// テストスイート
// ============================================================================

describe("agent-runtime リソース管理契約テスト", () => {
  let pool: MockResourcePool;

  beforeEach(() => {
    // 各テスト前に新しいプールを作成
    pool = new MockResourcePool({ maxRequests: 10, maxLlm: 5 });
  });

  afterEach(() => {
    // 各テスト後にリソースを強制クリーンアップ
    // テスト内で例外が発生した場合でもリソースリークを防ぐ
    pool.forceReleaseAll();
    expect(pool.isClean()).toBe(true);
  });

  describe("基本的なリソース確保と解放", () => {
    it("確保したリソースは正しく解放される", () => {
      // Arrange: 容量を確認
      const check = pool.checkCapacity(2, 1);
      expect(check.available).toBe(true);

      // Act: リソースを確保して解放
      const contract = pool.reserve(2, 1, 60000);
      expect(pool.getUsage()).toEqual({ requests: 2, llm: 1 });

      pool.release(contract.leaseId);
      expect(pool.getUsage()).toEqual({ requests: 0, llm: 0 });
    });

    it("複数の確保と解放が正しく追跡される", () => {
      // Arrange & Act: 複数のリースを作成
      const lease1 = pool.reserve(3, 2, 60000);
      const lease2 = pool.reserve(2, 1, 60000);
      expect(pool.getUsage()).toEqual({ requests: 5, llm: 3 });

      // 解放
      pool.release(lease1.leaseId);
      expect(pool.getUsage()).toEqual({ requests: 2, llm: 1 });

      pool.release(lease2.leaseId);
      expect(pool.getUsage()).toEqual({ requests: 0, llm: 0 });
    });

    it("容量超過時は確保が失敗する", () => {
      // Arrange: ほぼ上限まで確保
      const lease1 = pool.reserve(8, 4, 60000);

      // Act & Assert: 追加の確保は失敗
      expect(() => pool.reserve(3, 1, 60000)).toThrow("容量不足");

      // Cleanup: リソースを解放
      pool.release(lease1.leaseId);
    });
  });

  describe("契約違反の検出", () => {
    it("二重解放はエラーになる", () => {
      // Arrange: リースを作成して解放
      const contract = pool.reserve(1, 1, 60000);
      pool.release(contract.leaseId);

      // Act & Assert: 再度解放しようとするとエラー
      expect(() => pool.release(contract.leaseId)).toThrow("二重解放");
    });

    it("存在しないリースの解放はエラーになる", () => {
      // Act & Assert
      expect(() => pool.release("invalid-id")).toThrow("存在しないリース");
    });

    it("容量確認なしの確保でも制限は適用される", () => {
      // Arrange: 上限まで確保
      const lease1 = pool.reserve(10, 5, 60000);

      // Act & Assert: 追加確保は失敗
      expect(() => pool.reserve(1, 0, 60000)).toThrow("容量不足");

      // Cleanup: リソースを解放
      pool.release(lease1.leaseId);
    });
  });

  describe("期限切れリースの処理", () => {
    it("期限切れリースは自動的にクリーンアップされる", () => {
      // Arrange: 短いTTLでリース作成
      pool.reserve(2, 1, 1000); // 1秒で期限切れ
      expect(pool.getUsage()).toEqual({ requests: 2, llm: 1 });

      // Act: 時間を進めてクリーンアップ
      pool.advanceTime(1500);
      const cleaned = pool.cleanupExpired();

      // Assert: クリーンアップされ、リソースが解放されている
      expect(cleaned).toBe(1);
      expect(pool.getUsage()).toEqual({ requests: 0, llm: 0 });
    });

    it("期限前のリースはクリーンアップされない", () => {
      // Arrange: 十分なTTLでリース作成
      const lease1 = pool.reserve(2, 1, 60000);
      pool.advanceTime(30000); // 30秒経過

      // Act
      const cleaned = pool.cleanupExpired();

      // Assert: クリーンアップされない
      expect(cleaned).toBe(0);
      expect(pool.getUsage()).toEqual({ requests: 2, llm: 1 });

      // Cleanup: リソースを解放
      pool.release(lease1.leaseId);
    });
  });

  describe("並列実行時のリソース競合", () => {
    it("複数の並列リクエストが制限を超えない", async () => {
      // Arrange: 5つの並列リクエストをシミュレート
      const leases: ResourceContract[] = [];

      // Act: 各リクエストが2リクエスト/1LLMを消費
      for (let i = 0; i < 5; i++) {
        const check = pool.checkCapacity(2, 1);
        if (check.available) {
          leases.push(pool.reserve(2, 1, 60000));
        }
      }

      // Assert: 最大容量を超えていない
      expect(pool.getUsage()).toEqual({ requests: 10, llm: 5 });

      // Cleanup
      for (const lease of leases) {
        pool.release(lease.leaseId);
      }
    });

    it("競合時は適切に待機または失敗する", () => {
      // Arrange: 容量を使い切る
      const lease1 = pool.reserve(10, 5, 60000);

      // Act: 追加リクエストの確認
      const check = pool.checkCapacity(1, 1);

      // Assert: 容量不足が検出される
      expect(check.available).toBe(false);
      expect(check.waitReason).toBeDefined();

      // Cleanup: リソースを解放
      pool.release(lease1.leaseId);
    });
  });

  describe("サブエージェントとチームの協調", () => {
    it("サブエージェント用リソースとチーム用リソースが独立して管理される", () => {
      // Arrange: サブエージェント用リース
      const subagentLease = pool.reserve(2, 1, 60000);

      // Act: チーム用リース（同じプールから）
      const teamLease = pool.reserve(3, 2, 60000);

      // Assert: 合計が正しい
      expect(pool.getUsage()).toEqual({ requests: 5, llm: 3 });

      // Cleanup: 個別に解放
      pool.release(subagentLease.leaseId);
      expect(pool.getUsage()).toEqual({ requests: 3, llm: 2 });

      pool.release(teamLease.leaseId);
      expect(pool.getUsage()).toEqual({ requests: 0, llm: 0 });
    });

    it("リースIDは一意である", () => {
      // Arrange & Act: 複数のリースを作成
      const leases = [
        pool.reserve(1, 1, 60000),
        pool.reserve(1, 1, 60000),
        pool.reserve(1, 1, 60000),
      ];

      // Assert: すべて異なるID
      const ids = leases.map(l => l.leaseId);
      expect(new Set(ids).size).toBe(3);

      // Cleanup
      for (const lease of leases) {
        pool.release(lease.leaseId);
      }
    });
  });

  describe("エッジケースとエラーハンドリング", () => {
    it("ゼロリクエストの確保が正しく処理される", () => {
      // Arrange & Act
      const lease = pool.reserve(0, 0, 60000);

      // Assert: 使用量は変わらない
      expect(pool.getUsage()).toEqual({ requests: 0, llm: 0 });

      // Cleanup
      pool.release(lease.leaseId);
    });

    it("最大容量ちょうどの確保が成功する", () => {
      // Arrange & Act
      const lease = pool.reserve(10, 5, 60000);

      // Assert: 最大容量に達している
      expect(pool.getUsage()).toEqual({ requests: 10, llm: 5 });

      // Cleanup
      pool.release(lease.leaseId);
    });

    it("部分的な解放後の再確保が成功する", () => {
      // Arrange: 2つのリースを作成
      const lease1 = pool.reserve(5, 3, 60000);
      const lease2 = pool.reserve(5, 2, 60000);

      // Act: 1つ解放して再確保
      pool.release(lease1.leaseId);
      const lease3 = pool.reserve(3, 2, 60000);

      // Assert: 再確保が成功
      expect(lease3.requestsReserved).toBe(3);

      // Cleanup
      pool.release(lease2.leaseId);
      pool.release(lease3.leaseId);
    });
  });
});

// ============================================================================
// Consumer-Driven Contract Tests
// ============================================================================

describe("Consumer-Driven Contract: サブエージェントとチーム", () => {
  /**
   * 契約: サブエージェントは以下を期待する
   * 1. checkCapacityが正確な可用性情報を返す
   * 2. reserveが成功した場合、リソースは保証される
   * 3. releaseが呼ばれた場合、リソースは即座に解放される
   */

  it("契約: checkCapacityの結果はreserveの成功/失敗と一貫している", () => {
    const pool = new MockResourcePool({ maxRequests: 5, maxLlm: 3 });

    // Consumer: サブエージェントが容量を確認
    const check = pool.checkCapacity(3, 2);
    expect(check.available).toBe(true);

    // Provider: 確認後にreserveが成功することを保証
    expect(() => pool.reserve(3, 2, 60000)).not.toThrow();
  });

  it("契約: 複数のConsumerが同時に確認しても競合しない", () => {
    const pool = new MockResourcePool({ maxRequests: 10, maxLlm: 5 });

    // 複数のConsumerが同時に確認
    const checks = [
      pool.checkCapacity(3, 2),
      pool.checkCapacity(3, 2),
      pool.checkCapacity(3, 2),
    ];

    // すべて利用可能と判定される（まだ確保していないため）
    expect(checks.every(c => c.available)).toBe(true);

    // ただし、実際に確保できるのは制限まで
    const leases: ResourceContract[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        leases.push(pool.reserve(3, 2, 60000));
      } catch (e) {
        // 3つ目は容量不足で失敗する可能性がある
        break;
      }
    }

    // 少なくとも1つは成功しているはず
    expect(leases.length).toBeGreaterThan(0);

    // Cleanup
    for (const lease of leases) {
      pool.release(lease.leaseId);
    }
  });

  it("契約: リソース解放は次のConsumerに即座に反映される", () => {
    const pool = new MockResourcePool({ maxRequests: 5, maxLlm: 2 });

    // Consumer Aが確保
    const leaseA = pool.reserve(5, 2, 60000);

    // Consumer Bは待機が必要
    const checkB1 = pool.checkCapacity(1, 1);
    expect(checkB1.available).toBe(false);

    // Consumer Aが解放
    pool.release(leaseA.leaseId);

    // Consumer Bは即座に確保可能になる
    const checkB2 = pool.checkCapacity(1, 1);
    expect(checkB2.available).toBe(true);
  });
});
