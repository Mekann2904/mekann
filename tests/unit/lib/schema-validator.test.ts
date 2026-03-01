/**
 * @file .pi/lib/schema-validator.ts の単体テスト
 * @description JSON Schemaバリデーションのテスト
 * @testFramework vitest
 *
 * モック/スタブ戦略:
 * - Solitary test: 外部依存なし（純粋関数）
 * - モック不要
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validateSchema,
  validateToolInput,
  validateToolSchemas,
  detectToolNameCollisions,
  type ToolDefinition,
  type SchemaValidationResult,
} from "@lib/schema-validator";

// ============================================================================
// テスト用ユーティリティ
// ============================================================================

/**
 * 有効なスキーマを生成
 */
function createValidSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name"],
  };
}

/**
 * 有効なツール定義を生成
 */
function createValidTool(name = "test-tool"): ToolDefinition {
  return {
    name,
    description: "Test tool",
    parameters: createValidSchema(),
    source: "test-source",
  };
}

// ============================================================================
// validateSchema
// ============================================================================

describe("validateSchema", () => {
  describe("正常系", () => {
    it("should_accept_valid_object_schema", () => {
      // Arrange
      const schema = createValidSchema();

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should_accept_schema_without_type", () => {
      // Arrange
      const schema = { properties: { name: { type: "string" } } };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_accept_schema_with_array_type", () => {
      // Arrange
      const schema = { type: ["string", "null"] };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_accept_empty_schema", () => {
      // Arrange
      const schema = {};

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_accept_enum_constraint", () => {
      // Arrange
      const schema = {
        type: "string",
        enum: ["active", "inactive"],
      };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });
  });

  describe("異常系", () => {
    it("should_reject_non_object_schema", () => {
      // Arrange
      const schema = "not an object";

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0].keyword).toBe("type");
    });

    it("should_reject_null_schema", () => {
      // Arrange
      const schema = null;

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_reject_array_schema", () => {
      // Arrange
      const schema = [1, 2, 3];

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_detect_invalid_type_field", () => {
      // Arrange
      const schema = { type: 123 }; // type should be string or array

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "/type")).toBe(true);
    });

    it("should_detect_invalid_properties_field", () => {
      // Arrange
      const schema = { properties: "not an object" };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "/properties")).toBe(true);
    });

    it("should_detect_invalid_required_field", () => {
      // Arrange
      const schema = { required: "not an array" };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "/required")).toBe(true);
    });

    it("should_detect_invalid_enum_field", () => {
      // Arrange
      const schema = { enum: "not an array" };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "/enum")).toBe(true);
    });
  });

  describe("境界値", () => {
    it("should_accept_undefined_schema", () => {
      // Arrange
      const schema = undefined;

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_handle_empty_object_schema", () => {
      // Arrange
      const schema = {};

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_accept_deeply_nested_schema", () => {
      // Arrange
      const schema = {
        type: "object",
        properties: {
          level1: {
            type: "object",
            properties: {
              level2: {
                type: "object",
                properties: {
                  level3: { type: "string" },
                },
              },
            },
          },
        },
      };

      // Act
      const result = validateSchema(schema);

      // Assert
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// validateToolInput
// ============================================================================

describe("validateToolInput", () => {
  describe("正常系", () => {
    it("should_accept_valid_input_matching_schema", () => {
      // Arrange
      const tool = createValidTool();
      const input = { name: "test", age: 25 };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should_accept_input_without_parameters_schema", () => {
      // Arrange
      const tool: ToolDefinition = { name: "no-params-tool" };
      const input = { any: "data" };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_accept_optional_fields_missing", () => {
      // Arrange
      const tool = createValidTool();
      const input = { name: "test" }; // age is optional

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_string_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "string-tool",
        parameters: { type: "object", properties: { value: { type: "string" } } },
      };
      const input = { value: "hello" };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_number_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "number-tool",
        parameters: { type: "object", properties: { value: { type: "number" } } },
      };
      const input = { value: 42.5 };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_integer_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "integer-tool",
        parameters: { type: "object", properties: { value: { type: "integer" } } },
      };
      const input = { value: 42 };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_boolean_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "boolean-tool",
        parameters: { type: "object", properties: { value: { type: "boolean" } } },
      };
      const input = { value: true };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_array_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "array-tool",
        parameters: {
          type: "object",
          properties: { items: { type: "array", items: { type: "string" } } },
        },
      };
      const input = { items: ["a", "b", "c"] };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("should_validate_null_type", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "null-tool",
        parameters: { type: "object", properties: { value: { type: "null" } } },
      };
      const input = { value: null };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(true);
    });
  });

  describe("異常系", () => {
    it("should_detect_missing_required_field", () => {
      // Arrange
      const tool = createValidTool();
      const input = { age: 25 }; // missing required 'name'

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
    });

    it("should_detect_type_mismatch_string", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "string-tool",
        parameters: { type: "object", properties: { value: { type: "string" } } },
      };
      const input = { value: 123 }; // number instead of string

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "type")).toBe(true);
    });

    it("should_detect_type_mismatch_number", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "number-tool",
        parameters: { type: "object", properties: { value: { type: "number" } } },
      };
      const input = { value: "not a number" };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_detect_integer_vs_float", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "integer-tool",
        parameters: { type: "object", properties: { value: { type: "integer" } } },
      };
      const input = { value: 42.5 }; // float instead of integer

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_detect_invalid_enum_value", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "enum-tool",
        parameters: {
          type: "object",
          properties: { status: { type: "string", enum: ["active", "inactive"] } },
        },
      };
      const input = { status: "unknown" };

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "enum")).toBe(true);
    });

    it("should_report_invalid_schema_in_tool", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "bad-schema-tool",
        parameters: { type: 123 }, // invalid schema
      };
      const input = {};

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });
  });

  describe("境界値", () => {
    it("should_handle_null_input", () => {
      // Arrange
      const tool = createValidTool();
      const input = null;

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_handle_undefined_input", () => {
      // Arrange
      const tool = createValidTool();
      const input = undefined;

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_handle_empty_object_input", () => {
      // Arrange
      const tool = createValidTool();
      const input = {};

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false); // missing required 'name'
    });

    it("should_validate_minLength_constraint", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "minlength-tool",
        parameters: {
          type: "object",
          properties: { name: { type: "string", minLength: 3 } },
        },
      };
      const input = { name: "ab" }; // too short

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "minLength")).toBe(true);
    });

    it("should_validate_maxLength_constraint", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "maxlength-tool",
        parameters: {
          type: "object",
          properties: { name: { type: "string", maxLength: 5 } },
        },
      };
      const input = { name: "too long string" }; // too long

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "maxLength")).toBe(true);
    });

    it("should_validate_minimum_constraint", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "minimum-tool",
        parameters: {
          type: "object",
          properties: { age: { type: "number", minimum: 0 } },
        },
      };
      const input = { age: -1 }; // below minimum

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "minimum")).toBe(true);
    });

    it("should_validate_maximum_constraint", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "maximum-tool",
        parameters: {
          type: "object",
          properties: { age: { type: "number", maximum: 150 } },
        },
      };
      const input = { age: 200 }; // above maximum

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.keyword === "maximum")).toBe(true);
    });

    it("should_validate_nested_object", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "nested-tool",
        parameters: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
      };
      const input = { user: {} }; // missing nested required field

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("should_validate_array_items", () => {
      // Arrange
      const tool: ToolDefinition = {
        name: "array-items-tool",
        parameters: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
          },
        },
      };
      const input = { tags: ["valid", 123, "also valid"] }; // number in array

      // Act
      const result = validateToolInput(tool, input);

      // Assert
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// validateToolSchemas
// ============================================================================

