import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LLM_BEHAVIOR_CONFIG } from "./llm-behavior-types.js";
import { createRunId } from "../agent/agent-utils.js";
import {
  collectPromptMetrics,
  collectOutputMetrics,
  collectQualityMetrics,
  collectExecutionMetrics,
  extractExecutionContext
} from "./metric-collectors.js";
function getAnalyticsPaths(cwd) {
  const root = cwd ?? process.cwd();
  const basePath = join(root, ".pi", "analytics", "llm-behavior");
  return {
    base: basePath,
    records: join(basePath, "records"),
    aggregates: join(basePath, "aggregates"),
    anomalies: join(basePath, "anomalies")
  };
}
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function recordBehaviorMetrics(record, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const dateStr = record.timestamp.split("T")[0];
  const dateDir = join(paths.records, dateStr);
  ensureDir(dateDir);
  const filePath = join(dateDir, `${record.id}.json`);
  writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
  return filePath;
}
function createAndRecordMetrics(params) {
  const record = {
    id: createRunId(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    source: params.source,
    prompt: collectPromptMetrics(params.prompt.text, {
      skills: params.prompt.skills,
      hasSystemPrompt: params.prompt.hasSystemPrompt,
      hasExamples: params.prompt.hasExamples
    }),
    output: collectOutputMetrics(params.output.text),
    execution: collectExecutionMetrics({
      durationMs: params.execution.durationMs,
      retryCount: params.execution.retryCount,
      outcomeCode: params.execution.outcomeCode,
      modelUsed: params.execution.modelUsed,
      thinkingLevel: params.execution.thinkingLevel
    }),
    quality: collectQualityMetrics(params.output.text, {
      isValid: params.output.isValid
    }),
    context: extractExecutionContext(
      params.context.task,
      params.context.agentId,
      params.context.parentRunId
    )
  };
  recordBehaviorMetrics(record, params.cwd);
  return record;
}
function loadBehaviorRecords(startDate, endDate, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const records = [];
  if (!existsSync(paths.records)) {
    return records;
  }
  const dateDirs = readdirSync(paths.records);
  for (const dateDir of dateDirs) {
    const dirDateStart = /* @__PURE__ */ new Date(dateDir + "T00:00:00Z");
    const dirDateEnd = /* @__PURE__ */ new Date(dateDir + "T23:59:59.999Z");
    if (dirDateEnd < startDate || dirDateStart > endDate) {
      continue;
    }
    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }
    const files = readdirSync(fullPath).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const filePath = join(fullPath, file);
        const content = readFileSync(filePath, "utf-8");
        const record = JSON.parse(content);
        const recordDate = new Date(record.timestamp);
        if (recordDate >= startDate && recordDate <= endDate) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Failed to load record: ${file}`, error);
      }
    }
  }
  return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function loadRecentRecords(limit, cwd) {
  const paths = getAnalyticsPaths(cwd);
  if (!existsSync(paths.records)) {
    return [];
  }
  const records = [];
  const dateDirs = readdirSync(paths.records).sort().reverse();
  for (const dateDir of dateDirs) {
    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }
    const files = readdirSync(fullPath).filter((f) => f.endsWith(".json")).sort().reverse();
    for (const file of files) {
      if (records.length >= limit) {
        return records;
      }
      try {
        const filePath = join(fullPath, file);
        const content = readFileSync(filePath, "utf-8");
        const record = JSON.parse(content);
        records.push(record);
      } catch (error) {
        console.warn(`Failed to load record: ${file}`, error);
      }
    }
  }
  return records;
}
function cleanupOldRecords(config = DEFAULT_LLM_BEHAVIOR_CONFIG, cwd) {
  const paths = getAnalyticsPaths(cwd);
  if (!existsSync(paths.records)) {
    return 0;
  }
  const cutoffDate = /* @__PURE__ */ new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.retention.recordsDays);
  let deletedCount = 0;
  const dateDirs = readdirSync(paths.records);
  for (const dateDir of dateDirs) {
    const dirDate = new Date(dateDir);
    if (dirDate < cutoffDate) {
      const fullPath = join(paths.records, dateDir);
      try {
        const files = readdirSync(fullPath);
        for (const file of files) {
          unlinkSync(join(fullPath, file));
          deletedCount += 1;
        }
        try {
          unlinkSync(fullPath);
        } catch {
        }
      } catch (error) {
        console.warn(`Failed to cleanup: ${dateDir}`, error);
      }
    }
  }
  return deletedCount;
}
function getStorageStats(cwd) {
  const paths = getAnalyticsPaths(cwd);
  if (!existsSync(paths.records)) {
    return {
      totalRecords: 0,
      totalSizeBytes: 0,
      oldestRecord: null,
      newestRecord: null,
      dateDirCount: 0
    };
  }
  let totalRecords = 0;
  let totalSizeBytes = 0;
  let oldestRecord = null;
  let newestRecord = null;
  let dateDirCount = 0;
  const dateDirs = readdirSync(paths.records).sort();
  for (const dateDir of dateDirs) {
    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }
    dateDirCount += 1;
    const files = readdirSync(fullPath).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const filePath = join(fullPath, file);
      const stats = statSync(filePath);
      totalRecords += 1;
      totalSizeBytes += stats.size;
      if (!oldestRecord) {
        oldestRecord = dateDir;
      }
      newestRecord = dateDir;
    }
  }
  return {
    totalRecords,
    totalSizeBytes,
    oldestRecord,
    newestRecord,
    dateDirCount
  };
}
export {
  cleanupOldRecords,
  createAndRecordMetrics,
  getAnalyticsPaths,
  getStorageStats,
  loadBehaviorRecords,
  loadRecentRecords,
  recordBehaviorMetrics
};
