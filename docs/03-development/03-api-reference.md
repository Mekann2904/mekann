---
title: APIリファレンス
category: development
audience: developer
last_updated: 2026-02-11
tags: [api, reference]
related: [../README.md, ./01-getting-started.md, ]
---

# APIリファレンス

> パンくず: [Home](../../README.md) > [Developer Guide](./) > APIリファレンス

このページでは、pi拡張機能開発で使用する主要なExtensionAPIのメソッドと機能を説明します。

## ExtensionAPI概要

拡張機能のエントリーポイントとして、`ExtensionAPI`オブジェクトが提供されます。このオブジェクトを通じて、ツール、コマンド、ショートカットの登録やイベントの購読、UI操作などを行います。

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 拡張機能の実装
}
```

---

## ツールの登録

### `registerTool()`

AIエージェントが呼び出せるツールを登録します。

```typescript
pi.registerTool({
  name: "tool_name",
  label: "ツール表示名",
  description: "ツールの説明",
  parameters: Type.Object({
    // パラメータ定義
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 実装
    return {
      content: [{ type: "text", text: "結果" }],
      details: {}
    };
  },
  renderCall(args, theme) {
    // 呼び出し時のレンダリング（オプション）
  },
  renderResult(result, options, theme) {
    // 結果のレンダリング（オプション）
  }
});
```

#### プロパティ

| プロパティ | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `name` | `string` | ✓ | ツール名（一意） |
| `label` | `string` | ✓ | UI表示用のラベル |
| `description` | `string` | ✓ | AIへの説明文 |
| `parameters` | `TypeSchema` | ✓ | パラメータ定義 |
| `execute` | `function` | ✓ | 実行ハンドラ |
| `renderCall` | `function` | - | 呼び出し表示用レンダラー |
| `renderResult` | `function` | - | 結果表示用レンダラー |

#### `execute` 関数の引数

| 引数 | 型 | 説明 |
|------|-----|------|
| `toolCallId` | `string` | ツール呼び出しID |
| `params` | `object` | パラメータ値 |
| `signal` | `AbortSignal` | 中断シグナル |
| `onUpdate` | `function` | 進捗更新コールバック |
| `ctx` | `ToolContext` | 実行コンテキスト |

#### `ctx` (ToolContext) プロパティ

| プロパティ | 型 | 説明 |
|----------|-----|------|
| `hasUI` | `boolean` | UIが利用可能か |
| `ui` | `UIContext` | UI操作オブジェクト |

---

## コマンドの登録

### `registerCommand()`

スラッシュコマンドを登録します。

```typescript
pi.registerCommand("command_name", {
  description: "コマンドの説明",
  handler: async (args, ctx) => {
    // コマンド実装
    ctx.ui.notify("メッセージ", "info");
  }
});
```

#### プロパティ

| プロパティ | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `description` | `string` | ✓ | コマンドの説明 |
| `handler` | `function` | ✓ | 実行ハンドラ |

#### `handler` 関数の引数

| 引数 | 型 | 説明 |
|------|-----|------|
| `args` | `string` | コマンド引数 |
| `ctx` | `CommandContext` | 実行コンテキスト |

---

## ショートカットの登録

### `registerShortcut()`

キーボードショートカットを登録します。

```typescript
pi.registerShortcut("ctrl+shift+p", {
  description: "ショートカットの説明",
  handler: async (ctx) => {
    // ショートカット実装
    ctx.ui.notify("ショートカットが押されました", "info");
  }
});
```

#### プロパティ

| プロパティ | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `description` | `string` | ✓ | ショートカットの説明 |
| `handler` | `function` | ✓ | 実行ハンドラ |

#### キー名の例

| キー | 説明 |
|------|------|
| `ctrl+c` | Ctrl+C |
| `ctrl+shift+p` | Ctrl+Shift+P |
| `alt+enter` | Alt+Enter |
| `escape` | ESCキー |

---

## イベントの購読

### `on()`

piのイベントを購読して、イベント発生時に処理を実行します。

```typescript
pi.on("event_name", async (event, ctx) => {
  // イベント処理
});
```

#### 主なイベント

| イベント名 | 説明 |
|-----------|------|
| `session_start` | セッション開始時 |
| `session_end` | セッション終了時 |
| `before_agent_start` | エージェント開始前 |
| `after_agent_complete` | エージェント完了後 |
| `tool_call` | ツール呼び出し時 |
| `context` | コンテキスト操作時 |

#### 使用例

```typescript
// セッション開始時の通知
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.notify("拡張機能が読み込まれました", "info");
});

