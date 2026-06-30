/**
 * autoresearch/runner/secrets.ts — 秘密情報フィルタ。
 *
 * spawn (streaming log) と artifacts (成果物書き出し) の両方から利用される、
 * 秘密情報マスキングの単一入口。実体は共通 redactor
 * ({@link "../../../context/tool-output/redact.js"}) に委譲し、ここでは
 * runner 配下で使う `.text` 取得を一箇所に閉じ込める。
 */

import { redactSecrets } from "../../../context/tool-output/redact.js";

/**
 * text から秘密情報をマスクした結果を返す。
 * 呼び出し側は undefined を扱わないこと（必要なら `?? ""` で空文字化して渡す）。
 */
export function redactText(text: string): string {
	return redactSecrets(text).text;
}
