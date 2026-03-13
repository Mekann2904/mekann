/**
 * path: scripts/autoresearch-tbench.ts
 * role: terminal-bench 向け autoresearch の init/baseline/run/status CLI を提供する
 * why: pi 拡張と通常 CLI の両方から、同じ比較ロジックで改善ループを回せるようにするため
 * related: .pi/lib/autoresearch-tbench.ts, .pi/extensions/autoresearch-tbench.ts, scripts/run-terminal-bench.sh, package.json
 */

import {
  baselineAutoresearchTbench,
  getAutoresearchTbenchStatus,
  initAutoresearchTbench,
  renderAutoresearchTbenchStatus,
  runAutoresearchTbench,
} from "../.pi/lib/autoresearch-tbench.js";

interface CliOptions {
  selection?: string;
  taskNames?: string[];
  tag?: string;
  label?: string;
  timeoutMs?: number;
  preferMs?: number;
  commitMessage?: string;
  git: boolean;
  dataset?: string;
  datasetPath?: string;
  agent?: string;
  agentImportPath?: string;
  model?: string;
  nConcurrent?: number;
  jobsDir?: string;
  agentSetupTimeoutMultiplier?: number;
  forceBuild?: boolean | null;
  excludeTaskNames?: string[];
  json: boolean;
}

function parseBooleanToken(value: string): boolean {
  return value === "1" || value.toLowerCase() === "true";
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]): { subcommand: string; options: CliOptions } {
  const [subcommand = "status", ...rest] = argv;
  const options: CliOptions = {
    git: true,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const next = rest[index + 1];

    if (token === "--selection" && next) {
      options.selection = next;
      index += 1;
      continue;
    }
    if (token === "--task-names" && next) {
      options.taskNames = parseCsv(next);
      index += 1;
      continue;
    }
    if (token === "--tag" && next) {
      options.tag = next;
      index += 1;
      continue;
    }
    if (token === "--label" && next) {
      options.label = next;
      index += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (token === "--prefer-ms" && next) {
      options.preferMs = Number(next);
      index += 1;
      continue;
    }
    if (token === "--commit-message" && next) {
      options.commitMessage = next;
      index += 1;
      continue;
    }
    if (token === "--dataset" && next) {
      options.dataset = next;
      index += 1;
      continue;
    }
    if (token === "--dataset-path" && next) {
      options.datasetPath = next;
      index += 1;
      continue;
    }
    if (token === "--agent" && next) {
      options.agent = next;
      index += 1;
      continue;
    }
    if (token === "--agent-import-path" && next) {
      options.agentImportPath = next;
      index += 1;
      continue;
    }
    if (token === "--model" && next) {
      options.model = next;
      index += 1;
      continue;
    }
    if (token === "--n-concurrent" && next) {
      options.nConcurrent = Number(next);
      index += 1;
      continue;
    }
    if (token === "--jobs-dir" && next) {
      options.jobsDir = next;
      index += 1;
      continue;
    }
    if (token === "--agent-setup-timeout-multiplier" && next) {
      options.agentSetupTimeoutMultiplier = Number(next);
      index += 1;
      continue;
    }
    if (token === "--exclude-task-names" && next) {
      options.excludeTaskNames = parseCsv(next);
      index += 1;
      continue;
    }
    if (token === "--force-build" && next) {
      options.forceBuild = parseBooleanToken(next);
      index += 1;
      continue;
    }
    if (token === "--no-git") {
      options.git = false;
      continue;
    }
    if (token === "--json") {
      options.json = true;
    }
  }

  return { subcommand, options };
}

function printOutput(value: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const { subcommand, options } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  if (subcommand === "init") {
    const result = await initAutoresearchTbench(cwd, {
      selection: options.selection,
      taskNames: options.taskNames,
      tag: options.tag,
      git: options.git,
      dataset: options.dataset,
      datasetPath: options.datasetPath,
      agent: options.agent,
      agentImportPath: options.agentImportPath,
      model: options.model,
      nConcurrent: options.nConcurrent,
      jobsDir: options.jobsDir,
      agentSetupTimeoutMultiplier: options.agentSetupTimeoutMultiplier,
      forceBuild: options.forceBuild,
      excludeTaskNames: options.excludeTaskNames,
    });

    printOutput({
      action: "init",
      branch: result.branchName,
      headCommit: result.headCommit,
      taskNames: result.state.runConfig.taskNames,
      taskSelector: result.state.runConfig.taskSelector,
      jobsDir: result.state.runConfig.jobsDir,
    }, options.json);
    return;
  }

  if (subcommand === "baseline") {
    const result = await baselineAutoresearchTbench(cwd, {
      label: options.label,
      timeoutMs: options.timeoutMs,
      preferMs: options.preferMs,
    });
    printOutput({
      action: "baseline",
      outcome: result.outcome,
      score: result.score,
      commit: result.commit,
      preferredBudgetExceeded: result.preferredBudgetExceeded,
      jobDir: result.run.jobDir,
      resultPath: result.run.resultPath,
      logPath: result.run.artifacts.logPath,
    }, options.json);
    return;
  }

  if (subcommand === "run") {
    const result = await runAutoresearchTbench(cwd, {
      label: options.label,
      timeoutMs: options.timeoutMs,
      preferMs: options.preferMs,
      commitMessage: options.commitMessage,
    });
    printOutput({
      action: "run",
      outcome: result.outcome,
      score: result.score,
      commit: result.commit,
      preferredBudgetExceeded: result.preferredBudgetExceeded,
      jobDir: result.run.jobDir,
      resultPath: result.run.resultPath,
      logPath: result.run.artifacts.logPath,
    }, options.json);
    return;
  }

  if (subcommand === "status") {
    const result = await getAutoresearchTbenchStatus(cwd);
    printOutput(options.json ? {
      action: "status",
      ...result,
    } : renderAutoresearchTbenchStatus(result), options.json);
    return;
  }

  throw new Error(`unknown subcommand: ${subcommand}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
