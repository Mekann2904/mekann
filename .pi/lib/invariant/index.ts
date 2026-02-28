/**
 * @abdd.meta
 * path: .pi/lib/invariant/index.ts
 * role: Invariant Pipelineモジュールのエクスポート
 * why: ドメイン層とアプリケーション層の機能を一元的にエクスポートするため
 * related: ./domain/types.ts, ./application/parser.ts, ./application/generators/*.ts
 * public_api: 全ての型と関数を再エクスポート
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Invariant Pipelineモジュールの統合エクスポートポイント
 * what_it_does: ドメイン型、パーサー、ジェネレーターを一箇所から提供する
 * why_it_exists: モジュール利用者への簡潔なAPIを提供するため
 * scope:
 *   in: なし
 *   out: 全モジュールのエクスポート
 */

// Domain layer
export type {
  SpecState,
  SpecOperation,
  SpecInvariant,
  ParsedSpec,
  GenerationOutput,
  GenerationResult,
  FileOutput,
  VerifyQuintInput,
  GenerateMacrosInput,
  GenerateTestsInput,
  GenerateMBTInput,
} from "./domain/types.js";

// Application layer - Parser
export { parseSpecMarkdown } from "./application/parser.js";

// Application layer - Generators
export { generateQuintSpec } from "./application/generators/quint.js";
export { generateTsValidators } from "./application/generators/validators.js";
export { generatePropertyTests } from "./application/generators/property-tests.js";
export { generateMBTDriver } from "./application/generators/mbt-driver.js";