// エージェント開始前にシステムプロンプトを変更
pi.on("before_agent_start", async (event, _ctx) => {
  const systemPrompt = event.systemPrompt;
  const additional = "\n\n追加の指示...";
  return {
    systemPrompt: systemPrompt + additional
  };
});

// ツール呼び出しをブロック
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "dangerous_tool") {
    return {
      block: true,
      reason: "このツールは使用できません"
    };
  }
});
```

---

## UI操作

### `ui.notify()`

通知を表示します。

```typescript
ctx.ui.notify("メッセージ", "info");
```

#### レベル

| レベル | 説明 |
|--------|------|
| `"info"` | 情報 |
| `"success"` | 成功 |
| `"warning"` | 警告 |
| `"error"` | エラー |

### `ui.setStatus()`

ステータスバーにステータスを表示します。

```typescript
ctx.ui.setStatus("STATUS_KEY", "ステータス表示");

// ステータスをクリア
ctx.ui.setStatus("STATUS_KEY", undefined);
```

### `ui.custom()`

カスタムUIコンポーネントを表示します。

```typescript
const result = await ctx.ui.custom<ResultType>((tui, theme, _kb, done) => ({
  render: (width) => {
    // レンダリング
    return ["行1", "行2"];
  },
  invalidate: () => {
    // 再描画要求
  },
  handleInput: (data) => {
    // 入力処理
    if (data === "q") {
      done(null);
    }
  }
}), {
  overlay: true,
  overlayOptions: () => ({
    width: "100%",
    maxHeight: "100%",
    row: 0,
    col: 0,
    margin: 0,
  }),
});
```

---

## 型定義

### Type

`@mariozechner/pi-ai`から提供される型定義を使用して、ツールパラメータを定義します。

```typescript
import { Type } from "@mariozechner/pi-ai";

const MyType = Type.Object({
  name: Type.String({ description: "名前" }),
  age: Type.Optional(Type.Number({ description: "年齢" })),
  active: Type.Boolean({ description: "有効か" }),
  tags: Type.Array(Type.String(), { description: "タグ一覧" }),
});
```

#### 主要な型

| 型 | 説明 |
|----|------|
| `Type.String()` | 文字列 |
| `Type.Number()` | 数値 |
| `Type.Boolean()` | 真偽値 |
| `Type.Array(T)` | 配列 |
| `Type.Object({...})` | オブジェクト |
| `Type.Optional(T)` | オプション |
| `Type.Enum([...])` | 列挙型 |

---

## UIコンポーネント

### Text

シンプルなテキスト表示コンポーネント。

```typescript
import { Text } from "@mariozechner/pi-tui";

return new Text(theme.fg("accent", "テキスト"), 0, 0);
```

### Markdown

Markdownレンダリングコンポーネント。

```typescript
import { Markdown, getMarkdownTheme } from "@mariozechner/pi-tui";

const markdown = new Markdown(markdownText, 0, 0, getMarkdownTheme());
const rendered = markdown.render(width);
```

---

## 使用例

### 完全な拡張機能の例

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  // ツールの登録
  pi.registerTool({
    name: "my_tool",
    label: "マイツール",
    description: "ツールの説明",
    parameters: Type.Object({
      message: Type.String({ description: "メッセージ" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "UIが利用できません" }],
          details: {}
        };
      }

      ctx.ui.notify(params.message, "info");

      return {
        content: [{ type: "text", text: `処理完了: ${params.message}` }],
        details: { processed: true }
      };
    },
    renderCall(args, theme) {
      return new Text(theme.bold("マイツール: ") + args.message, 0, 0);
    },
    renderResult(result, _options, theme) {
      const status = result.details?.processed ? "✓" : "✗";
      return new Text(theme.fg("success", status) + " 完了", 0, 0);
    }
  });

  // コマンドの登録
  pi.registerCommand("mycmd", {
    description: "マイコマンド",
    handler: async (args, ctx) => {
      ctx.ui.notify(`コマンド実行: ${args}`, "info");
    }
  });

  // ショートカットの登録
  pi.registerShortcut("ctrl+alt+m", {
    description: "マイショートカット",
    handler: async (ctx) => {
      ctx.ui.notify("ショートカット実行", "success");
    }
  });

  // イベントの購読
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("マイ拡張機能が読み込まれました", "info");
  });
}
```

---

## 関連トピック

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [拡張機能開発]() - 拡張機能の開発方法
- [Testing](./04-testing.md) - テスト方法
