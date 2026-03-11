// Path: .pi/lib/artifact-output.ts
// Description: DAG 実行結果から成果物として保存すべき本文を選ぶ共通ヘルパーです。
// Why: subagents と ul-workflow で同じ判定を共有し、成果物破損の再発を防ぐためです。
// Related: .pi/extensions/subagents.ts, .pi/extensions/ul-workflow.ts, .pi/tests/lib/artifact-output.test.ts

/**
 * DAG の task output から文字列本文だけを取り出す。
 */
export function extractDagTaskOutput(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const maybeOutput = (result as { output?: unknown }).output;
  return typeof maybeOutput === "string" ? maybeOutput.trim() : "";
}

/**
 * 成果物として保存する本文を選ぶ。
 * まず指定 task の出力を優先し、空なら最後の正常な completed 出力へフォールバックする。
 */
export function selectArtifactContent<T extends { status: string; output?: unknown }>(
  taskResults: Iterable<[string, T]>,
  preferredArtifactTaskId?: string,
  aggregatedOutput: string = "",
): string {
  const entries = Array.from(taskResults);
  const preferredOutput = preferredArtifactTaskId?.trim()
    ? extractDagTaskOutput(
      entries.find(([taskId]) => taskId === preferredArtifactTaskId.trim())?.[1]?.output,
    )
    : "";

  if (preferredOutput) {
    return preferredOutput;
  }

  const completedOutputs = entries
    .filter(([, result]) => result.status === "completed")
    .map(([, result]) => extractDagTaskOutput(result.output))
    .filter(Boolean);

  return completedOutputs[completedOutputs.length - 1] || aggregatedOutput;
}
