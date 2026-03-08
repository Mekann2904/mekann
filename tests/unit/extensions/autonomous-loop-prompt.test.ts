// Path: tests/unit/extensions/autonomous-loop-prompt.test.ts
// What: 自律ループ規約拡張の prompt 注入を検証する単体テスト。
// Why: 通常時の system prompt に規約が一度だけ確実に入ることを保証するため。
// Related: .pi/extensions/autonomous-loop-prompt.ts, .pi/lib/agent/prompt-stack.ts, tests/unit/lib/agent/autonomous-loop-policy.test.ts

import { describe, expect, it } from "vitest";

import registerAutonomousLoopPrompt from "../../../.pi/extensions/autonomous-loop-prompt.js";

type BeforeAgentStartHandler = (event: { systemPrompt?: string }, ctx: unknown) =>
  Promise<{ systemPrompt: string } | undefined>;

function createFakePi() {
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let sessionShutdown: (() => Promise<void>) | undefined;

  return {
    pi: {
      on(event: string, handler: BeforeAgentStartHandler | (() => Promise<void>)) {
        if (event === "before_agent_start") {
          beforeAgentStart = handler as BeforeAgentStartHandler;
        }
        if (event === "session_shutdown") {
          sessionShutdown = handler as () => Promise<void>;
        }
      },
    },
    getBeforeAgentStart() {
      if (!beforeAgentStart) {
        throw new Error("before_agent_start handler is not registered");
      }
      return beforeAgentStart;
    },
    async shutdown() {
      await sessionShutdown?.();
    },
  };
}

describe("autonomous-loop-prompt", () => {
  it("before_agent_start で自律ループ規約を注入する", async () => {
    const fake = createFakePi();
    registerAutonomousLoopPrompt(fake.pi as never);

    const handler = fake.getBeforeAgentStart();
    const result = await handler({ systemPrompt: "BASE" }, {});

    expect(result?.systemPrompt).toContain("BASE");
    expect(result?.systemPrompt).toContain("Autonomous Loop Operating Rules");
    expect(result?.systemPrompt).toContain("prompt-stack:autonomous-loop-policy:lead");
    await fake.shutdown();
  });

  it("同じ規約を二重注入しない", async () => {
    const fake = createFakePi();
    registerAutonomousLoopPrompt(fake.pi as never);

    const handler = fake.getBeforeAgentStart();
    const first = await handler({ systemPrompt: "BASE" }, {});
    const second = await handler({ systemPrompt: first?.systemPrompt }, {});

    expect(first?.systemPrompt).toBeDefined();
    expect(second).toBeUndefined();
    await fake.shutdown();
  });
});
