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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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

interface GenerationOutput {
  content: string;
  warnings: string[];
  errors: string[];
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
    constants: [],
  };

  let currentSection = "";
  let currentState: SpecState | null = null;
  let currentOperation: SpecOperation | null = null;
  let currentConstant: { name: string; type: string; value?: unknown } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Title
    if (trimmed.startsWith("# ")) {
      spec.title = trimmed.substring(2);
      continue;
    }

    // Sections (##)
    if (trimmed.startsWith("## ")) {
      // Save pending items before changing section
      if (currentConstant) {
        spec.constants!.push(currentConstant);
        currentConstant = null;
      }
      if (currentState) {
        spec.states.push(currentState);
        currentState = null;
      }
      if (currentOperation) {
        spec.operations.push(currentOperation);
        currentOperation = null;
      }
      currentSection = trimmed.substring(3).toLowerCase();
      continue;
    }

    // Constants section (## 定数 / ## Constants)
    if (currentSection.includes("定数") || currentSection.includes("constants")) {
      // ### name: type format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*:\s*(.+)$/);
      if (headerMatch) {
        // Save previous constant if exists
        if (currentConstant) {
          spec.constants!.push(currentConstant);
        }
        currentConstant = { name: headerMatch[1], type: headerMatch[2].trim() };
        continue;
      }
      // - 値: value / - value: value
      const valueMatch = trimmed.match(/^[-*]\s+(?:値|value)\s*:\s*(.+)$/);
      if (valueMatch && currentConstant) {
        currentConstant.value = parseConstantValue(valueMatch[1].trim(), currentConstant.type);
        continue;
      }
    }

    // State variables section (## 状態 / ## State)
    if (currentSection.includes("状態") || currentSection.includes("state")) {
      // ### name: type format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*:\s*(.+)$/);
      if (headerMatch) {
        // Save previous state if exists
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = { name: headerMatch[1], type: headerMatch[2].trim(), constraints: [] };
        continue;
      }
      // - 初期値: value / - initial: value
      const initialMatch = trimmed.match(/^[-*]\s+(?:初期値|初期値|initial)\s*:\s*(.+)$/);
      if (initialMatch && currentState) {
        currentState.initialValue = parseConstantValue(initialMatch[1].trim(), currentState.type);
        continue;
      }
      // - 制約: condition / - constraint: condition
      const constraintMatch = trimmed.match(/^[-*]\s+(?:制約|constraint)\s*:\s*(.+)$/);
      if (constraintMatch && currentState) {
        currentState.constraints!.push(constraintMatch[1].trim());
        continue;
      }
      // Legacy format: - variable_name: Type (初期値: value)
      const legacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(\w+)(?:\s*（初期値\s+(.+)）)?(?:\s*\(initial:\s*(.+)\))?/);
      if (legacyMatch) {
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = {
          name: legacyMatch[1],
          type: legacyMatch[2],
          initialValue: legacyMatch[3] || legacyMatch[4],
          constraints: [],
        };
        continue;
      }
      // Simple legacy format: - variable_name: Type
      const simpleMatch = trimmed.match(/^[-*]\s+(\w+)\s*:\s*(.+)$/);
      if (simpleMatch && !trimmed.includes("初期値") && !trimmed.includes("制約")) {
        if (currentState) {
          spec.states.push(currentState);
        }
        currentState = { name: simpleMatch[1], type: simpleMatch[2].trim(), constraints: [] };
        continue;
      }
    }

    // Operations section (## 操作 / ## Operations)
    if (currentSection.includes("操作") || currentSection.includes("operation")) {
      // ### name() format
      const headerMatch = trimmed.match(/^###\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.*)$/);
      if (headerMatch) {
        // Save previous operation if exists
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: headerMatch[1],
          parameters: headerMatch[2] ? headerMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          description: headerMatch[3] || undefined,
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // Simple ### name() format (no description)
      const simpleHeaderMatch = trimmed.match(/^###\s+(\w+)\s*\(([^)]*)\)\s*$/);
      if (simpleHeaderMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: simpleHeaderMatch[1],
          parameters: simpleHeaderMatch[2] ? simpleHeaderMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // - 事前条件: condition / - precondition: condition
      const preMatch = trimmed.match(/^[-*]\s+(?:事前条件|precondition)\s*:\s*(.+)$/);
      if (preMatch && currentOperation) {
        currentOperation.preconditions!.push(preMatch[1].trim());
        continue;
      }
      // - 効果: condition / - effect: condition / - postcondition: condition
      const postMatch = trimmed.match(/^[-*]\s+(?:効果|effect|postcondition)\s*:\s*(.+)$/);
      if (postMatch && currentOperation) {
        currentOperation.postconditions!.push(postMatch[1].trim());
        continue;
      }
      // Legacy format: - name(params): description
      const legacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.+)$/);
      if (legacyMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: legacyMatch[1],
          parameters: legacyMatch[2] ? legacyMatch[2].split(",").filter(p => p.trim()).map(p => {
            const [name, type] = p.trim().split(":").map(s => s.trim());
            return { name, type: type || "any" };
          }) : [],
          description: legacyMatch[3],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
      // Simple legacy format: - operation_name()
      const simpleLegacyMatch = trimmed.match(/^[-*]\s+(\w+)\s*\(\s*\)/);
      if (simpleLegacyMatch) {
        if (currentOperation) {
          spec.operations.push(currentOperation);
        }
        currentOperation = {
          name: simpleLegacyMatch[1],
          parameters: [],
          preconditions: [],
          postconditions: [],
        };
        continue;
      }
    }

    // Invariants section (## インバリアント / ## Invariants)
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

  // Don't forget to save the last items
  if (currentConstant) {
    spec.constants!.push(currentConstant);
  }
  if (currentState) {
    spec.states.push(currentState);
  }
  if (currentOperation) {
    spec.operations.push(currentOperation);
  }

  return spec;
}

/**
 * Parse constant value based on type
 */
function parseConstantValue(valueStr: string, type: string): unknown {
  const trimmed = valueStr.trim();

  // Integer types
  if (type === "int" || type === "integer" || type === "整数" || type === "i64" || type === "i32") {
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? trimmed : num;
  }

  // Float types
  if (type === "float" || type === "double" || type === "f64" || type === "f32") {
    const num = parseFloat(trimmed);
    return isNaN(num) ? trimmed : num;
  }

  // Boolean types
  if (type === "bool" || type === "boolean" || type === "真偽") {
    if (trimmed.toLowerCase() === "true" || trimmed === "真" || trimmed === "1") return true;
    if (trimmed.toLowerCase() === "false" || trimmed === "偽" || trimmed === "0") return false;
    return trimmed;
  }

  // Default: keep as string
  return trimmed;
}

// ============================================================================
// Quint Generator
// ============================================================================

function generateQuintSpec(spec: ParsedSpec, moduleName?: string): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

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
    quint += `  action ${op.name} = all {\n`;
    // Add preconditions as guard conditions (not comments)
    if (op.preconditions && op.preconditions.length > 0) {
      for (const pre of op.preconditions) {
        quint += `    ${pre},  // guard: precondition\n`;
      }
    }
    if (op.postconditions && op.postconditions.length > 0) {
      for (const post of op.postconditions) {
        quint += `    ${post},\n`;
      }
    } else {
      warnings.push(`Operation "${op.name}" has no postconditions - generating trivially true transition`);
      quint += `    // SKIPPED: No postconditions defined for ${op.name}\n`;
      quint += `    true\n`;
    }
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

  return { content: quint, warnings, errors };
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

function generateRustMacros(spec: ParsedSpec, structName?: string): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

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

  return { content: rust, warnings, errors };
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

/**
 * Translate condition to use model.field access for state variables
 */
function translateToModelAccess(condition: string, states: SpecState[]): string {
  let result = condition;
  // Sort by name length (longest first) to avoid partial replacements
  const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
  for (const state of sortedStates) {
    // Replace word-boundary delimited state names with model.field
    const regex = new RegExp(`\\b${state.name}\\b`, "g");
    result = result.replace(regex, `model.${state.name}`);
  }
  return result;
}

/**
 * Translate precondition to Rust expression for guard checks
 * Converts natural language/math notation to Rust boolean expressions
 * Uses model.field access pattern for state variables
 */
function translatePreconditionToRust(precondition: string, states: SpecState[], prefix: string = "model"): string {
  let result = translateConditionToRust(precondition);
  // Sort by name length (longest first) to avoid partial replacements
  const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
  for (const state of sortedStates) {
    const regex = new RegExp(`\\b${state.name}\\b`, "g");
    result = result.replace(regex, `${prefix}.${state.name}`);
  }
  return result;
}

/**
 * Translate postcondition to state transition code for operation tests
 * Returns Rust code that modifies model state
 */
function translatePostconditionToOperationCode(postcondition: string, states: SpecState[]): string {
  // Pattern: variable = expression (assignment form)
  const assignMatch = postcondition.match(/^(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expression] = assignMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToRust(expression);
      // Replace state variable references with model.field
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `model.${state.name}`);
      }
      // Convert == back to = for assignment
      translatedExpr = translatedExpr.replace(/==/g, "=");
      return `model.${varName} = ${translatedExpr};`;
    }
  }

  // Pattern: variable' = expression (primed variable form - TLA+ style)
  const primedMatch = postcondition.match(/^(\w+)'\s*=\s*(.+)$/);
  if (primedMatch) {
    const [, varName, expression] = primedMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = translateConditionToRust(expression);
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `model.${state.name}`);
      }
      translatedExpr = translatedExpr.replace(/==/g, "=");
      return `model.${varName} = ${translatedExpr};`;
    }
  }

  // Unable to translate - return as comment
  return `// TODO: Manual implementation for: ${postcondition}`;
}

