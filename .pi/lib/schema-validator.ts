/**
 * @abdd.meta
 * path: .pi/lib/schema-validator.ts
 * role: ツール入力パラメータのJSON Schemaバリデーションを行うユーティリティ
 * why: ツール呼び出し時の入力検証を一元化し、型安全性を保証するため
 * related: .pi/lib/errors.ts, .pi/lib/tool-compiler.ts
 * public_api: validateToolInput, validateSchema, SchemaValidationResult
 * invariants: Ajvインスタンスはシングルトンとして再利用される
 * side_effects: なし（純粋な関数）
 * failure_modes: スキーマが無効な場合、入力がスキーマに一致しない場合
 * @abdd.explain
 * overview: JSON Schemaを使用してツール入力を検証するバリデーションシステム
 * what_it_does:
 *   - ツール定義のパラメータスキーマを検証する
 *   - 入力値をスキーマに対して検証する
 *   - 詳細なエラーメッセージを生成する
 * why_it_exists:
 *   - ツール呼び出しの型安全性を保証するため
 *   - 無効な入力によるランタイムエラーを防止するため
 * scope:
 *   in: ツール定義、入力値、スキーマ
 *   out: 検証結果、エラーメッセージ
 */

/**
 * Schema Validator - Validates tool input parameters against JSON Schema.
 *
 * Phase 3.3: Safety Property - Input Validation Completeness
 *
 * This module provides schema validation for tool parameters using Ajv.
 * It ensures that all tool inputs conform to their defined schemas.
 */

/**
 * スキーマ検証結果
 * @summary 検証結果
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

/**
 * スキーマ検証エラー
 * @summary 検証エラー
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  keyword?: string;
  schemaPath?: string;
}

/**
 * ツール定義インターフェース
 * @summary ツール定義
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: unknown;
  source?: string;
}

// シンプルなスキーマバリデーション実装
// Ajvの依存を避けるため、基本的な検証ロジックを実装

/**
 * 値がオブジェクトかどうかを判定
 * @summary オブジェクト判定
 * @param value - 判定対象の値
 * @returns オブジェクトの場合true
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 値が配列かどうかを判定
 * @summary 配列判定
 * @param value - 判定対象の値
 * @returns 配列の場合true
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * スキーマに対して値を検証
 * @summary スキーマ検証
 * @param schema - JSON Schema
 * @param value - 検証対象の値
 * @param path - 現在のパス
 * @returns 検証結果
 */
function validateAgainstSchema(
  schema: Record<string, unknown>,
  value: unknown,
  path = ''
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  if (!isObject(schema)) {
    return errors;
  }

  // type チェック
  if (typeof schema.type === 'string') {
    const expectedType = schema.type;
    let actualType: string;

    if (value === null) {
      actualType = 'null';
    } else if (isArray(value)) {
      actualType = 'array';
    } else {
      actualType = typeof value;
    }

    // JSON Schema type マッピング
    const typeMatches = 
      (expectedType === 'object' && isObject(value)) ||
      (expectedType === 'array' && isArray(value)) ||
      (expectedType === 'string' && typeof value === 'string') ||
      (expectedType === 'number' && typeof value === 'number') ||
      (expectedType === 'integer' && Number.isInteger(value)) ||
      (expectedType === 'boolean' && typeof value === 'boolean') ||
      (expectedType === 'null' && value === null);

    if (!typeMatches && expectedType !== actualType) {
      errors.push({
        path: path || '/',
        message: `Expected type "${expectedType}" but got "${actualType}"`,
        keyword: 'type'
      });
    }
  }

  // required チェック
  if (isArray(schema.required) && isObject(value)) {
    for (const req of schema.required) {
      if (typeof req === 'string' && !(req in value)) {
        errors.push({
          path: path || '/',
          message: `Missing required property "${req}"`,
          keyword: 'required'
        });
      }
    }
  }

  // properties チェック（再帰的）
  if (isObject(schema.properties) && isObject(value)) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in value && isObject(propSchema)) {
        const propErrors = validateAgainstSchema(
          propSchema,
          value[propName],
          path ? `${path}.${propName}` : propName
        );
        errors.push(...propErrors);
      }
    }
  }

  // items チェック（配列用）
  if (isObject(schema.items) && isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemErrors = validateAgainstSchema(
        schema.items,
        value[i],
        path ? `${path}[${i}]` : `[${i}]`
      );
      errors.push(...itemErrors);
    }
  }

  // enum チェック
  if (isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push({
        path: path || '/',
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        keyword: 'enum'
      });
    }
  }

  // minLength チェック
  if (typeof schema.minLength === 'number' && typeof value === 'string') {
    if (value.length < schema.minLength) {
      errors.push({
        path: path || '/',
        message: `String length ${value.length} is less than minimum ${schema.minLength}`,
        keyword: 'minLength'
      });
    }
  }

  // maxLength チェック
  if (typeof schema.maxLength === 'number' && typeof value === 'string') {
    if (value.length > schema.maxLength) {
      errors.push({
        path: path || '/',
        message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
        keyword: 'maxLength'
      });
    }
  }

  // minimum チェック
  if (typeof schema.minimum === 'number' && typeof value === 'number') {
    if (value < schema.minimum) {
      errors.push({
        path: path || '/',
        message: `Value ${value} is less than minimum ${schema.minimum}`,
        keyword: 'minimum'
      });
    }
  }

  // maximum チェック
  if (typeof schema.maximum === 'number' && typeof value === 'number') {
    if (value > schema.maximum) {
      errors.push({
        path: path || '/',
        message: `Value ${value} exceeds maximum ${schema.maximum}`,
        keyword: 'maximum'
      });
    }
  }

  return errors;
}

