/**
 * Tests for the child-Pi self-detection guard in reviewFixerExtension.
 *
 * Issue #62: when review_fixer launches an external Pi (kitty), the child Pi
 * reloads the whole mekann extension bundle. Without a guard the child would
 * re-register the review_fixer tool AND re-inject the mandatory GATE policy
 * fragment, causing the child to call review_fixer again (root → child →
 * grandchild recursion). The subagent extension already guards on
 * PI_SUBAGENT_ROLE === "child"; review-fixer must do the same.
 *
 * These tests verify:
 *   - child mode: neither the tool nor the policy fragment is registered
 *   - parent mode: both the tool and the policy fragment are registered
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track prompt-provider registrations so we can assert the GATE fragment is
// NOT injected in child mode.
const registeredProviders: Array<{ id: string }> = [];
vi.mock("../../core/prompt-core/index.js", () => ({
  registerPromptProvider: (provider: { id: string }) => {
    registeredProviders.push(provider);
  },
}));

// Avoid pulling the heavy subagent control-plane chain
// (agentControl → subagentSpawner → pi-coding-agent) which cannot be resolved
// in this test environment. The guard runs before control is ever created.
vi.mock("../subagent/controlFactory.js", () => ({
  createSubagentControl: () => ({ shutdown: async () => {} }),
}));

// schemas.ts imports @sinclair/typebox which is not resolvable in every test
// environment. The guard logic does not depend on the schema shape.
vi.mock("./schemas.js", () => ({
  ReviewFixerParamsSchema: { type: "object", properties: {}, required: [] },
}));

const originalRole = process.env.PI_SUBAGENT_ROLE;
const originalIssuePi = process.env.MEKANN_ISSUE_PI;

function makeMockApi() {
  const tools: Array<Record<string, unknown>> = [];
  return {
    api: {
      registerTool: vi.fn((tool: Record<string, unknown>) => { tools.push(tool); }),
      on: vi.fn(),
    },
    tools,
  };
}

describe("reviewFixerExtension child-Pi guard", () => {
  beforeEach(() => {
    registeredProviders.length = 0;
    delete process.env.PI_SUBAGENT_ROLE;
    delete process.env.MEKANN_ISSUE_PI;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalRole !== undefined) process.env.PI_SUBAGENT_ROLE = originalRole;
    else delete process.env.PI_SUBAGENT_ROLE;
    if (originalIssuePi !== undefined) process.env.MEKANN_ISSUE_PI = originalIssuePi;
    else delete process.env.MEKANN_ISSUE_PI;
  });

  it("skips tool registration and policy fragment injection when PI_SUBAGENT_ROLE=child", async () => {
    process.env.PI_SUBAGENT_ROLE = "child";
    // The child inherits MEKANN_ISSUE_PI=1 from its parent via --copy-env, so
    // set it here to prove the SUBAGENT guard — not the marker — breaks recursion.
    process.env.MEKANN_ISSUE_PI = "1";
    const { default: reviewFixerExtension } = await import("./index.js");
    const { api, tools } = makeMockApi();

    await reviewFixerExtension(api as any);

    expect(tools.find((t) => t.name === "review_fixer")).toBeUndefined();
    expect(registeredProviders).toHaveLength(0);
  });

  it("does not register the tool or policy fragment outside an Issue Work Pi session", async () => {
    // No PI_SUBAGENT_ROLE and no MEKANN_ISSUE_PI → Main Pi / unrelated session.
    const { default: reviewFixerExtension } = await import("./index.js");
    const { api, tools } = makeMockApi();

    await reviewFixerExtension(api as any);

    expect(tools.find((t) => t.name === "review_fixer")).toBeUndefined();
    expect(registeredProviders).toHaveLength(0);
  });

  it("registers the review_fixer tool and policy fragment in an Issue Work Pi session", async () => {
    process.env.MEKANN_ISSUE_PI = "1";
    const { default: reviewFixerExtension } = await import("./index.js");
    const { api, tools } = makeMockApi();

    await reviewFixerExtension(api as any);

    expect(tools.find((t) => t.name === "review_fixer")).toBeDefined();
    expect(registeredProviders.find((p) => p.id === "review-fixer")).toBeDefined();
  });

  it("execute refuses to run inside a child Pi (defense-in-depth)", async () => {
    // Load the extension in Issue Work Pi mode so the tool is registered.
    process.env.MEKANN_ISSUE_PI = "1";
    const { default: reviewFixerExtension } = await import("./index.js");
    const { api, tools } = makeMockApi();
    await reviewFixerExtension(api as any);

    const tool = tools.find((t) => t.name === "review_fixer") as {
      execute: (...args: unknown[]) => Promise<{ isError?: boolean }>;
    };
    expect(tool).toBeDefined();

    // Simulate the guard being bypassed and execute running under child env.
    process.env.PI_SUBAGENT_ROLE = "child";
    const result = await tool.execute("id", {}, undefined, undefined, { cwd: "/tmp" });
    expect(result.isError).toBe(true);
  });
});
