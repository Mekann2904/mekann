/**
 * @abdd.meta
 * path: .pi/lib/embeddings/providers/openai.ts
 * role: OpenAI埋め込みプロバイダーの実装モジュール
 * why: OpenAI APIを使用したテキスト埋め込みベクトル生成を標準化されたインターフェースで提供するため
 * related: ../types.js, ~/.pi/agent/auth.json, openai-api, ../index.ts
 * public_api: OpenAIEmbeddingProvider, getOpenAIKey
 * invariants:
 *   - DEFAULT_MODELは常に"text-embedding-3-small"
 *   - DEFAULT_DIMENSIONSは常に1536
 *   - APIキーはauth.jsonを優先し、次に環境変数を参照する
 *   - resolveKeyValueは"!"始まりをシェルコマンド、大文字_区切りを環境変数、それ以外をリテラルとして扱う
 * side_effects:
 *   - auth.jsonファイルの読み込み（ファイルシステムアクセス）
 *   - シェルコマンド実行（"!"プレフィックス付きキーの場合）
 *   - OpenAI APIへのHTTPリクエスト
 * failure_modes:
 *   - auth.jsonが存在しない、またはパース失敗時は空オブジェクトを返す
 *   - シェルコマンド実行失敗時はnullを返す
 *   - APIキーが全ソースで見つからない場合はnullを返す
 * @abdd.explain
 * overview: OpenAI text-embedding-3-smallモデルを使用した埋め込みプロバイダーの実装。pi公式認証方式に準拠したAPIキー解決機能を含む。
 * what_it_does:
 *   - OpenAI APIキーの解決（auth.json、環境変数、シェルコマンドの3方式をサポート）
 *   - EmbeddingProviderインターフェースの実装提供
 *   - text-embedding-3-smallモデルでの1536次元埋め込みベクトル生成
 * why_it_exists:
 *   - OpenAI埋め込み機能を他プロバイダーと統一されたインターフェースで利用可能にするため
 *   - piエコシステムの標準認証方式（auth.json）との統合のため
 * scope:
 *   in: テキスト文字列、認証設定（auth.jsonまたは環境変数）
 *   out: OpenAIEmbeddingProviderインスタンス、埋め込みベクトル配列
 */

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
  * OpenAI APIキーを取得する
  * @returns APIキー（見つからない場合はnull）
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

 /**
  * OpenAI埋め込みプロバイダー
  * @implements {EmbeddingProvider}
  */
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

  /**
   * OpenAI APIが利用可能かどうかを確認する
   * @returns APIキーが設定されている場合はtrue
   */
  async isAvailable(): Promise<boolean> {
    return getOpenAIKey() !== null;
  }

   /**
    * テキストの埋め込みベクトルを生成する
    * @param text 入力テキスト
    * @returns 埋め込みベクトル、またはAPIキー未設定時はnull
    */
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

   /**
    * テキストのリストからエンベディングを一括生成
    * @param texts - エンベディングを生成するテキストの配列
    * @returns 各テキストのエンベディング配列、失敗時はnull
    */
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