/**
 * Translate postcondition to state transition code
 * Handles patterns like:
 * - "count = count + 1" -> "new_state.count = self.count + 1"
 * - "count == old_count + 1" -> "new_state.count = self.count + 1"
 */
interface TransitionResult {
  code: string;
  warning?: string;
}

function translatePostconditionToTransition(postcondition: string, states: SpecState[]): TransitionResult {
  // Pattern: variable = expression (assignment form)
  const assignMatch = postcondition.match(/^(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expression] = assignMatch;
    // Check if varName is a state variable
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      // Translate expression and use self.var for references
      let translatedExpr = translateConditionToRust(expression);
      // Replace state variable references with self.field
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `self.${state.name}`);
      }
      // Convert == back to = for assignment (since translateConditionToRust converts = to ==)
      translatedExpr = translatedExpr.replace(/==/g, "=");
      return { code: `new_state.${varName} = ${translatedExpr};` };
    }
  }

  // Pattern: variable == expression (postcondition assertion form)
  const assertMatch = postcondition.match(/^(\w+)\s*==\s*(.+)$/);
  if (assertMatch) {
    const [, varName, expression] = assertMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = expression;
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `self.${state.name}`);
      }
      return { code: `new_state.${varName} = ${translatedExpr};` };
    }
  }

  // Pattern: variable' == expression (primed variable form - TLA+ style)
  const primedMatch = postcondition.match(/^(\w+)'\s*==\s*(.+)$/);
  if (primedMatch) {
    const [, varName, expression] = primedMatch;
    const isStateVar = states.some(s => s.name === varName);
    if (isStateVar) {
      let translatedExpr = expression;
      const sortedStates = [...states].sort((a, b) => b.name.length - a.name.length);
      for (const state of sortedStates) {
        const regex = new RegExp(`\\b${state.name}\\b`, "g");
        translatedExpr = translatedExpr.replace(regex, `self.${state.name}`);
      }
      return { code: `new_state.${varName} = ${translatedExpr};` };
    }
  }

  // Unable to translate - return as comment for manual implementation
  return {
    code: `// TODO: Manual implementation needed for: ${postcondition}`,
    warning: `Postcondition "${postcondition}" could not be automatically translated - requires manual implementation`,
  };
}

