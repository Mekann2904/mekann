# 実装計画: エージェント並列管理の安全プロパティ検証

## 目的

エージェント並列管理システムが定義された安全プロパティを満たしていることを証明し、証明できない場合はバグとして報告する。

---

## 1. 証明対象の安全プロパティ定義

### 1.1 容量安全（Capacity Safety）

| プロパティ | 形式的定義 | 検証箇所 |
|-----------|-----------|---------|
| **CS-1: 過剰コミット防止** | `∀t. projectedRequests(t) ≤ maxTotalActiveRequests` | `agent-runtime.ts:checkRuntimeCapacity()` |
| **CS-2: 予約TTL** | `∀r ∈ reservations. r.expiresAtMs - now ≤ maxTTL` | `agent-runtime.ts:createReservationLease()` |
| **CS-3: スイーパクリーンアップ** | `∀t. ∃t' > t. sweep(t') removes expired reservations` | `agent-runtime.ts:startReservationSweeper()` |

### 1.2 並列安全（Concurrency Safety）

| プロパティ | 形式的定義 | 検証箇所 |
|-----------|-----------|---------|
| **CC-1: 孤立ワーカーなし** | `∀w ∈ workers. error ⇒ w completes (success|failure)` | `concurrency.ts:runWithConcurrencyLimit()` |
| **CC-2: Abort伝播** | `abort(parent) ⇒ ∀child. abort(child) ∧ cleanup(child)` | `concurrency.ts:L40-80` |
| **CC-3: キュー上限** | `∀t. queue.size(t) ≤ maxQueueSize` | `agent-runtime.ts:enqueueRequest()` |

### 1.3 分散安全（Distributed Safety）

| プロパティ | 形式的定義 | 検証箇所 |
|-----------|-----------|---------|
| **DS-1: 原子的ロック取得** | `acquire(lock) ⇒ atomic(openSync("wx"))` | `cross-instance-coordinator.ts:tryAcquireLock()` |
| **DS-2: TOCTOU緩和** | `collision ⇒ backoff ∧ retry` | `cross-instance-coordinator.ts:L120-160` |
| **DS-3: 死んだインスタンス清理** | `∀i. heartbeat(i) > 60s ⇒ remove(i)` | `cross-instance-coordinator.ts:cleanupDeadInstances()` |

### 1.4 不変条件（Key Invariants）

| 不変条件 | 形式的定義 | 検証箇所 |
|---------|-----------|---------|
| **INV-1** | `limit ≥ 1` | `concurrency.ts:normalizeLimit()` |
| **INV-2** | `activeAgents ≥ 0` | `agent-runtime.ts:decrementActiveAgents()` |
| **INV-3** | `reservation.expiresAtMs > now` | `agent-runtime.ts:getActiveReservations()` |
| **INV-4** | `single(sweeper)` | `agent-runtime.ts:startReservationSweeper()` |
| **INV-5** | `release(lock) ⇒ owner(lock) = requester` | `cross-instance-coordinator.ts:releaseLock()` |

---

## 2. 証明方法

### 2.1 コード検査（Code Inspection）

**適用対象**: CS-1, DS-1, INV-1, INV-4, INV-5

**手順**:
1. 対象関数のソースコードを読む
2. 形式的定義に対応するコード箇所を特定
3. アサーション/ガード条件が正しく実装されているか確認
4. エッジケース（境界値）の処理を確認

**CS-1 検証コードスニペット**:
```typescript
// agent-runtime.ts - checkRuntimeCapacity()
function checkRuntimeCapacity(request: CapacityRequest): CapacityCheckResult {
  const projectedRequests = 
    state.activeRequestCount + 
    state.reservations.size + 
    (request.needsRequest ? 1 : 0);
  
  // INVARIANT CHECK: projectedRequests <= maxTotalActiveRequests
  if (projectedRequests > state.limits.maxTotalActiveRequests) {
    return { allowed: false, reasons: ["Capacity exceeded"] };
  }
  return { allowed: true, reservation: createReservation() };
}
```

