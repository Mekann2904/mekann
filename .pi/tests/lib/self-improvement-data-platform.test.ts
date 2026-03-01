/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildIntegratedDataView,
  runAllAnalyses,
  generatePhilosophicalReflections,
  generateInsightReport,
  saveInsightReport,
  loadLatestInsightReport,
  listInsightReports,
  formatInsightReportAsText,
  generatePlatformSummary,
  DEFAULT_CONFIG,
  PLATFORM_VERSION,
  PHILOSOPHICAL_PERSPECTIVES,
  type IntegratedDataView,
  type AnalysisResult,
  type InsightReport,
  type PlatformConfig,
} from "../../lib/self-improvement-data-platform.js";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("self-improvement-data-platform", () => {
  const testDir = join(process.cwd(), ".pi", "tests", "fixtures", "platform-test");
  const insightsDir = join(testDir, ".pi", "memory", "insights");

  beforeEach(() => {
    vi.clearAllMocks();
    // Create test directories
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Constants", () => {
    it("should_have_correct_platform_version", () => {
      expect(PLATFORM_VERSION).toBe(1);
    });

    it("should_have_default_config_values", () => {
      expect(DEFAULT_CONFIG.enableSemanticAnalysis).toBe(true);
      expect(DEFAULT_CONFIG.enablePatternAnalysis).toBe(true);
      expect(DEFAULT_CONFIG.enableUsageAnalysis).toBe(true);
      expect(DEFAULT_CONFIG.enablePhilosophicalReflection).toBe(true);
      expect(DEFAULT_CONFIG.maxInsightsPerReport).toBe(20);
      expect(DEFAULT_CONFIG.dataRetentionDays).toBe(90);
    });

    it("should_have_seven_philosophical_perspectives", () => {
      const perspectives = Object.keys(PHILOSOPHICAL_PERSPECTIVES);
      expect(perspectives).toContain("deconstruction");
      expect(perspectives).toContain("schizoanalysis");
      expect(perspectives).toContain("eudaimonia");
      expect(perspectives).toContain("utopia_dystopia");
      expect(perspectives).toContain("philosophy_of_thought");
      expect(perspectives).toContain("taxonomy_of_thought");
      expect(perspectives).toContain("logic");
      expect(perspectives.length).toBe(7);
    });

    it("should_have_required_properties_for_each_perspective", () => {
      for (const [_key, perspective] of Object.entries(PHILOSOPHICAL_PERSPECTIVES)) {
        expect(perspective.name).toBeDefined();
        expect(perspective.coreQuestion).toBeDefined();
        expect(perspective.practiceGuide).toBeDefined();
      }
    });
  });

  describe("buildIntegratedDataView", () => {
    it("should_return_data_view_with_timestamp", () => {
      // Arrange & Act
      const dataView = buildIntegratedDataView(testDir);

      // Assert
      expect(dataView.timestamp).toBeDefined();
      const timestamp = new Date(dataView.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("should_handle_missing_data_sources_gracefully", () => {
      // Arrange & Act
      const dataView = buildIntegratedDataView(testDir);

      // Assert - In empty test directory, data sources may be initialized with empty structures
      expect(dataView.timestamp).toBeDefined();
      // runIndex, patterns, semanticMemory may be initialized with empty structures
      // Only usageStats requires specific file
      expect(dataView.usageStats).toBeNull();
    });

    it("should_respect_config_flags", () => {
      // Arrange
      const config: PlatformConfig = {
        enableSemanticAnalysis: false,
        enablePatternAnalysis: false,
        enableUsageAnalysis: false,
        enablePhilosophicalReflection: true,
        maxInsightsPerReport: 20,
        dataRetentionDays: 90,
      };

      // Act
      const dataView = buildIntegratedDataView(testDir, config);

      // Assert
      expect(dataView.runIndex).toBeNull();
      expect(dataView.patterns).toBeNull();
      expect(dataView.semanticMemory).toBeNull();
      expect(dataView.usageStats).toBeNull();
    });
  });

  describe("runAllAnalyses", () => {
    it("should_return_analysis_results", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: null,
      };

      // Act
      const results = runAllAnalyses(dataView);

      // Assert
      expect(Array.isArray(results)).toBe(true);
    });

    it("should_include_pattern_analysis_when_no_data", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: null,
      };

      // Act
      const results = runAllAnalyses(dataView);

      // Assert - Should have observation about missing pattern data
      const patternResult = results.find((r) => r.category === "pattern");
      expect(patternResult).toBeDefined();
    });

    it("should_analyze_error_rate_when_stats_available", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: {
          totalToolCalls: 100,
          totalErrors: 10,
          errorRate: 0.1,
          avgContextRatio: 0.5,
          topExtensions: [],
        },
      };

      // Act
      const results = runAllAnalyses(dataView);

      // Assert
      const anomalyResult = results.find((r) => r.category === "anomaly");
      expect(anomalyResult).toBeDefined();
    });

    it("should_limit_results_reasonably", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: {
          totalToolCalls: 100,
          totalErrors: 20,
          errorRate: 0.2,
          avgContextRatio: 0.9,
          topExtensions: [
            { extension: "ext1", calls: 50, errors: 10, errorRate: 0.2 },
            { extension: "ext2", calls: 30, errors: 5, errorRate: 0.17 },
          ],
        },
      };

      // Act
      const results = runAllAnalyses(dataView);

      // Assert - Results should be reasonable in size
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(DEFAULT_CONFIG.maxInsightsPerReport);
    });
  });

  describe("generatePhilosophicalReflections", () => {
    it("should_generate_reflections_when_enabled", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: {
          totalToolCalls: 10,
          totalErrors: 1,
          errorRate: 0.1,
          avgContextRatio: 0.5,
          topExtensions: [{ extension: "test", calls: 10, errors: 1, errorRate: 0.1 }],
        },
      };

      const analyses: AnalysisResult[] = [
        {
          timestamp: dataView.timestamp,
          category: "anomaly",
          title: "Test",
          description: "Test",
          evidence: [],
          confidence: 0.5,
          severity: "medium",
        },
      ];

      // Act
      const reflections = generatePhilosophicalReflections(dataView, analyses);

      // Assert
      expect(reflections.length).toBeGreaterThan(0);
    });

    it("should_skip_when_disabled", () => {
      // Arrange
      const config: PlatformConfig = {
        ...DEFAULT_CONFIG,
        enablePhilosophicalReflection: false,
      };

      // Act
      const reflections = generatePhilosophicalReflections(
        { timestamp: "", runIndex: null, patterns: null, semanticMemory: null, usageStats: null },
        [],
        config
      );

      // Assert
      expect(reflections).toEqual([]);
    });

    it("should_include_perspective_and_question", () => {
      // Arrange
      const dataView: IntegratedDataView = {
        timestamp: new Date().toISOString(),
        runIndex: null,
        patterns: null,
        semanticMemory: null,
        usageStats: null,
      };

      // Act
      const reflections = generatePhilosophicalReflections(dataView, []);

      // Assert
      for (const reflection of reflections) {
        expect(reflection.perspective).toBeDefined();
        expect(reflection.question).toBeDefined();
        expect(reflection.observation).toBeDefined();
        expect(reflection.implication).toBeDefined();
      }
    });
  });

  describe("generateInsightReport", () => {
    it("should_generate_complete_report", () => {
      // Arrange & Act
      const report = generateInsightReport(testDir);

      // Assert
      expect(report.version).toBe(PLATFORM_VERSION);
      expect(report.generatedAt).toBeDefined();
      expect(report.dataView).toBeDefined();
      expect(Array.isArray(report.analyses)).toBe(true);
      expect(Array.isArray(report.philosophicalReflections)).toBe(true);
      expect(Array.isArray(report.actionableInsights)).toBe(true);
      expect(report.metrics).toBeDefined();
    });

    it("should_include_metrics", () => {
      // Arrange & Act
      const report = generateInsightReport(testDir);

      // Assert
      expect(report.metrics.dataQualityScore).toBeGreaterThanOrEqual(0);
      expect(report.metrics.dataQualityScore).toBeLessThanOrEqual(1);
      expect(report.metrics.analysisCoverage).toBeGreaterThanOrEqual(0);
      expect(report.metrics.insightActionability).toBeGreaterThanOrEqual(0);
    });
  });

  describe("saveInsightReport", () => {
    it("should_save_report_to_file", () => {
      // Arrange
      const report: InsightReport = {
        version: 1,
        generatedAt: new Date().toISOString(),
        dataView: {
          timestamp: new Date().toISOString(),
          runIndex: null,
          patterns: null,
          semanticMemory: null,
          usageStats: null,
        },
        analyses: [],
        philosophicalReflections: [],
        actionableInsights: [],
        metrics: {
          dataQualityScore: 0.5,
          analysisCoverage: 0.5,
          insightActionability: 0.5,
        },
      };

      // Act
      const filepath = saveInsightReport(testDir, report);

      // Assert
      expect(existsSync(filepath)).toBe(true);
      expect(filepath).toContain("insight-report-");
      expect(filepath).toContain(testDir);
    });
  });

  describe("loadLatestInsightReport", () => {
    it("should_return_null_when_no_reports_exist", () => {
      // Arrange & Act
      const report = loadLatestInsightReport(testDir);

      // Assert
      expect(report).toBeNull();
    });

    it("should_load_most_recent_report", () => {
      // Arrange
      const report: InsightReport = {
        version: 1,
        generatedAt: new Date().toISOString(),
        dataView: {
          timestamp: new Date().toISOString(),
          runIndex: null,
          patterns: null,
          semanticMemory: null,
          usageStats: null,
        },
        analyses: [],
        philosophicalReflections: [],
        actionableInsights: [],
        metrics: {
          dataQualityScore: 0.5,
          analysisCoverage: 0.5,
          insightActionability: 0.5,
        },
      };
      saveInsightReport(testDir, report);

      // Act
      const loaded = loadLatestInsightReport(testDir);

      // Assert
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe(1);
    });
  });

  describe("listInsightReports", () => {
    it("should_return_empty_array_when_no_reports", () => {
      // Arrange & Act
      const reports = listInsightReports(testDir);

      // Assert
      expect(reports).toEqual([]);
    });

    it("should_list_saved_reports", () => {
      // Arrange
      const report: InsightReport = {
        version: 1,
        generatedAt: new Date().toISOString(),
        dataView: {
          timestamp: new Date().toISOString(),
          runIndex: null,
          patterns: null,
          semanticMemory: null,
          usageStats: null,
        },
        analyses: [],
        philosophicalReflections: [],
        actionableInsights: [],
        metrics: {
          dataQualityScore: 0.5,
          analysisCoverage: 0.5,
          insightActionability: 0.5,
        },
      };
      saveInsightReport(testDir, report);

      // Act
      const reports = listInsightReports(testDir);

      // Assert
      expect(reports.length).toBe(1);
      expect(reports[0]).toContain("insight-report-");
    });
  });

  describe("formatInsightReportAsText", () => {
    it("should_format_report_as_markdown", () => {
      // Arrange
      const report: InsightReport = {
        version: 1,
        generatedAt: new Date().toISOString(),
        dataView: {
          timestamp: new Date().toISOString(),
          runIndex: null,
          patterns: null,
          semanticMemory: null,
          usageStats: null,
        },
        analyses: [
          {
            timestamp: new Date().toISOString(),
            category: "pattern",
            title: "Test Pattern",
            description: "Test description",
            evidence: [{ source: "test", data: "data" }],
            confidence: 0.8,
            severity: "medium",
          },
        ],
        philosophicalReflections: [
          {
            perspective: "logic",
            question: "Test question?",
            observation: "Test observation",
            implication: "Test implication",
          },
        ],
        actionableInsights: [
          {
            insight: "Test insight",
            rationale: "Test rationale",
            priority: "medium_term",
            estimatedEffort: "low",
          },
        ],
        metrics: {
          dataQualityScore: 0.6,
          analysisCoverage: 0.5,
          insightActionability: 0.7,
        },
      };

      // Act
      const text = formatInsightReportAsText(report);

      // Assert
      expect(text).toContain("# Self-Improvement Insight Report");
      expect(text).toContain("## Metrics");
      expect(text).toContain("## Analyses");
      expect(text).toContain("## Philosophical Reflections");
      expect(text).toContain("## Actionable Insights");
    });
  });

  describe("generatePlatformSummary", () => {
    it("should_generate_summary_with_available_actions", () => {
      // Arrange & Act
      const summary = generatePlatformSummary(testDir);

      // Assert
      expect(summary).toContain("# Self-Improvement Data Platform Summary");
      expect(summary).toContain("## Data Sources");
      expect(summary).toContain("## Available Actions");
    });

    it("should_indicate_data_source_status", () => {
      // Arrange & Act
      const summary = generatePlatformSummary(testDir);

      // Assert - Summary should indicate status of data sources
      expect(summary).toContain("# Self-Improvement Data Platform Summary");
      expect(summary).toContain("## Data Sources");
      // The actual message for runIndex is "Ready (will accumulate...)" when initialized
      expect(summary).toContain("Run Index:");
    });
  });
});
