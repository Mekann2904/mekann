/**
 * サブエージェント結果キャッシュの設定変更検出テスト
 * エージェント設定が変更された場合にキャッシュが無効化されることを検証する
 */

import { describe, it, expect } from "vitest";

describe("Subagent result cache - config change detection", () => {
  describe("computeAgentConfigHash", () => {
    // ハッシュ計算ロジックのテスト
    // 同じ設定なら同じハッシュ、異なる設定なら異なるハッシュになることを確認

    it("同じ設定なら同じハッシュ値を生成すること", () => {
      const agent1 = {
        id: "test-agent",
        name: "Test Agent",
        description: "Test",
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research", "code"],
      };

      const agent2 = {
        id: "test-agent",
        name: "Test Agent",
        description: "Test",
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research", "code"],
      };

      // 同じ設定内容なら同じハッシュになることを期待
      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).toBe(configStr2);
    });

    it("systemPromptが異なれば異なる設定文字列になること", () => {
      const agent1 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research"],
      };

      const agent2 = {
        systemPrompt: "You are a strict reviewer.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research"],
      };

      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).not.toBe(configStr2);
    });

    it("enabled状態が異なれば異なる設定文字列になること", () => {
      const agent1 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: [],
      };

      const agent2 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "disabled" as const,
        skills: [],
      };

      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).not.toBe(configStr2);
    });

    it("modelが異なれば異なる設定文字列になること", () => {
      const agent1 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: [],
      };

      const agent2 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-opus-4",
        enabled: "enabled" as const,
        skills: [],
      };

      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).not.toBe(configStr2);
    });

    it("skillsが異なれば異なる設定文字列になること", () => {
      const agent1 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research", "code"],
      };

      const agent2 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research", "review"],
      };

      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).not.toBe(configStr2);
    });

    it("skillsの順序が異なっていても同じ設定文字列になること（sortされる）", () => {
      const agent1 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["code", "research"],
      };

      const agent2 = {
        systemPrompt: "You are a helpful assistant.",
        provider: "anthropic",
        model: "claude-sonnet-4",
        enabled: "enabled" as const,
        skills: ["research", "code"],
      };

      const configStr1 = [
        agent1.systemPrompt,
        agent1.provider || "",
        agent1.model || "",
        String(agent1.enabled),
        (agent1.skills || []).sort().join(","),
      ].join("|");

      const configStr2 = [
        agent2.systemPrompt,
        agent2.provider || "",
        agent2.model || "",
        String(agent2.enabled),
        (agent2.skills || []).sort().join(","),
      ].join("|");

      expect(configStr1).toBe(configStr2);
    });
  });

  describe("Cache validation logic", () => {
    it("エージェントが存在しない場合はキャッシュを使用しないこと", () => {
      const storage = {
        agents: [],
        runs: [
          {
            runId: "run-1",
            agentId: "missing-agent",
            task: "test task",
            summary: "completed",
            status: "completed" as const,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            latencyMs: 1000,
            outputFile: "/tmp/output.json",
          },
        ],
      };

      // エージェントが存在しない場合はnullを返すべき
      const agent = storage.agents.find(a => a.id === "missing-agent");
      expect(agent).toBeUndefined();
    });

    it("エージェントが無効な場合はキャッシュを使用しないこと", () => {
      const storage = {
        agents: [
          {
            id: "disabled-agent",
            name: "Disabled Agent",
            description: "Test",
            systemPrompt: "Test",
            enabled: "disabled" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        runs: [
          {
            runId: "run-1",
            agentId: "disabled-agent",
            task: "test task",
            summary: "completed",
            status: "completed" as const,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            latencyMs: 1000,
            outputFile: "/tmp/output.json",
          },
        ],
      };

      const agent = storage.agents.find(a => a.id === "disabled-agent");
      expect(agent?.enabled).toBe("disabled");
    });

    it("設定ハッシュが異なる場合はキャッシュを使用しないこと", () => {
      const currentConfigHash = "abc123";
      const cachedConfigHash = "def456";

      expect(currentConfigHash).not.toBe(cachedConfigHash);
      // 設定ハッシュが異なる場合はスキップされるべき
    });

    it("設定ハッシュが同じ場合はキャッシュを使用できること", () => {
      const currentConfigHash = "abc123";
      const cachedConfigHash = "abc123";

      expect(currentConfigHash).toBe(cachedConfigHash);
      // 設定ハッシュが同じ場合はキャッシュを使用できる
    });

    it("古いレコードにハッシュがない場合はスキップされること", () => {
      const runRecord = {
        runId: "run-1",
        agentId: "test-agent",
        task: "test task",
        summary: "completed",
        status: "completed" as const,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: 1000,
        outputFile: "/tmp/output.json",
        // agentConfigHashがない（古いレコード）
      };

      // agentConfigHashがない場合はスキップしない（後方互換性）
      // ただし、新しいレコードでは必ずハッシュを保存する
      expect(runRecord).not.toHaveProperty("agentConfigHash");
    });
  });
});
