---
title: システムアーキテクチャ図
category: reference
audience: developer
last_updated: 2025-03-04
tags: [architecture, system-design]
related: [".pi/INDEX.md", "README.md"]
---

# システムアーキテクチャ図

## 概要

本ドキュメントはmekann/pi拡張コレクションの全体アーキテクチャを視覚化する。

## レイヤー構造図

```mermaid
flowchart TB
    subgraph User["👤 ユーザー層"]
        CLI["pi CLI"]
        WebUI["Web UI Dashboard"]
    end

    subgraph Core["🔧 コアエンジン層"]
        Mediator["Intent Mediator<br/>意図解釈・問い生成"]
        TaskFlow["Task Flow<br/>タスク管理・委任"]
        PlanEngine["Plan Engine<br/>計画・DAG実行"]
    end

    subgraph Agent["🤖 エージェント層"]
        Subagents["Subagents<br/>個別エージェント実行"]
        AgentTeams["Agent Teams<br/>チーム並列実行"]
        DAGExec["DAG Executor<br/>依存関係ベース並列化"]
    end

    subgraph Extension["📦 拡張機能層 (34 extensions)"]
        SearchTools["Search Tools<br/>file_candidates/code_search/sym_*"]
        ABDD["ABDD System<br/>実態駆動開発"]
        DynamicTools["Dynamic Tools<br/>動的ツール生成"]
        MCPClient["MCP Client<br/>外部サーバー連携"]
        GitHubAgent["GitHub Agent<br/>リポジトリ操作"]
        WebUIServer["Web UI Server<br/>ダッシュボード"]
    end

    subgraph Library["📚 ライブラリ層 (55 files)"]
        Concurrency["concurrency.ts<br/>Worker Pool"]
        Retry["retry-with-backoff.ts"]
        SemanticMem["semantic-memory.ts"]
        Verification["verification-workflow.ts"]
        SkillRegistry["skill-registry.ts"]
        Embeddings["embeddings/<br/>ベクトル埋め込み"]
    end

    subgraph Skill["🎓 スキル層 (17 skills)"]
        GitWorkflow["git-workflow"]
        CodeReview["code-review"]
        CleanArch["clean-architecture"]
        BugHunt["bug-hunting"]
        TestEng["test-engineering"]
        ABDDSkill["abdd"]
        SelfImprove["self-improvement"]
    end

    subgraph Storage["💾 ストレージ層"]
        Memory[".pi/memory/<br/>セマンティックメモリ"]
        Plans[".pi/plans/<br/>計画履歴"]
        ABDDDocs["ABDD/<br/>自動生成ドキュメント"]
        Config[".pi/config/<br/>設定ファイル"]
    end

    %% 接続関係
    CLI --> Mediator
    WebUI --> WebUIServer
    
    Mediator --> TaskFlow
    TaskFlow --> PlanEngine
    PlanEngine --> DAGExec
    
    DAGExec --> Subagents
    DAGExec --> AgentTeams
    
    Subagents --> Extension
    AgentTeams --> Extension
    
    Extension --> Library
    Library --> Skill
    
    Extension --> Storage
    Library --> Storage
```

## データフロー図

```mermaid
sequenceDiagram
    actor User
    participant CLI as pi CLI
    participant Mediator as Intent Mediator
    participant Planner as Task Planner
    participant DAG as DAG Executor
    participant Subagent as Subagent
    participant Tool as Extension Tool
    participant Lib as Library
    participant Storage as Storage

    User->>CLI: タスク入力
    CLI->>Mediator: 意図解釈
    Mediator->>Mediator: 情報欠損検出
    alt 情報不足
        Mediator->>User: 補足質問
        User->>Mediator: 追加情報
    end
    Mediator->>Planner: 明確化されたタスク
    Planner->>Planner: DAG分解
    Planner->>DAG: 実行計画
    
    loop 並列タスク実行
        DAG->>Subagent: タスク割り当て
        Subagent->>Tool: ツール呼び出し
        Tool->>Lib: ライブラリ使用
        Lib->>Storage: データ読み書き
        Storage-->>Lib: 結果
        Lib-->>Tool: 結果
        Tool-->>Subagent: 結果
        Subagent-->>DAG: 完了
    end
    
    DAG-->>Planner: 全タスク完了
    Planner-->>CLI: 結果統合
    CLI-->>User: 最終出力
```

## サブシステム詳細

### 1. 検索システム

```mermaid
flowchart LR
    subgraph SearchSystem["🔍 Search System"]
        FC[file_candidates<br/>fdベース]
        CS[code_search<br/>rgベース]
        SI[sym_index<br/>ctags]
        SF[sym_find]
        SS[semantic_search<br/>ベクトル検索]
    end

    subgraph IndexTypes["インデックスタイプ"]
        FileIdx["ファイルインデックス"]
        SymIdx["シンボルインデックス"]
        SemIdx["セマンティックインデックス"]
        CallIdx["コールグラフインデックス"]
    end

    FC --> FileIdx
    SI --> SymIdx
    CS --> CallIdx
    SS --> SemIdx
    SF --> SymIdx
```

