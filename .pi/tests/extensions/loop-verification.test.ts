import { describe, it, expect } from "vitest";
import { parseVerificationCommand } from "../../extensions/loop/verification.js";

describe("parseVerificationCommand", () => {
  describe("basic parsing", () => {
    it("should parse simple command without args", () => {
      const result = parseVerificationCommand("npm");
      expect(result).toEqual({
        executable: "npm",
        args: [],
      });
    });

    it("should parse command with single arg", () => {
      const result = parseVerificationCommand("npm test");
      expect(result).toEqual({
        executable: "npm",
        args: ["test"],
      });
    });

    it("should parse command with multiple args", () => {
      const result = parseVerificationCommand("npm run build --verbose");
      expect(result).toEqual({
        executable: "npm",
        args: ["run", "build", "--verbose"],
      });
    });

    it("should handle quoted arguments", () => {
      const result = parseVerificationCommand('echo "hello world"');
      expect(result).toEqual({
        executable: "echo",
        args: ["hello world"],
      });
    });

    it("should handle single quoted arguments", () => {
      const result = parseVerificationCommand("echo 'hello world'");
      expect(result).toEqual({
        executable: "echo",
        args: ["hello world"],
      });
    });

    it("should handle escaped characters", () => {
      // tokenizeArgs processes escape sequences, so \n becomes n
      const result = parseVerificationCommand('echo "hello\\nworld"');
      expect(result).toEqual({
        executable: "echo",
        args: ["hellonworld"],
      });
    });
  });

  describe("empty and invalid input", () => {
    it("should return error for empty string", () => {
      const result = parseVerificationCommand("");
      expect(result.error).toBe("verification command is empty");
      expect(result.executable).toBe("");
    });

    it("should return error for whitespace only", () => {
      const result = parseVerificationCommand("   ");
      expect(result.error).toBe("verification command is empty");
    });

    it("should return error for null/undefined", () => {
      const result = parseVerificationCommand(null as unknown as string);
      expect(result.error).toBe("verification command is empty");
    });

    it("should return error for multiline command", () => {
      const result = parseVerificationCommand("npm test\nnpm run build");
      expect(result.error).toBe("verification command must be a single line");
    });

    it("should return error for command with carriage return", () => {
      const result = parseVerificationCommand("npm test\rnpm run build");
      expect(result.error).toBe("verification command must be a single line");
    });
  });

  describe("shell operator rejection", () => {
    it("should reject pipe operator", () => {
      const result = parseVerificationCommand("cat file | grep pattern");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject semicolon", () => {
      const result = parseVerificationCommand("npm test; npm run build");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject ampersand (background)", () => {
      const result = parseVerificationCommand("npm test &");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject double ampersand (and)", () => {
      const result = parseVerificationCommand("npm test && npm run build");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject double pipe (or)", () => {
      const result = parseVerificationCommand("npm test || echo failed");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject angle brackets (redirect)", () => {
      const result = parseVerificationCommand("npm test > output.txt");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject dollar sign (variable)", () => {
      const result = parseVerificationCommand("echo $HOME");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject backtick (command substitution)", () => {
      const result = parseVerificationCommand("echo `date`");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject $() command substitution pattern", () => {
      const result = parseVerificationCommand("echo $(whoami)");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });

    it("should reject nested $() command substitution", () => {
      const result = parseVerificationCommand("cmd --flag-$(echo inner)");
      expect(result.error).toBe("shell operators are not allowed in verification command");
    });
  });

  describe("path traversal protection", () => {
    it("should reject relative path with ..", () => {
      const result = parseVerificationCommand("../scripts/test.sh");
      expect(result.error).toBe("path traversal (..) is not allowed in verification command executable");
    });

    it("should reject nested relative path with ..", () => {
      const result = parseVerificationCommand("../../bin/tool");
      expect(result.error).toBe("path traversal (..) is not allowed in verification command executable");
    });

    it("should reject path with embedded ..", () => {
      const result = parseVerificationCommand("./some/../path/tool");
      expect(result.error).toBe("path traversal (..) is not allowed in verification command executable");
    });

    it("should accept simple relative path without ..", () => {
      const result = parseVerificationCommand("./scripts/test.sh");
      expect(result).toEqual({
        executable: "./scripts/test.sh",
        args: [],
      });
    });

    it("should accept absolute path", () => {
      const result = parseVerificationCommand("/usr/local/bin/tool");
      expect(result).toEqual({
        executable: "/usr/local/bin/tool",
        args: [],
      });
    });

    it("should accept npm command", () => {
      const result = parseVerificationCommand("npm run test");
      expect(result).toEqual({
        executable: "npm",
        args: ["run", "test"],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle command with many spaces", () => {
      const result = parseVerificationCommand("npm    run    test");
      expect(result).toEqual({
        executable: "npm",
        args: ["run", "test"],
      });
    });

    it("should handle command with leading/trailing spaces", () => {
      const result = parseVerificationCommand("   npm test   ");
      expect(result).toEqual({
        executable: "npm",
        args: ["test"],
      });
    });

    it("should handle executable with hyphen", () => {
      const result = parseVerificationCommand("my-tool --flag");
      expect(result).toEqual({
        executable: "my-tool",
        args: ["--flag"],
      });
    });

    it("should handle executable with underscore", () => {
      const result = parseVerificationCommand("my_tool --flag");
      expect(result).toEqual({
        executable: "my_tool",
        args: ["--flag"],
      });
    });

    it("should handle args with equals sign", () => {
      const result = parseVerificationCommand("cmd --key=value");
      expect(result).toEqual({
        executable: "cmd",
        args: ["--key=value"],
      });
    });

    it("should handle args with dots (version numbers)", () => {
      const result = parseVerificationCommand("cmd --version 1.2.3");
      expect(result).toEqual({
        executable: "cmd",
        args: ["--version", "1.2.3"],
      });
    });
  });
});
