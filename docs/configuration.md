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
      "bashMode": "sandboxed",
      "bashAllowlist": "",
      "allowPersistentBashApprovals": true,
      "llmOutputMaxBytes": 51200,
      "llmOutputMaxLines": 2000
    }
  }
}
```

`bashMode` は `off`（bash 禁止）、`ask`（allowlist 外をユーザー確認）、`sandboxed`（filesystem sandbox 内で実行、**既定**）、`yolo`（OS sandbox なしで実行）のいずれかです。`bashAllowlist` は `bashMode=ask` で確認なしに実行できる bash command の exact match 一覧（1 行 1 command、既定は空）。`allowPersistentBashApprovals`（既定 true）は allowlist 外 command を workspace の `mekann.json` に永続許可できるようにします。

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

### Goal

```json
{
  "version": 1,
  "features": {
    "goal": {
      "enabled": true,
      "toolSurface": "slash",
      "maxObjectiveLength": 100000,
      "compactReserveTokens": 16384
    }
  }
}
```

goal model tools を LLM に見せる条件。`toolSurface` は `slash`（`/goal` command のみ）、`active`（active goal 中のみ）、`always`（常時）のいずれかです。`maxObjectiveLength`（1〜200000、既定 100000）は goal objective の最大文字数で、200000 の sanity ceiling でクランプされます。objective は continuation 毎にプロンプトに埋め込まれるため、上限は context/cache コストを抑えるため控えめに設定されています。`compactReserveTokens`（0〜1000000、既定 16384）は goal continuation を送る前に compaction を発動する context token 予約幅で、Pi の `CompactionSettings.reserveTokens` と合わせて調整してください。いずれも restart 不要です。

### Autoresearch

```json
{
  "version": 1,
  "features": {
    "autoresearch": {
      "enabled": true,
      "toolSurface": "active"
    }
  }
}
```

autoresearch model tools を LLM に見せる条件。`toolSurface` は `active`（`/autoresearch on` 実行中のみ）または `always`（常時）です。

### Review Fixer

```json
{
  "version": 1,
  "features": {
    "review-fixer": {
      "enabled": true,
      "maxFixRetries": 3
    }
  }
}
```

Review fixer tool を有効にします（`thermo-nuclear-code-quality-review` に基づく同期 review + edit を child Pi で実行）。`maxFixRetries`（1〜10、既定 3）は verification 失敗時の修正再試行回数上限です。Work Pi の model / thinking 設定は `modes` feature の `review_fix` profile に集約されているため、ここには含まれません。

### Context Ledger

```json
{
  "version": 1,
  "features": {
    "context-ledger": {
      "enabled": true,
      "toolSurface": "on-demand",
      "postCompactionRestore": {
        "enabled": true
      }
    }
  }
}
```

`toolSurface` は `on-demand`（compaction 後や command で有効化）または `always`（常時）です。`postCompactionRestore.enabled`（既定 true）をオンにすると、compaction 後の次 turn で ledger snapshot を動的フラグメントとして自動注入し working memory を復元します。

### Context Tracker

```json
{
  "version": 1,
  "features": {
    "context-tracker": {
      "enabled": true,
      "autoStartServer": false,
      "port": 0
    }
  }
}
```

Mekann Web UI と context pressure monitoring を有効にします（LLM tool は追加しません）。`autoStartServer`（既定 false）をオンにすると `session_start` 時に monitoring HTTP server を自動起動します（オフなら `/web-ui` 実行時のみ）。`port`（既定 0）は 0 で空き port を自動選択します。変更時は restart が必要です。

### Context Control

```json
{
  "version": 1,
  "features": {
    "context-control": {
      "pressureCriticalPct": 85,
      "pressureHighPct": 70,
      "pressureMediumPct": 45,
      "messageSummarizeBytes": 24576,
      "toolExternalizeTotalBytes": 65536,
      "messagePctHigh": 75,
      "riskCriticalScore": 35,
      "riskHighScore": 55,
      "riskMediumScore": 75
    }
  }
}
```

context-control の planner / report / analysis が共有する閾値テーブルです（issue #166 / IC-174 / IC-175 / IC-176）。以前は圧力判定・予算・要約閾値・減点・risk 帯・cache 警告が各モジュールにハードコードされ、planner と report が同じ指標で別の閾値を持っていました。これらを1箇所に集約し、`mekann.json` で上書きすると3モジュールの挙動が連動して変わります。上記以外にも budget 系（`budgetDynamicTail*` / `budgetMessage*` / `budgetTool*`）、policy 系（`messageRetrieveBytes` / `toolWarnBytes` / `toolLargeSchemaBytes`）、penalty 系（`penalty*`）、alert 系（`alert*`）、growth 系（`growth*`）など多数の閾値が上書き可能です（既定値は現状挙動）。`/mekann-settings` で全項目と検証範囲を確認できます。

### Codex Shared

```json
{
  "version": 1,
  "features": {
    "codex-shared": {
      "baseUrl": "https://chatgpt.com/backend-api",
      "modelCacheTtlMs": 300000
    }
  }
}
```

Codex API の共有設定（Advanced カテゴリ、通常は変更不要）。`codex-shared` は `codex-web-search` / `codex-limits` から共有される Codex 接続・モデル取得の共通設定です。`baseUrl` は Codex API base URL、`modelCacheTtlMs`（0〜86400000、既定 300000 = 5 分）は model catalog cache TTL です。いずれも restart 不要です。

**Reasoning effort に関する注意**: Mekann が扱う既知の effort は `none` / `minimal` / `low` / `medium` / `high` / `xhigh` です。`xhigh` は非公式仕様・一部モデルのみ対応のため、対象モデルが対応していない場合は `low` へフォールバックします（このとき警告を出します）。モデルが API で新たな effort を報告した場合は破棄せず保持しますが、API 側で拒否される可能性があります。プロバイダ/モデル別の対応 effort は Codex API のモデルメタデータ（`supported_reasoning_efforts`）を正としてください。

### Model Optimizer

```json
{
  "version": 1,
  "features": {
    "model-optimizer": {
      "enabled": true,
      "overflowRecovery": { "enabled": true },
      "metrics": { "enabled": true },
      "compactionObserver": { "enabled": true },
      "postCompactionHint": { "enabled": true },
      "debugLogging": false
    }
  }
}
```

model-optimizer 拡張全体の有効/無効と各観測機能の切替。`overflowRecovery`（context overflow エラーの自動正規化）、`metrics`（使用量・レイテンシの session-local 計測）、`compactionObserver`（compaction lifecycle の観測）、`postCompactionHint`（compaction 後の次 turn で provider-aware continuation hint を注入）、`debugLogging`（既定 false、notify 表示）です。provider 別（OpenAI / DeepSeek など）の最適化設定は各 optimizer module から動的に追加されます。詳細な key、default、validation は各 `settingsSchema.ts` を正とします。

### Terminal

```json
{
  "version": 1,
  "features": {
    "terminal": {
      "clearOnStartup": true
    }
  }
}
```

`clearOnStartup`（既定 true）は Pi 起動時（`session_start` reason: `startup`）にターミナル画面をクリアします。

### Issue

```json
{
  "version": 1,
  "features": {
    "issue": {
      "autopilot": {
        "maxParallel": 2
      }
    }
  }
}
```

`autopilot.maxParallel`（既定 2、1 以上の整数）は `/issue-autopilot` が同時に駆動する Work Pi の上限。並列ワーカープールは別 issue で拡張されるまで、現状は 1（逐次）として動作します。

### Codex Limits

```json
{
  "version": 1,
  "features": {
    "codex-limits": {
      "enabled": true
    }
  }
}
```

Codex usage footer / statusline と `/codex-status` command を有効にします。変更時は restart が必要です。

### Dashboard

```json
{
  "version": 1,
  "features": {
    "dashboard": {
      "enabled": true,
      "kittyChunkChars": 4096,
      "widthMin": 20,
      "widthMax": 140,
      "levelColorFourth": "#39d353"
    }
  }
}
```

`/dashboard` command と dashboard 関連 UI integration を有効にします（`enabled` 変更時は restart が必要）。それ以外は runtime 反映可能な描画チューニングです（issue #166 / IC-233 / IC-236 / IC-239）: `kittyChunkChars`（512〜65536、既定 4096）は Kitty graphics protocol の APC エスケープを構築する `kittyGraphicsEscape` ヘルパーの base64 チャンク文字数です（実画像配置は `kitten icat` 経由で行うため、この値は将来の APC 直接送信パス向けのチューニングです）。`widthMin`（8〜80、既定 20）/`widthMax`（40〜1000、既定 140）はテキスト描画の端末幅クランプ範囲で、極狭端末での崩れと広端末での余白過多を防ぎます。`levelColorNone`/`levelColorFirst`/`levelColorSecond`/`levelColorThird`/`levelColorFourth` は GitHub contribution 四分位数の色（`#rrggbb`）で、テーマ・ダークライト・色覚多様性に合わせて調整できます。

