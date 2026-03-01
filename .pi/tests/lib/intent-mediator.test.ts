/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mediate,
  mediateWithAnswers,
  createMediatorSession,
  type LlmCallFunction,
  type MediatorSession,
} from "../../lib/intent-mediator.js";
import type { MediatorInput } from "../../lib/mediator-types.js";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Mock mediator-history to avoid file system operations
vi.mock("../../lib/mediator-history.js", () => ({
  loadConfirmedFacts: vi.fn(() => ({ facts: [], version: 1 })),
  saveConfirmedFacts: vi.fn(),
  appendFact: vi.fn(),
  findFactByKey: vi.fn(),
  getRecentFacts: vi.fn(() => []),
  loadConversationSummary: vi.fn(() => null),
  appendSummarySection: vi.fn(),
}));

describe("intent-mediator", () => {
  const testHistoryDir = join(process.cwd(), ".pi", "tests", "fixtures", "mediator-test");

  beforeEach(() => {
    vi.clearAllMocks();
    // Create test directory
    if (!existsSync(testHistoryDir)) {
      mkdirSync(testHistoryDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testHistoryDir)) {
      rmSync(testHistoryDir, { recursive: true, force: true });
    }
  });

  describe("createMediatorSession", () => {
    it("should_create_session_with_valid_input", () => {
      // Arrange
      const userMessage = "Implement feature X";
      const memoryDir = "/tmp/memory";

      // Act
      const session = createMediatorSession(userMessage, memoryDir);

      // Assert
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe("initialized");
      expect(session.originalInput).toBe(userMessage);
      expect(session.currentInterpretation).toBe("");
      expect(session.detectedGaps).toEqual([]);
      expect(session.clarifications).toEqual([]);
      expect(session.messages.length).toBe(1);
      expect(session.messages[0].role).toBe("user");
      expect(session.messages[0].content).toBe(userMessage);
    });

    it("should_generate_unique_session_ids", () => {
      // Arrange & Act
      const session1 = createMediatorSession("Task 1", "/tmp");
      const session2 = createMediatorSession("Task 2", "/tmp");

      // Assert
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it("should_set_startedAt_timestamp", () => {
      // Arrange & Act
      const session = createMediatorSession("Task", "/tmp");
      const timestamp = new Date(session.startedAt);

      // Assert
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("mediate", () => {
    const createMockLlmCall = (response: string): LlmCallFunction => {
      return vi.fn().mockResolvedValue(response);
    };

    it("should_return_interpretation_result", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Implement user authentication",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const mockLlmResponse = `
### 解釈結果
ユーザーは認証機能の実装を希望している

### 参照解決
（参照なし）

### 情報ギャップ
（検出されませんでした）

### 信頼度
0.8
`;

      const llmCall = createMockLlmCall(mockLlmResponse);

      // Act
      const result = await mediate(input, { historyDir: testHistoryDir }, llmCall);

      // Assert
      expect(result.interpretation).toContain("認証機能");
      expect(result.status).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should_detect_information_gaps", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Fix the bug",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const mockLlmResponse = `
### 解釈結果
バグ修正を希望

### 参照解決
- 「the bug」: 未解決

### 情報ギャップ
ambiguous_reference: どのバグか不明

### 信頼度
0.4
`;

      const llmCall = createMockLlmCall(mockLlmResponse);

      // Act
      const result = await mediate(input, { historyDir: testHistoryDir }, llmCall);

      // Assert
      expect(result.gaps.length).toBeGreaterThan(0);
    });

    it("should_handle_llm_call_failure", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Test",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const failingLlmCall = vi.fn().mockRejectedValue(new Error("LLM failed"));

      // Act
      const result = await mediate(input, { historyDir: testHistoryDir }, failingLlmCall);

      // Assert
      expect(result.status).toBe("error");
      expect(result.confidence).toBe(0);
    });

    it("should_return_questions_when_needs_clarification", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Implement it",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const mockLlmResponse = `
### 解釈結果
「it」が何を指すか不明

### 参照解決
- 「it」: 未解決

### 情報ギャップ
ambiguous_reference: 「it」の参照先が不明確です

### 信頼度
0.2
`;

      const llmCall = createMockLlmCall(mockLlmResponse);

      // Act
      const result = await mediate(
        input,
        { historyDir: testHistoryDir, enableQuestioning: true },
        llmCall
      );

      // Assert
      expect(result.status).toBe("needs_clarification");
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it("should_respect_enableQuestioning_config", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Implement it",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const mockLlmResponse = `
### 解釈結果
不明

### 情報ギャップ
ambiguous_reference: 参照不明

### 信頼度
0.2
`;

      const llmCall = createMockLlmCall(mockLlmResponse);

      // Act
      const result = await mediate(
        input,
        { historyDir: testHistoryDir, enableQuestioning: false },
        llmCall
      );

      // Assert
      expect(result.questions).toEqual([]);
    });

    it("should_measure_processing_time", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Test",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const llmCall = createMockLlmCall("### 解釈結果\nTest");

      // Act
      const result = await mediate(input, { historyDir: testHistoryDir }, llmCall);

      // Assert
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("mediateWithAnswers", () => {
    it("should_generate_structured_intent_with_answers", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Implement authentication",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const interpretation = "Implement user authentication system";
      const answers = [
        { question: "Which auth method?", answer: "JWT" },
      ];

      const mockLlmResponse = `
\`\`\`json
{
  "target": { "scope": "authentication" },
  "action": { "type": "implement", "description": "JWT auth" },
  "constraints": { "mustPreserve": [], "mustSatisfy": [], "avoid": [], "assumptions": [] },
  "successCriteria": { "criteria": [] },
  "confidence": 0.9
}
\`\`\`
`;

      const llmCall = vi.fn().mockResolvedValue(mockLlmResponse);

      // Act
      const result = await mediateWithAnswers(
        input,
        interpretation,
        answers,
        { historyDir: testHistoryDir },
        llmCall
      );

      // Assert
      expect(result.status).toBe("ready");
      expect(result.structuredIntent).toBeDefined();
    });

    it("should_handle_empty_answers", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Test",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const mockLlmResponse = `
\`\`\`json
{
  "target": { "scope": "unknown" },
  "action": { "type": "unknown" },
  "constraints": { "mustPreserve": [], "mustSatisfy": [], "avoid": [], "assumptions": [] },
  "successCriteria": { "criteria": [] },
  "confidence": 0.5
}
\`\`\`
`;

      const llmCall = vi.fn().mockResolvedValue(mockLlmResponse);

      // Act
      const result = await mediateWithAnswers(
        input,
        "Test interpretation",
        [],
        { historyDir: testHistoryDir },
        llmCall
      );

      // Assert
      expect(result.status).toBe("ready");
    });

    it("should_handle_llm_failure", async () => {
      // Arrange
      const input: MediatorInput = {
        userMessage: "Test",
        sessionId: "test-session",
        conversationHistory: [],
        confirmedFacts: [],
      };

      const failingLlmCall = vi.fn().mockRejectedValue(new Error("Failed"));

      // Act
      const result = await mediateWithAnswers(
        input,
        "Test",
        [],
        { historyDir: testHistoryDir },
        failingLlmCall
      );

      // Assert
      expect(result.status).toBe("error");
    });
  });

  describe("LlmCallFunction type", () => {
    it("should_accept_function_with_correct_signature", () => {
      // Arrange
      const llmCall: LlmCallFunction = async (
        systemPrompt: string,
        userPrompt: string,
        options?: { timeoutMs?: number }
      ) => {
        return "response";
      };

      // Act & Assert - Should compile without error
      expect(llmCall).toBeDefined();
    });
  });

  describe("MediatorSession interface", () => {
    it("should_have_required_properties", () => {
      // Arrange
      const session: MediatorSession = {
        sessionId: "test",
        status: "initialized",
        originalInput: "test input",
        currentInterpretation: "",
        detectedGaps: [],
        clarifications: [],
        messages: [],
        startedAt: new Date().toISOString(),
        processingTimeMs: 0,
      };

      // Assert
      expect(session.sessionId).toBe("test");
      expect(session.status).toBe("initialized");
    });

    it("should_support_all_status_values", () => {
      // Arrange & Assert
      const statuses: MediatorSession["status"][] = [
        "initialized",
        "interpreting",
        "clarifying",
        "structuring",
        "completed",
        "error",
      ];

      expect(statuses.length).toBe(6);
    });
  });
});
