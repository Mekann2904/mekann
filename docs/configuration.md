# Configuration

Mekann の feature settings は Pi の `settings.json` ではなく、Mekann 専用の `mekann.json` に保存します。

## Files

| Scope | Path | Use |
|---|---|---|
| Global | `~/.pi/agent/mekann.json` | 全 workspace の default |
| Workspace | `.pi/mekann.json` | 現在の repo だけの override |

workspace 設定が global 設定より優先され、どちらにもない値は feature default が使われます。

## Shape

```json
{
  "version": 1,
  "features": {
    "sandbox": {
      "bashMode": "sandboxed"
    },
    "subagent": {
      "maxSubagents": 1,
      "display": "external-split"
    }
  }
}
```

## Editor

Pi 上では `/mekann-settings` を使って設定を確認・編集できます。global と workspace の effective value、source、diagnostics を確認できます。

## Common settings

### Sandbox

```json
{
  "version": 1,
  "features": {
    "sandbox": {
      "enabled": true,
      "bashMode": "ask",
      "allowPersistentBashApprovals": true,
      "llmOutputMaxBytes": 51200,
      "llmOutputMaxLines": 2000
    }
  }
}
```

`bashMode` は `off`、`ask`、`sandboxed`、`yolo` のいずれかです。`yolo` は OS sandbox なしで実行します。

### Subagent

```json
{
  "version": 1,
  "features": {
    "subagent": {
      "enabled": true,
      "maxSubagents": 1,
      "maxQueuedSubagents": 2,
      "display": "external-split",
      "defaultReasoningEffort": "low",
      "maxResultRetries": 3
    }
  }
}
```

`display` は `none`、`external-pi`、`external-split` のいずれかです。Kitty 以外では表示機能が制限される場合があります。`maxSubagents` は hard-cap の `4` まで指定できます。`maxResultRetries`（1〜10、既定 3）は `agent_results action=retry` で1つの結果を再実行できる回数上限です。

**既定では無効** です（ADR-0018）。汎用の `delegate_agent` / `spawn_agent` などのツールを既定で隠すためです。`review-fixer` はこの設定によらず独自の control plane で動作するため、subagent を無効のままでも issue worktree で `review_fixer` を使えます。subagent 機能を使う場合のみ `features.subagent.enabled = true` を設定してください。

### Command Normalization

```json
{
  "version": 1,
  "features": {
    "command-normalization": {
      "enabled": true,
      "bashEnabled": true,
      "recordNormalization": false
    }
  }
}
```

単純な `bash` command を parse-friendly な形式へ実行前に正規化します。旧 `output-budget` 設定は互換 alias として読み取られますが、新規設定では `command-normalization` を使ってください。

### Output Gate

```json
{
  "version": 1,
  "features": {
    "output-gate": {
      "enabled": true,
      "maxInlineBytes": 49152,
      "previewBytes": 8192,
      "defaultMaxResults": 10
    }
  }
}
```

大きな tool output を artifact として保存し、context window への過剰な inline 挿入を抑えます。

### Collaboration Modes

```json
{
  "version": 1,
  "features": {
    "modes": {
      "models": {
        "read_only": {
          "provider": "openai",
          "modelId": "gpt-5"
        }
      },
      "thinking": {
        "read_only": "medium"
      }
    }
  }
}
```

未設定の mode は Pi の現在 model / thinking を継承します。

### Cacheable Context

```json
{
  "version": 1,
  "features": {
    "cacheable-context": {
      "enabled": true,
      "promptSurface": "locator",
      "contextMode": "term-index"
    }
  }
}
```

`promptSurface` は `locator` または `off` です。初期値は `locator` で、system prompt には保存場所と探索方針の小さな locator だけを追加し、詳細は agent が通常の read/rg で探索します。`full` は **非推奨** です。base system が既に `<project_context>` として AGENTS.md（や domain docs）を注入しているため、`full` で生成 fragment 本文を追加注入すると二重注入になります。`full` を指定した場合は `locator` へフォールバックし、`/mekann-settings` に非推奨 diagnostic が表示されます。

`contextMode` は `off`、`term-index`（既定）、`distilled`、`full` で、CONTEXT.md の取り込み方式を制御します。

### Codex Web Search

```json
{
  "version": 1,
  "features": {
    "codex-web-search": {
      "enabled": true,
      "externalWebAccess": true,
      "defaultSearchContextSize": "medium",
      "nonCodexDefaultModel": "gpt-5.5",
      "nonCodexDefaultEffort": "low"
    }
  }
}
```

## Registered features

現在 registry にある feature settings は、`modes`、`sandbox`、`subagent`、`command-normalization`、`output-gate`、`context-ledger`、`context-tracker`、`cacheable-context`、`codex-shared`、`codex-web-search`、`codex-limits`、`dashboard`、`model-optimizer`、`terminal` です。詳細な key、default、validation は各 `settingsSchema.ts` を正とします。
