/**
 * @file .pi/lib/tool-contracts.ts の単体テスト
 * @description 共通ツール契約 helper の schema と検証を確認する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  createBoundedOptionalNumberSchema,
  createOptionalEnumStringSchema,
  createOptionalStringArraySchema,
  createTargetSelectorSchema,
  requireTargetSelector,
} from "../../../.pi/lib/tool-contracts.js";

describe("tool-contracts", () => {
  it("selector schema は id/name を持つ", () => {
    const schema = createTargetSelectorSchema({
      idKey: "tool_id",
      nameKey: "tool_name",
      idDescription: "ツールID",
      nameDescription: "ツール名",
    });

    expect(schema.properties.tool_id).toBeDefined();
    expect(schema.properties.tool_name).toBeDefined();
  });

  it("selector 検証は片側必須を要求する", () => {
    expect(requireTargetSelector({}, "tool_id", "tool_name", "run_dynamic_tool")).toEqual({
      success: false,
      error: "エラー: tool_id または tool_name を指定してください (run_dynamic_tool)",
    });

    expect(requireTargetSelector({ tool_id: "abc" }, "tool_id", "tool_name", "run_dynamic_tool")).toEqual({
      success: true,
    });
  });

  it("境界付き optional number schema を返す", () => {
    const schema = createBoundedOptionalNumberSchema("最大表示件数", 1, 100);
    expect(schema.type).toBe("number");
    expect(schema.minimum).toBe(1);
    expect(schema.maximum).toBe(100);
    expect(schema.description).toBe("最大表示件数");
  });

  it("optional string array schema を返す", () => {
    const schema = createOptionalStringArraySchema("ID一覧");
    expect(schema.type).toBe("array");
    expect(schema.description).toBe("ID一覧");
  });

  it("optional enum string schema を返す", () => {
    const schema = createOptionalEnumStringSchema("Topology", [
      "parallel",
      "sequential",
      "hierarchical",
    ]);
    expect(schema.anyOf).toHaveLength(3);
    expect(schema.description).toBe("Topology");
  });
});
