/**
 * @abdd.meta
 * path: tests/unit/extensions/search/utils/metrics.test.ts
 * role: メトリクス収集・集計機能のテスト
 * why: 検索パフォーマンス計測の正確性を保証し、パフォーマンス劣化を早期検出するため
 * related: .pi/extensions/search/utils/metrics.ts, .pi/extensions/search/core/index.ts
 * public_api: MetricsCollector, aggregateMetrics, formatMetrics, classifySpeed
 * invariants: durationMsは0以上、filesSearchedは0以上、indexHitRateは0.0から1.0の範囲
 * side_effects: performance.now()を呼び出し、時間計測を行う
 * failure_modes: performance.now()が利用できない環境でのテスト失敗、浮動小数点精度
 * @abdd.explain
 * overview: 検索メトリクスの収集・集計・フォーマット機能をテストする
 * what_it_does:
 *   - MetricsCollectorクラスの時間計測・ファイル数設定・インデックス命中率設定をテスト
 *   - aggregateMetrics関数の集計ロジックをテスト
 *   - formatMetrics関数の出力フォーマットをテスト
 *   - classifySpeed関数の分類ロジックをテスト
 * why_it_exists:
 *   - メトリクス収集の正確性を保証し、パフォーマンス劣化を早期検出するため
 *   - メトリクス表示機能の正確性を保証し、ユーザーに正しい情報を提供するため
 * scope:
 *   in: MetricsCollectorクラス、集計関数、フォーマット関数、分類関数
 *   out: テストの実行結果、各関数の動作検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  MetricsCollector,
  aggregateMetrics,
  formatMetrics,
  formatDuration,
  classifySpeed,
  DEFAULT_THRESHOLDS,
  SearchMetrics,
  AggregatedMetrics,
  PerformanceThresholds,
  ExtendedSearchMetrics,
} from '@ext/search/utils/metrics';

beforeEach(() => {
  vi.useRealTimers();
});

describe('MetricsCollector', () => {
  describe('constructor', () => {
    it('正常系: ツール名を設定してインスタンスを生成できる', () => {
      const collector = new MetricsCollector('test-tool');
      expect(collector).toBeInstanceOf(MetricsCollector);
    });

    it('正常系: 開始時刻を記録する', () => {
      const beforeCreate = performance.now();
      const collector = new MetricsCollector('test-tool');
      const afterCreate = performance.now();

      // 開始時刻は作成時刻とほぼ同じであるはず
      const elapsed = collector.elapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(afterCreate - beforeCreate + 100); // +100msはマージン
    });
  });

  describe('setFilesSearched', () => {
    it('正常系: ファイル数を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setFilesSearched(10);

      expect(result).toBe(collector);
      expect(result).toBeInstanceOf(MetricsCollector);
    });

    it('正常系: 0を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setFilesSearched(0);

      expect(result).toBe(collector);
    });

    it('正常系: 大きな数値を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setFilesSearched(1000000);

      expect(result).toBe(collector);
    });

    it('正常系: メソッドチェーンができる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector
        .setFilesSearched(10)
        .setFilesSearched(20);

      expect(result).toBe(collector);
    });

    it('PBT: 任意の非負整数を設定できる', () => {
      fc.assert(fc.property(
        fc.nat(),
        (count) => {
          const collector = new MetricsCollector('test-tool');
          const result = collector.setFilesSearched(count);
          return result === collector;
        }
      ));
    });
  });

  describe('setIndexHitRate', () => {
    it('正常系: インデックス命中率を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setIndexHitRate(0.8);

      expect(result).toBe(collector);
      expect(result).toBeInstanceOf(MetricsCollector);
    });

    it('正常系: 0.0を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setIndexHitRate(0.0);

      expect(result).toBe(collector);
    });

    it('正常系: 1.0を設定できる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector.setIndexHitRate(1.0);

      expect(result).toBe(collector);
    });

    it('正常系: メソッドチェーンができる', () => {
      const collector = new MetricsCollector('test-tool');
      const result = collector
        .setIndexHitRate(0.5)
        .setIndexHitRate(0.8);

      expect(result).toBe(collector);
    });

    it('境界値: 0.0未満の値を設定しても、finish時に問題ない', () => {
      const collector = new MetricsCollector('test-tool');
      collector.setIndexHitRate(-0.1);
      const metrics = collector.finish();

      // TypeScriptの型定義では0.0〜1.0を期待するが、実装ではそのまま渡される
      expect(metrics.indexHitRate).toBe(-0.1);
    });

    it('境界値: 1.0超過の値を設定しても、finish時に問題ない', () => {
      const collector = new MetricsCollector('test-tool');
      collector.setIndexHitRate(1.5);
      const metrics = collector.finish();

      expect(metrics.indexHitRate).toBe(1.5);
    });

    it('PBT: 任意の数値を設定できる', () => {
      fc.assert(fc.property(
        fc.float(),
        (rate) => {
          const collector = new MetricsCollector('test-tool');
          const result = collector.setIndexHitRate(rate);
          return result === collector;
        }
      ));
    });
  });

  describe('elapsedMs', () => {
    it('正常系: 経過時間を取得できる', async () => {
      const collector = new MetricsCollector('test-tool');
      const elapsed1 = collector.elapsedMs();

      await new Promise((resolve) => setTimeout(resolve, 50));
      const elapsed2 = collector.elapsedMs();

      expect(elapsed2).toBeGreaterThan(elapsed1);
      expect(elapsed2 - elapsed1).toBeGreaterThanOrEqual(40); // 50ms - マージン
    });

    it('正常系: 0ms付近から始まる', () => {
      const collector = new MetricsCollector('test-tool');
      const elapsed = collector.elapsedMs();

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(100); // 作成時のオーバーヘッドを許容
    });

    it('正常系: 複数回呼び出しても一貫性がある', async () => {
      const collector = new MetricsCollector('test-tool');
      await new Promise((resolve) => setTimeout(resolve, 10));

      const elapsed1 = collector.elapsedMs();
      const elapsed2 = collector.elapsedMs();

      // 同じ時点での呼び出しは似た値を返すはず
      expect(Math.abs(elapsed2 - elapsed1)).toBeLessThan(10);
    });
  });

  describe('finish', () => {
    it('正常系: メトリクスオブジェクトを返す', () => {
      const collector = new MetricsCollector('test-tool');
      collector.setFilesSearched(10);
      collector.setIndexHitRate(0.8);

      const metrics = collector.finish();

      expect(metrics).toMatchObject({
        toolName: 'test-tool',
        filesSearched: 10,
        indexHitRate: 0.8,
      });
      expect(typeof metrics.durationMs).toBe('number');
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('正常系: durationMsを含む', async () => {
      const collector = new MetricsCollector('test-tool');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const metrics = collector.finish();

      expect(metrics.durationMs).toBeGreaterThan(40);
    });

    it('正常系: indexHitRateを設定しない場合はundefined', () => {
      const collector = new MetricsCollector('test-tool');
      collector.setFilesSearched(10);

      const metrics = collector.finish();

      expect(metrics.indexHitRate).toBeUndefined();
    });

    it('正常系: filesSearchedを設定しない場合は0', () => {
      const collector = new MetricsCollector('test-tool');

      const metrics = collector.finish();

      expect(metrics.filesSearched).toBe(0);
    });

    it('PBT: finishは常に有効なSearchMetricsを返す', () => {
      fc.assert(fc.property(
        fc.nat(),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (filesSearched, toolName) => {
          const collector = new MetricsCollector(toolName);
          collector.setFilesSearched(filesSearched);

          const metrics = collector.finish();

          return (
            typeof metrics.durationMs === 'number' &&
            metrics.durationMs >= 0 &&
            metrics.filesSearched === filesSearched &&
            metrics.toolName === toolName &&
            metrics.indexHitRate === undefined
          );
        }
      ));
    });

    it('PBT: finishはindexHitRateを正しく設定できる', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (indexHitRate, toolName) => {
          const collector = new MetricsCollector(toolName);
          collector.setIndexHitRate(indexHitRate);

          const metrics = collector.finish();

          return (
            typeof metrics.durationMs === 'number' &&
            metrics.durationMs >= 0 &&
            metrics.filesSearched === 0 &&
            metrics.toolName === toolName &&
            metrics.indexHitRate === indexHitRate
          );
        }
      ));
    });
  });

  describe('統合テスト', () => {
    it('正常系: 完全なワークフローを実行できる', async () => {
      const collector = new MetricsCollector('code-search');
      collector.setFilesSearched(100);
      collector.setIndexHitRate(0.85);

      await new Promise((resolve) => setTimeout(resolve, 30));

      const metrics = collector.finish();

      expect(metrics.toolName).toBe('code-search');
      expect(metrics.filesSearched).toBe(100);
      expect(metrics.indexHitRate).toBe(0.85);
      expect(metrics.durationMs).toBeGreaterThan(20);
    });

    it('正常系: 複数のメトリクスを収集できる', async () => {
      const metrics: SearchMetrics[] = [];

      for (let i = 0; i < 3; i++) {
        const collector = new MetricsCollector(`tool-${i}`);
        collector.setFilesSearched(i * 10);
        if (i > 0) {
          collector.setIndexHitRate(0.5 + i * 0.1);
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
        metrics.push(collector.finish());
      }

      expect(metrics).toHaveLength(3);
      expect(metrics[0].filesSearched).toBe(0);
      expect(metrics[1].filesSearched).toBe(10);
      expect(metrics[2].filesSearched).toBe(20);
    });
  });
});

describe('aggregateMetrics', () => {
  describe('空の配列', () => {
    it('正常系: 空の配列でゼロ統計を返す', () => {
      const result = aggregateMetrics([]);

      expect(result).toMatchObject({
        operationCount: 0,
        totalDurationMs: 0,
        averageDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        totalFilesSearched: 0,
        byTool: {},
      });
      expect(result.averageIndexHitRate).toBeUndefined();
    });
  });

  describe('単一のメトリクス', () => {
    it('正常系: 単一のメトリクスを集計できる', () => {
      const metrics: SearchMetrics[] = [
        {
          durationMs: 100,
          filesSearched: 10,
          indexHitRate: 0.8,
          toolName: 'tool-1',
        },
      ];

      const result = aggregateMetrics(metrics);

      expect(result).toMatchObject({
        operationCount: 1,
        totalDurationMs: 100,
        averageDurationMs: 100,
        minDurationMs: 100,
        maxDurationMs: 100,
        totalFilesSearched: 10,
        averageIndexHitRate: 0.8,
      });
      expect(result.byTool['tool-1']).toMatchObject({
        count: 1,
        totalDurationMs: 100,
        averageDurationMs: 100,
      });
    });
  });

  describe('複数のメトリクス', () => {
    it('正常系: 複数のメトリクスを集計できる', () => {
      const metrics: SearchMetrics[] = [
        {
          durationMs: 100,
          filesSearched: 10,
          indexHitRate: 0.8,
          toolName: 'tool-1',
        },
        {
          durationMs: 200,
          filesSearched: 20,
          indexHitRate: 0.9,
          toolName: 'tool-1',
        },
        {
          durationMs: 150,
          filesSearched: 15,
          indexHitRate: 0.85,
          toolName: 'tool-2',
        },
      ];

      const result = aggregateMetrics(metrics);

      expect(result.operationCount).toBe(3);
      expect(result.totalDurationMs).toBe(450);
      expect(result.averageDurationMs).toBe(150);
      expect(result.minDurationMs).toBe(100);
      expect(result.maxDurationMs).toBe(200);
      expect(result.totalFilesSearched).toBe(45);
      expect(result.averageIndexHitRate).toBeCloseTo(0.85, 5);

      expect(result.byTool['tool-1']).toMatchObject({
        count: 2,
        totalDurationMs: 300,
        averageDurationMs: 150,
      });
      expect(result.byTool['tool-2']).toMatchObject({
        count: 1,
        totalDurationMs: 150,
        averageDurationMs: 150,
      });
    });

    it('正常系: indexHitRateなしのメトリクスを含む集計', () => {
      const metrics: SearchMetrics[] = [
        {
          durationMs: 100,
          filesSearched: 10,
          indexHitRate: 0.8,
          toolName: 'tool-1',
        },
        {
          durationMs: 200,
          filesSearched: 20,
          toolName: 'tool-1',
        },
      ];

      const result = aggregateMetrics(metrics);

      expect(result.operationCount).toBe(2);
      expect(result.averageIndexHitRate).toBe(0.8); // 有効な値のみで平均化
    });
  });

  describe('プロパティベーステスト', () => {
    it('PBT: 統計値は常に整合している', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            durationMs: fc.nat({ max: 10000 }),
            filesSearched: fc.nat({ max: 1000 }),
            indexHitRate: fc.option(fc.float({ min: 0, max: 1 })),
            toolName: fc.string(),
          }),
          { minLength: 0, maxLength: 100 }
        ),
        (metrics) => {
          const result = aggregateMetrics(metrics);

          // 基本的な整合性チェック
          return (
            result.operationCount === metrics.length &&
            result.totalDurationMs === metrics.reduce((sum, m) => sum + m.durationMs, 0) &&
            result.totalFilesSearched === metrics.reduce((sum, m) => sum + m.filesSearched, 0) &&
            result.minDurationMs <= result.maxDurationMs
          );
        }
      ));
    });

    it('PBT: byToolの集計は正しい', () => {
      fc.assert(fc.property(
        fc.array(
          fc.record({
            durationMs: fc.nat(),
            filesSearched: fc.nat(),
            indexHitRate: fc.option(fc.float({ min: 0, max: 1 })),
            toolName: fc.string(),
          })
        ),
        (metrics) => {
          const result = aggregateMetrics(metrics);

          // byToolの集計が正しいかチェック
          for (const toolName of Object.keys(result.byTool)) {
            const toolMetrics = metrics.filter(m => m.toolName === toolName);
            const toolSummary = result.byTool[toolName];

            if (
              toolSummary.count !== toolMetrics.length ||
              toolSummary.totalDurationMs !== toolMetrics.reduce((sum, m) => sum + m.durationMs, 0)
            ) {
              return false;
            }
          }

          return true;
        }
      ));
    });
  });
});

describe('formatMetrics', () => {
  it('正常系: 基本的なメトリクスをフォーマットできる', () => {
    const metrics: SearchMetrics = {
      durationMs: 1000,
      filesSearched: 10,
      indexHitRate: 0.8,
      toolName: 'test-tool',
    };

    const result = formatMetrics(metrics);

    expect(result).toContain('Tool: test-tool');
    expect(result).toContain('Duration: 1.00s');
    expect(result).toContain('Files searched: 10');
    expect(result).toContain('Index hit rate: 80.0%');
  });

  it('正常系: indexHitRateなしでフォーマットできる', () => {
    const metrics: SearchMetrics = {
      durationMs: 1000,
      filesSearched: 10,
      toolName: 'test-tool',
    };

    const result = formatMetrics(metrics);

    expect(result).toContain('Tool: test-tool');
    expect(result).toContain('Duration: 1.00s');
    expect(result).toContain('Files searched: 10');
    expect(result).not.toContain('Index hit rate:');
  });

  it('PBT: 常に文字列を返す', () => {
    fc.assert(fc.property(
      fc.record({
        durationMs: fc.nat(),
        filesSearched: fc.nat(),
        indexHitRate: fc.option(fc.float({ min: 0, max: 1 })),
        toolName: fc.string(),
      }),
      (metrics) => {
        const result = formatMetrics(metrics);
        return typeof result === 'string' && result.length > 0;
      }
    ));
  });
});

describe('formatDuration', () => {
  it('正常系: マイクロ秒単位の時間をフォーマットする', () => {
    expect(formatDuration(0.1)).toBe('100us');
    expect(formatDuration(0.5)).toBe('500us');
    expect(formatDuration(0.999)).toBe('999us');
  });

  it('正常系: ミリ秒単位の時間をフォーマットする', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(100)).toBe('100ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('正常系: 秒単位の時間をフォーマットする', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(59000)).toBe('59.00s');
  });

  it('正常系: 分単位の時間をフォーマットする', () => {
    expect(formatDuration(60000)).toBe('1.0m');
    expect(formatDuration(90000)).toBe('1.5m');
    expect(formatDuration(120000)).toBe('2.0m');
  });

  it('境界値: 0秒をフォーマットする', () => {
    expect(formatDuration(0)).toBe('0us');
  });

  it('PBT: 常に文字列を返す', () => {
    fc.assert(fc.property(
      fc.nat(),
      (ms) => {
        const result = formatDuration(ms);
        return typeof result === 'string' && result.length > 0;
      }
    ));
  });
});

describe('classifySpeed', () => {
  const customThresholds: PerformanceThresholds = {
    fast: 50,
    normal: 500,
    slow: 2000,
  };

  it('正常系: fastに分類される', () => {
    expect(classifySpeed(50, DEFAULT_THRESHOLDS)).toBe('fast');
    expect(classifySpeed(99, DEFAULT_THRESHOLDS)).toBe('fast');
    expect(classifySpeed(0, DEFAULT_THRESHOLDS)).toBe('fast');
  });

  it('正常系: normalに分類される', () => {
    expect(classifySpeed(100, DEFAULT_THRESHOLDS)).toBe('normal');
    expect(classifySpeed(500, DEFAULT_THRESHOLDS)).toBe('normal');
    expect(classifySpeed(999, DEFAULT_THRESHOLDS)).toBe('normal');
  });

  it('正常系: slowに分類される', () => {
    expect(classifySpeed(1000, DEFAULT_THRESHOLDS)).toBe('slow');
    expect(classifySpeed(3000, DEFAULT_THRESHOLDS)).toBe('slow');
    expect(classifySpeed(4999, DEFAULT_THRESHOLDS)).toBe('slow');
  });

  it('正常系: very-slowに分類される', () => {
    expect(classifySpeed(5000, DEFAULT_THRESHOLDS)).toBe('very-slow');
    expect(classifySpeed(10000, DEFAULT_THRESHOLDS)).toBe('very-slow');
  });

  it('正常系: カスタムしきい値で分類する', () => {
    expect(classifySpeed(30, customThresholds)).toBe('fast');
    expect(classifySpeed(100, customThresholds)).toBe('normal');
    expect(classifySpeed(1000, customThresholds)).toBe('slow');
    expect(classifySpeed(3000, customThresholds)).toBe('very-slow');
  });

  it('境界値: 各カテゴリの境界で正しく分類される', () => {
    expect(classifySpeed(99, DEFAULT_THRESHOLDS)).toBe('fast');
    expect(classifySpeed(100, DEFAULT_THRESHOLDS)).toBe('normal');
    expect(classifySpeed(999, DEFAULT_THRESHOLDS)).toBe('normal');
    expect(classifySpeed(1000, DEFAULT_THRESHOLDS)).toBe('slow');
    expect(classifySpeed(4999, DEFAULT_THRESHOLDS)).toBe('slow');
    expect(classifySpeed(5000, DEFAULT_THRESHOLDS)).toBe('very-slow');
  });

  it('PBT: 常に有効なカテゴリを返す', () => {
    fc.assert(fc.property(
      fc.nat(),
      (durationMs) => {
        const result = classifySpeed(durationMs);
        return ['fast', 'normal', 'slow', 'very-slow'].includes(result);
      }
    ));
  });

  it('PBT: しきい値に対して単調性がある', () => {
    fc.assert(fc.property(
      fc.nat(),
      fc.nat(),
      (ms1, ms2) => {
        const speed1 = classifySpeed(ms1, DEFAULT_THRESHOLDS);
        const speed2 = classifySpeed(ms2, DEFAULT_THRESHOLDS);

        if (ms1 <= ms2) {
          // ms1 <= ms2なら、speed1はspeed2より遅くない
          const order = ['fast', 'normal', 'slow', 'very-slow'];
          return order.indexOf(speed1) <= order.indexOf(speed2);
        }
        return true;
      }
    ));
  });
});
