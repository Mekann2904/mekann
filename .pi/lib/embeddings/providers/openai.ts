/**
 * OpenAI Embedding Provider.
 * Implements embedding generation using OpenAI's text-embedding-3-small model.
 * 
 * API key resolution (uses pi's official method):
 * 1. ~/.pi/agent/auth.json: { "openai": { "type": "api_key", "key": "sk-..." } }
 * 2. Environment variable: OPENAI_API_KEY
 * 
 * See: https://pi-docs/providers.md
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import type { EmbeddingProvider, ProviderCapabilities } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const AUTH_FILE_PATH = join(homedir(), ".pi", "agent", "auth.json");
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;

// ============================================================================
// Types
// ============================================================================

interface AuthConfig {
  [provider: string]: {
    type: "api_key" | "oauth";
    key: string;
  };
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// API Key Resolution (pi's official method)
// ============================================================================

/**
 * Resolve a key value that may be a literal, env var reference, or shell command.
 * This follows pi's official key resolution method.
 */
function resolveKeyValue(key: string): string | null {
  if (!key) return null;

  // Shell command execution: "!command"
  if (key.startsWith("!")) {
    try {
      return execSync(key.slice(1), {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return null;
    }
  }

  // Environment variable reference
  if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    return process.env[key] || null;
  }

  // Literal value
  return key;
}

/**
 * Load auth configuration from auth.json.
 */
function loadAuthConfig(): AuthConfig {
  try {
    if (existsSync(AUTH_FILE_PATH)) {
      const content = readFileSync(AUTH_FILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

/**
 * Get OpenAI API key from auth.json or environment variable.
 * Resolution order (pi's official method):
 * 1. auth.json entry
 * 2. OPENAI_API_KEY environment variable
 */
export function getOpenAIKey(): string | null {
  const auth = loadAuthConfig();
  if (auth.openai?.key) {
    const resolved = resolveKeyValue(auth.openai.key);
    if (resolved) return resolved;
  }
  return process.env.OPENAI_API_KEY || null;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai";
  readonly name = "OpenAI Embeddings";
  readonly model = DEFAULT_MODEL;

  readonly capabilities: ProviderCapabilities = {
    maxTokens: 8191,
    dimensions: DEFAULT_DIMENSIONS,
    supportsBatch: true,
    maxBatchSize: 2048,
    offlineCapable: false,
  };

  async isAvailable(): Promise<boolean> {
    return getOpenAIKey() !== null;
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    const apiKey = getOpenAIKey();
    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text.slice(0, 8000),
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;
      return data.data[0]?.embedding || null;
    } catch {
      return null;
    }
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
    const apiKey = getOpenAIKey();
    if (!apiKey) {
      return texts.map(() => null);
    }

    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts.map((t) => t.slice(0, 8000)),
        }),
      });

      if (!response.ok) {
        return texts.map(() => null);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // Map embeddings back to input order
      const results: (number[] | null)[] = texts.map(() => null);
      for (const item of data.data) {
        results[item.index] = item.embedding;
      }

      return results;
    } catch {
      return texts.map(() => null);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const openAIEmbeddingProvider = new OpenAIEmbeddingProvider();
