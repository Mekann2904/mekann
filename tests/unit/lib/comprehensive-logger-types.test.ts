/**
 * @file .pi/lib/comprehensive-logger-types.ts の単体テスト
 * @description 包括的ログ収集システムの型定義テスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import type {
	EventType,
	ComponentType,
	ToolType,
	Status,
	BaseEvent,
	SessionStartEvent,
	SessionEndEvent,
	TaskStartEvent,
	TaskEndEvent,
	ToolCallEvent,
	ToolResultEvent,
	ToolErrorEvent,
	LLMRequestEvent,
	LLMResponseEvent,
	LLMErrorEvent,
	LoggerConfig,
	LogEvent,
} from "@lib/comprehensive-logger-types";

// ============================================================================
// Type Definitions Validation
// ============================================================================

describe("EventType", () => {
	it("should_accept_valid_lifecycle_events", () => {
		const lifecycleEvents: EventType[] = [
			"session_start",
			"session_end",
			"task_start",
			"task_end",
			"operation_start",
			"operation_end",
		];

		lifecycleEvents.forEach((event) => {
			expect(typeof event).toBe("string");
		});
	});

	it("should_accept_valid_tool_events", () => {
		const toolEvents: EventType[] = ["tool_call", "tool_result", "tool_error"];

		toolEvents.forEach((event) => {
			expect(typeof event).toBe("string");
		});
	});

	it("should_accept_valid_llm_events", () => {
		const llmEvents: EventType[] = ["llm_request", "llm_response", "llm_error"];

		llmEvents.forEach((event) => {
			expect(typeof event).toBe("string");
		});
	});

	it("should_accept_valid_user_events", () => {
		const userEvents: EventType[] = ["user_input", "user_feedback"];

		userEvents.forEach((event) => {
			expect(typeof event).toBe("string");
		});
	});

	it("should_accept_valid_system_events", () => {
		const systemEvents: EventType[] = [
			"config_load",
			"state_change",
			"metrics_snapshot",
		];

		systemEvents.forEach((event) => {
			expect(typeof event).toBe("string");
		});
	});
});

// ============================================================================
// ComponentType
// ============================================================================

describe("ComponentType", () => {
	it("should_accept_valid_component_types", () => {
		const validTypes: ComponentType[] = [
			"extension",
			"subagent",
			"team",
			"skill",
			"tool",
		];

		validTypes.forEach((type) => {
			expect(typeof type).toBe("string");
		});
	});
});

// ============================================================================
// ToolType
// ============================================================================

describe("ToolType", () => {
	it("should_accept_valid_tool_types", () => {
		const validTypes: ToolType[] = ["builtin", "extension", "dynamic"];

		validTypes.forEach((type) => {
			expect(typeof type).toBe("string");
		});
	});
});

// ============================================================================
// Status
// ============================================================================

describe("Status", () => {
	it("should_accept_valid_status_values", () => {
		const validStatuses: Status[] = [
			"pending",
			"running",
			"success",
			"failure",
			"timeout",
			"partial",
			"cancelled",
		];

		validStatuses.forEach((status) => {
			expect(typeof status).toBe("string");
		});
	});
});

// ============================================================================
// BaseEvent
// ============================================================================

describe("BaseEvent", () => {
	it("should_have_required_fields", () => {
		const event: BaseEvent = {
			eventId: "evt-123",
			eventType: "tool_call",
			sessionId: "sess-456",
			taskId: "task-789",
			operationId: "op-012",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "test-extension",
			},
		};

		expect(event.eventId).toBe("evt-123");
		expect(event.eventType).toBe("tool_call");
		expect(event.sessionId).toBe("sess-456");
		expect(event.taskId).toBe("task-789");
		expect(event.operationId).toBe("op-012");
		expect(event.timestamp).toBeDefined();
		expect(event.component.type).toBe("extension");
	});

	it("should_support_optional_parent_event_id", () => {
		const event: BaseEvent = {
			eventId: "evt-123",
			eventType: "tool_call",
			sessionId: "sess-456",
			taskId: "task-789",
			operationId: "op-012",
			parentEventId: "parent-evt",
			timestamp: new Date().toISOString(),
			component: {
				type: "tool",
				name: "test-tool",
			},
		};

		expect(event.parentEventId).toBe("parent-evt");
	});
});

// ============================================================================
// SessionStartEvent
// ============================================================================

describe("SessionStartEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: SessionStartEvent = {
			eventId: "evt-1",
			eventType: "session_start",
			sessionId: "sess-1",
			taskId: "task-1",
			operationId: "op-1",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "core",
			},
			data: {
				piVersion: "1.0.0",
				nodeVersion: "22.0.0",
				platform: "darwin",
				cwd: "/workspace",
				envKeys: ["PATH", "HOME"],
				configHash: "abc123",
				startupTimeMs: 100,
			},
		};

		expect(event.eventType).toBe("session_start");
		expect(event.data.piVersion).toBe("1.0.0");
		expect(event.data.platform).toBe("darwin");
	});
});

// ============================================================================
// SessionEndEvent
// ============================================================================

describe("SessionEndEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: SessionEndEvent = {
			eventId: "evt-2",
			eventType: "session_end",
			sessionId: "sess-1",
			taskId: "task-1",
			operationId: "op-1",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "core",
			},
			data: {
				durationMs: 60000,
				taskCount: 5,
				errorCount: 1,
				totalTokensUsed: 10000,
				exitReason: "normal",
			},
		};

		expect(event.eventType).toBe("session_end");
		expect(event.data.exitReason).toBe("normal");
		expect(event.data.taskCount).toBe(5);
	});
});

// ============================================================================
// TaskStartEvent
// ============================================================================

describe("TaskStartEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: TaskStartEvent = {
			eventId: "evt-3",
			eventType: "task_start",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "task-manager",
			},
			data: {
				userInput: "Create a new file",
				inputType: "text",
				context: {
					filesReferenced: ["file1.ts", "file2.ts"],
					skillsLoaded: ["git-workflow"],
					teamsAvailable: ["core-team"],
				},
			},
		};

		expect(event.eventType).toBe("task_start");
		expect(event.data.inputType).toBe("text");
		expect(event.data.context.filesReferenced).toHaveLength(2);
	});
});

// ============================================================================
// TaskEndEvent
// ============================================================================

describe("TaskEndEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: TaskEndEvent = {
			eventId: "evt-4",
			eventType: "task_end",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "task-manager",
			},
			data: {
				durationMs: 5000,
				status: "success",
				operationsCount: 3,
				toolsCount: 5,
				tokensUsed: 1000,
				filesCreated: ["new-file.ts"],
				filesModified: ["existing-file.ts"],
				filesDeleted: [],
				commandsExecuted: ["npm test"],
				summary: "Task completed successfully",
				errors: [],
			},
		};

		expect(event.eventType).toBe("task_end");
		expect(event.data.status).toBe("success");
		expect(event.data.filesCreated).toHaveLength(1);
	});
});

// ============================================================================
// ToolCallEvent
// ============================================================================

describe("ToolCallEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: ToolCallEvent = {
			eventId: "evt-5",
			eventType: "tool_call",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "tool",
				name: "read",
			},
			data: {
				toolName: "read",
				toolType: "builtin",
				params: { path: "/file.ts" },
				caller: {
					file: "agent.ts",
					line: 42,
					function: "executeTask",
				},
				environment: {
					cwd: "/workspace",
				},
			},
		};

		expect(event.eventType).toBe("tool_call");
		expect(event.data.toolName).toBe("read");
		expect(event.data.params.path).toBe("/file.ts");
	});
});

// ============================================================================
// ToolResultEvent
// ============================================================================

describe("ToolResultEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: ToolResultEvent = {
			eventId: "evt-6",
			eventType: "tool_result",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "tool",
				name: "read",
			},
			data: {
				toolName: "read",
				status: "success",
				durationMs: 50,
				outputType: "inline",
				output: "file contents",
				outputSize: 100,
			},
		};

		expect(event.eventType).toBe("tool_result");
		expect(event.data.status).toBe("success");
		expect(event.data.outputSize).toBe(100);
	});
});

// ============================================================================
// ToolErrorEvent
// ============================================================================

describe("ToolErrorEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: ToolErrorEvent = {
			eventId: "evt-7",
			eventType: "tool_error",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "tool",
				name: "bash",
			},
			data: {
				toolName: "bash",
				errorType: "execution",
				errorMessage: "Command failed",
				recoveryAttempted: true,
				recoveryMethod: "retry",
				recoverySuccessful: false,
				params: { command: "npm test" },
			},
		};

		expect(event.eventType).toBe("tool_error");
		expect(event.data.errorType).toBe("execution");
		expect(event.data.recoveryAttempted).toBe(true);
	});
});

// ============================================================================
// LLMRequestEvent
// ============================================================================

describe("LLMRequestEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: LLMRequestEvent = {
			eventId: "evt-8",
			eventType: "llm_request",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "llm-client",
			},
			data: {
				provider: "anthropic",
				model: "claude-3-5-sonnet",
				systemPromptLength: 500,
				systemPromptHash: "hash123",
				userMessageCount: 2,
				userMessageLength: 1000,
				contextWindowUsed: 10000,
				toolsAvailable: ["read", "write", "bash"],
			},
		};

		expect(event.eventType).toBe("llm_request");
		expect(event.data.provider).toBe("anthropic");
		expect(event.data.toolsAvailable).toHaveLength(3);
	});
});

// ============================================================================
// LLMResponseEvent
// ============================================================================

describe("LLMResponseEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: LLMResponseEvent = {
			eventId: "evt-9",
			eventType: "llm_response",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "llm-client",
			},
			data: {
				provider: "anthropic",
				model: "claude-3-5-sonnet",
				inputTokens: 500,
				outputTokens: 200,
				totalTokens: 700,
				durationMs: 2000,
				responseLength: 500,
				stopReason: "end_turn",
				toolsCalled: [{ name: "read", paramsSize: 50 }],
			},
		};

		expect(event.eventType).toBe("llm_response");
		expect(event.data.totalTokens).toBe(700);
		expect(event.data.stopReason).toBe("end_turn");
	});
});

// ============================================================================
// LLMErrorEvent
// ============================================================================

describe("LLMErrorEvent", () => {
	it("should_have_correct_event_type_and_data", () => {
		const event: LLMErrorEvent = {
			eventId: "evt-10",
			eventType: "llm_error",
			sessionId: "sess-1",
			taskId: "task-2",
			operationId: "op-2",
			timestamp: new Date().toISOString(),
			component: {
				type: "extension",
				name: "llm-client",
			},
			data: {
				provider: "anthropic",
				model: "claude-3-5-sonnet",
				errorType: "rate_limit",
				errorMessage: "Rate limit exceeded",
				retryAttempt: 1,
				retryAfterMs: 60000,
			},
		};

		expect(event.eventType).toBe("llm_error");
		expect(event.data.errorType).toBe("rate_limit");
		expect(event.data.retryAfterMs).toBe(60000);
	});
});

// ============================================================================
// LoggerConfig
// ============================================================================

describe("LoggerConfig", () => {
	it("should_have_required_configuration_fields", () => {
		const config: LoggerConfig = {
			logDir: "/var/log/pi",
			enabled: true,
			bufferSize: 1000,
			flushIntervalMs: 5000,
			maxFileSizeMB: 100,
			retentionDays: 30,
			environment: "production",
			minLogLevel: "info",
		};

		expect(config.logDir).toBe("/var/log/pi");
		expect(config.enabled).toBe(true);
		expect(config.bufferSize).toBe(1000);
		expect(config.environment).toBe("production");
	});
});

// ============================================================================
// LogEvent Union Type
// ============================================================================

describe("LogEvent Union", () => {
	it("should_accept_session_events", () => {
		const event: LogEvent = {
			eventId: "evt-1",
			eventType: "session_start",
			sessionId: "sess-1",
			taskId: "task-1",
			operationId: "op-1",
			timestamp: new Date().toISOString(),
			component: { type: "extension", name: "core" },
			data: {
				piVersion: "1.0.0",
				nodeVersion: "22.0.0",
				platform: "darwin",
				cwd: "/workspace",
				envKeys: [],
				configHash: "abc",
				startupTimeMs: 100,
			},
		};

		expect(event.eventType).toBe("session_start");
	});

	it("should_accept_tool_events", () => {
		const event: LogEvent = {
			eventId: "evt-2",
			eventType: "tool_call",
			sessionId: "sess-1",
			taskId: "task-1",
			operationId: "op-1",
			timestamp: new Date().toISOString(),
			component: { type: "tool", name: "read" },
			data: {
				toolName: "read",
				toolType: "builtin",
				params: {},
				caller: { file: "test.ts", line: 1, function: "test" },
				environment: { cwd: "/workspace" },
			},
		};

		expect(event.eventType).toBe("tool_call");
	});
});
