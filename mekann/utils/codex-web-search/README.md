# codex-web-search

Pi extension tool that exposes the ChatGPT Codex backend-api web search endpoint as an LLM-callable tool.

## 概要

`codex_web_search` は、Pi の現在の会話モデルに関わらず、ChatGPT サブスクリプションの Web 検索機能をエージェントに提供します。Claude、Gemini、GLM など任意のプロバイダーで会話していても、Codex OAuth 認証があれば検索ツールが使えます。

## 前提

- Pi で `openai-codex` プロバイダーにログイン済み（`/login` で ChatGPT アカウント認証）
- ChatGPT サブスクリプション（Plus / Pro / Team 等）の枠が残っている

## アーキテクチャ

```
codex-shared/          ← Codex API クライアント基盤（codex-limits と共有）
├── types.ts           ← 共通型（CodexErrorKind, CodexModel, CodexReasoningEffort 等）
├── errors.ts          ← CodexError + エラー分類ヘルパー
├── auth.ts            ← accountId 抽出（JWT パース）
├── client.ts          ← URL 正規化、ヘッダー生成、fetchJson
├── models.ts          ← モデル取得・選択・キャッシュ・effort 検証
└── index.ts           ← バレルエクスポート

codex-web-search/      ← Web 検索ツール本体
├── search.ts          ← fetchCodexWebSearch コア（HTTP + SSE）
├── stream.ts          ← SSE パーサー
├── result.ts          ← 結果フォーマット（LLM 向けテキスト + details）
└── index.ts           ← Pi registerTool エントリポイント
```

### 依存ルール

```
codex-shared         → Pi framework に依存しない
codex-web-search     → codex-shared + Pi framework
codex-shared         → codex-limits / codex-web-search に依存しない
```

## モデル・effort 解決

ツール実行時に、以下の優先順位で検索モデルと reasoning effort を決定します。

| 条件 | モデル | Effort |
|---|---|---|
| `config.model` が明示指定 | 指定値 | `config.effort`（未指定なら送信なし） |
| 現在の provider が `openai-codex` | `ctx.model`（一覧に存在すれば） | config.effort |
| 現在の provider がその他（GLM 等） | `gpt-5.5`（一覧に存在すれば） | `low` |
| 上記でモデルが見つからない | Codex デフォルト | 直前と同じ effort |

送信前に各モデルの `supportedReasoningEfforts` で effort を検証します。未対応の effort 値は `low` にフォールバックし、さらに `low` も未対応なら effort を送信しません。

### リトライ戦略

| エラー | 対応 |
|---|---|
| `model_not_found` / `unsupported_model` | キャッシュ破棄 → モデル再取得 → Codex デフォルトでリトライ |
| 400 + reasoning/effort エラー | effort なしでリトライ |

## LLM 向けパラメータ

ツールの公開スキーマは最小限です。

```ts
{
  query: string;                    // 必須：検索クエリ
  searchContextSize?: "low" | "medium" | "high";  // 取得文脈量（デフォルト: medium）
}
```

`token`、`accountId`、`model`、`baseUrl`、`effort`、`externalWebAccess` はいずれも LLM パラメータとして公開していません。

## 結果フォーマット

### LLM が受け取るテキスト

```
Next.js 15 was released on October 26, 2024...

Sources:
[1] Next.js 15 Release Notes — https://nextjs.org/blog/next-15
[2] Next.js Documentation — https://nextjs.org/docs
```

### TUI / ログ用の details

```ts
{
  responseId: "resp_xxx",
  model: "gpt-5.5",
  modelSource: "non_codex_default",  // "explicit" | "current_codex" | "non_codex_default" | "codex_default"
  effort: "low",
  searchCalls: [{ id: "ws_xxx", query: "...", status: "completed" }],
  citations: [{ title: "...", url: "..." }],
  usage: { inputTokens: 120, outputTokens: 200, totalTokens: 320 },
  rawText: "...",
  streaming: false,
}
```

## 設定

`mekann/config.ts` で管理される中央設定です。

```ts
MEKANN_CODEX_DEFAULTS = {
  baseUrl: "https://chatgpt.com/backend-api",
  modelCacheTtlMs: 5 * 60 * 1000,
}

MEKANN_CODEX_WEB_SEARCH_DEFAULTS = {
  enabled: true,
  externalWebAccess: true,
  defaultSearchContextSize: "medium",
  model: undefined,                    // 明示指定時のみ
  effort: undefined,                   // 明示指定時のみ
  nonCodexDefaultModel: "gpt-5.5",     // 非 Codex プロバイダー時の検索モデル
  nonCodexDefaultEffort: "low",        // 非 Codex プロバイダー時の effort
}
```

## テスト

```bash
# codex-shared + codex-web-search のみ
npx vitest run mekann/utils/codex-shared mekann/utils/codex-web-search

# プロジェクト全体
npm test
```

## ADR

- [ADR-5: codex-shared を先行抽出する](../../docs/adr/0005-extract-codex-shared-upfront.md)

## 関連

- [`codex-limits`](../codex-limits/) — 同じ `codex-shared` 基盤を使う usage 照会機能
- [`CONTEXT.md`](../../../CONTEXT.md) — プロジェクト全体の用語定義