// ============================================================================
// Property Test Generator
// ============================================================================

function generatePropertyTests(spec: ParsedSpec, structName?: string, testCount?: number): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];
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

  // Generate struct for testing
  tests += `/// Test struct for ${name}\n`;
  tests += `struct ${name}Test {\n`;
  for (const s of spec.states) {
    tests += `    ${s.name}: ${mapTypeToRust(s.type)},\n`;
  }
  tests += `}\n\n`;

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

    // Create model struct instance
    tests += `        let model = ${name}Test {\n`;
    for (const s of spec.states) {
      tests += `            ${s.name},\n`;
    }
    tests += `        };\n`;

    // Translate and assert the invariant condition
    const translatedCondition = translateConditionToRust(inv.condition);
    // Replace bare variable names with model.field access
    const modelCondition = translateToModelAccess(translatedCondition, spec.states);
    tests += `        prop_assert!(${modelCondition},\n`;
    tests += `            "Invariant ${inv.name} violated: ${inv.condition.replace(/"/g, '\\"')}");\n`;
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

    // Create model struct instance
    tests += `        let mut model = ${name}Test {\n`;
    for (const s of spec.states) {
      tests += `            ${s.name},\n`;
    }
    tests += `        };\n\n`;

    // Check preconditions
    if (op.preconditions && op.preconditions.length > 0) {
      tests += `        // Check preconditions\n`;
      const preconditionChecks = op.preconditions.map(pre => {
        return translatePreconditionToRust(pre, spec.states, "model");
      });
      tests += `        let preconditions_met = ${preconditionChecks.join(" && ")};\n\n`;
      tests += `        if preconditions_met {\n`;

      // Execute operation (apply postconditions)
      if (op.postconditions && op.postconditions.length > 0) {
        tests += `            // Execute operation: apply postconditions\n`;
        for (const post of op.postconditions) {
          const transitionCode = translatePostconditionToOperationCode(post, spec.states);
          tests += `            ${transitionCode}\n`;
        }
      } else {
        warnings.push(`Operation "${op.name}" has no postconditions - state remains unchanged`);
        tests += `            // No postconditions defined - state unchanged\n`;
      }

      // Check all invariants after operation
      tests += `\n`;
      tests += `            // Check invariants after operation\n`;
      for (const inv of spec.invariants) {
        const translatedCondition = translatePreconditionToRust(inv.condition, spec.states, "model");
        tests += `            prop_assert!(${translatedCondition},\n`;
        tests += `                "Invariant ${inv.name} violated after ${op.name}: ${inv.condition.replace(/"/g, '\\"')}");\n`;
      }
      tests += `        }\n`;
    } else {
      // No preconditions - operation is always valid
      warnings.push(`Operation "${op.name}" has no preconditions - assuming always valid`);

      // Execute operation (apply postconditions)
      if (op.postconditions && op.postconditions.length > 0) {
        tests += `        // Execute operation: apply postconditions\n`;
        for (const post of op.postconditions) {
          const transitionCode = translatePostconditionToOperationCode(post, spec.states);
          tests += `        ${transitionCode}\n`;
        }
      } else {
        warnings.push(`Operation "${op.name}" has no postconditions - state remains unchanged`);
        tests += `        // No postconditions defined - state unchanged\n`;
      }

      // Check all invariants after operation
      tests += `\n`;
      tests += `        // Check invariants after operation\n`;
      for (const inv of spec.invariants) {
        const translatedCondition = translatePreconditionToRust(inv.condition, spec.states, "model");
        tests += `        prop_assert!(${translatedCondition},\n`;
        tests += `            "Invariant ${inv.name} violated after ${op.name}: ${inv.condition.replace(/"/g, '\\"')}");\n`;
      }
    }

    tests += `    }\n`;
    tests += `}\n\n`;
  }

  return { content: tests, warnings, errors };
}