describe("validateToolSchemas", () => {
  describe("正常系", () => {
    it("should_validate_multiple_tool_schemas", () => {
      // Arrange
      const tools = [
        createValidTool("tool1"),
        createValidTool("tool2"),
        createValidTool("tool3"),
      ];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.size).toBe(3);
      results.forEach((result) => {
        expect(result.valid).toBe(true);
      });
    });

    it("should_skip_tools_without_parameters", () => {
      // Arrange
      const tools = [
        { name: "no-params" },
        createValidTool("with-params"),
      ];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.size).toBe(1);
      expect(results.has("with-params")).toBe(true);
    });

    it("should_return_empty_map_for_empty_array", () => {
      // Arrange
      const tools: ToolDefinition[] = [];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.size).toBe(0);
    });
  });

  describe("異常系", () => {
    it("should_detect_invalid_schemas_in_batch", () => {
      // Arrange
      const tools = [
        createValidTool("valid-tool"),
        { name: "invalid-tool", parameters: { type: 123 } },
      ];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.get("valid-tool")?.valid).toBe(true);
      expect(results.get("invalid-tool")?.valid).toBe(false);
    });
  });
});

// ============================================================================
// detectToolNameCollisions
// ============================================================================

describe("detectToolNameCollisions", () => {
  describe("正常系", () => {
    it("should_return_empty_array_when_no_collisions", () => {
      // Arrange
      const tools = [
        createValidTool("tool1"),
        createValidTool("tool2"),
        createValidTool("tool3"),
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toHaveLength(0);
    });

    it("should_detect_duplicate_tool_names", () => {
      // Arrange
      const tools = [
        { ...createValidTool("duplicate"), source: "source1" },
        { ...createValidTool("duplicate"), source: "source2" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toHaveLength(1);
      expect(collisions[0].name).toBe("duplicate");
      expect(collisions[0].sources).toContain("source1");
      expect(collisions[0].sources).toContain("source2");
    });

    it("should_return_empty_array_for_empty_input", () => {
      // Arrange
      const tools: ToolDefinition[] = [];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toHaveLength(0);
    });

    it("should_handle_multiple_collisions", () => {
      // Arrange
      const tools = [
        { ...createValidTool("dup1"), source: "a" },
        { ...createValidTool("dup1"), source: "b" },
        { ...createValidTool("dup2"), source: "c" },
        { ...createValidTool("dup2"), source: "d" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toHaveLength(2);
    });

    it("should_use_unknown_for_missing_source", () => {
      // Arrange
      const tools = [
        { name: "collision" }, // no source
        { name: "collision", source: "explicit" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toHaveLength(1);
      expect(collisions[0].sources).toContain("unknown");
      expect(collisions[0].sources).toContain("explicit");
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("validateSchema_任意の入力_常にbooleanのvalidを返す", () => {
    fc.assert(
      fc.property(fc.anything(), (schema) => {
        const result = validateSchema(schema);
        return typeof result.valid === "boolean";
      })
    );
  });

  it("validateSchema_任意の入力_常にerrors配列を返す", () => {
    fc.assert(
      fc.property(fc.anything(), (schema) => {
        const result = validateSchema(schema);
        return Array.isArray(result.errors);
      })
    );
  });

  it("validateSchema_有効なオブジェクトスキーマ_常に成功", () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constant("object"),
          properties: fc.dictionary(fc.string(), fc.record({ type: fc.constantFrom("string", "number", "boolean") })),
        }),
        (schema) => {
          const result = validateSchema(schema);
          return result.valid === true;
        }
      )
    );
  });

  it("validateToolInput_パラメータなしツール_常に成功", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.anything(),
        (toolName, input) => {
          const tool: ToolDefinition = { name: toolName };
          const result = validateToolInput(tool, input);
          return result.valid === true;
        }
      )
    );
  });

  it("validateToolSchemas_空配列_常に空Mapを返す", () => {
    fc.assert(
      fc.property(fc.constant([]), (tools) => {
        const result = validateToolSchemas(tools);
        return result.size === 0;
      })
    );
  });

  it("detectToolNameCollisions_ユニークな名前_常に空配列", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        (names) => {
          const tools: ToolDefinition[] = names.map((name) => ({ name }));
          const collisions = detectToolNameCollisions(tools);
          return collisions.length === 0;
        }
      )
    );
  });

  it("validateToolInput_型一致の入力_常に成功", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        (toolName, stringValue) => {
          const tool: ToolDefinition = {
            name: toolName,
            parameters: {
              type: "object",
              properties: { value: { type: "string" } },
            },
          };
          const input = { value: stringValue };
          const result = validateToolInput(tool, input);
          return result.valid === true;
        }
      )
    );
  });

  it("validateToolInput_数値型に数値入力_常に成功", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.double({ noNaN: true }),
        (toolName, numValue) => {
          const tool: ToolDefinition = {
            name: toolName,
            parameters: {
              type: "object",
              properties: { value: { type: "number" } },
            },
          };
          const input = { value: numValue };
          const result = validateToolInput(tool, input);
          return result.valid === true;
        }
      )
    );
  });

  it("validateToolInput_整数型に整数入力_常に成功", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer(),
        (toolName, intValue) => {
          const tool: ToolDefinition = {
            name: toolName,
            parameters: {
              type: "object",
              properties: { value: { type: "integer" } },
            },
          };
          const input = { value: intValue };
          const result = validateToolInput(tool, input);
          return result.valid === true;
        }
      )
    );
  });
});
