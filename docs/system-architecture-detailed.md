---
title: 詳細システムアーキテクチャ図 - DAG実行とインデックスシステム
category: reference
audience: developer
last_updated: 2025-03-04
tags: [architecture, dag, index, search]
related: ["system-architecture.md", ".pi/extensions/subagents.ts"]
---

# 詳細システムアーキテクチャ図

## 1. DAG実行システム（subagent_run_dag）

### 1.1 DAG実行の全体フロー

```mermaid
flowchart TB
    subgraph Input["入力層"]
        Task["task: 実行したいタスク"]
        Plan["plan: DAG定義（オプション）"]
        AutoGen["autoGenerate: true/false"]
        MaxConcurrency["maxConcurrency: 並列数"]
    end

    subgraph DagGenerator["DAG生成エンジン"]
        TaskAnalyzer["タスク分析<br/>generateDagFromTask()"]
        DependencyResolver["依存関係解決"]
        DepthCalculator["深さ計算<br/>maxDepth: 4"]
        TaskLimiter["タスク制限<br/>maxTasks: 10"]
    end

    subgraph Validation["検証層"]
        CycleCheck["循環依存チェック"]
        OrphanCheck["孤立タスクチェック"]
        DepthCheck["深さ制限チェック"]
    end

    subgraph RuntimeCapacity["ランタイム容量管理"]
        Snapshot["getRuntimeSnapshot()"]
        DispatchPermit["acquireRuntimeDispatchPermit()"]
        ConcurrencyLimit["maxParallelSubagentsPerRun制限"]
    end

    subgraph ExecutionEngine["実行エンジン"]
        subgraph StandardDag["標準DAG実行"]
            executeDag["executeDag()"]
        end
        
        subgraph AdaptOrch["AdaptOrch拡張"]
            TopologyAnalyzer["トポロジー分析"]
            StrategySelector["戦略選択<br/>parallel/sequential/hierarchical/hybrid"]
            executeWithAdaptOrch["executeWithAdaptOrch()"]
        end
    end

    subgraph TaskExecutor["タスク実行器"]
        AgentPicker["エージェント選択<br/>pickAgent()"]
        PromptBuilder["プロンプト構築<br/>buildSubagentPrompt()"]
        LiveMonitor["ライブモニタリング"]
        runSubagentTask["runSubagentTask()"]
    end

    subgraph Output["出力層"]
        Results["各タスク結果"]
        Aggregated["結果統合"]
        RunRecord["実行レコード保存"]
    end

    Task --> TaskAnalyzer
    Plan -.->|提供時はスキップ| Validation
    AutoGen -->|true| TaskAnalyzer
    
    TaskAnalyzer --> DependencyResolver
    DependencyResolver --> DepthCalculator
    DepthCalculator --> TaskLimiter
    TaskLimiter --> Validation
    
    Validation --> RuntimeCapacity
    RuntimeCapacity --> ExecutionEngine
    
    ExecutionEngine --> TaskExecutor
    TaskExecutor --> Output
```

### 1.2 DAG自動生成のアルゴリズム

```mermaid
sequenceDiagram
    participant User
    participant DagGen as DAG Generator
    participant LLM as LLM (分解)
    participant Validator as Plan Validator
    participant Executor as DAG Executor

    User->>DagGen: task="APIリファクタリング"
    
    DagGen->>DagGen: タスク複雑度分析
    
    alt 単純タスク
        DagGen->>DagGen: 単一ノードDAG生成
    else 複雑タスク
        DagGen->>LLM: 「以下のタスクをサブタスクに分解」
        Note over LLM: プロンプト例:<br/>- タスク: APIリファクタリング<br/>- 最大4階層<br/>- 最大10タスク
        LLM-->>DagGen: サブタスクリスト + 依存関係
        
        DagGen->>DagGen: タスクID割り当て
        DagGen->>DagGen: 依存関係グラフ構築
        DagGen->>DagGen: トポロジカルソート
    end
    
    DagGen->>Validator: validateTaskPlan()
    Validator->>Validator: 循環依存チェック
    Validator->>Validator: 未定義依存チェック
    Validator->>Validator: 深さ制限チェック
    
    alt 検証失敗
        Validator-->>DagGen: エラー返却
        DagGen-->>User: 自動生成失敗
    else 検証成功
        Validator-->>DagGen: OK
        DagGen->>Executor: executeDag()
    end
```

### 1.3 DAG実行の並列制御

