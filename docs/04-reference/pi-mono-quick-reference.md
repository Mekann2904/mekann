---
title: pi-mono クイックリファレンス
category: reference
audience: daily-user
last_updated: 2026-02-25
tags: [pi-mono, quick-reference, cheatsheet]
related: [../02-user-guide/24-pi-mono-reference.md, ./01-configuration.md]
---

# pi-mono クイックリファレンス

pi-monoのベストプラクティスを素早く参照するためのチートシートです。

---

## ドキュメント場所一覧

| ドキュメント | パス | 用途 |
|-------------|------|------|
| Extension API | `docs/extensions.md` | 拡張機能開発（1936行） |
| Skill System | `docs/skills.md` | スキル作成 |
| TUI Components | `docs/tui.md` | TUI構築（~900行） |
| SDK Integration | `docs/sdk.md` | SDK統合（~970行） |
| RPC Protocol | `docs/rpc.md` | RPCモード（~800行） |
| Package Format | `docs/packages.md` | パッケージ配布 |
| Custom Provider | `docs/custom-provider.md` | カスタムプロバイダー |
| Settings | `docs/settings.md` | 設定オプション |
| Session Format | `docs/session.md` | セッションファイル |
| Compaction | `docs/compaction.md` | コンテキスト圧縮 |
| Examples | `examples/extensions/` | 67個のサンプル |

---

## 目的別参照先一覧

| 目的 | 参照先 |
|------|--------|
| 拡張機能を作成したい | `@docs/extensions.md` |
| スキルを作成したい | `@docs/skills.md` |
| TUIを構築したい | `@docs/tui.md` |
| SDKで統合したい | `@docs/sdk.md` |
| パッケージを配布したい | `@docs/packages.md` |
| プロバイダーを追加したい | `@docs/custom-provider.md` |
| 設定を変更したい | `@docs/settings.md` または `/settings` |
| サンプルコードを見たい | `@examples/extensions/` |

---

## よく使うパターン

### StringEnum（Google API互換）

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// OK - Google APIで動作
action: StringEnum(["list", "add", "remove"] as const)

// NG - Google APIで失敗
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

### 状態永続化（フォーク対応）

```typescript
// ツールの結果に状態を含める
return {
  content: [{ type: "text", text: "Done" }],
  details: { todos: [...todos], nextId },  // セッションに永続化
};

// セッション開始時に復元
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      const details = entry.message.details;
      // detailsから状態を復元
    }
  }
});
```

### 出力切り捨て（必須）

```typescript
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,  // 2000
  maxBytes: DEFAULT_MAX_BYTES,  // 50KB
});

if (truncation.truncated) {
  const tempFile = writeTempFile(output);
  result = truncation.output + `\n\n[Full output: ${tempFile}]`;
}
```

### カスタムツールレンダリング

```typescript
renderCall(args, theme) {
  let text = theme.fg("toolTitle", theme.bold("my_tool "));
  text += theme.fg("muted", args.action);
  return new Text(text, 0, 0);  // パディングはBoxが管理
}

renderResult(result, { expanded, isPartial }, theme) {
  if (isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0);
  if (result.details?.error) return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
  return new Text(theme.fg("success", "✓ Done"), 0, 0);
}
```

---

## コマンド一覧

### ドキュメント参照

| コマンド | 説明 |
|---------|------|
| `@path "質問"` | ファイルをコンテキストに読み込み質問 |
| `@docs/extensions.md` | 拡張機能ドキュメントを参照 |
| `@examples/extensions/todo.ts` | サンプルコードを参照 |

### スキル呼び出し

| コマンド | 説明 |
|---------|------|
| `/skill:name` | スキルを呼び出し |
| `/skill:code-review` | コードレビュースキル |
| `/skill:git-workflow` | Gitワークフロースキル |

### 発見とナビゲーション

| コマンド | 説明 |
|---------|------|
| `/` | すべてのコマンド、テンプレート、スキルを一覧 |
| `/hotkeys` | キーボードショートカット一覧 |
| `/settings` | 設定UIを開く |
| `/reload` | 拡張機能を再読み込み |

### セッション管理

| コマンド | 説明 |
|---------|------|
| `pi -c` | 最新セッションを継続 |
| `pi -r` | 過去のセッションを選択 |
| `pi --no-session` | 一時セッション（保存しない） |
| `pi --session <path>` | 特定のセッションを使用 |

### パッケージ管理

| コマンド | 説明 |
|---------|------|
| `pi install npm:@foo/bar@1.0.0` | npmからインストール（バージョン指定） |
| `pi install git:github.com/user/repo@v1` | gitからインストール（タグ指定） |
| `pi install ./local/path` | ローカルパスからインストール |

---

## 拡張機能配置場所

| 場所 | スコープ | ホットリロード |
|------|--------|--------------|
| `~/.pi/agent/extensions/*.ts` | グローバル | `/reload`で可能 |
| `.pi/extensions/*.ts` | プロジェクト | `/reload`で可能 |

## スキル配置場所

| 場所 | スコープ |
|------|--------|
| `~/.pi/agent/skills/` | グローバル |
| `~/.agents/skills/` | グローバル |
| `.pi/skills/` | プロジェクト |
| `.agents/skills/` | プロジェクト |

---

## 関連トピック

- [pi-mono参照ガイド](../02-user-guide/24-pi-mono-reference.md) - 詳細なユーザーガイド
- [設定](./01-configuration.md) - 設定オプションの詳細
