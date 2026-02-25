/**
 * @abdd.meta
 * path: .pi/lib/resource-tracker.ts
 * role: リソースリーク検出とトラッキングを行うユーティリティ
 * why: ファイルディスクリプタ、メモリ、その他のリソースのリークを検出し、デバッグを支援するため
 * related: .pi/lib/errors.ts, .pi/lib/storage-lock.ts
 * public_api: ResourceTracker, withFileDescriptor, withTrackedResource
 * invariants: すべてのtrack呼び出しは対応するrelease呼び出しが必要
 * side_effects: リソースのオープン/クローズ、エラーログの出力
 * failure_modes: 二重解放、未解放リソースの検出
 * @abdd.explain
 * overview: リソースのライフサイクルを追跡し、リークを検出するトラッキングシステム
 * what_it_does:
 *   - リソースのオープン/クローズを追跡する
 *   - 未解放のリソースを検出して報告する
 *   - スタックトレースを記録してデバッグを支援する
 * why_it_exists:
 *   - リソースリークによる問題を早期に発見するため
 *   - 本番環境でのデバッグを容易にするため
 * scope:
 *   in: リソースタイプ、リソースID、スタックトレース
 *   out: リークレポート、トラッキングID
 */

/**
 * Resource Tracker - Detects resource leaks and tracks resource lifecycle.
 *
 * Phase 3.1: Safety Property - No Resource Leaks
 *
 * Usage:
 * ```typescript
 * const tracker = ResourceTracker.getInstance();
 * const trackId = tracker.track('file_descriptor');
 * try {
 *   // use resource
 * } finally {
 *   tracker.release(trackId);
 * }
 * ```
 */

/**
 * トラッキングされたリソース情報
 * @summary リソース情報
 */
export interface TrackedResource {
  id: number;
  type: string;
  openedAt: Date;
  stackTrace: string;
  metadata?: Record<string, unknown>;
}

/**
 * リーク情報
 * @summary リーク情報
 */
export interface ResourceLeak {
  id: number;
  type: string;
  openedAt: Date;
  ageMs: number;
  stackTrace: string;
  metadata?: Record<string, unknown>;
}

/**
 * リソーストラッカークラス
 * @summary リソーストラッカー
 */
export class ResourceTracker {
  private static instance: ResourceTracker | null = null;
  private resources = new Map<number, TrackedResource>();
  private nextId = 0;
  private enabled = true;

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   * @summary インスタンス取得
   * @returns リソーストラッカーインスタンス
   */
  static getInstance(): ResourceTracker {
    if (!ResourceTracker.instance) {
      ResourceTracker.instance = new ResourceTracker();
    }
    return ResourceTracker.instance;
  }

  /**
   * トラッキングを有効/無効化
   * @summary トラッキング設定
   * @param enabled - 有効にするかどうか
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * リソースをトラッキング開始
   * @summary リソース追跡開始
   * @param type - リソースタイプ（例: 'file_descriptor', 'database_connection'）
   * @param metadata - 追加のメタデータ
   * @returns トラッキングID
   */
  track(type: string, metadata?: Record<string, unknown>): number {
    if (!this.enabled) {
      return -1;
    }

    const id = this.nextId++;
    const stackTrace = new Error().stack || 'unknown';
    
    this.resources.set(id, {
      id,
      type,
      openedAt: new Date(),
      stackTrace,
      metadata
    });

    return id;
  }

  /**
   * リソースのトラッキングを終了
   * @summary リソース解放
   * @param id - トラッキングID
   * @throws 二重解放または無効なIDの場合にエラー
   */
  release(id: number): void {
    if (!this.enabled) {
      return;
    }

    if (id < 0) {
      return;
    }

    if (!this.resources.has(id)) {
      throw new Error(`Double-free or invalid release: tracking ID ${id}`);
    }
    
    this.resources.delete(id);
  }

