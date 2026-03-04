import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBehaviorRecords, getAnalyticsPaths } from "./behavior-storage.js";
import { calculateAggregates } from "./efficiency-analyzer.js";
function aggregateHourly(date, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const generatedFiles = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    const records = loadBehaviorRecords(hourStart, hourEnd, cwd);
    if (records.length === 0) {
      continue;
    }
    const aggregates = calculateAggregates(records, "hour");
    if (!aggregates) {
      continue;
    }
    const localDate = `${hourStart.getFullYear()}-${String(hourStart.getMonth() + 1).padStart(2, "0")}-${String(hourStart.getDate()).padStart(2, "0")}`;
    const hourStr = `${localDate}T${hour.toString().padStart(2, "0")}`;
    const outputDir = join(paths.aggregates, "hourly");
    ensureDir(outputDir);
    const outputPath = join(outputDir, `${hourStr}.json`);
    writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");
    generatedFiles.push(outputPath);
  }
  return generatedFiles;
}
function aggregateDaily(date, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const records = loadBehaviorRecords(dayStart, dayEnd, cwd);
  if (records.length === 0) {
    return null;
  }
  const aggregates = calculateAggregates(records, "day");
  if (!aggregates) {
    return null;
  }
  const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
  const outputDir = join(paths.aggregates, "daily");
  ensureDir(outputDir);
  const outputPath = join(outputDir, `${dateStr}.json`);
  writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");
  return outputPath;
}
function aggregateWeekly(date, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const weekStart = new Date(date);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);
  const records = loadBehaviorRecords(weekStart, weekEnd, cwd);
  if (records.length === 0) {
    return null;
  }
  const aggregates = calculateAggregates(records, "week");
  if (!aggregates) {
    return null;
  }
  const weekNumber = getISOWeek(weekStart);
  const year = weekStart.getFullYear();
  const outputDir = join(paths.aggregates, "weekly");
  ensureDir(outputDir);
  const outputPath = join(outputDir, `${year}-W${weekNumber.toString().padStart(2, "0")}.json`);
  writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");
  return outputPath;
}
function runAggregation(days = 7, cwd) {
  const result = {
    hourly: 0,
    daily: 0,
    weekly: 0
  };
  for (let i = 0; i < days; i += 1) {
    const date = /* @__PURE__ */ new Date();
    date.setDate(date.getDate() - i);
    const dailyFile = aggregateDaily(date, cwd);
    if (dailyFile) {
      result.daily += 1;
    }
    const hourlyFiles = aggregateHourly(date, cwd);
    result.hourly += hourlyFiles.length;
  }
  const weeklyFile = aggregateWeekly(/* @__PURE__ */ new Date(), cwd);
  if (weeklyFile) {
    result.weekly = 1;
  }
  return result;
}
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function getISOWeek(date) {
  const tmpDate = new Date(date.valueOf());
  tmpDate.setHours(0, 0, 0, 0);
  tmpDate.setDate(tmpDate.getDate() + 4 - (tmpDate.getDay() || 7));
  const yearStart = new Date(tmpDate.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((tmpDate.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return weekNumber;
}
function loadAggregates(period, startDate, endDate, cwd) {
  const paths = getAnalyticsPaths(cwd);
  const aggregateDir = join(paths.aggregates, period);
  if (!existsSync(aggregateDir)) {
    return [];
  }
  const files = readdirSync(aggregateDir).filter((f) => f.endsWith(".json"));
  const aggregates = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(aggregateDir, file), "utf-8");
      const agg = JSON.parse(content);
      const aggStart = new Date(agg.startTime);
      if (aggStart >= startDate && aggStart <= endDate) {
        aggregates.push(agg);
      }
    } catch (error) {
      console.error("[analytics/aggregator] Failed to read analytics file:", join(aggregateDir, file), error);
    }
  }
  return aggregates.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
function getAggregationSummary(cwd) {
  const now = /* @__PURE__ */ new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayAggregates = loadAggregates("daily", todayStart, now, cwd);
  const today = todayAggregates.length > 0 ? todayAggregates[todayAggregates.length - 1] : null;
  const weekAggregates = loadAggregates("weekly", weekStart, now, cwd);
  const thisWeek = weekAggregates.length > 0 ? weekAggregates[weekAggregates.length - 1] : null;
  const last24Hours = loadAggregates("hourly", yesterday, now, cwd);
  return {
    today,
    thisWeek,
    last24Hours
  };
}
export {
  aggregateDaily,
  aggregateHourly,
  aggregateWeekly,
  getAggregationSummary,
  loadAggregates,
  runAggregation
};
