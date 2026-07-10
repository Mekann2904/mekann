import { completeSimple } from "@earendil-works/pi-ai";
import type { Context, Model, Api, AssistantMessage } from "@earendil-works/pi-ai";

export interface CommitInput {
	sha: string;
	subject: string;
	author: string;
	diff: string;
}

/**
 * Build the LLM context (system + single user turn) for one commit.
 * Pure — extracted for unit testing of the prompt shape.
 */
export function buildPromptContext(input: CommitInput): Context {
	const system = [
		"あなたは Git のコミットメッセージを Conventional Commits 形式で書き直す専門家です。",
		"ルール:",
		"- 1行目は `type(scope): 概要` の形式にすること（type は feat/fix/refactor/test/docs/chore/perf/build/ci/style のいずれか）。",
		"- 1行目は50文字以内、日本語で、コード追加の意図を端的に表すこと。",
		"- diff の実態（何が・どこが・なぜ変わったか）を正確に反映すること。元の貧弱なメッセージに引きずられないこと。",
		"- 本文が必要な場合は1行空行を挟み、箇条書きで要点を記載してもよい。",
		"- コードブロックやクォートで囲まないこと。コミットメッセージ本文そのものを出力すること。",
		"- 余計な挨拶・説明・前置きは一切不要。メッセージのみを出力すること。",
	].join("\n");

	const user = [
		`元のコミットメッセージ: ${input.subject}`,
		`作者: ${input.author}`,
		`コミット: ${input.sha}`,
		"",
		"以下の diff を確認し、適切なコミットメッセージを1つ生成してください。",
		"",
		"```diff",
		input.diff,
		"```",
	].join("\n");

	return {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
	};
}

function extractText(message: AssistantMessage): string {
	return message.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

/**
 * Generate a rewritten commit message for one commit using the given model.
 * Throws on API errors or empty output so the caller can stop the run cleanly.
 */
export async function generateCommitMessage(model: Model<Api>, input: CommitInput, signal?: AbortSignal): Promise<string> {
	const context = buildPromptContext(input);
	const message = await completeSimple(model, context, { signal });
	const text = extractText(message);
	if (!text) {
		throw new Error(`モデルが空のメッセージを返しました (${input.sha})`);
	}
	return text;
}
