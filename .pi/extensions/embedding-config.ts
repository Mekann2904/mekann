/**
 * Embedding Configuration Extension.
 * Provides /embedding slash command for managing embedding providers.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  embeddingRegistry,
  getEmbeddingProvider,
  generateEmbedding,
  cosineSimilarity,
  type ProviderStatus,
} from "../lib/embeddings/index.js";
import {
  getOpenAIKey,
  setOpenAIKey,
  removeOpenAIKey,
  maskApiKey,
  isValidOpenAIKeyFormat,
} from "../lib/embeddings/providers/openai.js";

const AUTH_FILE_PATH = `${process.env.HOME}/.pi/agent/auth.json`;

export default function (pi: ExtensionAPI) {
  /**
   * /embedding - Embedding provider configuration
   *
   * Usage:
   *   /embedding              - Show current status
   *   /embedding status       - Show current status
   *   /embedding list         - List all providers
   *   /embedding set <id>     - Set default provider
   *   /embedding test [text]  - Test embedding generation
   *   /embedding openai <key> - Set OpenAI API key
   */
  pi.registerCommand("embedding", {
    description: "Configure embedding providers for semantic search",
    handler: async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/);
      const subcommand = parts[0] || "";
      const rest = parts.slice(1).join(" ");

      switch (subcommand) {
        case "":
        case "status":
          await showStatus(ctx);
          break;

        case "list":
          await listProviders(ctx);
          break;

        case "set":
          await setProvider(rest, ctx);
          break;

        case "test":
          await testEmbedding(rest, ctx);
          break;

        case "openai":
          await configureOpenAI(rest, ctx);
          break;

        case "info":
          await showProviderInfo(rest, ctx);
          break;

        case "help":
        default:
          showHelp(ctx);
      }
    },
  });

  // ============================================================================
  // Command Handlers
  // ============================================================================

  async function showStatus(ctx: ExtensionAPI["context"]): Promise<void> {
    const lines: string[] = ["## Embedding Configuration", ""];

    // Current default provider
    const defaultId = embeddingRegistry.getDefaultProviderId();
    const provider = await getEmbeddingProvider();

    if (provider) {
      const available = await provider.isAvailable();
      lines.push(`Default Provider: **${provider.id}** (${provider.name})`);
      lines.push(`Model: ${provider.model}`);
      lines.push(`Dimensions: ${provider.capabilities.dimensions}`);
      lines.push(`Status: ${available ? "Available" : "Unavailable"}`);
    } else {
      lines.push("Default Provider: **None configured**");
      lines.push("");
      lines.push("Configure with:");
      lines.push("  /embedding openai sk-xxx");
    }

    // OpenAI key status
    lines.push("");
    lines.push("---");
    lines.push("## API Keys");
    const openaiKey = getOpenAIKey();
    if (openaiKey) {
      lines.push(`OpenAI: ${maskApiKey(openaiKey)}`);
    } else {
      lines.push("OpenAI: Not configured");
    }

    ctx.ui.notify(lines.join("\n"), "info");
  }

  async function listProviders(ctx: ExtensionAPI["context"]): Promise<void> {
    const statuses = await embeddingRegistry.getAllStatus();
    const defaultId = embeddingRegistry.getDefaultProviderId();

    const lines: string[] = ["## Embedding Providers", ""];

    for (const status of statuses) {
      const isDefault = status.id === defaultId;
      const prefix = isDefault ? "* " : "  ";
      const available = status.available ? "available" : "unavailable";

      lines.push(`${prefix}${status.id} - ${status.name}`);
      lines.push(`    Model: ${status.model}`);
      lines.push(`    Status: ${available}`);
      lines.push(`    Dimensions: ${status.capabilities.dimensions}`);
      lines.push("");
    }

    lines.push("Use /embedding set <id> to change default provider.");

    ctx.ui.notify(lines.join("\n"), "info");
  }

  async function setProvider(
    providerId: string,
    ctx: ExtensionAPI["context"]
  ): Promise<void> {
    if (!providerId) {
      ctx.ui.notify("Usage: /embedding set <provider-id>", "error");
      ctx.ui.notify("Available providers: openai", "info");
      return;
    }

    const provider = embeddingRegistry.get(providerId);
    if (!provider) {
      ctx.ui.notify(`Unknown provider: ${providerId}`, "error");
      ctx.ui.notify("Available providers: openai", "info");
      return;
    }

    const available = await provider.isAvailable();
    if (!available) {
      ctx.ui.notify(
        `Provider ${providerId} is not available. Check configuration.`,
        "warning"
      );
    }

    embeddingRegistry.setDefault(providerId);
    ctx.ui.notify(`Default embedding provider set to: ${providerId}`, "success");
  }

  async function testEmbedding(
    text: string,
    ctx: ExtensionAPI["context"]
  ): Promise<void> {
    const testText = text || "Hello, world! This is a test embedding.";

    ctx.ui.notify(`Generating embedding for: "${testText.slice(0, 50)}..."`, "info");

    const provider = await getEmbeddingProvider();
    if (!provider) {
      ctx.ui.notify("No embedding provider available. Configure with /embedding openai", "error");
      return;
    }

    const startTime = Date.now();
    const embedding = await generateEmbedding(testText);
    const elapsed = Date.now() - startTime;

    if (!embedding) {
      ctx.ui.notify("Failed to generate embedding.", "error");
      return;
    }

    const lines: string[] = [
      "## Embedding Test Result",
      "",
      `Provider: ${provider.id}`,
      `Model: ${provider.model}`,
      `Dimensions: ${embedding.length}`,
      `Time: ${elapsed}ms`,
      "",
      "Sample values (first 10):",
      `  [${embedding.slice(0, 10).map((v) => v.toFixed(4)).join(", ")}]`,
      "",
      "Embedding vector generated successfully.",
    ];

    ctx.ui.notify(lines.join("\n"), "success");
  }

  async function configureOpenAI(
    key: string,
    ctx: ExtensionAPI["context"]
  ): Promise<void> {
    if (!key) {
      // Show current status
      const currentKey = getOpenAIKey();
      if (currentKey) {
        ctx.ui.notify(`OpenAI API key is set: ${maskApiKey(currentKey)}`, "info");
        ctx.ui.notify(`Stored in: ${AUTH_FILE_PATH}`, "info");
      } else {
        ctx.ui.notify("OpenAI API key is not set.", "warning");
        ctx.ui.notify("Usage: /embedding openai sk-xxx", "info");
        ctx.ui.notify("To remove: /embedding openai clear", "info");
      }
      return;
    }

    if (key === "clear" || key === "delete" || key === "remove") {
      removeOpenAIKey();
      ctx.ui.notify("OpenAI API key removed.", "success");
      return;
    }

    // Validate key format
    if (!isValidOpenAIKeyFormat(key)) {
      ctx.ui.notify("Invalid OpenAI API key format.", "error");
      ctx.ui.notify("Expected: sk-[proj-]<alphanumeric>", "info");
      return;
    }

    try {
      setOpenAIKey(key);
      ctx.ui.notify(`OpenAI API key saved: ${maskApiKey(key)}`, "success");
      ctx.ui.notify(`Stored in: ${AUTH_FILE_PATH}`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to save API key: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  }

  async function showProviderInfo(
    providerId: string,
    ctx: ExtensionAPI["context"]
  ): Promise<void> {
    if (!providerId) {
      ctx.ui.notify("Usage: /embedding info <provider-id>", "error");
      return;
    }

    const provider = embeddingRegistry.get(providerId);
    if (!provider) {
      ctx.ui.notify(`Unknown provider: ${providerId}`, "error");
      return;
    }

    const available = await provider.isAvailable();
    const caps = provider.capabilities;

    const lines: string[] = [
      `## Provider: ${provider.name}`,
      "",
      `ID: ${provider.id}`,
      `Model: ${provider.model}`,
      `Available: ${available ? "Yes" : "No"}`,
      "",
      "### Capabilities",
      `- Max Tokens: ${caps.maxTokens}`,
      `- Dimensions: ${caps.dimensions}`,
      `- Batch Support: ${caps.supportsBatch ? "Yes" : "No"}`,
      `- Max Batch Size: ${caps.maxBatchSize}`,
      `- Offline Capable: ${caps.offlineCapable ? "Yes" : "No"}`,
    ];

    ctx.ui.notify(lines.join("\n"), "info");
  }

  function showHelp(ctx: ExtensionAPI["context"]): void {
    const lines: string[] = [
      "## Embedding Commands",
      "",
      "Commands:",
      "  /embedding              - Show current status",
      "  /embedding status       - Show current status",
      "  /embedding list         - List all providers",
      "  /embedding set <id>     - Set default provider",
      "  /embedding test [text]  - Test embedding generation",
      "  /embedding openai <key> - Set OpenAI API key",
      "  /embedding openai clear - Remove OpenAI API key",
      "  /embedding info <id>    - Show provider details",
      "",
      "Providers:",
      "  openai  - OpenAI text-embedding-3-small (requires API key)",
      "",
      "Storage:",
      `  API keys are stored in: ${AUTH_FILE_PATH}`,
    ];

    ctx.ui.notify(lines.join("\n"), "info");
  }

  // ============================================================================
  // Session Start Notification
  // ============================================================================

  pi.on("session_start", async (_event, ctx) => {
    const provider = await getEmbeddingProvider();
    if (provider) {
      ctx.ui.notify(
        `Embedding provider: ${provider.id} (${provider.model}). /embedding for details.`,
        "info"
      );
    } else {
      ctx.ui.notify(
        "No embedding provider configured. Use /embedding openai <key> to set up.",
        "info"
      );
    }
  });
}