**INV-1 検証コードスニペット**:
```typescript
// concurrency.ts - normalizeLimit()
function normalizeLimit(limit: number, itemCount: number): number {
  // INVARIANT: limit >= 1
  return Math.max(1, Math.min(limit, itemCount));
}
```

### 2.2 ユニットテスト（Unit Testing）

**適用対象**: CS-2, CS-3, INV-2, INV-3

**手順**:
1. テストケースを作成
2. 境界値・異常系をカバー
3. タイミング依存のテストはモックを使用

**CS-2 テストコードスニペット**:
```typescript
// tests/capacity-safety.test.ts
describe('Reservation TTL', () => {
  it('should auto-expire reservation after TTL', async () => {
    const lease = createReservationLease({ ttlMs: 100 });
    expect(lease.expiresAtMs - Date.now()).toBeLessThanOrEqual(100);
    
    await sleep(150);
    const activeReservations = getActiveReservations();
    expect(activeReservations.has(lease.id)).toBe(false);
  });
  
  it('should allow heartbeat extension', async () => {
    const lease = createReservationLease({ ttlMs: 100 });
    await sleep(50);
    lease.heartbeat(100); // Extend by 100ms
    
    await sleep(75); // Total 125ms < 200ms extended TTL
    expect(isReservationActive(lease.id)).toBe(true);
  });
});
```

**INV-2 テストコードスニペット**:
```typescript
// tests/invariants.test.ts
describe('ActiveAgents non-negative', () => {
  it('should never go below zero on decrement', () => {
    const state = createRuntimeState();
    state.activeAgents = 0;
    
    // Try to decrement below zero
    state.activeAgents = Math.max(0, state.activeAgents - 1);
    
    expect(state.activeAgents).toBe(0);
    expect(state.activeAgents).toBeGreaterThanOrEqual(0);
  });
});
```

### 2.3 レース条件テスト（Race Condition Testing）

**適用対象**: CC-1, CC-2, DS-2

**手順**:
1. 並列実行テストを作成
2. 高負荷状態で競合を誘発
3. 一貫性違反を検出

**CC-1 テストコードスニペット**:
```typescript
// tests/concurrency-safety.test.ts
describe('No dangling workers', () => {
  it('should complete all workers even after first error', async () => {
    const results: string[] = [];
    const items = [1, 2, 3, 4, 5];
    
    await runWithConcurrencyLimit(
      items,
      3,
      async (item, index, signal) => {
        await sleep(item * 10);
        if (item === 2) throw new Error('Worker 2 failed');
        results.push(`item-${item}`);
      },
      { abortOnFirstError: false }
    ).catch(() => {}); // Ignore aggregate error
    
    // All workers should have completed
    expect(results.length).toBe(4); // All except item 2
    expect(results).toContain('item-1');
    expect(results).toContain('item-3');
    expect(results).toContain('item-4');
    expect(results).toContain('item-5');
  });
});
```

**DS-2 テストコードスニペット**:
```typescript
// tests/distributed-safety.test.ts
describe('TOCTOU mitigation', () => {
  it('should retry with backoff on collision', async () => {
    const attempts: number[] = [];
    const mockOpenSync = jest.fn()
      .mockImplementationOnce(() => { throw { code: 'EEXIST' }; })
      .mockImplementationOnce(() => { throw { code: 'EEXIST' }; })
      .mockImplementationOnce(() => 42); // Success on 3rd attempt
    
    const result = await tryAcquireLock('test-resource', 1000, 5);
    
    expect(mockOpenSync).toHaveBeenCalledTimes(3);
    expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(10); // Exponential backoff
  });
});
```

### 2.4 統合テスト（Integration Testing）

**適用対象**: CS-3, DS-3, CC-3

**手順**:
1. 実際のファイルシステム/タイマーを使用
2. 複数コンポーネント間の相互作用を検証
3. 長時間実行テストでメモリリーク/リソースリークを検出

