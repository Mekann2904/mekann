/**
 * OpenAI Embedding Provider.
 * Implements embedding generation using OpenAI's text-embedding-3-small model.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, lstatSync } from "node:fs";
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

/**
 * Allowed shell command patterns for secure execution.
 * Only 1Password CLI 'op read' commands are permitted.
 */
const ALLOWED_COMMAND_PATTERNS = [
  /^op\s+read\s+['"]op:\/\/[^'"]+['"]$/,           // op read 'op://...'
  /^op\s+read\s+['"]op:\/\/[^'"]+['"]\s*$/,        // op read 'op://...' (trailing space)
  /^op\s+item\s+get\s+\S+\s+--field\s+\S+$/,       // op item get xxx --field yyy
];

/**
 * OpenAI API key format pattern.
 */
const OPENAI_KEY_PATTERN = /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/;

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
// Security Utilities
// ============================================================================

/**
 * Sanitize text by removing potential API keys.
 */
function sanitizeForLogging(text: string): string {
  // Mask potential API keys
  return text
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+sk-[a-zA-Z0-9_-]{20,}/gi, "Bearer [REDACTED]");
}

/**
 * Check if a file path is safe (not a symbolic link).
 */
function isSafeFilePath(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return true;
    const stats = lstatSync(filePath);
    return !stats.isSymbolicLink();
  } catch {
    return true; // File doesn't exist, safe to create
  }
}

/**
 * Validate OpenAI API key format.
 */
export function isValidOpenAIKeyFormat(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return OPENAI_KEY_PATTERN.test(key.trim());
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Resolve a key value that may be a literal, env var reference, or allowed shell command.
 * SECURITY: Only whitelisted commands are executed.
 */
function resolveKeyValue(key: string): string | null {
  if (!key) return null;

  // Shell command execution with strict allowlist
  if (key.startsWith("!")) {
    const cmd = key.slice(1).trim();
    
    // Check against allowlist patterns
    const isAllowed = ALLOWED_COMMAND_PATTERNS.some(pattern => pattern.test(cmd));
    if (!isAllowed) {
      console.error(`Security: Rejected disallowed command pattern. Only 'op read' commands are permitted.`);
      return null;
    }

    try {
      return execSync(cmd, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, // 10 second timeout
      }).trim();
    } catch (error) {
      console.error("Failed to execute allowed command");
      return null;
    }
  }

  // Environment variable reference (must be uppercase with underscores)
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
      // Security check: reject symbolic links
      if (!isSafeFilePath(AUTH_FILE_PATH)) {
        console.error("Security: auth.json is a symbolic link, refusing to read");
        return {};
      }
      const content = readFileSync(AUTH_FILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

/**
 * Save auth configuration to auth.json with secure permissions.
 */
export function saveAuthConfig(auth: AuthConfig): void {
  const dir = join(homedir(), ".pi", "agent");
  
  // Create directory if needed
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  
  // Security check: reject if auth.json is a symbolic link
  if (existsSync(AUTH_FILE_PATH) && !isSafeFilePath(AUTH_FILE_PATH)) {
    throw new Error("Security: auth.json is a symbolic link, refusing to write");
  }
  
  // Write file
  writeFileSync(AUTH_FILE_PATH, JSON.stringify(auth, null, 2), {
    mode: 0o600,
  });
  
  // Explicitly set permissions (mode option may not work on existing files)
  try {
    chmodSync(AUTH_FILE_PATH, 0o600);
  } catch {
    // Ignore chmod errors on some filesystems
  }
}

/**
 * Get OpenAI API key from auth.json or environment.
 */
export function getOpenAIKey(): string | null {
  const auth = loadAuthConfig();
  if (auth.openai?.key) {
    const resolved = resolveKeyValue(auth.openai.key);
    if (resolved) return resolved;
  }
  return process.env.OPENAI_API_KEY || null;
}

/**
 * Set OpenAI API key in auth.json.
 */
export function setOpenAIKey(key: string): void {
  const trimmedKey = key.trim();
  
  // Validate key format
  if (!isValidOpenAIKeyFormat(trimmedKey)) {
    throw new Error("Invalid OpenAI API key format. Key must match pattern: sk-[proj-]<alphanumeric>");
  }
  
  const auth = loadAuthConfig();
  auth.openai = { type: "api_key", key: trimmedKey };
  saveAuthConfig(auth);
}

/**
 * Remove OpenAI API key from auth.json.
 */
export function removeOpenAIKey(): void {
  const auth = loadAuthConfig();
  if (auth.openai) {
    delete auth.openai;
    saveAuthConfig(auth);
  }
}

/**
 * Mask API key for safe display.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return "***";
  return key.slice(0, 3) + "..." + key.slice(-2);
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
      console.warn("OpenAI API key not configured");
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
        const error = await response.text();
        // SECURITY: Sanitize error before logging
        console.error(`OpenAI API error: ${response.status} ${sanitizeForLogging(error)}`);
        return null;
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;
      return data.data[0]?.embedding || null;
    } catch (error) {
      console.error("Error generating embedding:", error instanceof Error ? error.message : "Unknown error");
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
        console.error(`OpenAI API error: ${response.status}`);
        return texts.map(() => null);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // Map embeddings back to input order
      const results: (number[] | null)[] = texts.map(() => null);
      for (const item of data.data) {
        results[item.index] = item.embedding;
      }

      return results;
    } catch (error) {
      console.error("Error generating embeddings batch:", error instanceof Error ? error.message : "Unknown error");
      return texts.map(() => null);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const openAIEmbeddingProvider = new OpenAIEmbeddingProvider();