/**
 * スキーマ自体の正当性を検証
 * @summary スキーマ検証
 * @param schema - 検証対象のスキーマ
 * @returns 検証結果
 */
export function validateSchema(schema: unknown): SchemaValidationResult {
  const errors: SchemaValidationError[] = [];

  if (!isObject(schema)) {
    return {
      valid: false,
      errors: [{ path: '/', message: 'Schema must be an object', keyword: 'type' }]
    };
  }

  // 基本的なスキーマ構造の検証
  if (schema.type !== undefined && typeof schema.type !== 'string' && !isArray(schema.type)) {
    errors.push({
      path: '/type',
      message: 'type must be a string or array',
      keyword: 'type'
    });
  }

  if (schema.properties !== undefined && !isObject(schema.properties)) {
    errors.push({
      path: '/properties',
      message: 'properties must be an object',
      keyword: 'type'
    });
  }

  if (schema.required !== undefined && !isArray(schema.required)) {
    errors.push({
      path: '/required',
      message: 'required must be an array',
      keyword: 'type'
    });
  }

  if (schema.enum !== undefined && !isArray(schema.enum)) {
    errors.push({
      path: '/enum',
      message: 'enum must be an array',
      keyword: 'type'
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * ツール入力を検証
 * @summary ツール入力検証
 * @param tool - ツール定義
 * @param input - 入力値
 * @returns 検証結果
 */
export function validateToolInput(
  tool: ToolDefinition,
  input: unknown
): SchemaValidationResult {
  // パラメータスキーマがない場合は成功
  if (!tool.parameters) {
    return { valid: true, errors: [] };
  }

  // スキーマ自体を検証
  const schemaResult = validateSchema(tool.parameters);
  if (!schemaResult.valid) {
    return {
      valid: false,
      errors: [
        {
          path: '/',
          message: `Invalid schema for tool ${tool.name}: ${schemaResult.errors.map(e => e.message).join(', ')}`
        }
      ]
    };
  }

  // 入力をスキーマに対して検証
  const errors = validateAgainstSchema(
    tool.parameters as Record<string, unknown>,
    input
  );

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 複数のツール定義のスキーマを一括検証
 * @summary 一括スキーマ検証
 * @param tools - ツール定義の配列
 * @returns ツール名ごとの検証結果
 */
export function validateToolSchemas(
  tools: ToolDefinition[]
): Map<string, SchemaValidationResult> {
  const results = new Map<string, SchemaValidationResult>();

  for (const tool of tools) {
    if (tool.parameters) {
      results.set(tool.name, validateSchema(tool.parameters));
    }
  }

  return results;
}

/**
 * ツール名の重複を検出
 * @summary ツール名重複検出
 * @param tools - ツール定義の配列
 * @returns 重複しているツール名のリスト
 */
export function detectToolNameCollisions(
  tools: ToolDefinition[]
): Array<{ name: string; sources: string[] }> {
  const nameMap = new Map<string, string[]>();

  for (const tool of tools) {
    const sources = nameMap.get(tool.name) || [];
    sources.push(tool.source || 'unknown');
    nameMap.set(tool.name, sources);
  }

  const collisions: Array<{ name: string; sources: string[] }> = [];
  for (const [name, sources] of nameMap) {
    if (sources.length > 1) {
      collisions.push({ name, sources });
    }
  }

  return collisions;
}
