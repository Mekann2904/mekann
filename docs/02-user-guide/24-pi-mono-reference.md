---
title: pi-mono ベストプラクティス参照ガイド
category: user-guide
audience: developer
last_updated: 2026-02-25
tags: [pi-mono, best-practices, reference]
related: [./01-extensions.md, ../03-development/README.md, ../04-reference/pi-mono-quick-reference.md]
---

# pi-mono ベストプラクティス参照ガイド

> パンくず: [Home](../../README.md) > [User Guide](./) > pi-mono参照ガイド

pi-mono（piコア）のベストプラクティスに関する情報を、目的に応じて効率的に参照する方法をまとめたガイドです。開発者が拡張機能開発、スキル作成、SDK統合などのタスクにおいて、適切なドキュメントと例を素早く見つけられるようにします。

## 概要

pi-monoは**5つの主要な参照経路**を提供しています：

1. **Core Documentation** - README.md と docs/ ディレクトリ
2. **Extension System** - docs/extensions.md + examples/
3. **Skill System** - docs/skills.md + Agent Skills標準
4. **SDK & Integration** - docs/sdk.md, docs/tui.md, docs/rpc.md
5. **Package Distribution** - docs/packages.md + npm/git

---

## 5つの参照経路

### 1. Core Documentation

**場所**: `pi-mono/README.md` および `pi-mono/docs/`

pi-monoの基本概念、使用方法、設定オプションを網羅したドキュメントです。

| ドキュメント | 用途 | 優先度 |
|-------------|------|--------|
| `README.md` | 概要、基本概念、コマンド | 最初に参照 |
| `docs/settings.md` | 設定オプション一覧 | 設定時 |
| `docs/session.md` | セッションファイル形式 | セッション管理 |
| `docs/compaction.md` | コンテキスト圧縮 | 長期セッション |

**参照方法**:
```bash
# piセッション内から
pi @README.md "piの基本概念を説明して"
pi @docs/settings.md "設定オプションの一覧を表示"
```

### 2. Extension System

**場所**: `pi-mono/docs/extensions.md` + `pi-mono/examples/extensions/`

拡張機能開発のための包括的なガイドと67個のサンプルコードです。

| ドキュメント | 内容 | 行数 |
|-------------|------|------|
| `docs/extensions.md` | Extension API、イベント、カスタムツール | 1936行 |
| `examples/extensions/` | 67個の動作するサンプル | - |

**参照方法**:
```bash
pi @docs/extensions.md "カスタムツールの登録方法は？"
pi @examples/extensions/todo.ts "この拡張機能を解説して"
```

**主要セクション**:
- Quick Start（1-100行）
- Events（200-600行）- ライフサイクル、セッション、エージェント、ツールイベント
- ExtensionContext（600-750行）
- Custom Tools（900-1200行）
- Custom UI（1200-1600行）

### 3. Skill System

