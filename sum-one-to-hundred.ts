/**
 * @abdd.meta
 * path: sum-one-to-hundred.ts
 * role: utility
 * why: 等差数列の和を計算する基本的な数学関数の実装例
 * related: test-engineering, abdd
 * public_api: sumRange
 * invariants: start <= end, start >= 1, end >= 1
 * side_effects: none
 * failure_modes: start > end の場合はエラーを投げる
 */

/**
 * 指定された範囲の整数の合計を計算する
 * @param start - 開始値（デフォルト: 1）
 * @param end - 終了値（デフォルト: 100）
 * @returns 範囲内の整数の合計値
 * @throws start が end より大きい場合にエラー
 *
 * @example
 * ```ts
 * sumRange(1, 100); // 5050
 * sumRange();      // 5050
 * sumRange(1, 10); // 55
 * ```
 *
 * 等差数列の和の公式: n(n+1)/2
 * 1からendまでの合計: end * (end + 1) / 2
 * startからendまでの合計: sum(1,end) - sum(1,start-1)
 */
export function sumRange(start: number = 1, end: number = 100): number {
  if (start > end) {
    throw new Error(`開始値(${start})が終了値(${end})より大きいです`);
  }
  if (start < 1) {
    throw new Error(`開始値は1以上である必要があります: ${start}`);
  }

  const sumToEnd = (end * (end + 1)) / 2;
  const sumToStartMinusOne = ((start - 1) * start) / 2;

  return sumToEnd - sumToStartMinusOne;
}

/**
 * 1から100までの合計を計算する（簡易版）
 * @returns 5050
 */
export function sumOneToHundred(): number {
  return sumRange(1, 100);
}