```mermaid
flowchart TB
    subgraph DagStructure["DAG構造例"]
        T1["T1: research"] --> T2["T2: impl-auth"]
        T1 --> T3["T3: impl-users"]
        T1 --> T4["T4: impl-products"]
        T2 --> T5["T5: review"]
        T3 --> T5
        T4 --> T5
        T5 --> T6["T6: test"]
    end

    subgraph Timeline["実行タイムライン<br/>maxConcurrency=3"]
        direction LR
        
        Time0["t=0"] --> Time1["t=30s"]
        Time1 --> Time2["t=60s"]
        Time2 --> Time3["t=90s"]
        Time3 --> Time4["t=120s"]
        
        subgraph Phase1["Phase 1"]
            P1_T1["T1 running"]
        end
        
        subgraph Phase2["Phase 2"]
            P2_T2["T2 running"]
            P2_T3["T3 running"]
            P2_T4["T4 running"]
        end
        
        subgraph Phase3["Phase 3"]
            P3_T5["T5 running"]
        end
        
        subgraph Phase4["Phase 4"]
            P4_T6["T6 running"]
        end
    end

    T1 -.->|完了後| Phase2
    T2 -.->|完了後| Phase3
    T3 -.->|完了後| Phase3
    T4 -.->|完了後| Phase3
    T5 -.->|完了後| Phase4

    Time0 --> Phase1
    Time1 --> Phase2
    Time2 --> Phase3
    Time3 --> Phase4
```

### 1.4 AdaptOrchトポロジー認識実行

```mermaid
flowchart TB
    subgraph TaskGraph["タスクグラフ分析"]
        FanOut["Fan-out検出<br/>1→N分岐"]
        FanIn["Fan-in検出<br/>N→1収束"]
        Diamond["Diamond検出<br/>Fan-out + Fan-in"]
        Chain["Chain検出<br/>直列依存"]
        Independent["独立タスク検出"]
    end

    subgraph TopologyStrategies["トポロジー戦略"]
        Parallel["parallel<br/>全独立タスクを並列"]
        Sequential["sequential<br/>依存順に直列"]
        Hierarchical["hierarchical<br/>階層ごとにバッチ"]
        Hybrid["hybrid<br/>動的戦略切替"]
    end

    subgraph Execution["実行最適化"]
        BatchSize["バッチサイズ計算"]
        CriticalPath["クリティカルパス特定"]
        LoadBalancing["負荷分散"]
    end

    FanOut -->|検出| Hybrid
    FanIn -->|検出| Hybrid
    Diamond -->|検出| Hierarchical
    Chain -->|検出| Sequential
    Independent -->|検出| Parallel
    
    Parallel --> Execution
    Sequential --> Execution
    Hierarchical --> Execution
    Hybrid --> Execution
```

## 2. ツールコンパイラシステム（compile_tools / execute_compiled）

### 2.1 ツール融合の仕組み

```mermaid
flowchart TB
    subgraph OriginalTools["元のツール呼び出し"]
        T1["file_candidates<br/>estimatedTokens: 500"]
        T2["code_search<br/>estimatedTokens: 800"]
        T3["sym_find<br/>estimatedTokens: 400"]
        T4["read<br/>estimatedTokens: 1000"]
    end

    subgraph Analysis["依存関係分析"]
        DepGraph["依存グラフ構築"]
        Grouping["類似ツールグループ化"]
        Parallelizable["並列可能性判定"]
    end

    subgraph FusionConfig["融合設定"]
        MinTools["minToolsForFusion: 2"]
        TokenThreshold["minTokenSavingsThreshold: 100"]
        MaxParallel["maxParallelism: 5"]
    end

    subgraph FusedOperations["融合操作"]
        F1["FusedOp_1<br/>file_candidates + code_search<br/>strategy: parallel<br/>savings: 600"]
        F2["FusedOp_2<br/>sym_find + read<br/>strategy: sequential<br/>savings: 300"]
    end

    subgraph CompilationResult["コンパイル結果"]
        ResultId["compilationId: abc123"]
        TotalSavings["totalTokenSavings: 900"]
        ParallelCount["parallelizableCount: 2"]
        Cache["30分間キャッシュ"]
    end

    T1 --> Analysis
    T2 --> Analysis
    T3 --> Analysis
    T4 --> Analysis
    
    Analysis --> FusionConfig
    FusionConfig --> FusedOperations
    FusedOperations --> CompilationResult
```

### 2.2 融合操作の実行フロー

