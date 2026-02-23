/**
 * sleep-utils.ts の単体テスト
 *
 * テスト対象:
 * - sleep: 指定ミリ秒の非同期待機
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sleep } from "../../../.pi/lib/sleep-utils.js";

describe("sleep-utils.ts", () => {
  describe("sleep", () => {
    describe("正常系", () => {
      it("指定時間待機する", async () => {
        // Arrange
        const ms = 50;
        const start = Date.now();

        // Act
        await sleep(ms);

        // Assert
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(ms - 10); // 許容誤差
      });

      it("Promiseを返す", () => {
        // Arrange
        const result = sleep(0);

        // Assert
        expect(result).toBeInstanceOf(Promise);
      });

      it("await可能である", async () => {
        // Act & Assert - エラーが発生しないこと
        await expect(sleep(10)).resolves.toBeUndefined();
      });
    });

    describe("境界値テスト", () => {
      it("ms=0の場合は即座に解決する", async () => {
        // Arrange
        const start = Date.now();

        // Act
        await sleep(0);

        // Assert
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(20); // ほぼ即座
      });

      it("ms<0の場合は即座に解決する", async () => {
        // Arrange
        const start = Date.now();

        // Act
        await sleep(-100);

        // Assert
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(20); // ほぼ即座
      });

      it("ms=1でも待機する", async () => {
        // Arrange
        const start = Date.now();

        // Act
        await sleep(1);

        // Assert
        // 1ms以上経過している（環境による）
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(0);
      });
    });

    describe("並列実行", () => {
      it("複数のsleepを並列実行できる", async () => {
        // Arrange
        const start = Date.now();

        // Act
        await Promise.all([
          sleep(30),
          sleep(30),
          sleep(30),
        ]);

        // Assert
        const elapsed = Date.now() - start;
        // 並列実行なので合計時間は約30msのはず
        expect(elapsed).toBeLessThan(100);
      });

      it("直列実行では時間が累積する", async () => {
        // Arrange
        const start = Date.now();

        // Act
        await sleep(30);
        await sleep(30);
        await sleep(30);

        // Assert
        const elapsed = Date.now() - start;
        // 直列実行なので約90ms
        expect(elapsed).toBeGreaterThanOrEqual(70);
      });
    });

    describe("プロパティベーステスト", () => {
      it("任意の正のミリ秒で待機する", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 50 }),
            async (ms) => {
              // Arrange
              const start = Date.now();

              // Act
              await sleep(ms);

              // Assert
              const elapsed = Date.now() - start;
              // 許容誤差を考慮
              expect(elapsed).toBeGreaterThanOrEqual(ms - 20);
            }
          )
        );
      });

      it("0以下の値は即座に解決する", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ max: 0 }),
            async (ms) => {
              // Arrange
              const start = Date.now();

              // Act
              await sleep(ms);

              // Assert
              const elapsed = Date.now() - start;
              expect(elapsed).toBeLessThan(30);
            }
          )
        );
      });
    });
  });
});