  /**
   * 現在のリークを取得
   * @summary リーク取得
   * @param minAgeMs - 最小経過時間（ミリ秒）、これより新しいリークは除外
   * @returns リーク情報の配列
   */
  getLeaks(minAgeMs = 0): ResourceLeak[] {
    const now = Date.now();
    const leaks: ResourceLeak[] = [];

    for (const resource of this.resources.values()) {
      const ageMs = now - resource.openedAt.getTime();
      if (ageMs >= minAgeMs) {
        leaks.push({
          id: resource.id,
          type: resource.type,
          openedAt: resource.openedAt,
          ageMs,
          stackTrace: resource.stackTrace,
          metadata: resource.metadata
        });
      }
    }

    return leaks;
  }

  /**
   * リークの数を取得
   * @summary リーク数取得
   * @returns 現在のリーク数
   */
  getLeakCount(): number {
    return this.resources.size;
  }

  /**
   * タイプ別のリーク数を取得
   * @summary タイプ別リーク数
   * @returns タイプごとのリーク数のマップ
   */
  getLeakCountByType(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const resource of this.resources.values()) {
      const count = counts.get(resource.type) || 0;
      counts.set(resource.type, count + 1);
    }
    return counts;
  }

  /**
   * すべてのトラッキングをクリア（テスト用）
   * @summary トラッキングクリア
   */
  clear(): void {
    this.resources.clear();
    this.nextId = 0;
  }

  /**
   * リークサマリーを生成
   * @summary リークサマリー
   * @returns 人間が読める形式のサマリー
   */
  getLeakSummary(): string {
    const leaks = this.getLeaks();
    if (leaks.length === 0) {
      return 'No resource leaks detected.';
    }

    const lines: string[] = [`Resource Leaks Detected (${leaks.length} total):`];
    const byType = this.getLeakCountByType();
    
    for (const [type, count] of byType) {
      lines.push(`  - ${type}: ${count}`);
    }

    // 最も古いリークを表示
    const oldest = leaks.reduce((a, b) => a.ageMs > b.ageMs ? a : b);
    lines.push(`  Oldest: ${oldest.type} (age: ${Math.round(oldest.ageMs / 1000)}s)`);

    return lines.join('\n');
  }
}

/**
 * ファイルディスクリプタをトラッキング付きで使用
 * @summary ファイルディスクリプタ追跡
 * @param openFn - ファイルを開く関数
 * @param closeFn - ファイルを閉じる関数
 * @param fn - ファイルディスクリプタを使用する関数
 * @returns fnの戻り値
 */
export async function withTrackedResource<T>(
  openFn: () => Promise<number>,
  closeFn: (fd: number) => Promise<void>,
  fn: (fd: number) => Promise<T>
): Promise<T> {
  const tracker = ResourceTracker.getInstance();
  const fd = await openFn();
  const trackId = tracker.track('file_descriptor', { fd });
  
  try {
    return await fn(fd);
  } finally {
    await closeFn(fd);
    tracker.release(trackId);
  }
}

/**
 * 同期版のリソーストラッキング
 * @summary 同期リソース追跡
 * @param openFn - ファイルを開く関数
 * @param closeFn - ファイルを閉じる関数
 * @param fn - ファイルディスクリプタを使用する関数
 * @returns fnの戻り値
 */
export function withTrackedResourceSync<T>(
  openFn: () => number,
  closeFn: (fd: number) => void,
  fn: (fd: number) => T
): T {
  const tracker = ResourceTracker.getInstance();
  const fd = openFn();
  const trackId = tracker.track('file_descriptor', { fd });
  
  try {
    return fn(fd);
  } finally {
    closeFn(fd);
    tracker.release(trackId);
  }
}

// グローバルにエクスポートして、プロセス終了時にリークを報告
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    const tracker = ResourceTracker.getInstance();
    const leaks = tracker.getLeaks(1000); // 1秒以上経過したリークのみ
    if (leaks.length > 0) {
      console.warn(tracker.getLeakSummary());
    }
  });
}