```mermaid
sequenceDiagram
    participant Agent as Subagent
    participant Compiler as Tool Compiler
    participant Fuser as Tool Fuser
    participant Executor as Tool Executor
    participant Storage as Storage

    Agent->>Compiler: compile_tools(toolCalls)
    Compiler->>Fuser: fuser.compile(toolCalls)
    
    loop 各融合操作
        Fuser->>Fuser: 依存関係解析
        Fuser->>Fuser: 実行戦略決定<br/>parallel/sequential
        Fuser->>Fuser: トークン節約計算
    end
    
    Fuser-->>Compiler: CompilationResult
    Compiler->>Storage: saveStorage(compilationId, result)
    Compiler-->>Agent: compilationId + summary
    
    Agent->>Compiler: execute_compiled(compilationId)
    Compiler->>Storage: loadStorage(compilationId)
    Storage-->>Compiler: CompilationResult
    
    Compiler->>Executor: executor.execute(fusedOperations)
    
    par 並列実行可能な操作
        Executor->>Executor: FusedOp_1実行
        Executor->>Executor: FusedOp_2実行
    end
    
    Executor->>Executor: 結果を元のツール形式に分解
    Executor-->>Compiler: 統合結果
    Compiler-->>Agent: 各ツールの結果マップ
```

## 3. インデックスシステム

### 3.1 インデックスシステム全体図

```mermaid
flowchart TB
    subgraph SourceCode["ソースコード"]
        TSFiles["*.ts, *.tsx"]
        JSFiles["*.js, *.jsx"]
        PyFiles["*.py"]
        Other["*.go, *.rs..."]
    end

    subgraph IndexBuilders["インデックス構築器"]
        subgraph FileIndex["ファイルインデックス"]
            FdWrapper["fdコマンドラッパー"]
            NativeFallback["Node.js fs再帰"]
        end
        
        subgraph SymbolIndex["シンボルインデックス"]
            CtagsWrapper["ctagsラッパー"]
            SymParser["シンボルパーサー"]
        end
        
        subgraph CallGraph["コールグラフ"]
            RipgrepWrapper["ripgrepラッパー"]
            RegexFallback["正規表現フォールバック"]
        end
        
        subgraph RepoGraph["RepoGraph<br/>行レベル"]
            TreeSitter["tree-sitterパーサー"]
            ASTAnalyzer["AST分析"]
            DefRefExtractor["定義/参照抽出"]
        end
        
        subgraph LocAgent["LocAgent<br/>異種グラフ"]
            EntityExtractor["エンティティ抽出"]
            EdgeBuilder["エッジ構築"]
            GraphSerializer["グラフシリアライズ"]
        end
        
        subgraph SemanticIndex["セマンティックインデックス"]
            OpenAIEmbed["OpenAI Embeddings"]
            Chunker["コードチャンク分割"]
            VectorStore["ベクトルストア"]
        end
    end

    subgraph StorageLayer["ストレージ層"]
        FileCache[".pi/search/files/"]
        SymbolCache[".pi/search/symbols.json"]
        CallGraphCache[".pi/search/callgraph/"]
        RepoGraphCache[".pi/search/repograph/"]
        LocAgentCache[".pi/search/locagent/"]
        SemanticCache[".pi/search/semantic/"]
    end

    subgraph QueryEngines["クエリエンジン"]
        FileQuery["file_candidates"]
        CodeSearch["code_search"]
        SymFind["sym_find"]
        FindCallers["find_callers"]
        RepoGraphQuery["repograph_query"]
        LocAgentQuery["locagent_query"]
        SemanticSearch["semantic_search"]
        MergeResults["merge_results"]
    end

    TSFiles --> IndexBuilders
    JSFiles --> IndexBuilders
    PyFiles --> IndexBuilders
    Other --> IndexBuilders
    
    FileIndex --> FileCache
    SymbolIndex --> SymbolCache
    CallGraph --> CallGraphCache
    RepoGraph --> RepoGraphCache
    LocAgent --> LocAgentCache
    SemanticIndex --> SemanticCache
    
    FileCache --> FileQuery
    SymbolCache --> SymFind
    CallGraphCache --> FindCallers
    RepoGraphCache --> RepoGraphQuery
    LocAgentCache --> LocAgentQuery
    SemanticCache --> SemanticSearch
    
    FileQuery --> MergeResults
    CodeSearch --> MergeResults
    SymFind --> MergeResults
    SemanticSearch --> MergeResults
```

