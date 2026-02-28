/**
 * @abdd.meta
 * path: .pi/lib/embeddings/providers/openai.ts
 * role: OpenAI APIを利用した埋め込みベクトル生成プロバイダの実装
 * why: piシステム内でOpenAIのtext-embedding-3-smallモデルを通じてテキストをベクトル化するため
 * related: ../types.js, .pi/agent/auth.json
 * public_api: OpenAIEmbeddingProvider class, getOpenAIKey function
 * invariants: text-embedding-3-smallモデルを使用する、APIキーはauth.jsonまたは環境変数から取得する、シェルコマンドによるキー解決を無効化する
 * side_effects: ファイルシステム(~/.pi/agent/auth.json)への読み取りアクセス、外部API(OpenAI)へのHTTPリクエスト
 * failure_modes: APIキー不在、ネットワークエラー、APIレートリミット、auth.jsonのJSONパースエラー
 * @abdd.explain
 * overview: OpenAI APIクライアントのラッパーであり、埋め込みベクトル生成とAPIキー管理を担当する
 * what_it_does:
 *   - ~/.pi/agent/auth.jsonおよび環境変数からAPIキーを解決する
 *   - シェルコマンド(!command)によるキー解決をセキュリティ上の理由で無効化する
 *   - text-embedding-3-smallモデルを使用してテキストの配列をベクトル化する
 * why_it_exists:
 *   - OpenAIのモデルを利用した標準的な埋め込み処理を提供するため
 *   - piプロジェクト固有の認証構成(auth.json)を統一的に扱うため
 * scope:
 *   in: 認証設定ファイルパス、環境変数、入力テキスト配列
 *   out: 埋め込みベクトル数値配列、APIキー文字列、またはエラー時のnull
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
 * Resolve a key value that may be a literal or env var reference.
 * This follows pi's official key resolution method.
 */
function resolveKeyValue(key: string): string | null {
  if (!key) return null;

  // Security hardening:
  // shell command resolution (!command) is disabled to avoid arbitrary command execution.
  if (key.startsWith("!")) {
    return null;
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
 * OpenAI APIキーを取得
 * @summary APIキー取得
 * @returns {string | null} APIキー（見つからない場合はnull）
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
 * OpenAI埋め込みプロバイダ
 * @summary プロバイダ生成
 * @param {string[]} texts - 入力テキストの配列
 * @param {ProviderConfig} [config] - プロバイダ設定（オプション）
 * @returns {Promise<(number[] | null)[]>} 埋め込みベクトルの配列
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
   * 利用可能か確認
   * @summary 利用可否確認
   * @returns {Promise<boolean>} 利用可能な場合はtrue
   */
  async isAvailable(): Promise<boolean> {
    return getOpenAIKey() !== null;
  }

  /**
   * OpenAI埋め込みを生成
   * @summary 埋め込みベクトル生成
   * @param {string} text - 入力テキスト
   * @returns {Promise<number[] | null>} 埋め込みベクトルまたは失敗時はnull
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
   * @summary バッチ生成
   * テキスト配列からベクトルをバッチ生成
   * @param {string[]} texts 入力テキスト配列
   * @returns {Promise<(number[] | null)[]>} ベクトル配列またはnull
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