**DS-3 テストコードスニペット**:
```typescript
// tests/integration/dead-instance-cleanup.test.ts
describe('Dead instance cleanup', () => {
  it('should remove instances with stale heartbeat', async () => {
    // Register instance
    const coordinator = new CrossInstanceCoordinator();
    coordinator.registerInstance('test-session', '/test/cwd');
    
    // Verify registration
    const instances = getActiveInstances();
    expect(instances.some(i => i.sessionId === 'test-session')).toBe(true);
    
    // Simulate dead instance (no heartbeat for 60s)
    await sleep(65000);
    
    // Trigger cleanup
    coordinator.cleanupDeadInstances();
    
    // Verify removal
    const activeInstances = getActiveInstances();
    expect(activeInstances.some(i => i.sessionId === 'test-session')).toBe(false);
  }, 70000);
});
```

### 2.5 静的解析（Static Analysis）

**適用対象**: 全プロパティ

**手順**:
1. TypeScript strict modeを有効化
2. ESLintルールを適用
3. 制御フロー解析で未処理のパスを検出

**推奨ESLintルール**:
```json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/require-await": "error",
    "no-unsafe-finally": "error"
  }
}
```

---

## 3. 検証手順

### Phase 1: コード検査（1-2時間）

1. **CS-1, DS-1検証**
   - `agent-runtime.ts:checkRuntimeCapacity()` を読む
   - `cross-instance-coordinator.ts:tryAcquireLock()` を読む
   - アサーション/ガード条件を確認

2. **INV-1, INV-4, INV-5検証**
   - `concurrency.ts:normalizeLimit()` を読む
   - `agent-runtime.ts:startReservationSweeper()` を読む
   - `cross-instance-coordinator.ts:releaseLock()` を読む

### Phase 2: ユニットテスト作成（2-3時間）

1. テストファイル作成:
   - `tests/safety/capacity-safety.test.ts`
   - `tests/safety/concurrency-safety.test.ts`
   - `tests/safety/distributed-safety.test.ts`
   - `tests/safety/invariants.test.ts`

2. テスト実行:
   ```bash
   npm test -- tests/safety/
   ```

### Phase 3: レース条件テスト（2-3時間）

1. 並列実行テスト作成
2. 高負荷テスト実行:
   ```bash
   npm run test:stress -- --iterations 1000 --concurrency 100
   ```

### Phase 4: 統合テスト（1-2時間）

1. 実際のファイルシステムでテスト
2. 長時間実行テスト（メモリリーク検出）

### Phase 5: 静的解析（30分）

1. TypeScript strict mode確認
2. ESLint実行:
   ```bash
   npm run lint
   ```

---

## 4. バグ報告フォーマット

### バグ報告テンプレート

```markdown
# バグ報告: [安全プロパティ違反]

## 違反したプロパティ
- [ ] CS-1: 過剰コミット防止
- [ ] CS-2: 予約TTL
- [ ] CS-3: スイーパクリーンアップ
- [ ] CC-1: 孤立ワーカーなし
- [ ] CC-2: Abort伝播
- [ ] CC-3: キュー上限
- [ ] DS-1: 原子的ロック取得
- [ ] DS-2: TOCTOU緩和
- [ ] DS-3: 死んだインスタンス清理
- [ ] INV-1: limit >= 1
- [ ] INV-2: activeAgents >= 0
- [ ] INV-3: reservation.expiresAtMs > now
- [ ] INV-4: 単一スイーパ
- [ ] INV-5: ロック所有権

## 期待される動作
[安全プロパティが満たされるべき動作]

## 実際の動作
[観測された違反動作]

## 再現手順
1. [手順1]
2. [手順2]
3. [手順3]

## 再現コード
```typescript
// 最小再現コード
```

## 影響度
- [ ] Critical: データ損失/システムクラッシュ
- [ ] High: リソースリーク/デッドロック
- [ ] Medium: 一時的な不整合
- [ ] Low: パフォーマンス劣化

## 根本原因
[コードのどの部分が原因か]

## 提案される修正
[修正案]

## 関連ファイル
- [ファイルパス]: [影響範囲]
```