**場所**: `pi-mono/docs/skills.md` + [Agent Skills標準](https://agentskills.io/specification)

スキル作成のための仕様とベストプラクティスです。

| ドキュメント | 内容 |
|-------------|------|
| `docs/skills.md` | piスキル実装、フロントマター形式 |
| [agentskills.io](https://agentskills.io/specification) | Agent Skills標準仕様 |

**参照方法**:
```bash
pi @docs/skills.md "SKILL.mdのフロントマター形式は？"
```

### 4. SDK & Integration

**場所**: `pi-mono/docs/sdk.md`, `pi-mono/docs/tui.md`, `pi-mono/docs/rpc.md`

SDK統合、TUIコンポーネント、RPCモードのためのドキュメントです。

| ドキュメント | 内容 | 行数 |
|-------------|------|------|
| `docs/sdk.md` | SDK統合ガイド | ~970行 |
| `docs/tui.md` | TUIコンポーネントAPI | ~900行 |
| `docs/rpc.md` | RPCプロトコル | ~800行 |

**参照方法**:
```bash
pi @docs/sdk.md "SDKでセッションを作成する方法は？"
pi @docs/tui.md "利用可能なTUIコンポーネント一覧"
```

### 5. Package Distribution

**場所**: `pi-mono/docs/packages.md`

パッケージ作成とnpm/git配布のためのドキュメントです。

**参照方法**:
```bash
pi @docs/packages.md "パッケージの作成方法は？"
```

---

## 目的別クイックナビゲーション

| タスク | 主参照先 | 副参照先 |
|------|---------|---------|
| **拡張機能作成** | `docs/extensions.md` | `examples/extensions/` |
| **スキル作成** | `docs/skills.md` | [agentskills.io](https://agentskills.io/specification) |
| **パッケージ作成** | `docs/packages.md` | `examples/extensions/with-deps/` |
| **TUI構築** | `docs/tui.md` | `examples/extensions/snake.ts` |
| **SDK統合** | `docs/sdk.md` | `examples/sdk/` |
| **カスタムプロバイダー** | `docs/custom-provider.md` | `examples/extensions/custom-provider-*` |
| **設定** | `docs/settings.md` | `/settings` コマンド |
| **セッション管理** | `docs/session.md` | `docs/tree.md` |

---

## 実践例

### 例1: カスタムツール作成

**ベストプラクティス**:

1. **StringEnumを使用**（Google API互換性）
2. **状態をdetailsに永続化**（フォーク対応）
3. **出力の切り捨て**（必須）

```typescript
import { StringEnum } from "@mariozechner/pi-ai";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

// パラメータ定義（StringEnumを使用）
const params = Type.Object({
  action: StringEnum(["list", "add", "remove"] as const),
  item: Type.Optional(Type.String()),
});

// ツール実装
pi.tool("my_tool", params, async (args, ctx) => {
  // 処理...
  let result = expensiveOperation();
  
  // 出力切り捨て（必須）
  const truncation = truncateHead(result, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  
  if (truncation.truncated) {
    const tempFile = writeTempFile(result);
    result = truncation.output + `\n\n[Full output: ${tempFile}]`;
  }
  
  return {
    content: [{ type: "text", text: result }],
    details: { todos, nextId }, // 状態永続化
  };
});
```

**参照先**: `docs/extensions.md` 900-1200行、`examples/extensions/todo.ts`

### 例2: スキル作成

**ベストプラクティス**:

1. **具体的なdescription**（最大1024文字）
2. **相対パスの使用**
3. **allowed-toolsの指定**

```markdown
---
name: my-skill
description: PDFファイルからテキストとテーブルを抽出し、フォーム入力とPDF結合を行う。PDFドキュメントを扱う場合に使用。
license: MIT
compatibility: Node.js 18+
allowed-tools: read bash edit
---

# My Skill

## Setup
\`\`\`bash
cd /path/to/skill && npm install
\`\`\`

## Usage
\`\`\`bash
./scripts/process.sh <input>
\`\`\`

## References
See [API Reference](references/api-reference.md) for details.
```

**参照先**: `docs/skills.md`、[agentskills.io](https://agentskills.io/specification)

### 例3: パッケージ作成

**ベストプラクティス**:

1. **keywordsに"pi-package"を含める**
2. **pi manifestで明示的に指定**
3. **バージョンピニング**

```json
{
  "name": "my-pi-package",
  "version": "1.0.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**インストール**:
```bash
pi install npm:@foo/bar@1.0.0      # npm（バージョン指定）
pi install git:github.com/user/repo@v1  # git（タグ指定）
pi install ./local/path             # ローカルパス
```

**参照先**: `docs/packages.md`

---

## pi-monoからの直接参照方法

### @file構文

piセッション内からドキュメントを直接参照：

```
@docs/extensions.md "カスタムツールの登録方法を教えて"
@examples/extensions/todo.ts "このコードを解説して"
```

### スキル呼び出し

登録済みスキルを直接呼び出し：

```
/skill:code-review
/skill:git-workflow
/skill:clean-architecture
```

### コマンド発見

利用可能なコマンド、テンプレート、スキルを一覧：

```
/                    # すべてのコマンドを表示
/hotkeys             # キーボードショートカット
/settings            # 設定UIを開く
```

---

## pi-monoのインストールパス

pi-monoのドキュメントは、インストール方法によって異なる場所に配置されます：

| インストール方法 | パス |
|----------------|------|
| NVM + npm（グローバル） | `~/.nvm/versions/node/<version>/lib/node_modules/@mariozechner/pi-coding-agent/` |
| システムNode | `/usr/local/lib/node_modules/@mariozechner/pi-coding-agent/` |
| ローカル開発 | `<repo-dir>/` |

**パス確認方法**:
```bash
which pi
# または
npm list -g @mariozechner/pi-coding-agent
```

---

## 関連トピック

- [クイックリファレンス](../04-reference/pi-mono-quick-reference.md) - よく使うパターンとコマンドのチートシート
- [拡張機能一覧](./01-extensions.md) - mekannプロジェクトの拡張機能
- [開発者ガイド](../03-development/) - 開発に関する詳細情報

## 次のトピック

[→ クイックリファレンス](../04-reference/pi-mono-quick-reference.md)