### 3.2 RepoGraph vs LocAgent の比較

```mermaid
flowchart TB
    subgraph Comparison["粒度比較"]
        subgraph RepoGraphDetail["RepoGraph（行レベル）"]
            RG_Node["ノード: file:line:column<br/>例: src/utils.ts:42:15"]
            RG_Edge["エッジ: def/ref/invoke/contain"]
            RG_Query["クエリ: symbol/file/<br/>definitions/references/related"]
        end
        
        subgraph LocAgentDetail["LocAgent（要素レベル）"]
            LA_Node["ノード: directory/file/<br/>class/function"]
            LA_Edge["エッジ: contain/import/<br/>invoke/inherit"]
            LA_Query["クエリ: search/traverse/<br/>retrieve/symbol/stats"]
        end
    end

    subgraph UseCases["使用場面"]
        RG_Use1["正確な定義位置特定"]
        RG_Use2["変数の使用箇所追跡"]
        RG_Use3["リファクタリング影響範囲"]
        
        LA_Use1["Issueから関連コード候補"]
        LA_Use2["アーキテクチャ理解"]
        LA_Use3["モジュール依存関係"]
    end

    subgraph Integration["連携パターン"]
        Step1["1. LocAgentで候補絞り込み"]
        Step2["2. RepoGraphで詳細取得"]
        Step3["3. 正確な変更箇所特定"]
    end

    RG_Node --> RG_Use1
    RG_Node --> RG_Use2
    RG_Node --> RG_Use3
    
    LA_Node --> LA_Use1
    LA_Node --> LA_Use2
    LA_Node --> LA_Use3
    
    LA_Use1 --> Step1
    Step1 --> Step2
    Step2 --> Step3
```

### 3.3 セマンティックインデックス構築フロー

```mermaid
sequenceDiagram
    participant User
    participant IndexTool as semantic_index
    participant Chunker as Code Chunker
    participant Embedder as OpenAI Embeddings
    participant VectorDB as Vector Store

    User->>IndexTool: semantic_index(path="./src")
    
    IndexTool->>IndexTool: ソースファイル列挙
    
    loop 各ファイル
        IndexTool->>Chunker: ファイル内容
        Chunker->>Chunker: チャンク分割<br/>chunkSize: 500<br/>overlap: 50
        Chunker-->>IndexTool: chunks[]
    end
    
    loop バッチ処理
        IndexTool->>Embedder: texts[] (最大100件)
        Embedder->>Embedder: text-embedding-3-small
        Embedder-->>IndexTool: embeddings[]
    end
    
    IndexTool->>VectorDB: 保存
    Note over VectorDB: {id, text, embedding,<br/>filePath, lineStart, lineEnd}
    
    IndexTool-->>User: インデックス完了<br/>fileCount, chunkCount, apiCalls
```

### 3.4 検索ツールの統合（merge_results）

```mermaid
flowchart TB
    subgraph SearchMethods["検索メソッド"]
        Semantic["semantic_search<br/>自然言語クエリ"]
        Symbol["sym_find<br/>シンボル名"]
        Code["code_search<br/>正規表現"]
        LocAgent["locagent_query<br/>グラフ探索"]
        RepoGraph["repograph_localize<br/>行レベル"]
    end

    subgraph MergingStrategies["統合戦略"]
        Weighted["weighted<br/>重み付け統合"]
        RankFusion["rank_fusion<br/>RRFアルゴリズム"]
        Interleave["interleave<br/>交互配置"]
    end

    subgraph RankingFactors["ランキング要因"]
        SimilarityScore["類似度スコア"]
        SymbolFrequency["シンボル出現頻度"]
        Recency["最近の検索履歴"]
        UserPreference["ユーザープリファレンス"]
    end

    subgraph FinalOutput["最終出力"]
        Deduplicated["重複除去"]
        Reranked["再ランキング"]
        TopK["上位K件返却"]
    end

    Semantic --> Weighted
    Symbol --> Weighted
    Code --> Weighted
    LocAgent --> Weighted
    RepoGraph --> Weighted
    
    Weighted --> RankingFactors
    RankFusion --> RankingFactors
    Interleave --> RankingFactors
    
    RankingFactors --> Deduplicated
    Deduplicated --> Reranked
    Reranked --> TopK
```

## 4. スキルレジストリシステム

### 4.1 スキル解決フロー

