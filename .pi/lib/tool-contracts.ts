/*
 * .pi/lib/tool-contracts.ts
 * 拡張ツール定義で繰り返し現れる入力契約を共通化する。
 * スキーマ説明と実行時バリデーションの揺れを減らすために存在する。
 * 関連ファイル: .pi/extensions/dynamic-tools.ts, .pi/extensions/loop.ts, tests/unit/lib/tool-contracts.test.ts
 */

import { Type } from "@mariozechner/pi-ai";

/**
 * @abdd.meta
 * path: .pi/lib/tool-contracts.ts
 * role: ツール契約の共通 TypeBox 定義と実行時検証を提供する
 * why: tool_id/tool_name の片側必須や limit/timeout の境界定義が各拡張に重複しているため
 * related: .pi/extensions/dynamic-tools.ts, .pi/extensions/loop.ts, tests/unit/lib/tool-contracts.test.ts
 * public_api: createTargetSelectorSchema, requireTargetSelector, createBoundedOptionalNumberSchema, createOptionalStringArraySchema, createOptionalEnumStringSchema
 * invariants: selector は id または name の少なくとも一方を要求する、数値 schema は min/max を保持する
 * side_effects: なし
 * failure_modes: 無効 selector 入力時は success=false を返す
 * @abdd.explain
 * overview: よく使うツール入力契約を helper 化し、説明文とバリデーションを共通化する
 * what_it_does:
 *   - id/name selector 用の TypeBox schema を生成する
 *   - 実行時に id/name の片側必須を検証する
 *   - 境界付きの optional number schema を生成する
 *   - 共通の string array / enum string schema を生成する
 * why_it_exists:
 *   - 各拡張で同じ入力契約を再定義しないため
 *   - エラーメッセージを統一するため
 *   - ツール説明を短く保ちながら境界条件を明確にするため
 * scope:
 *   in: selector 設定、数値説明文、min/max
 *   out: TypeBox schema、検証結果
 */

/**
 * selector schema の入力。
 * @summary selector schema 設定
 */
interface TargetSelectorSchemaInput {
  idKey: string;
  nameKey: string;
  idDescription: string;
  nameDescription: string;
}

/**
 * selector 検証結果。
 * @summary selector 検証結果
 */
export interface TargetSelectorValidationResult {
  success: boolean;
  error?: string;
}

/**
 * id/name selector 用 schema を作る。
 * @summary selector schema 作成
 * @param input selector 設定
 * @returns TypeBox schema
 */
export function createTargetSelectorSchema(input: TargetSelectorSchemaInput) {
  return Type.Object({
    [input.idKey]: Type.Optional(Type.String({ description: input.idDescription })),
    [input.nameKey]: Type.Optional(Type.String({ description: input.nameDescription })),
  });
}

/**
 * id または name の片側必須を検証する。
 * @summary selector 検証
 * @param input 入力オブジェクト
 * @param idKey ID キー
 * @param nameKey Name キー
 * @param label エラーメッセージ用ラベル
 * @returns 検証結果
 */
export function requireTargetSelector(
  input: object,
  idKey: string,
  nameKey: string,
  label: string,
): TargetSelectorValidationResult {
  const record = input as Record<string, unknown>;
  const idValue = typeof record[idKey] === "string" ? record[idKey].trim() : "";
  const nameValue = typeof record[nameKey] === "string" ? record[nameKey].trim() : "";

  if (idValue || nameValue) {
    return { success: true };
  }

  return {
    success: false,
    error: `エラー: ${idKey} または ${nameKey} を指定してください (${label})`,
  };
}

/**
 * 境界付き optional number schema を作る。
 * @summary 境界付き数値 schema 作成
 * @param description 説明文
 * @param minimum 最小値
 * @param maximum 最大値
 * @returns TypeBox schema
 */
export function createBoundedOptionalNumberSchema(
  description: string,
  minimum: number,
  maximum: number,
) {
  return Type.Optional(
    Type.Number({
      description,
      minimum,
      maximum,
    }),
  );
}

/**
 * optional string array schema を作る。
 * @summary 文字列配列 schema 作成
 * @param description 説明文
 * @returns TypeBox schema
 */
export function createOptionalStringArraySchema(description: string) {
  return Type.Optional(
    Type.Array(Type.String(), {
      description,
    }),
  );
}

/**
 * optional enum string schema を作る。
 * @summary enum string schema 作成
 * @param description 説明文
 * @param values 候補一覧
 * @returns TypeBox schema
 */
export function createOptionalEnumStringSchema<const TValues extends [string, ...string[]]>(
  description: string,
  values: TValues,
) {
  return Type.Optional(
    Type.Union(
      values.map((value) => Type.Literal(value)),
      { description },
    ),
  );
}
