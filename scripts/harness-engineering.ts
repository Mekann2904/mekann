/**
 * path: scripts/harness-engineering.ts
 * role: harness engineering 診断を CLI から実行し、report や workflow template を出力する
 * why: pi の外でも repo の自走基盤を検査できる入口を用意するため
 * related: .pi/lib/harness-engineering.ts, .pi/extensions/harness-engineering.ts, package.json, WORKFLOW.md
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  assessHarnessEngineering,
  createAgentFirstWorkflowTemplate,
  renderHarnessAssessmentMarkdown,
} from "../.pi/lib/harness-engineering.js";

interface CliOptions {
  write: boolean;
  workflow: boolean;
  outputPath?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    workflow: false,
  };

  for (const raw of argv) {
    if (raw === "--write") {
      options.write = true;
      continue;
    }

    if (raw === "--workflow") {
      options.workflow = true;
      continue;
    }

    if (raw.startsWith("--output=")) {
      options.outputPath = raw.slice("--output=".length).trim();
    }
  }

  return options;
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.workflow) {
    const template = createAgentFirstWorkflowTemplate();
    if (options.write) {
      const outputPath = resolve(process.cwd(), options.outputPath ?? "WORKFLOW.md");
      ensureParentDir(outputPath);
      writeFileSync(outputPath, template);
      process.stdout.write(`workflow template written to ${outputPath}\n`);
      return;
    }

    process.stdout.write(template);
    return;
  }

  const assessment = assessHarnessEngineering(process.cwd());
  const report = renderHarnessAssessmentMarkdown(assessment);

  if (options.write) {
    const outputPath = resolve(process.cwd(), options.outputPath ?? ".pi/reports/harness-engineering-report.md");
    ensureParentDir(outputPath);
    writeFileSync(outputPath, report);
    process.stdout.write(`report written to ${outputPath}\n`);
    return;
  }

  process.stdout.write(report);
}

main();