---

## 5. Todoリスト

### Phase 1: コード検査
- [ ] **TODO-1**: CS-1（過剰コミット防止）のコード検査
  - 対象: `agent-runtime.ts:checkRuntimeCapacity()`
  - 確認事項: `projectedRequests <= maxTotalActiveRequests` ガード条件

- [ ] **TODO-2**: DS-1（原子的ロック取得）のコード検査
  - 対象: `cross-instance-coordinator.ts:tryAcquireLock()`
  - 確認事項: `openSync(path, "wx")` の原子的実行

- [ ] **TODO-3**: INV-1（limit >= 1）のコード検査
  - 対象: `concurrency.ts:normalizeLimit()`
  - 確認事項: `Math.max(1, limit)` の適用

- [ ] **TODO-4**: INV-4（単一スイーパ）のコード検査
  - 対象: `agent-runtime.ts:startReservationSweeper()`
  - 確認事項: 二重起動防止フラグ

- [ ] **TODO-5**: INV-5（ロック所有権）のコード検査
  - 対象: `cross-instance-coordinator.ts:releaseLock()`
  - 確認事項: `lockId` 一致確認

### Phase 2: ユニットテスト作成
- [ ] **TODO-6**: CS-2（予約TTL）のテスト作成
  - ファイル: `tests/safety/capacity-safety.test.ts`
  - テストケース:
    ```typescript
    it('should auto-expire reservation after TTL', async () => {
      const lease = createReservationLease({ ttlMs: 100 });
      await sleep(150);
      expect(isReservationActive(lease.id)).toBe(false);
    });
    ```

- [ ] **TODO-7**: INV-2（activeAgents >= 0）のテスト作成
  - ファイル: `tests/safety/invariants.test.ts`
  - テストケース:
    ```typescript
    it('should never decrement below zero', () => {
      state.activeAgents = 0;
      state.activeAgents = Math.max(0, state.activeAgents - 1);
      expect(state.activeAgents).toBe(0);
    });
    ```

- [ ] **TODO-8**: INV-3（reservation.expiresAtMs > now）のテスト作成
  - ファイル: `tests/safety/invariants.test.ts`
  - テストケース:
    ```typescript
    it('should only count non-expired reservations', () => {
      const reservations = getActiveReservations();
      const now = Date.now();
      reservations.forEach(r => {
        expect(r.expiresAtMs).toBeGreaterThan(now);
      });
    });
    ```

### Phase 3: レース条件テスト
- [ ] **TODO-9**: CC-1（孤立ワーカーなし）のレース条件テスト
  - ファイル: `tests/safety/concurrency-safety.test.ts`
  - テストケース:
    ```typescript
    it('should complete all workers after first error', async () => {
      const completed: number[] = [];
      await runWithConcurrencyLimit(
        [1, 2, 3, 4, 5],
        3,
        async (item) => {
          await sleep(item * 10);
          if (item === 2) throw new Error('fail');
          completed.push(item);
        },
        { abortOnFirstError: false }
      ).catch(() => {});
      expect(completed.length).toBe(4);
    });
    ```

- [ ] **TODO-10**: CC-2（Abort伝播）のテスト作成
  - ファイル: `tests/safety/concurrency-safety.test.ts`
  - テストケース:
    ```typescript
    it('should propagate abort to all children', async () => {
      const aborted: boolean[] = [];
      const controller = new AbortController();
      
      const promise = runWithConcurrencyLimit(
        [1, 2, 3],
        3,
        async (item, _, signal) => {
          signal.addEventListener('abort', () => aborted.push(true));
          await sleep(1000);
        },
        { signal: controller.signal }
      );
      
      controller.abort();
      await promise.catch(() => {});
      expect(aborted.length).toBe(3);
    });
    ```

