/**
 * Tool: autoresearch_evaluate_query
 * ユーザの自然文クエリを評価し、autoresearch 実験契約に変換できるか判定。
 */

import { evaluateQueryStatically } from "../queryEvaluation.js";
import type { SessionStore, ToolResponse } from "./sessionStore.js";

export function executeEvaluateQuery(
	store: SessionStore,
	params: { query: string },
): ToolResponse {
	const evaluation = evaluateQueryStatically(params.query);
	const r = evaluation.readiness;
	const m = evaluation.contractDraft.primaryMetric;

	const text = [
		`## クエリ評価結果`,
		``,
		`**判定**: ${evaluation.decision}`,
		``,
		`### 段階別 readiness`,
		`- initReady: ${r.initReady}`,
		`- runReady: ${r.runReady}`,
		`- metricExtractionReady: ${r.metricExtractionReady}`,
		`- checksReady: ${r.checksReady}`,
		`- logReady: ${r.logReady}`,
		``,
		`### 測定方法`,
		`- measurementMethod: ${m.measurementMethod}`,
		`- extractionConfidence: ${m.extractionConfidence.toFixed(2)}`,
		`- extractionRule: ${m.extractionRule ?? "(未定)"}`,
		``,
		`### checks policy`,
		evaluation.contractDraft.checksPolicy,
		``,
		`### スコア`,
		`- readiness: ${evaluation.scores.readiness.toFixed(2)}`,
		`- completeness: ${evaluation.scores.completeness.toFixed(2)}`,
		`- measurability: ${evaluation.scores.measurability.toFixed(2)}`,
		`- commandReadiness: ${evaluation.scores.commandReadiness.toFixed(2)}`,
		`- scopeClarity: ${evaluation.scores.scopeClarity.toFixed(2)}`,
		`- safety: ${evaluation.scores.safety.toFixed(2)}`,
		`- reproducibility: ${evaluation.scores.reproducibility.toFixed(2)}`,
		``,
		evaluation.contractDraft.missingFields.length > 0
			? `### 欠落フィールド\n${evaluation.contractDraft.missingFields.map(f => `- ${f}`).join("\n")}\n`
			: "",
		evaluation.blockingIssues.length > 0
			? `### ブロッキング issue\n${evaluation.blockingIssues.map(i => `- ${i}`).join("\n")}\n`
			: "",
		evaluation.riskFlags.length > 0
			? `### リスク\n${evaluation.riskFlags.map(fl => `- ⚠️ ${fl}`).join("\n")}\n`
			: "",
		evaluation.suggestedRewrite
			? `### 推奨書き換え\n${evaluation.suggestedRewrite}\n`
			: "",
		evaluation.clarifyingQuestions.length > 0
			? `### 確認質問\n${evaluation.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`
			: "",
		`### 実験契約ドラフト`,
		`- 目的: ${evaluation.contractDraft.objective || "(未定)"}`,
		`- 対象: ${evaluation.contractDraft.targetScope.length > 0 ? evaluation.contractDraft.targetScope.join(", ") : "(未定)"}`,
		`- 主指標: ${m.name ?? "(未定)"}(${m.direction})`,
		`- benchmark: ${evaluation.contractDraft.benchmarkCommand ?? "(未定)"}`,
		`- checks: ${evaluation.contractDraft.checksCommand ?? "(未定)"}`,
	].filter(Boolean).join("\n");

	return store.textDetails(text, evaluation as unknown as Record<string, unknown>);
}
