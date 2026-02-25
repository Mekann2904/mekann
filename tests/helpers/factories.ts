/**
 * @abdd.meta
 * path: tests/helpers/factories.ts
 * role: Test data factory functions for consistent test fixtures
 * why: Eliminate 60+ duplicate test data creation patterns
 * related: tests/helpers/fixtures.ts, tests/unit directory
 * public_api: createPlan, createStep, createSubagent, createMessage, createPlans, createSteps, planSequence
 * invariants: All factories generate valid default objects with UUIDs
 * side_effects: None (pure factory functions)
 * failure_modes: Invalid overrides may cause type errors
 * @abdd.explain
 * overview: Provides test data factory functions for consistent test fixtures
 * what_it_does: Creates Plan, Step, Subagent, Message objects with sensible defaults
 * why_it_exists: DRY principle - centralize test data creation
 * scope:
 *   in: Test data generation with optional overrides
 *   out: Production data, database persistence
 */

import { randomUUID } from "node:crypto";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Plan entity for test data
 */
export interface Plan {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "completed" | "cancelled";
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Step entity for test data
 */
export interface Step {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  order: number;
  dependencies?: string[];
}

/**
 * Subagent entity for test data
 */
export interface Subagent {
  id: string;
  name: string;
  role: string;
  status: "idle" | "running" | "completed" | "error";
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Message entity for test data
 */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * @summary Creates a Plan test fixture with defaults
 * @param overrides - Partial Plan object to override defaults
 * @returns Complete Plan object with UUID and timestamps
 */
export function createPlan(overrides: Partial<Plan> = {}): Plan {
  const now = new Date();
  return {
    id: randomUUID(),
    title: "Test Plan",
    description: "A test plan for unit testing",
    status: "draft",
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * @summary Creates a Step test fixture with defaults
 * @param overrides - Partial Step object to override defaults
 * @returns Complete Step object with UUID
 */
export function createStep(overrides: Partial<Step> = {}): Step {
  return {
    id: randomUUID(),
    title: "Test Step",
    description: "A test step for unit testing",
    status: "pending",
    order: 0,
    dependencies: [],
    ...overrides,
  };
}

/**
 * @summary Creates a Subagent test fixture with defaults
 * @param overrides - Partial Subagent object to override defaults
 * @returns Complete Subagent object with UUID and timestamp
 */
export function createSubagent(overrides: Partial<Subagent> = {}): Subagent {
  return {
    id: randomUUID(),
    name: "test-subagent",
    role: "Test role for unit testing",
    status: "idle",
    createdAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

/**
 * @summary Creates a Message test fixture with defaults
 * @param overrides - Partial Message object to override defaults
 * @returns Complete Message object with UUID and timestamp
 */
export function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: randomUUID(),
    role: "user",
    content: "Test message content",
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// Batch Generation Helpers
// ============================================================================

/**
 * @summary Creates multiple Plan fixtures
 * @param count - Number of plans to create
 * @param overrides - Partial Plan object to apply to all
 * @returns Array of Plan objects with sequential titles
 */
export function createPlans(count: number, overrides: Partial<Plan> = {}): Plan[] {
  return Array.from({ length: count }, (_, i) =>
    createPlan({ ...overrides, title: `Plan ${i + 1}` })
  );
}

/**
 * @summary Creates multiple Step fixtures with sequential ordering
 * @param count - Number of steps to create
 * @param overrides - Partial Step object to apply to all
 * @returns Array of Step objects with sequential order values
 */
export function createSteps(count: number, overrides: Partial<Step> = {}): Step[] {
  return Array.from({ length: count }, (_, i) =>
    createStep({ ...overrides, title: `Step ${i + 1}`, order: i })
  );
}

/**
 * @summary Creates multiple Subagent fixtures
 * @param count - Number of subagents to create
 * @param overrides - Partial Subagent object to apply to all
 * @returns Array of Subagent objects with sequential names
 */
export function createSubagents(count: number, overrides: Partial<Subagent> = {}): Subagent[] {
  return Array.from({ length: count }, (_, i) =>
    createSubagent({ ...overrides, name: `subagent-${i + 1}` })
  );
}

/**
 * @summary Creates multiple Message fixtures
 * @param count - Number of messages to create
 * @param overrides - Partial Message object to apply to all
 * @returns Array of Message objects with sequential content
 */
export function createMessages(count: number, overrides: Partial<Message> = {}): Message[] {
  return Array.from({ length: count }, (_, i) =>
    createMessage({ ...overrides, content: `Message ${i + 1}` })
  );
}

// ============================================================================
// Sequence Generators (for Property-Based Testing)
// ============================================================================

/**
 * @summary Infinite Plan generator for property-based tests
 * @yields Plan objects with sequential IDs
 */
export function* planSequence(): Generator<Plan> {
  let id = 1;
  while (true) {
    yield createPlan({
      id: `plan-${id}`,
      title: `Generated Plan ${id}`,
    });
    id++;
  }
}

/**
 * @summary Infinite Step generator for property-based tests
 * @yields Step objects with sequential IDs and orders
 */
export function* stepSequence(): Generator<Step> {
  let id = 1;
  while (true) {
    yield createStep({
      id: `step-${id}`,
      title: `Generated Step ${id}`,
      order: id - 1,
    });
    id++;
  }
}

/**
 * @summary Infinite Message generator for property-based tests
 * @yields Message objects with sequential IDs
 */
export function* messageSequence(): Generator<Message> {
  let id = 1;
  while (true) {
    yield createMessage({
      id: `msg-${id}`,
      content: `Generated Message ${id}`,
    });
    id++;
  }
}