// ============================================================================
// MBT Driver Generator
// ============================================================================

function generateMBTDriver(spec: ParsedSpec, structName?: string, maxSteps?: number): GenerationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

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

    // Generate state transitions from postconditions
    if (op.postconditions && op.postconditions.length > 0) {
      for (const post of op.postconditions) {
        const transition = translatePostconditionToTransition(post, spec.states);
        if (transition.warning) {
          warnings.push(transition.warning);
        }
        mbt += `                ${transition.code}\n`;
      }
    } else {
      warnings.push(`Operation "${op.name}" has no postconditions - state remains unchanged`);
      mbt += `                // SKIPPED: No postconditions defined for ${op.name} - state unchanged\n`;
    }

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

  // Add note about required dependency
  mbt += `// Note: This MBT driver requires the 'rand' crate.\n`;
  mbt += `// Add to Cargo.toml: rand = "0.8"\n\n`;

  // Generate valid actions function based on preconditions
  if (spec.operations.length > 0) {
    mbt += `/// Generate list of valid actions based on model state and preconditions\n`;
    mbt += `fn generate_valid_actions(model: &${name}Model) -> Vec<${name}Action> {\n`;
    mbt += `    let mut actions = Vec::new();\n\n`;

    for (const op of spec.operations) {
      mbt += `    // Check precondition for ${capitalize(op.name)}\n`;
      if (op.preconditions && op.preconditions.length > 0) {
        const preconditionChecks = op.preconditions.map(pre => {
          return translatePreconditionToRust(pre, spec.states, "model");
        });
        mbt += `    if ${preconditionChecks.join(" && ")} {\n`;
      } else {
        // No preconditions - always valid
        warnings.push(`Operation "${op.name}" has no preconditions - assuming always valid in MBT`);
        mbt += `    // No preconditions - always valid\n`;
        mbt += `    {\n`;
      }

      // Add action to list
      if (op.parameters && op.parameters.length > 0) {
        const paramInits = op.parameters.map(p => {
          const rustType = mapTypeToRust(p.type);
          if (rustType === "i64" || rustType === "i32") {
            return `rand::thread_rng().gen_range(0..100)`;
          } else if (rustType === "bool") {
            return `rand::thread_rng().gen_bool(0.5)`;
          } else {
            return `Default::default()`;
          }
        }).join(", ");
        mbt += `        actions.push(${name}Action::${capitalize(op.name)} { ${op.parameters!.map((p, idx) =>
          `${p.name}: ${paramInits.split(", ")[idx]}`).join(", ")} });\n`;
      } else {
        mbt += `        actions.push(${name}Action::${capitalize(op.name)});\n`;
      }
      mbt += `    }\n\n`;
    }

    mbt += `    actions\n`;
    mbt += `}\n\n`;

    mbt += `/// Generate a random valid action based on model state\n`;
    mbt += `fn generate_action(model: &${name}Model) -> Option<${name}Action> {\n`;
    mbt += `    use rand::seq::SliceRandom;\n`;
    mbt += `    let valid_actions = generate_valid_actions(model);\n`;
    mbt += `    valid_actions.choose(&mut rand::thread_rng()).copied()\n`;
    mbt += `}\n\n`;
  }

  mbt += `/// Run model-based test\n`;
  mbt += `pub fn run_mbt(max_steps: usize) -> Result<(), String> {\n`;
  mbt += `    let mut model = ${name}Model::initial_state();\n`;
  mbt += `    // Default max_steps: ${maxStepsValue}\n\n`;
  mbt += `    for step in 0..max_steps {\n`;

  if (spec.operations.length > 0) {
    mbt += `        // Generate a valid action based on current model state\n`;
    mbt += `        match generate_action(&model) {\n`;
    mbt += `            Some(action) => {\n`;
    mbt += `                model = model.apply_action(&action);\n`;
    mbt += `                model.check_invariants()?;\n`;
    mbt += `                println!("Step {}: action={:?}, state={:?}", step, action, model);\n`;
    mbt += `            }\n`;
    mbt += `            None => {\n`;
    mbt += `                // No valid actions available - skip this step\n`;
    mbt += `                println!("Step {}: no valid actions available, state={:?}", step, model);\n`;
    mbt += `            }\n`;
    mbt += `        }\n`;
  } else {
    mbt += `        // No operations defined - nothing to test\n`;
    mbt += `        println!("Step {}: {:?}", step, model);\n`;
  }

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

  return { content: mbt, warnings, errors };
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
        const quintOutput = generateQuintSpec(spec, params.module_name);
        const quintPath = join(outputDir, `${spec.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.qnt`);
        writeFileSync(quintPath, quintOutput.content);
        result.outputs.quint = { path: quintPath, content: quintOutput.content };
        result.warnings.push(...quintOutput.warnings);
        result.errors.push(...quintOutput.errors);

        // Generate Rust macros
        const macrosOutput = generateRustMacros(spec, params.struct_name);
        const macrosPath = join(outputDir, "invariants.rs");
        writeFileSync(macrosPath, macrosOutput.content);
        result.outputs.macros = { path: macrosPath, content: macrosOutput.content };
        result.warnings.push(...macrosOutput.warnings);
        result.errors.push(...macrosOutput.errors);

        // Generate property tests
        const testsOutput = generatePropertyTests(spec, params.struct_name, params.test_count);
        const testsPath = join(outputDir, "property_tests.rs");
        writeFileSync(testsPath, testsOutput.content);
        result.outputs.tests = { path: testsPath, content: testsOutput.content };
        result.warnings.push(...testsOutput.warnings);
        result.errors.push(...testsOutput.errors);

        // Generate MBT driver
        const mbtOutput = generateMBTDriver(spec, params.struct_name, params.max_steps);
        const mbtPath = join(outputDir, "mbt_driver.rs");
        writeFileSync(mbtPath, mbtOutput.content);
        result.outputs.mbt = { path: mbtPath, content: mbtOutput.content };
        result.warnings.push(...mbtOutput.warnings);
        result.errors.push(...mbtOutput.errors);

        const durationMs = Date.now() - startTime;
        console.log(`[invariant-pipeline] Generation complete in ${durationMs}ms, outputs: ${Object.keys(result.outputs).join(", ")}, warnings: ${result.warnings.length}`);

        return {
          success: true,
          spec_title: spec.title,
          states_count: spec.states.length,
          operations_count: spec.operations.length,
          invariants_count: spec.invariants.length,
          outputs: result.outputs,
          warnings: result.warnings,
          errors: result.errors,
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
        const output = generateRustMacros(spec, params.struct_name);

        const outputPath = params.output_path || join(dirname(params.spec_path), "invariants.rs");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          invariants_count: spec.invariants.length,
          warnings: output.warnings,
          errors: output.errors,
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
        const output = generatePropertyTests(spec, params.struct_name, params.test_count);

        const outputPath = params.output_path || join(dirname(params.spec_path), "property_tests.rs");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          tests_count: spec.invariants.length + spec.operations.length,
          configured_test_count: params.test_count,
          warnings: output.warnings,
          errors: output.errors,
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
        const output = generateMBTDriver(spec, params.struct_name, params.max_steps);

        const outputPath = params.output_path || join(dirname(params.spec_path), "mbt_driver.rs");
        writeFileSync(outputPath, output.content);

        return {
          success: true,
          path: outputPath,
          content: output.content,
          actions_count: spec.operations.length,
          configured_max_steps: params.max_steps,
          warnings: output.warnings,
          errors: output.errors,
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