### Zip Repo

```json
{
  "version": 1,
  "features": {
    "zip-repo": {
      "enabled": true
    }
  }
}
```

`/zip` command を有効にします。`false` の場合、zip utility command を登録しません。変更時は restart が必要です。

### Terminal Shortcuts

```json
{
  "version": 1,
  "features": {
    "terminal-shortcuts": {
      "enabled": true
    }
  }
}
```

terminal shortcut handling を有効にします。`false` の場合、shortcut hooks を登録しません。変更時は restart が必要です。

### Settings Editor

```json
{
  "version": 1,
  "features": {
    "settings-editor": {
      "enabled": true
    }
  }
}
```

`/mekann-settings` command を有効にします。`false` の場合、settings editor command を登録しません。変更時は restart が必要です。

### Mekann Skills

```json
{
  "version": 1,
  "features": {
    "skills": {
      "diagnose": true,
      "tdd": true,
      "zoom-out": true
    }
  }
}
```

各 Mekann skill の system prompt 可視性を制御します（feature key は `skills`）。各 key は skill 名で、`false` にすると `available skills` 一覧から非表示になります（`/skill:<name>` での明示起動は可能）。実際の skill 一覧と既定値は `mekann/skill-surface/skills.ts` の定義から動的に生成されるため、上記は例です。

## Registered features

現在 registry にある feature settings（`mekann/settings/registry.ts` の `mekannSettingsSchemas` 順）は、`modes`、`sandbox`、`goal`、`subagent`、`autoresearch`、`review-fixer`、`command-normalization`、`output-gate`、`context-ledger`、`context-tracker`、`cacheable-context`、`context-control`、`codex-shared`、`codex-web-search`、`codex-limits`、`dashboard`、`zip-repo`、`terminal-shortcuts`、`settings-editor`、`skills`、`model-optimizer`、`terminal`、`issue` の 23 feature です。詳細な key、default、validation は各 `settingsSchema.ts` を正とします。
