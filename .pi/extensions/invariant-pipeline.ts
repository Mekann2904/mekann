/**
 * Invariant Validation Pipeline拡張機能
 * spec.mdからQuint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストを自動生成
 *
 * ツール:
 * - generate_from_spec: spec.mdから全成果物を生成
 * - verify_quint_spec: Quint仕様の検証
 * - generate_invariant_macros: Rustマクロ生成
 * - generate_property_tests: proptestコード生成
 * - generate_mbt_driver: モデルベーステストドライバー生成
 *
 * 統合:
 * - invariant-generationスキル: 形式仕様生成の専門知識
 * - invariant-generation-team: マルチエージェント生成
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ============================================================================
// Types
// ============================================================================

interface SpecState {
  name: string;
  type: string;
  initialValue?: unknown;
  constraints?: string[];
}

interface SpecOperation {
  name: string;
  parameters?: { name: string; type: string }[];
  preconditions?: string[];
  postconditions?: string[];
  description?: string;
}

interface SpecInvariant {
  name: string;
  condition: string;
  description?: string;
}

interface ParsedSpec {
  title: string;
  description?: string;
  states: SpecState[];
  operations: SpecOperation[];
  invariants: SpecInvariant[];
  constants?: { name: string; type: string; value?: unknown }[];
}

interface GenerationResult {
  success: boolean;
  outputs: {
    quint?: { path: string; content: string };
    macros?: { path: string; content: string };
    tests?: { path: string; content: string };
    mbt?: { path: string; content: string };
  };
  errors: string[];
  warnings: string[];
}

interface VerifyQuintInput {
  quint_path: string;
  check_invariants?: boolean;
  check_liveness?: boolean;
}

interface GenerateMacrosInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
}

interface GenerateTestsInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  test_count?: number;
}

interface GenerateMBTInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  max_steps?: number;
}

// ============================================================================
// Spec Parser
// ============================================================================

function parseSpecMarkdown(content: string): ParsedSpec {
  const lines = content.split("\n");
  const spec: ParsedSpec = {
    title: "",
    states: [],
    operations: [],
    invariants: [],
  };

  let currentSection = "";
  let currentItem: any = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Title
    if (trimmed.startsWith("# ")) {
      spec.title = trimmed.substring(2);
      continue;
    }

    // Sections
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.substring(3).toLowerCase();
      continue;
    }

    // State variables
    if (currentSection.includes("状態") || currentSection.includes("state")) {
      const match = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(\w+)(?:\s*（初期値\s+(.+)）)?(?:\s*\(initial:\s*(.+)\))?/);
      if (match) {
        spec.states.push({
          name: match[1],
          type: match[2],
          initialValue: match[3] || match[4],
        });
      } else {
        // Simple format: - variable_name: Type
        const simpleMatch = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(.+)$/);
        if (simpleMatch) {
          spec.states.push({
            name: simpleMatch[1],
            type: simpleMatch[2].trim(),
          });
        }
      }
    }

    // Operations
    if (currentSection.includes("操作") || currentSection.includes("operation")) {
      const match = trimmed.match(/^[-*]\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.+)$/);
      if (match) {
        spec.operations.push({
          name: match[1],
          parameters: match[2] ? match[2].split(",").map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          description: match[3],
        });
      } else {
        // Simple format: - operation_name()
        const simpleMatch = trimmed.match(/^[-*]\s+(\w+)\s*\(\s*\)/);
        if (simpleMatch) {
          spec.operations.push({
            name: simpleMatch[1],
            parameters: [],
          });
        }
      }
    }

    // Invariants
    if (currentSection.includes("インバリアント") || currentSection.includes("invariant")) {
      const match = trimmed.match(/^[-*]\s+(.+)$/);
      if (match && !trimmed.startsWith("```")) {
        spec.invariants.push({
          name: `Invariant${spec.invariants.length + 1}`,
          condition: match[1],
        });
      }
    }
  }

  return spec;
}

// ============================================================================
// Quint Generator
// ============================================================================

function generateQuintSpec(spec: ParsedSpec, moduleName?: string): string {
  const name = moduleName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let quint = `// Generated Quint specification from ${spec.title}\n`;
  quint += `// Generated by invariant-pipeline\n\n`;
  quint += `module ${name} {\n`;

  // Constants
  if (spec.constants && spec.constants.length > 0) {
    quint += `\n  // Constants\n`;
    for (const c of spec.constants) {
      quint += `  const ${c.name}: ${c.type}\n`;
    }
  }

  // State variables
  if (spec.states.length > 0) {
    quint += `\n  // State variables\n`;
    for (const s of spec.states) {
      quint += `  var ${s.name}: ${mapTypeToQuint(s.type)}\n`;
    }
  }

  // Init
  quint += `\n  // Initial state\n`;
  quint += `  init() {\n`;
  const initAssignments = spec.states.map(s => {
    const initVal = s.initialValue !== undefined ? s.initialValue : getDefaultValue(s.type);
    return `    ${s.name}' = ${formatValue(initVal, s.type)}`;
  });
  quint += initAssignments.join(",\n") + "\n";
  quint += `  }\n`;

  // Operations
  for (const op of spec.operations) {
    quint += `\n  // ${op.description || op.name}\n`;
    quint += `  ${op.name}() {\n`;
    quint += `    all {\n`;
    if (op.preconditions && op.preconditions.length > 0) {
      quint += `      // Preconditions\n`;
      for (const pre of op.preconditions) {
        quint += `      ${pre},\n`;
      }
    }
    if (op.postconditions && op.postconditions.length > 0) {
      quint += `      // Postconditions\n`;
      for (const post of op.postconditions) {
        quint += `      ${post},\n`;
      }
    } else {
      quint += `      // TODO: Define state transition\n`;
      quint += `      true\n`;
    }
    quint += `    }\n`;
    quint += `  }\n`;
  }

  // Invariants
  if (spec.invariants.length > 0) {
    quint += `\n  // Invariants\n`;
    for (const inv of spec.invariants) {
      const invName = inv.name || `Invariant${spec.invariants.indexOf(inv) + 1}`;
      quint += `  invariant ${invName} {\n`;
      quint += `    ${inv.condition}\n`;
      quint += `  }\n`;
    }
  }

  quint += `}\n`;

  return quint;
}

function mapTypeToQuint(type: string): string {
  const typeMap: Record<string, string> = {
    "int": "int",
    "integer": "int",
    "整数": "int",
    "bool": "bool",
    "boolean": "bool",
    "真偽": "bool",
    "str": "str",
    "string": "str",
    "文字列": "str",
    "Set": "Set",
    "集合": "Set",
    "List": "List",
    "リスト": "List",
    "Map": "Map",
    "マップ": "Map",
  };
  return typeMap[type] || type;
}

function getDefaultValue(type: string): unknown {
  const defaults: Record<string, unknown> = {
    "int": 0,
    "integer": 0,
    "整数": 0,
    "bool": false,
    "boolean": false,
    "真偽": false,
    "str": "",
    "string": "",
    "文字列": "",
  };
  return defaults[type] ?? null;
}

function formatValue(value: unknown, type: string): string {
  if (typeof value === "string") {
    // Check if it's already a number
    if (type === "int" || type === "整数") {
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num.toString();
    }
    return `"${value}"`;
  }
  return String(value);
}

// ============================================================================
// Rust Macro Generator
// ============================================================================

function generateRustMacros(spec: ParsedSpec, structName?: string): string {
  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let rust = `//! Generated invariant macros for ${spec.title}\n`;
  rust += `//! Generated by invariant-pipeline\n\n`;
  rust += `use std::fmt;\n\n`;

  // InvariantViolation error type
  rust += `/// Invariant violation error\n`;
  rust += `#[derive(Debug, Clone)]\n`;
  rust += `pub struct InvariantViolation {\n`;
  rust += `    pub invariant: &'static str,\n`;
  rust += `    pub details: String,\n`;
  rust += `}\n\n`;

  rust += `impl InvariantViolation {\n`;
  rust += `    pub fn new(invariant: &'static str, details: impl Into<String>) -> Self {\n`;
  rust += `        Self { invariant, details: details.into() }\n`;
  rust += `    }\n`;
  rust += `}\n\n`;

  rust += `impl fmt::Display for InvariantViolation {\n`;
  rust += `    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {\n`;
  rust += `        write!(f, "Invariant '{}' violated: {}", self.invariant, self.details)\n`;
  rust += `    }\n`;
  rust += `}\n\n`;

  rust += `impl std::error::Error for InvariantViolation {}\n\n`;

  // Macro definition
  rust += `/// Macro to define invariant checks for ${name}\n`;
  rust += `#[macro_export]\n`;
  rust += `macro_rules! define_${name.toLowerCase()}_invariants {\n`;
  rust += `    ($struct_name:ident) => {\n`;
  rust += `        impl $struct_name {\n`;
  rust += `            /// Check all invariants\n`;
  rust += `            #[inline]\n`;
  rust += `            pub fn check_invariants(&self) -> Result<(), InvariantViolation> {\n`;

  for (const inv of spec.invariants) {
    rust += `                // ${inv.description || inv.name}\n`;
    rust += `                if !(${translateConditionToRust(inv.condition)}) {\n`;
    rust += `                    return Err(InvariantViolation::new(\n`;
    rust += `                        "${inv.condition}",\n`;
    rust += `                        format!("Condition violated: ${inv.condition}")\n`;
    rust += `                    ));\n`;
    rust += `                }\n`;
  }

  rust += `                Ok(())\n`;
  rust += `            }\n`;
  rust += `        }\n`;
  rust += `    };\n`;
  rust += `}\n\n`;

  // Usage example
  rust += `// Usage example:\n`;
  rust += `// struct ${name} {\n`;
  for (const s of spec.states) {
    rust += `//     ${s.name}: ${mapTypeToRust(s.type)},\n`;
  }
  rust += `// }\n`;
  rust += `// define_${name.toLowerCase()}_invariants!(${name});\n`;

  return rust;
}

function mapTypeToRust(type: string): string {
  const typeMap: Record<string, string> = {
    "int": "i64",
    "integer": "i64",
    "整数": "i64",
    "bool": "bool",
    "boolean": "bool",
    "真偽": "bool",
    "str": "String",
    "string": "String",
    "文字列": "String",
    "List": "Vec",
    "リスト": "Vec",
    "Map": "HashMap",
    "マップ": "HashMap",
    "Set": "HashSet",
    "集合": "HashSet",
  };
  return typeMap[type] || type;
}

function translateConditionToRust(condition: string): string {
  // Basic translation from natural/math notation to Rust
  // Process compound operators first, then single operators
  // Use word boundaries for logical operators to avoid matching inside variable names
  return condition
    // Fix compound operators first: use placeholder to prevent double-matching
    .replace(/>=/g, "___GTE___")
    .replace(/<=/g, "___LTE___")
    .replace(/!=/g, "___NEQ___")
    .replace(/==/g, "___EQ___")
    // Convert single = to == (safe now since >=, <=, !=, == are protected)
    .replace(/=/g, "==")
    // Restore compound operators
    .replace(/___GTE___/g, ">=")
    .replace(/___LTE___/g, "<=")
    .replace(/___NEQ___/g, "!=")
    .replace(/___EQ___/g, "==")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!");
}

// ============================================================================
// Property Test Generator
// ============================================================================

function generatePropertyTests(spec: ParsedSpec, structName?: string, testCount?: number): string {
  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let tests = `//! Generated property-based tests for ${spec.title}\n`;
  tests += `//! Generated by invariant-pipeline\n\n`;
  tests += `use proptest::prelude::*;\n\n`;

  // Generate strategies for each state
  const testCountValue = testCount || 256; // proptest default
  tests += `// Test configuration\n`;
  tests += `const DEFAULT_TEST_COUNT: usize = ${testCountValue};\n\n`;
  tests += `// Strategies for state variables\n`;
  for (const s of spec.states) {
    tests += `prop_compose! {\n`;
    tests += `    fn arb_${s.name}()(v in any::<${mapTypeToRust(s.type)}>()) -> ${mapTypeToRust(s.type)} {\n`;
    tests += `        v\n`;
    tests += `    }\n`;
    tests += `}\n\n`;
  }

  // Generate tests for each invariant
  for (const inv of spec.invariants) {
    const testName = `test_${inv.name.toLowerCase()}`;
    tests += `proptest! {\n`;
    tests += `    #[test]\n`;
    tests += `    fn ${testName}(\n`;

    // Generate parameters for the test
    const params = spec.states.map(s => `${s.name} in arb_${s.name}()`).join(",\n        ");
    tests += `        ${params}\n`;
    tests += `    ) {\n`;
    tests += `        // ${inv.description || inv.name}\n`;
    tests += `        // Condition: ${inv.condition}\n`;
    tests += `        // TODO: Implement test body\n`;
    tests += `        prop_assert!(true);\n`;
    tests += `    }\n`;
    tests += `}\n\n`;
  }

  // Generate operation tests
  for (const op of spec.operations) {
    const testName = `test_${op.name}_maintains_invariants`;
    tests += `proptest! {\n`;
    tests += `    #[test]\n`;
    tests += `    fn ${testName}(\n`;

    const params = spec.states.map(s => `${s.name} in arb_${s.name}()`).join(",\n        ");
    tests += `        ${params}\n`;
    tests += `    ) {\n`;
    tests += `        // Test that ${op.name} maintains all invariants\n`;
    tests += `        // TODO: Create instance, call ${op.name}, check invariants\n`;
    tests += `        prop_assert!(true);\n`;
    tests += `    }\n`;
    tests += `}\n\n`;
  }

  return tests;
}

// ============================================================================
// MBT Driver Generator
// ============================================================================

function generateMBTDriver(spec: ParsedSpec, structName?: string, maxSteps?: number): string {
  const name = structName || spec.title.replace(/[^a-zA-Z0-9]/g, "") || "Generated";

  let mbt = `//! Generated model-based test driver for ${spec.title}\n`;
  mbt += `//! Generated by invariant-pipeline\n\n`;

  // Action enum
  mbt += `/// Actions for ${name} model\n`;
  mbt += `#[derive(Debug, Clone)]\n`;
  mbt += `pub enum ${name}Action {\n`;
  for (const op of spec.operations) {
    const params = op.parameters && op.parameters.length > 0
      ? op.parameters.map(p => `${p.name}: ${mapTypeToRust(p.type)}`).join(", ")
      : "";
    mbt += `    ${capitalize(op.name)}${params ? `{ ${params} }` : ""},\n`;
  }
  mbt += `}\n\n`;

  // Model struct
  mbt += `/// Model for ${name}\n`;
  mbt += `#[derive(Debug, Clone)]\n`;
  mbt += `pub struct ${name}Model {\n`;
  for (const s of spec.states) {
    mbt += `    pub ${s.name}: ${mapTypeToRust(s.type)},\n`;
  }
  mbt += `}\n\n`;

  // Model implementation
  mbt += `impl ${name}Model {\n`;

  // Initial state
  mbt += `    /// Create initial state\n`;
  mbt += `    pub fn initial_state() -> Self {\n`;
  mbt += `        Self {\n`;
  for (const s of spec.states) {
    const initVal = s.initialValue !== undefined ? formatRustValue(s.initialValue, s.type) : getRustDefault(s.type);
    mbt += `            ${s.name}: ${initVal},\n`;
  }
  mbt += `        }\n`;
  mbt += `    }\n\n`;

  // Apply action
  mbt += `    /// Apply action to model\n`;
  mbt += `    pub fn apply_action(&self, action: &${name}Action) -> Self {\n`;
  mbt += `        let mut new_state = self.clone();\n`;
  mbt += `        match action {\n`;

  for (const op of spec.operations) {
    const pattern = op.parameters && op.parameters.length > 0
      ? `${capitalize(op.name)} { ${op.parameters!.map(p => p.name).join(", ")} }`
      : capitalize(op.name);
    mbt += `            ${name}Action::${pattern} => {\n`;
    mbt += `                // TODO: Implement ${op.name} transition\n`;
    mbt += `            }\n`;
  }

  mbt += `        }\n`;
  mbt += `        new_state\n`;
  mbt += `    }\n\n`;

  // Check invariants
  mbt += `    /// Check all invariants\n`;
  mbt += `    pub fn check_invariants(&self) -> Result<(), String> {\n`;

  for (const inv of spec.invariants) {
    mbt += `        // ${inv.description || inv.name}\n`;
    mbt += `        if !(${translateConditionToRust(inv.condition)}) {\n`;
    mbt += `            return Err(format!("Invariant violated: ${inv.condition}"));\n`;
    mbt += `        }\n\n`;
  }

  mbt += `        Ok(())\n`;
  mbt += `    }\n`;

  mbt += `}\n\n`;

  // Test runner
  const maxStepsValue = maxSteps || 100;
  mbt += `/// Run model-based test\n`;
  mbt += `pub fn run_mbt(max_steps: usize) -> Result<(), String> {\n`;
  mbt += `    let mut model = ${name}Model::initial_state();\n`;
  mbt += `    // Default max_steps: ${maxStepsValue}\n\n`;
  mbt += `    for step in 0..max_steps {\n`;
  mbt += `        // TODO: Generate random action\n`;
  mbt += `        // let action = generate_action();\n`;
  mbt += `        // model = model.apply_action(&action);\n`;
  mbt += `        // model.check_invariants()?;\n`;
  mbt += `        println!("Step {}: {:?}", step, model);\n`;
  mbt += `    }\n\n`;
  mbt += `    Ok(())\n`;
  mbt += `}\n\n`;

  mbt += `#[cfg(test)]\n`;
  mbt += `mod tests {\n`;
  mbt += `    use super::*;\n\n`;
  mbt += `    #[test]\n`;
  mbt += `    fn test_initial_state_invariants() {\n`;
  mbt += `        let model = ${name}Model::initial_state();\n`;
  mbt += `        assert!(model.check_invariants().is_ok());\n`;
  mbt += `    }\n`;
  mbt += `}\n`;

  return mbt;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRustValue(value: unknown, type: string): string {
  if (typeof value === "string") {
    if (type === "int" || type === "整数" || type === "i64") {
      return value;
    }
    return `"${value}".to_string()`;
  }
  return String(value);
}

function getRustDefault(type: string): string {
  const defaults: Record<string, string> = {
    "int": "0",
    "integer": "0",
    "整数": "0",
    "i64": "0",
    "bool": "false",
    "boolean": "false",
    "真偽": "false",
    "str": 'String::new()',
    "string": 'String::new()',
    "文字列": 'String::new()',
  };
  return defaults[type] || "Default::default()";
}

// ============================================================================
// Extension Registration
// ============================================================================

export default (api: ExtensionAPI) => {
  console.log("[invariant-pipeline] Extension loading...");

  // generate_from_spec tool
  api.registerTool({
    name: "generate_from_spec",
    description: "spec.mdからQuint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストドライバーを一括生成",
    parameters: {
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_dir: Type.Optional(Type.String({ description: "出力ディレクトリ（デフォルト: spec_pathと同じディレクトリ）" })),
      module_name: Type.Optional(Type.String({ description: "Quintモジュール名（デフォルト: specのタイトル）" })),
      struct_name: Type.Optional(Type.String({ description: "Rust構造体名（デフォルト: specのタイトル）" })),
      test_count: Type.Optional(Type.Number({ description: "プロパティテストのテスト数（デフォルト: 256）" })),
      max_steps: Type.Optional(Type.Number({ description: "MBTの最大ステップ数（デフォルト: 100）" })),
    },
    handler: async (params: {
      spec_path: string;
      output_dir?: string;
      module_name?: string;
      struct_name?: string;
      test_count?: number;
      max_steps?: number;
    }) => {
      const startTime = Date.now();

      try {
        // Read spec file
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);

        // Determine output directory
        const outputDir = params.output_dir || dirname(params.spec_path);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        const result: GenerationResult = {
          success: true,
          outputs: {},
          errors: [],
          warnings: [],
        };

        // Generate Quint spec
        const quintContent = generateQuintSpec(spec, params.module_name);
        const quintPath = join(outputDir, `${spec.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.qnt`);
        writeFileSync(quintPath, quintContent);
        result.outputs.quint = { path: quintPath, content: quintContent };

        // Generate Rust macros
        const macrosContent = generateRustMacros(spec, params.struct_name);
        const macrosPath = join(outputDir, "invariants.rs");
        writeFileSync(macrosPath, macrosContent);
        result.outputs.macros = { path: macrosPath, content: macrosContent };

        // Generate property tests
        const testsContent = generatePropertyTests(spec, params.struct_name, params.test_count);
        const testsPath = join(outputDir, "property_tests.rs");
        writeFileSync(testsPath, testsContent);
        result.outputs.tests = { path: testsPath, content: testsContent };

        // Generate MBT driver
        const mbtContent = generateMBTDriver(spec, params.struct_name, params.max_steps);
        const mbtPath = join(outputDir, "mbt_driver.rs");
        writeFileSync(mbtPath, mbtContent);
        result.outputs.mbt = { path: mbtPath, content: mbtContent };

        const durationMs = Date.now() - startTime;
        console.log(`[invariant-pipeline] Generation complete in ${durationMs}ms, outputs: ${Object.keys(result.outputs).join(", ")}`);

        return {
          success: true,
          spec_title: spec.title,
          states_count: spec.states.length,
          operations_count: spec.operations.length,
          invariants_count: spec.invariants.length,
          outputs: result.outputs,
          duration_ms: durationMs,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[invariant-pipeline] Generation failed: ${errorMessage}`);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // verify_quint_spec tool
  api.registerTool({
    name: "verify_quint_spec",
    description: "Quint形式仕様を検証（構文チェック、インバリアントチェック）",
    parameters: {
      quint_path: Type.String({ description: "Quintファイルへのパス" }),
      check_invariants: Type.Optional(Type.Boolean({ description: "インバリアントをチェック" })),
    },
    handler: async (params: VerifyQuintInput) => {
      try {
        if (!existsSync(params.quint_path)) {
          return {
            success: false,
            error: `Quint file not found: ${params.quint_path}`,
          };
        }

        const content = readFileSync(params.quint_path, "utf-8");

        // Basic syntax checks
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for module declaration
        if (!content.includes("module ")) {
          errors.push("Missing module declaration");
        }

        // Check for balanced braces
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
        }

        // Check for invariant declarations
        const hasInvariants = content.includes("invariant ");
        if (params.check_invariants && !hasInvariants) {
          warnings.push("No invariant declarations found");
        }

        // Liveness check placeholder (requires temporal logic analysis)
        if (params.check_liveness) {
          // Check for temporal operators (eventually, always)
          const hasTemporalOps = /\b(eventually|always|leads[_\s]*to)\b/i.test(content);
          if (!hasTemporalOps) {
            warnings.push("Liveness check requested but no temporal operators found in spec");
          }
          // Full liveness verification would require Quint/TLA+ model checker integration
        }

        return {
          success: errors.length === 0,
          path: params.quint_path,
          errors,
          warnings,
          has_invariants: hasInvariants,
          liveness_checked: params.check_liveness ?? false,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_invariant_macros tool
  api.registerTool({
    name: "generate_invariant_macros",
    description: "spec.mdからRustインバリアントマクロを生成",
    parameters: {
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "Rust構造体名" })),
    },
    handler: async (params: GenerateMacrosInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const macrosContent = generateRustMacros(spec, params.struct_name);

        const outputPath = params.output_path || join(dirname(params.spec_path), "invariants.rs");
        writeFileSync(outputPath, macrosContent);

        return {
          success: true,
          path: outputPath,
          content: macrosContent,
          invariants_count: spec.invariants.length,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_property_tests tool
  api.registerTool({
    name: "generate_property_tests",
    description: "spec.mdからproptestベースのプロパティテストを生成",
    parameters: {
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "テスト対象構造体名" })),
      test_count: Type.Optional(Type.Number({ description: "プロパティテストのテスト数（デフォルト: 256）" })),
    },
    handler: async (params: GenerateTestsInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const testsContent = generatePropertyTests(spec, params.struct_name, params.test_count);

        const outputPath = params.output_path || join(dirname(params.spec_path), "property_tests.rs");
        writeFileSync(outputPath, testsContent);

        return {
          success: true,
          path: outputPath,
          content: testsContent,
          tests_count: spec.invariants.length + spec.operations.length,
          configured_test_count: params.test_count,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  // generate_mbt_driver tool
  api.registerTool({
    name: "generate_mbt_driver",
    description: "spec.mdからモデルベーステストドライバーを生成",
    parameters: {
      spec_path: Type.String({ description: "spec.mdファイルへのパス" }),
      output_path: Type.Optional(Type.String({ description: "出力ファイルパス" })),
      struct_name: Type.Optional(Type.String({ description: "モデル構造体名" })),
      max_steps: Type.Optional(Type.Number({ description: "MBTの最大ステップ数（デフォルト: 100）" })),
    },
    handler: async (params: GenerateMBTInput) => {
      try {
        if (!existsSync(params.spec_path)) {
          return {
            success: false,
            error: `Spec file not found: ${params.spec_path}`,
          };
        }

        const specContent = readFileSync(params.spec_path, "utf-8");
        const spec = parseSpecMarkdown(specContent);
        const mbtContent = generateMBTDriver(spec, params.struct_name, params.max_steps);

        const outputPath = params.output_path || join(dirname(params.spec_path), "mbt_driver.rs");
        writeFileSync(outputPath, mbtContent);

        return {
          success: true,
          path: outputPath,
          content: mbtContent,
          actions_count: spec.operations.length,
          configured_max_steps: params.max_steps,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  });

  console.log("[invariant-pipeline] Extension loaded", {
    tools: ["generate_from_spec", "verify_quint_spec", "generate_invariant_macros", "generate_property_tests", "generate_mbt_driver"],
  });
};
