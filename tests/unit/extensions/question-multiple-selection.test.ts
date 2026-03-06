/**
 * @file .pi/extensions/question.ts の複数選択 helper テスト
 * @description multiple=true の回答合成と結果文言を検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  buildQuestionAnswers,
  formatQuestionResultText,
} from "../../../.pi/extensions/question.js";

describe("question multiple selection helpers", () => {
  it("選択肢と自由入力を順序付きで回答配列にまとめる", () => {
    const answers = buildQuestionAnswers(
      [
        { label: "Option A" },
        { label: "Option B" },
        { label: "Type something.", isOther: true },
      ],
      [1, 0],
      ["custom note"],
    );

    expect(answers).toEqual(["Option A", "Option B", "custom note"]);
  });

  it("multiple 結果文言を 1 行で整形する", () => {
    const text = formatQuestionResultText(
      {
        answers: ["Option A", "Option C", "custom note"],
        selectedIndexes: [0, 2],
        wasCustom: true,
      },
      true,
    );

    expect(text).toBe("User selected: Option A, Option C, custom note");
  });

  it("単一の自由入力は wrote 形式で返す", () => {
    const text = formatQuestionResultText(
      {
        answers: ["typed answer"],
        selectedIndexes: [],
        wasCustom: true,
      },
      false,
    );

    expect(text).toBe("User wrote: typed answer");
  });
});