### 2. ABDDシステム

```mermaid
flowchart TB
    subgraph ABDDSystem["📋 ABDD System"]
        Spec["spec.md<br/>仕様・不変条件"]
        Philosophy["philosophy.md<br/>価値観・原則"]
        GenDoc["generate-abdd<br/>ドキュメント生成"]
        JSDocGen["add-jsdoc<br/>JSDoc生成"]
        Review["abdd_review<br/>乖離分析"]
        Analyze["abdd_analyze<br/>AST解析"]
    end

    subgraph Outputs["生成物"]
        ExtDocs["ABDD/.pi/extensions/<br/>拡張機能ドキュメント"]
        LibDocs["ABDD/.pi/lib/<br/>ライブラリドキュメント"]
        Reviews["ABDD/reviews/<br/>レビュー記録"]
    end

    Spec --> GenDoc
    Philosophy --> GenDoc
    GenDoc --> ExtDocs
    GenDoc --> LibDocs
    Review --> Reviews
    Analyze --> Reviews
```

### 3. エージェントオーケストレーション

```mermaid
flowchart TB
    subgraph Orchestration["🎼 オーケストレーション"]
        direction TB
        
        subgraph Single["単一エージェント"]
            SR[subagent_run]
        end
        
        subgraph Parallel["並列実行"]
            SRP[subagent_run_parallel]
            ATR[agent_team_run]
        end
        
        subgraph DAG["DAG実行"]
            SRD[subagent_run_dag]
            ULD[ul_workflow_dag]
        end
        
        subgraph UL["UL Workflow"]
            ULW[ul_workflow_run]
            Research[Research Phase]
            Plan[Plan Phase]
            Implement[Implement Phase]
        end
    end

    SR --> SRP
    SRP --> SRD
    SRD --> ULW
    ULW --> Research
    Research --> Plan
    Plan --> Implement
```

### 4. メモリシステム

```mermaid
flowchart LR
    subgraph MemorySystem["🧠 Memory System"]
        AgentMem["agent-memory<br/>探索キャッシュ"]
        SemanticMem["semantic-memory<br/>ベクトルストア"]
        AWO["AWO<br/>ワークフロー最適化"]
        PatternExt["pattern-extraction<br/>パターン抽出"]
    end

    subgraph StorageTypes["ストレージ"]
        Confirmed["confirmed-facts.json"]
        Patterns["patterns.json"]
        ConvSum["conversation-summary.md"]
        Traces["execution-traces/"]
    end

    AgentMem --> Confirmed
    SemanticMem --> Patterns
    PatternExt --> Patterns
    AWO --> Traces
```

## コンポーネント依存関係

```mermaid
graph TD
    A[question] --> B[user-input]
    C[mediator_interpret] --> D[intent-mediator]
    E[task_*] --> F[task-flow]
    G[plan_*] --> H[plan.ts]
    I[subagent_*] --> J[subagents.ts]
    K[agent_team_*] --> L[agent-teams.ts]
    M[abdd_*] --> N[abdd.ts]
    O[file_candidates] --> P[search/file-candidates.ts]
    Q[code_search] --> R[search/code-search.ts]
    S[sym_index] --> T[search/symbol-index.ts]
    U[sym_find] --> V[search/symbol-find.ts]
    W[create_tool] --> X[dynamic-tools.ts]
    Y[mcp_*] --> Z[mcp-client.ts]
    AA[repo_audit] --> BB[repo-audit-orchestrator.ts]
    CC[loop_run] --> DD[loop.ts]
    EE[self_reflect] --> FF[self-improvement-reflection.ts]
```

## スキル呼び出しフロー

```mermaid
sequenceDiagram
    participant User
    participant CLI as pi CLI
    participant SkillReg as skill-registry
    participant SkillLoader as Skill Loader
    participant SkillFile as SKILL.md
    participant Execution as 実行エンジン

    User->>CLI: git commitしたい
    CLI->>SkillReg: スキル検索
    SkillReg->>SkillReg: "git"キーワードマッチ
    SkillReg-->>CLI: git-workflowスキル
    CLI->>SkillLoader: スキル読み込み
    SkillLoader->>SkillFile: read .pi/skills/git-workflow/SKILL.md
    SkillFile-->>SkillLoader: スキル定義
    SkillLoader-->>CLI: スキルコンテキスト
    CLI->>Execution: スキルガイド付き実行
    Execution-->>User: 結果
```

## 技術スタック

| 層 | 技術 |
|----|------|
| ランタイム | Node.js / TypeScript |
| プロセス管理 | Worker Threads |
| 検索 | fd, ripgrep, ctags |
| ベクトル検索 | OpenAI Embeddings |
| ブラウザ自動化 | Playwright |
| ドキュメント | Markdown + Mermaid |
| 設定 | JSON / YAML |

## 関連ドキュメント

- [.pi/INDEX.md](.pi/INDEX.md) - リポジトリ構造マップ
- [.pi/NAVIGATION.md](.pi/NAVIGATION.md) - タスク別ソースマッピング
- [ABDD/index.md](ABDD/index.md) - ABDDシステム詳細