- [ ] **TODO-11**: DS-2（TOCTOU緩和）のテスト作成
  - ファイル: `tests/safety/distributed-safety.test.ts`
  - テストケース:
    ```typescript
    it('should retry with exponential backoff on collision', async () => {
      let attempts = 0;
      const mockOpen = jest.spyOn(fs, 'openSync')
        .mockImplementationOnce(() => { attempts++; throw { code: 'EEXIST' }; })
        .mockImplementationOnce(() => { attempts++; throw { code: 'EEXIST' }; })
        .mockImplementation(() => { attempts++; return 42; });
      
      await tryAcquireLock('test', 1000, 5);
      expect(attempts).toBe(3);
    });
    ```

### Phase 4: 統合テスト
- [ ] **TODO-12**: CS-3（スイーパクリーンアップ）の統合テスト
  - ファイル: `tests/integration/sweeper-cleanup.test.ts`
  - テストケース:
    ```typescript
    it('should periodically remove expired reservations', async () => {
      createReservationLease({ ttlMs: 100 });
      await sleep(5500); // Wait for sweeper cycle (5s)
      const active = getActiveReservations();
      expect(active.size).toBe(0);
    }, 10000);
    ```

- [ ] **TODO-13**: DS-3（死んだインスタンス清理）の統合テスト
  - ファイル: `tests/integration/dead-instance-cleanup.test.ts`
  - テストケース:
    ```typescript
    it('should remove instances without heartbeat for 60s', async () => {
      registerInstance('test-session', '/test');
      await sleep(65000);
      cleanupDeadInstances();
      expect(getActiveInstances()).not.toContain('test-session');
    }, 70000);
    ```

- [ ] **TODO-14**: CC-3（キュー上限）のテスト作成
  - ファイル: `tests/safety/concurrency-safety.test.ts`
  - テストケース:
    ```typescript
    it('should enforce max queue size', () => {
      for (let i = 0; i < 1001; i++) {
        enqueueRequest({ id: `req-${i}` });
      }
      expect(getQueueSize()).toBeLessThanOrEqual(1000);
    });
    ```

### Phase 5: 静的解析
- [ ] **TODO-15**: TypeScript strict mode確認
  - コマンド: `npx tsc --noEmit --strict`
  - 確認事項: エラーなし

- [ ] **TODO-16**: ESLint実行
  - コマンド: `npm run lint`
  - 確認事項: エラーなし

---

## 6. 成功基準

以下のすべてを満たした場合、安全プロパティが証明されたとみなす:

1. **コード検査**: 全12プロパティのコード検査完了
2. **ユニットテスト**: 全テストケース合格
3. **レース条件テスト**: 1000回反復で一貫性違反なし
4. **統合テスト**: 長時間実行テストでリソースリークなし
5. **静的解析**: TypeScript strict mode + ESLint エラーなし

---

## 7. 参照ファイル

| ファイル | 役割 |
|---------|-----|
| `.pi/extensions/agent-runtime.ts` | 容量管理・予約システム |
| `.pi/lib/concurrency.ts` | 並列プール・Abort伝播 |
| `.pi/lib/cross-instance-coordinator.ts` | 分散ロック・インスタンス管理 |
| `.pi/extensions/subagents.ts` | サブエージェント並列実行 |
| `.pi/extensions/agent-teams/team-orchestrator.ts` | チーム並列実行 |
| `research.md` | 調査結果レポート |

---

## 考慮事項

- **タイミング依存テスト**: モックまたはfake timersを使用して非決定性を排除
- **ファイルシステム競合**: テスト用の一時ディレクトリを使用
- **長時間テスト**: CIではshort mode、ローカルではfull modeで実行
- **並列テスト**: テスト間でグローバル状態を共有しない

---

## 次のアクション

1. Phase 1（コード検査）から開始
2. 各プロパティの検証結果を記録
3. バグを発見した場合はバグ報告フォーマットで記録
4. 全プロパティの検証完了後、最終レポートを作成