```mermaid
flowchart TB
    subgraph SkillRequest["スキルリクエスト"]
        SkillName["skill: 'git-workflow'"]
        Cwd["cwd: '/project'"]
        AgentDir["agentDir: '~/.pi/agent'"]
    end

    subgraph ResolutionPaths["解決パス"]
        LocalProject["1. プロジェクトローカル<br/>./.pi/lib/skills/"]
        GlobalAgent["2. グローバル<br/>~/.pi/agent/skills/"]
        PiCore["3. pi-core組み込み<br/>PI_CODING_AGENT_DIR/skills/"]
    end

    subgraph SkillLoading["スキル読み込み"]
        FindSkillMd["SKILL.md検索"]
        ParseFrontmatter["フロントマター解析"]
        LoadContent["コンテンツ読み込み"]
    end

    subgraph Inheritance["継承処理"]
        ParentSkills["親スキル<br/>チーム共通"]
        ChildSkills["子スキル<br/>メンバー固有"]
        MergeStrategy["マージ戦略<br/>replace/merge"]
    end

    subgraph Resolved["解決済みスキル"]
        SkillDef["SkillDefinition"]
        Content["Markdownコンテンツ"]
        Metadata["メタデータ"]
    end

    SkillRequest --> ResolutionPaths
    ResolutionPaths --> FindSkillMd
    FindSkillMd --> ParseFrontmatter
    ParseFrontmatter --> LoadContent
    LoadContent --> Inheritance
    Inheritance --> Resolved
```

## 5. システム連携図

### 5.1 完全なタスク実行フロー

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Mediator as Intent Mediator
    participant Planner as Task Planner
    participant DagExec as DAG Executor
    participant ToolComp as Tool Compiler
    participant Subagent as Subagent
    participant Search as Search Tools
    participant Index as Index System

    User->>Mediator: 「このバグを修正して」
    Mediator->>Mediator: 意図解釈・情報欠損検出
    Mediator->>User: どのファイルで発生？
    User->>Mediator: auth.tsでエラー
    
    Mediator->>Planner: 明確化されたタスク
    Planner->>Planner: DAG分解
    
    par 並列タスク生成
        Planner->>DagExec: タスク1: 原因調査
        Planner->>DagExec: タスク2: 影響範囲特定
    end
    
    DagExec->>Subagent: サブエージェント起動
    Subagent->>ToolComp: 複数ツール必要
    
    ToolComp->>ToolComp: compile_tools()
    ToolComp->>Search: locagent_query(keywords)
    Search->>Index: グラフ読み込み
    Index-->>Search: 候補ノード
    Search-->>ToolComp: 関連コード位置
    
    ToolComp->>Search: repograph_query(symbol)
    Search->>Index: 行レベル検索
    Index-->>Search: 正確な定義位置
    Search-->>ToolComp: file:line情報
    
    ToolComp->>ToolComp: execute_compiled()
    ToolComp-->>Subagent: 統合結果
    
    Subagent->>Subagent: バグ原因分析
    Subagent-->>DagExec: 調査結果
    
    DagExec->>Subagent: タスク3: 修正実装
    Subagent->>Subagent: コード編集
    Subagent-->>DagExec: 実装完了
    
    DagExec-->>Planner: 全タスク完了
    Planner-->>User: 結果報告
```

## 6. パフォーマンス特性

### 6.1 各インデックスの性能比較

| インデックス | 構築時間 | サイズ | クエリ速度 | 精度 | 用途 |
|------------|---------|--------|-----------|------|------|
| file_candidates | 即時 | 小 | 速い | 高 | ファイル列挙 |
| sym_index | 数秒 | 中 | 速い | 高 | シンボル検索 |
| call_graph_index | 数十秒 | 大 | 普通 | 中 | 呼び出し関係 |
| repograph_index | 数分 | 大 | 普通 | 非常高 | 正確な位置特定 |
| locagent_index | 数秒 | 中 | 速い | 高 | Issue解決 |
| semantic_index | 数分 | 大 | 普通 | 中〜高 | 意味検索 |

### 6.2 DAG実行のスケーラビリティ

```mermaid
xychart-beta
    title "DAG実行時間 vs タスク数"
    x-axis [1, 5, 10, 20, 50]
    y-axis "実行時間(秒)" 0 --> 300
    bar "Sequential" [30, 150, 300, 600, 1500]
    bar "DAG(max=3)" [30, 60, 90, 150, 300]
    bar "DAG(max=5)" [30, 45, 60, 90, 180]
```
