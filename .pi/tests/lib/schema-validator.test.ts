/**
 * @jest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  validateSchema,
  validateToolInput,
  validateToolSchemas,
  detectToolNameCollisions,
  type ToolDefinition,
} from "../../lib/schema-validator.js";

describe("schema-validator", () => {
  describe("validateSchema", () => {
    describe("valid schemas", () => {
      it("should_validate_simple_object_schema", () => {
        // Arrange
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it("should_validate_schema_with_required_fields", () => {
        // Arrange
        const schema = {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(true);
      });

      it("should_validate_schema_with_enum", () => {
        // Arrange
        const schema = {
          type: "string",
          enum: ["red", "green", "blue"],
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(true);
      });

      it("should_validate_array_schema_with_items", () => {
        // Arrange
        const schema = {
          type: "array",
          items: { type: "string" },
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(true);
      });
    });

    describe("invalid schemas", () => {
      it("should_reject_non_object_schema", () => {
        // Arrange
        const schema = "not an object";

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors[0].keyword).toBe("type");
      });

      it("should_reject_invalid_type_field", () => {
        // Arrange
        const schema = {
          type: 123, // Should be string
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(false);
      });

      it("should_reject_invalid_properties_field", () => {
        // Arrange
        const schema = {
          type: "object",
          properties: "not an object",
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.path === "/properties")).toBe(true);
      });

      it("should_reject_invalid_required_field", () => {
        // Arrange
        const schema = {
          type: "object",
          required: "not an array",
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.path === "/required")).toBe(true);
      });

      it("should_reject_invalid_enum_field", () => {
        // Arrange
        const schema = {
          type: "string",
          enum: "not an array",
        };

        // Act
        const result = validateSchema(schema);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.path === "/enum")).toBe(true);
      });
    });
  });

  describe("validateToolInput", () => {
    describe("without parameters schema", () => {
      it("should_pass_when_no_parameters_defined", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
        };

        // Act
        const result = validateToolInput(tool, { any: "input" });

        // Assert
        expect(result.valid).toBe(true);
      });
    });

    describe("type validation", () => {
      it("should_validate_string_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { name: "John" }).valid).toBe(true);
        expect(validateToolInput(tool, { name: 123 }).valid).toBe(false);
      });

      it("should_validate_number_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              age: { type: "number" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { age: 25 }).valid).toBe(true);
        expect(validateToolInput(tool, { age: "25" }).valid).toBe(false);
      });

      it("should_validate_integer_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              count: { type: "integer" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { count: 5 }).valid).toBe(true);
        expect(validateToolInput(tool, { count: 5.5 }).valid).toBe(false);
      });

      it("should_validate_boolean_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { enabled: true }).valid).toBe(true);
        expect(validateToolInput(tool, { enabled: "true" }).valid).toBe(false);
      });

      it("should_validate_array_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              tags: { type: "array" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { tags: ["a", "b"] }).valid).toBe(true);
        expect(validateToolInput(tool, { tags: "a,b" }).valid).toBe(false);
      });

      it("should_validate_null_type", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              value: { type: "null" },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { value: null }).valid).toBe(true);
        expect(validateToolInput(tool, { value: "null" }).valid).toBe(false);
      });
    });

    describe("required fields", () => {
      it("should_detect_missing_required_field", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name", "email"],
          },
        };

        // Act
        const result = validateToolInput(tool, { name: "John" });

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.keyword === "required")).toBe(true);
      });

      it("should_pass_when_all_required_fields_present", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name"],
          },
        };

        // Act
        const result = validateToolInput(tool, { name: "John", email: "john@example.com" });

        // Assert
        expect(result.valid).toBe(true);
      });
    });

    describe("enum validation", () => {
      it("should_validate_enum_values", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              color: { type: "string", enum: ["red", "green", "blue"] },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { color: "red" }).valid).toBe(true);
        expect(validateToolInput(tool, { color: "yellow" }).valid).toBe(false);
      });
    });

    describe("string constraints", () => {
      it("should_validate_minLength", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 3 },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { name: "John" }).valid).toBe(true);
        expect(validateToolInput(tool, { name: "Jo" }).valid).toBe(false);
      });

      it("should_validate_maxLength", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", maxLength: 5 },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { name: "John" }).valid).toBe(true);
        expect(validateToolInput(tool, { name: "Jonathan" }).valid).toBe(false);
      });
    });

    describe("number constraints", () => {
      it("should_validate_minimum", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              age: { type: "number", minimum: 0 },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { age: 25 }).valid).toBe(true);
        expect(validateToolInput(tool, { age: -1 }).valid).toBe(false);
      });

      it("should_validate_maximum", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              age: { type: "number", maximum: 150 },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { age: 100 }).valid).toBe(true);
        expect(validateToolInput(tool, { age: 200 }).valid).toBe(false);
      });
    });

    describe("nested properties", () => {
      it("should_validate_nested_objects", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { user: { name: "John" } }).valid).toBe(true);
        expect(validateToolInput(tool, { user: { name: 123 } }).valid).toBe(false);
      });

      it("should_validate_array_items", () => {
        // Arrange
        const tool: ToolDefinition = {
          name: "testTool",
          parameters: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        };

        // Act & Assert
        expect(validateToolInput(tool, { tags: ["a", "b"] }).valid).toBe(true);
        expect(validateToolInput(tool, { tags: ["a", 1] }).valid).toBe(false);
      });
    });
  });

  describe("validateToolSchemas", () => {
    it("should_validate_multiple_tools", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        {
          name: "tool1",
          parameters: { type: "object" },
        },
        {
          name: "tool2",
          parameters: { type: "object" },
        },
        {
          name: "tool3",
          // No parameters
        },
      ];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.size).toBe(2); // Only tools with parameters
      expect(results.get("tool1")?.valid).toBe(true);
      expect(results.get("tool2")?.valid).toBe(true);
    });

    it("should_detect_invalid_schemas", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        {
          name: "badTool",
          parameters: { type: 123 }, // Invalid
        },
      ];

      // Act
      const results = validateToolSchemas(tools);

      // Assert
      expect(results.get("badTool")?.valid).toBe(false);
    });
  });

  describe("detectToolNameCollisions", () => {
    it("should_return_empty_for_unique_names", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        { name: "tool1", source: "source1" },
        { name: "tool2", source: "source2" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions).toEqual([]);
    });

    it("should_detect_duplicate_names", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        { name: "read", source: "fs" },
        { name: "read", source: "http" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions.length).toBe(1);
      expect(collisions[0].name).toBe("read");
      expect(collisions[0].sources).toContain("fs");
      expect(collisions[0].sources).toContain("http");
    });

    it("should_handle_multiple_collisions", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        { name: "read", source: "fs" },
        { name: "read", source: "http" },
        { name: "write", source: "fs" },
        { name: "write", source: "http" },
        { name: "unique", source: "other" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions.length).toBe(2);
    });

    it("should_use_unknown_for_missing_source", () => {
      // Arrange
      const tools: ToolDefinition[] = [
        { name: "tool" },
        { name: "tool" },
      ];

      // Act
      const collisions = detectToolNameCollisions(tools);

      // Assert
      expect(collisions[0].sources).toContain("unknown");
    });
  });
});
