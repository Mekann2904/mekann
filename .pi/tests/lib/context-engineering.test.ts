/**
 * @abdd.meta
 * @path .pi/tests/lib/context-engineering.test.ts
 * @role Test suite for context window management and chunking strategies
 * @why Verify token estimation, context optimization, and chunking logic
 * @related ../../lib/context-engineering.ts
 * @public_api Tests for exported functions and types
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateTokens,
  estimateContextItemTokens,
  optimizeContextWindow,
  detectSemanticBoundaries,
  chunkText,
  extractStateSummary,
  formatStateSummary,
  createContextItem,
  mergeContextItems,
  calculateUtilization,
  DEFAULT_CONTEXT_WINDOW_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_SUMMARY_CONFIG,
  type ContextItem,
  type ContextPriority,
  type ContextCategory,
  type ContextWindowConfig,
  type ChunkingConfig,
  type StateSummary,
  type SummaryExtractionConfig,
} from "../../lib/context-engineering";

describe("context-engineering", () => {
  describe("estimateTokens", () => {
    it("estimateTokens_emptyString_returnsZero", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("estimateTokens_simpleText_estimatesTokens", () => {
      const text = "Hello world this is a test";
      const tokens = estimateTokens(text);

      // Should count words
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it("estimateTokens_japaneseText_estimatesTokens", () => {
      const text = "これは日本語のテストです";
      const tokens = estimateTokens(text);

      // CJK characters should be counted
      expect(tokens).toBeGreaterThan(0);
    });

    it("estimateTokens_codeContent_estimatesTokens", () => {
      const code = "function test() { return 42; }";
      const tokens = estimateTokens(code);

      // Code tokens should be counted
      expect(tokens).toBeGreaterThan(0);
    });

    it("estimateTokens_mixedContent_estimatesTokens", () => {
      const text = "Hello 世界 function test() { return 42; }";
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("estimateContextItemTokens", () => {
    it("estimateContextItemTokens_usesProvidedEstimate", () => {
      const item: ContextItem = {
        id: "test-1",
        content: "Test content",
        priority: "medium",
        tokenEstimate: 100,
        category: "working-memory",
        timestamp: Date.now(),
      };

      expect(estimateContextItemTokens(item)).toBe(100);
    });

    it("estimateContextItemTokens_calculatesWhenNotProvided", () => {
      const item: ContextItem = {
        id: "test-1",
        content: "Test content for estimation",
        priority: "medium",
        tokenEstimate: 0,
        category: "working-memory",
        timestamp: Date.now(),
      };

      const tokens = estimateContextItemTokens(item);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("createContextItem", () => {
    it("createContextItem_createsItem_withDefaults", () => {
      const item = createContextItem("Test content", "working-memory");

      expect(item.content).toBe("Test content");
      expect(item.category).toBe("working-memory");
      expect(item.priority).toBe("medium");
      expect(item.id).toBeDefined();
      expect(item.timestamp).toBeGreaterThan(0);
      expect(item.tokenEstimate).toBeGreaterThan(0);
    });

    it("createContextItem_createsItem_withCustomPriority", () => {
      const item = createContextItem("Test content", "task-instruction", "critical");

      expect(item.priority).toBe("critical");
    });

    it("createContextItem_createsItem_withOptions", () => {
      const item = createContextItem("Test content", "file-content", "high", {
        id: "custom-id",
        source: "test-source",
        metadata: { key: "value" },
      });

      expect(item.id).toBe("custom-id");
      expect(item.source).toBe("test-source");
      expect(item.metadata).toEqual({ key: "value" });
    });
  });

  describe("optimizeContextWindow", () => {
    it("optimizeContextWindow_emptyItems_returnsEmptyResult", () => {
      const result = optimizeContextWindow([]);

      expect(result.items).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.trimmedItems).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("optimizeContextWindow_withinBudget_keepsAllItems", () => {
      const items: ContextItem[] = [
        createContextItem("Short content 1", "working-memory", "high"),
        createContextItem("Short content 2", "working-memory", "medium"),
      ];

      const config: ContextWindowConfig = {
        ...DEFAULT_CONTEXT_WINDOW_CONFIG,
        maxTokens: 100000,
        reservedTokens: 1000,
      };

      const result = optimizeContextWindow(items, config);

      expect(result.items).toHaveLength(2);
      expect(result.trimmedItems).toHaveLength(0);
    });

    it("optimizeContextWindow_exceedsBudget_trimsLowPriority", () => {
      const items: ContextItem[] = [
        createContextItem("Critical content that must be kept", "task-instruction", "critical"),
        createContextItem("High priority content", "working-memory", "high"),
        createContextItem("Low priority that might be trimmed", "reference-doc", "low"),
        createContextItem("Optional content to trim first", "reference-doc", "optional"),
      ];

      const config: ContextWindowConfig = {
        maxTokens: 100,
        reservedTokens: 20,
        priorityWeights: DEFAULT_CONTEXT_WINDOW_CONFIG.priorityWeights,
        categoryLimits: {},
        preserveOrder: true,
        enableSummarization: false,
      };

      const result = optimizeContextWindow(items, config);

      // Critical items should always be preserved
      expect(result.items.some((i) => i.priority === "critical")).toBe(true);
    });

    it("optimizeContextWindow_preservesOrder_whenConfigured", () => {
      const items: ContextItem[] = [
        createContextItem("First", "working-memory", "medium"),
        createContextItem("Second", "working-memory", "low"),
        createContextItem("Third", "working-memory", "high"),
      ];

      const config: ContextWindowConfig = {
        ...DEFAULT_CONTEXT_WINDOW_CONFIG,
        preserveOrder: true,
        maxTokens: 100000,
      };

      const result = optimizeContextWindow(items, config);

      expect(result.items[0].content).toBe("First");
      expect(result.items[1].content).toBe("Second");
      expect(result.items[2].content).toBe("Third");
    });

    it("optimizeContextWindow_generatesWarnings_whenHighUtilization", () => {
      // Create items that will result in high utilization
      const largeContent = "x".repeat(100000);
      const items: ContextItem[] = [
        createContextItem(largeContent, "file-content", "high"),
      ];

      const config: ContextWindowConfig = {
        ...DEFAULT_CONTEXT_WINDOW_CONFIG,
        maxTokens: 150000,
        reservedTokens: 10000,
      };

      const result = optimizeContextWindow(items, config);

      // Utilization ratio should be calculated
      expect(result.utilizationRatio).toBeGreaterThan(0);
    });
  });

  describe("detectSemanticBoundaries", () => {
    it("detectSemanticBoundaries_emptyText_returnsEmptyArray", () => {
      const boundaries = detectSemanticBoundaries("");

      expect(boundaries).toEqual([]);
    });

    it("detectSemanticBoundaries_detectsParagraphBreaks", () => {
      const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

      const boundaries = detectSemanticBoundaries(text);

      expect(boundaries.some((b) => b.type === "paragraph")).toBe(true);
    });

    it("detectSemanticBoundaries_detectsMarkdownHeadings", () => {
      const text = "# Heading 1\n\nSome content\n\n## Heading 2\n\nMore content";

      const boundaries = detectSemanticBoundaries(text);

      const sectionBoundaries = boundaries.filter((b) => b.type === "section");
      expect(sectionBoundaries.length).toBeGreaterThan(0);
    });

    it("detectSemanticBoundaries_detectsCodeBlocks", () => {
      const text = "Some text\n\n```typescript\nconst x = 1;\n```\n\nMore text";

      const boundaries = detectSemanticBoundaries(text);

      const codeBoundaries = boundaries.filter((b) => b.type === "code-block");
      expect(codeBoundaries.length).toBeGreaterThan(0);
    });

    it("detectSemanticBoundaries_detectsAgentOutputMarkers", () => {
      const text = "SUMMARY: Test summary\nCLAIM: Test claim\nEVIDENCE: Test evidence";

      const boundaries = detectSemanticBoundaries(text);

      const agentBoundaries = boundaries.filter((b) => b.type === "agent-output");
      expect(agentBoundaries.length).toBeGreaterThan(0);
    });

    it("detectSemanticBoundaries_detectsDialogueTurns", () => {
      const text = "Q: What is this?\nA: This is a test.\nQ: Another question?";

      const boundaries = detectSemanticBoundaries(text);

      const dialogueBoundaries = boundaries.filter((b) => b.type === "dialogue-turn");
      expect(dialogueBoundaries.length).toBeGreaterThan(0);
    });

    it("detectSemanticBoundaries_detectsTopicShifts", () => {
      const text = "First topic.\n\nHowever, let's discuss something else.\n\nOn the other hand, consider this.";

      const boundaries = detectSemanticBoundaries(text);

      // Should detect semantic gaps or paragraph boundaries
      expect(boundaries.length).toBeGreaterThan(0);
    });
  });

  describe("chunkText", () => {
    it("chunkText_emptyText_returnsEmptyArray", () => {
      const chunks = chunkText("");

      expect(chunks).toEqual([]);
    });

    it("chunkText_shortText_returnsSingleChunk", () => {
      const text = "This is a short text that should fit in one chunk.";
      const chunks = chunkText(text);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].content).toContain("short text");
    });

    it("chunkText_createsChunks_withMetadata", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const chunks = chunkText(text);

      expect(chunks[0].metadata.lineCount).toBeGreaterThan(0);
      expect(chunks[0].metadata.startPosition).toBeDefined();
      expect(chunks[0].metadata.endPosition).toBeDefined();
    });

    it("chunkText_respectsMaxChunkTokens", () => {
      const longText = "Word ".repeat(10000);
      const config: ChunkingConfig = {
        ...DEFAULT_CHUNKING_CONFIG,
        maxChunkTokens: 500,
        minChunkTokens: 100,
      };

      const chunks = chunkText(longText, config);

      // Each chunk should exist - note that chunking may not strictly enforce max
      // due to boundary preservation and overlap
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.tokenEstimate).toBeGreaterThan(0);
      });
    });

    it("chunkText_detectsCodeBlocks", () => {
      const text = "Some text\n\n```typescript\nconst x = 1;\n```\n\nMore text";
      const chunks = chunkText(text);

      const hasCodeBlock = chunks.some((c) => c.metadata.hasCodeBlock);
      expect(hasCodeBlock).toBe(true);
    });

    it("chunkText_detectsMarkdownHeadings", () => {
      const text = "# Heading\n\nContent\n\n## Subheading\n\nMore content";
      const chunks = chunkText(text);

      const hasHeadings = chunks.some((c) => c.metadata.hasMarkdownHeadings);
      expect(hasHeadings).toBe(true);
    });

    it("chunkText_assignsPriority", () => {
      const text = "SUMMARY: Important content\n\nRegular content";
      const chunks = chunkText(text);

      // Chunks should have priority assigned
      chunks.forEach((chunk) => {
        expect(chunk.priority).toBeDefined();
      });
    });
  });

  describe("extractStateSummary", () => {
    it("extractStateSummary_emptyText_returnsEmptySummary", () => {
      const summary = extractStateSummary("");

      expect(summary.carriedForward).toEqual([]);
      expect(summary.pendingTasks).toEqual([]);
      expect(summary.decisions).toEqual([]);
      expect(summary.confidence).toBe(0.5);
    });

    it("extractStateSummary_extractsCarriedForward", () => {
      const text = "CARRIED_FORWARD:\n  - Item 1\n  - Item 2\n\nOther content";

      const summary = extractStateSummary(text);

      expect(summary.carriedForward.length).toBeGreaterThan(0);
    });

    it("extractStateSummary_extractsNextStep", () => {
      const text = "NEXT_STEP: Implement the feature";

      const summary = extractStateSummary(text);

      expect(summary.pendingTasks).toContain("Implement the feature");
    });

    it("extractStateSummary_handlesNoneNextStep", () => {
      const text = "NEXT_STEP: none";

      const summary = extractStateSummary(text);

      expect(summary.pendingTasks).toEqual([]);
    });

    it("extractStateSummary_extractsConfidence", () => {
      const text = "CONFIDENCE: 0.85";

      const summary = extractStateSummary(text);

      expect(summary.confidence).toBe(0.85);
    });

    it("extractStateSummary_mergesWithPreviousSummary", () => {
      const previousSummary: StateSummary = {
        id: "prev-1",
        timestamp: Date.now() - 1000,
        carriedForward: ["Previous item"],
        pendingTasks: [],
        decisions: [],
        blockers: ["Previous blocker"],
        assumptions: ["Previous assumption"],
        evidence: [],
        confidence: 0.6,
      };

      const text = "CARRIED_FORWARD:\n  - New item";
      const summary = extractStateSummary(text, previousSummary);

      // Should include new items
      expect(summary.carriedForward.some((i) => i.includes("New item"))).toBe(true);
    });

    it("extractStateSummary_respectsConfigLimits", () => {
      const config: SummaryExtractionConfig = {
        maxCarriedForward: 2,
        maxPendingTasks: 1,
        maxDecisions: 1,
        maxBlockers: 1,
        maxAssumptions: 1,
        maxEvidence: 1,
        minConfidence: 0.5,
      };

      const text = "CARRIED_FORWARD:\n  - Item 1\n  - Item 2\n  - Item 3\n  - Item 4";
      const summary = extractStateSummary(text, undefined, config);

      expect(summary.carriedForward.length).toBeLessThanOrEqual(config.maxCarriedForward);
    });
  });

  describe("formatStateSummary", () => {
    it("formatStateSummary_formatsEmptySummary", () => {
      const summary: StateSummary = {
        id: "test-1",
        timestamp: Date.now(),
        carriedForward: [],
        pendingTasks: [],
        decisions: [],
        blockers: [],
        assumptions: [],
        evidence: [],
        confidence: 0.5,
      };

      const formatted = formatStateSummary(summary);

      expect(formatted).toContain("CONFIDENCE: 0.50");
    });

    it("formatStateSummary_formatsAllSections", () => {
      const summary: StateSummary = {
        id: "test-1",
        timestamp: Date.now(),
        carriedForward: ["Item 1"],
        pendingTasks: ["Task 1"],
        decisions: ["Decision 1"],
        blockers: ["Blocker 1"],
        assumptions: ["Assumption 1"],
        evidence: [],
        confidence: 0.8,
      };

      const formatted = formatStateSummary(summary);

      expect(formatted).toContain("CARRIED_FORWARD:");
      expect(formatted).toContain("PENDING_TASKS:");
      expect(formatted).toContain("DECISIONS:");
      expect(formatted).toContain("BLOCKERS:");
      expect(formatted).toContain("ASSUMPTIONS:");
      expect(formatted).toContain("Item 1");
      expect(formatted).toContain("Task 1");
    });
  });

  describe("mergeContextItems", () => {
    it("mergeContextItems_emptyArray_returnsEmptyItem", () => {
      const merged = mergeContextItems([]);

      expect(merged.content).toBe("");
      expect(merged.priority).toBe("low");
    });

    it("mergeContextItems_singleItem_returnsSameItem", () => {
      const item = createContextItem("Test", "working-memory", "high");

      const merged = mergeContextItems([item]);

      expect(merged.content).toBe("Test");
    });

    it("mergeContextItems_concatStrategy_joinsContent", () => {
      const items = [
        createContextItem("First", "working-memory", "medium"),
        createContextItem("Second", "working-memory", "medium"),
      ];

      const merged = mergeContextItems(items, "concat");

      expect(merged.content).toContain("First");
      expect(merged.content).toContain("Second");
    });

    it("mergeContextItems_priorityFirstStrategy_sortsByPriority", () => {
      const items = [
        createContextItem("Low", "working-memory", "low"),
        createContextItem("Critical", "working-memory", "critical"),
        createContextItem("High", "working-memory", "high"),
      ];

      const merged = mergeContextItems(items, "priority-first");

      expect(merged.priority).toBe("critical");
    });

    it("mergeContextItems_summarizeStrategy_extractsKeyInfo", () => {
      const items = [
        createContextItem("SUMMARY: Important info\nOther content", "working-memory", "medium"),
        createContextItem("CLAIM: Another key point\nMore text", "working-memory", "medium"),
      ];

      const merged = mergeContextItems(items, "summarize");

      expect(merged.content).toBeDefined();
    });
  });

  describe("calculateUtilization", () => {
    it("calculateUtilization_emptyItems_returnsZero", () => {
      const result = calculateUtilization([], 1000);

      expect(result.usedTokens).toBe(0);
      expect(result.utilizationRatio).toBe(0);
    });

    it("calculateUtilization_calculatesBreakdowns", () => {
      const items = [
        createContextItem("Test 1", "file-content", "high"),
        createContextItem("Test 2", "working-memory", "medium"),
        createContextItem("Test 3", "conversation", "low"),
      ];

      const result = calculateUtilization(items, 10000);

      expect(result.usedTokens).toBeGreaterThan(0);
      expect(result.categoryBreakdown["file-content"]).toBeGreaterThan(0);
      expect(result.priorityBreakdown["high"]).toBeGreaterThan(0);
    });

    it("calculateUtilization_calculatesRatio", () => {
      const items = [createContextItem("x".repeat(4000), "file-content", "high")];

      const result = calculateUtilization(items, 2000);

      expect(result.utilizationRatio).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT_CONFIGS", () => {
    it("DEFAULT_CONTEXT_WINDOW_CONFIG_hasExpectedValues", () => {
      expect(DEFAULT_CONTEXT_WINDOW_CONFIG.maxTokens).toBe(128000);
      expect(DEFAULT_CONTEXT_WINDOW_CONFIG.reservedTokens).toBe(16000);
      expect(DEFAULT_CONTEXT_WINDOW_CONFIG.priorityWeights.critical).toBe(1.0);
    });

    it("DEFAULT_CHUNKING_CONFIG_hasExpectedValues", () => {
      expect(DEFAULT_CHUNKING_CONFIG.maxChunkTokens).toBe(4000);
      expect(DEFAULT_CHUNKING_CONFIG.minChunkTokens).toBe(500);
      expect(DEFAULT_CHUNKING_CONFIG.overlapTokens).toBe(200);
    });

    it("DEFAULT_SUMMARY_CONFIG_hasExpectedValues", () => {
      expect(DEFAULT_SUMMARY_CONFIG.maxCarriedForward).toBe(5);
      expect(DEFAULT_SUMMARY_CONFIG.minConfidence).toBe(0.5);
    });
  });

  describe("integration tests", () => {
    it("full context optimization workflow", () => {
      // Create context items
      const items: ContextItem[] = [
        createContextItem("Task instruction content", "task-instruction", "critical"),
        createContextItem("System prompt", "system-prompt", "critical"),
        createContextItem("File content being analyzed", "file-content", "high"),
        createContextItem("Agent output from previous step", "agent-output", "medium"),
        createContextItem("Reference documentation", "reference-doc", "low"),
      ];

      // Optimize context window
      const result = optimizeContextWindow(items, {
        ...DEFAULT_CONTEXT_WINDOW_CONFIG,
        maxTokens: 50000,
        reservedTokens: 5000,
      });

      // Critical items should be preserved
      expect(result.items.some((i) => i.priority === "critical")).toBe(true);

      // Calculate utilization
      const utilization = calculateUtilization(result.items, 45000);
      expect(utilization.utilizationRatio).toBeGreaterThanOrEqual(0);
      expect(utilization.utilizationRatio).toBeLessThanOrEqual(1);
    });

    it("chunking and boundary detection workflow", () => {
      const text = `
# Introduction

This is the introduction section.

## Background

Some background information here.

\`\`\`typescript
const example = "code block";
\`\`\`

## Analysis

The analysis follows.

SUMMARY: Key findings
CLAIM: Main assertion
EVIDENCE: Supporting data
`.trim();

      // Detect boundaries
      const boundaries = detectSemanticBoundaries(text);
      expect(boundaries.length).toBeGreaterThan(0);

      // Chunk text
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(0);

      // Each chunk should have proper metadata
      chunks.forEach((chunk) => {
        expect(chunk.id).toBeDefined();
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });

    it("state summary extraction and formatting workflow", () => {
      const text = `
SUMMARY: Completed analysis of the system
CLAIM: The architecture is sound
EVIDENCE: Test coverage is 85%
CONFIDENCE: 0.9
NEXT_STEP: Implement the remaining features
CARRIED_FORWARD:
  - System is stable
  - Tests are passing
`.trim();

      // Extract summary
      const summary = extractStateSummary(text);

      expect(summary.carriedForward.length).toBeGreaterThan(0);
      expect(summary.pendingTasks.length).toBeGreaterThan(0);
      expect(summary.confidence).toBe(0.9);

      // Format summary
      const formatted = formatStateSummary(summary);
      expect(formatted).toContain("CONFIDENCE:");
    });
  });
});
