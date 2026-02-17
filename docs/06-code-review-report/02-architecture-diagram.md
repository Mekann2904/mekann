---
title: システムアーキテクチャ図
category: reference
audience: developer
last_updated: 2026-02-17
tags: [architecture, mermaid, diagram, dependencies]
related: [./README.md, ../subagents-agent-teams-sequence-diagrams.md]
---

# システムアーキテクチャ図

> パンくず: [Home](../README.md) > [Code Review Report](./README.md) > Architecture Diagram

## 概要

本ドキュメントは、pi-plugin/mekannプロジェクトのシステムアーキテクチャをMermaid図で可視化します。

---

## 1. 拡張機能依存関係図

### 全体構成

```mermaid
graph TB
    subgraph Core["Core Layer"]
        AC[agent-common.ts]
        ER[execution-rules.ts]
        AE[agent-errors.ts]
        OS[output-schema.ts]
    end

    subgraph Extensions["Extension Layer"]
        SUB[subagents.ts]
        AT[agent-teams.ts]
        LOOP[loop.ts]
        PLAN[plan.ts]
        RSA[rsa.ts]
        DT[dynamic-tools.ts]
        QUEST[question.ts]
    end

    subgraph Runtime["Runtime Layer"]
        AR[agent-runtime.ts]
        CIC[cross-instance-coordinator.ts]
        ARC[adaptive-rate-controller.ts]
    end

    subgraph Search["Search Layer"]
        FC[file_candidates]
        CS[code_search]
        SI[sym_index]
        SF[sym_find]
    end

    subgraph Lib["Library Layer"]
        RWB[retry-with-backoff.ts]
        CON[concurrency.ts]
        LOG[comprehensive-logger.ts]
        MEM[semantic-memory.ts]
    end

    %% Core dependencies
    SUB --> AC
    SUB --> ER
    SUB --> AE
    SUB --> OS
    SUB --> AR

    AT --> AC
    AT --> ER
    AT --> AE
    AT --> OS
    AT --> AR

    LOOP --> PLAN
    LOOP --> SUB

    DT --> AC
    DT --> ER

    RSA --> AC
    RSA --> ER

    %% Runtime dependencies
    AR --> CIC
    AR --> ARC
    CIC --> AC

    %% Search dependencies
    FC --> LOG
    CS --> LOG
    SI --> LOG
    SF --> LOG

    %% Library dependencies
    AC --> RWB
    AC --> CON
    AR --> LOG
    SUB --> MEM

    classDef core fill:#e1f5fe,stroke:#01579b
    classDef ext fill:#f3e5f5,stroke:#4a148c
    classDef runtime fill:#fff3e0,stroke:#e65100
    classDef search fill:#e8f5e9,stroke:#1b5e20
    classDef lib fill:#fce4ec,stroke:#880e4f

    class AC,ER,AE,OS core
    class SUB,AT,LOOP,PLAN,RSA,DT,QUEST ext
    class AR,CIC,ARC runtime
    class FC,CS,SI,SF search
    class RWB,CON,LOG,MEM lib
```

### 依存関係の方向性

- **上から下へ**: 高レベル抽象から低レベル実装へ
- **Extension → Core → Library**: 適切な依存方向
- **双方向依存なし**: 循環依存は存在しない

---

## 2. データフロー図

### 委任オーケストレーションデータフロー

```mermaid
flowchart LR
    subgraph Input["入力"]
        REQ[ユーザーリクエスト]
        CTX[コンテキスト]
        SKL[スキル定義]
    end

    subgraph Processing["処理"]
        LA[Lead Agent]
        DC[Delegation Checker]
        RM[Runtime Manager]
    end

    subgraph Execution["実行"]
        SA[Subagent Pool]
        TM[Team Members]
    end

    subgraph Output["出力"]
        RES[統合結果]
        DOC[ドキュメント]
        LOG[ログ]
    end

    REQ --> LA
    CTX --> LA
    SKL --> LA

    LA --> DC
    DC -->|委任要求| RM
    RM -->|キャパシティ予約| SA
    RM -->|キャパシティ予約| TM

    SA -->|SUMMARY/RESULT| LA
    TM -->|DISCUSSION/RESULT| LA

    LA --> RES
    LA --> DOC
    LA --> LOG

    classDef input fill:#bbdefb,stroke:#1565c0
    classDef proc fill:#e1bee7,stroke:#7b1fa2
    classDef exec fill:#ffcc80,stroke:#ef6c00
    classDef output fill:#c8e6c9,stroke:#2e7d32

    class REQ,CTX,SKL input
    class LA,DC,RM proc
    class SA,TM exec
    class RES,DOC,LOG output
```

### キャパシティ管理データフロー

```mermaid
flowchart TD
    subgraph Request["リクエスト"]
        RR[実行リクエスト]
    end

    subgraph Check["チェック"]
        CC{キャパシティ確認}
        AP[Adaptive Penalty]
    end

    subgraph Actions["アクション"]
        RESERVE[キャパシティ予約]
        WAIT[待機]
        REJECT[拒否]
    end

    subgraph Result["結果"]
        EXEC[実行開始]
        QUEUE[キューイング]
    end

    RR --> CC
    CC -->|空きあり| AP
    CC -->|空きなし| WAIT
    AP -->|penalty=0| RESERVE
    AP -->|penalty>0| RESERVE

    RESERVE --> EXEC
    WAIT --> QUEUE
    QUEUE --> CC

    CC -->|上限超過| REJECT

    classDef req fill:#e3f2fd,stroke:#1565c0
    classDef check fill:#fff8e1,stroke:#f57f17
    classDef action fill:#e8f5e9,stroke:#2e7d32
    classDef result fill:#fce4ec,stroke:#c2185b

    class RR req
    class CC,AP check
    class RESERVE,WAIT,REJECT action
    class EXEC,QUEUE result
```

---

## 3. コンポーネント関係図

### レイヤー構成

```mermaid
graph TB
    subgraph User["ユーザー層"]
        CLI[CLI/TUI]
    end

    subgraph Agent["エージェント層"]
        LEAD[Lead Agent]
        SUBS[Subagents]
        TEAM[Agent Teams]
    end

    subgraph Extension["拡張機能層"]
        TOOLS[Tools]
        SKILLS[Skills]
        PLANS[Plans]
    end

    subgraph Core["コア層"]
        RUNTIME[Runtime]
        STORAGE[Storage]
        MEMORY[Memory]
    end

    subgraph Infra["インフラ層"]
        FS[File System]
        LLM[LLM API]
        EMBED[Embeddings]
    end

    CLI --> LEAD
    LEAD --> SUBS
    LEAD --> TEAM

    SUBS --> TOOLS
    TEAM --> TOOLS
    TOOLS --> SKILLS
    TOOLS --> PLANS

    TOOLS --> RUNTIME
    TOOLS --> STORAGE
    TOOLS --> MEMORY

    RUNTIME --> LLM
    STORAGE --> FS
    MEMORY --> EMBED

    classDef user fill:#e1f5fe,stroke:#0277bd
    classDef agent fill:#f3e5f5,stroke:#7b1fa2
    classDef ext fill:#fff3e0,stroke:#ef6c00
    classDef core fill:#e8f5e9,stroke:#2e7d32
    classDef infra fill:#fce4ec,stroke:#c2185b

    class CLI user
    class LEAD,SUBS,TEAM agent
    class TOOLS,SKILLS,PLANS ext
    class RUNTIME,STORAGE,MEMORY core
    class FS,LLM,EMBED infra
```

### エージェントチーム構成

```mermaid
graph LR
    subgraph Team["Agent Team"]
        LT[Lead]
        RS[Researcher]
        AR[Architect]
        IM[Implementer]
        RV[Reviewer]
        TG[Tester]
        JG[Judge]
    end

    LT -->|委任| RS
    LT -->|委任| AR
    LT -->|委任| IM

    RS -->|出力| RV
    AR -->|出力| RV
    IM -->|出力| RV

    RV -->|評価| TG
    TG -->|結果| JG
    JG -->|判定| LT

    classDef lead fill:#ffd54f,stroke:#f57f17
    classDef worker fill:#90caf9,stroke:#1565c0
    classDef judge fill:#ef5350,stroke:#c62828

    class LT lead
    class RS,AR,IM,RV,TG worker
    class JG judge
```

---

## 4. 実行フロー図

### コードレビュー実行フロー

```mermaid
flowchart TD
    subgraph Start["開始"]
        A[ファイル選択]
    end

    subgraph Analysis["分析"]
        B[ファイル読み込み]
        C[構造解析]
        D[依存関係抽出]
    end

    subgraph Scoring["スコアリング"]
        E[設計評価]
        F[機能性評価]
        G[複雑性評価]
        H[テスト評価]
        I[総合スコア計算]
    end

    subgraph Output["出力"]
        J[改善点抽出]
        K[ドキュメント更新]
        L[レポート生成]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
    E --> I
    F --> I
    G --> I
    H --> I
    I --> J
    J --> K
    K --> L

    classDef start fill:#c8e6c9,stroke:#2e7d32
    classDef analysis fill:#bbdefb,stroke:#1565c0
    classDef scoring fill:#fff9c4,stroke:#f57f17
    classDef output fill:#f8bbd0,stroke:#c2185b

    class A start
    class B,C,D analysis
    class E,F,G,H,I scoring
    class J,K,L output
```

### ドキュメント作成フロー

```mermaid
flowchart LR
    subgraph Template["テンプレート"]
        A[_template.md読み込み]
        B[frontmatter確認]
    end

    subgraph Content["コンテンツ"]
        C[タイトル設定]
        D[本文作成]
        E[関連リンク追加]
    end

    subgraph Validation["検証"]
        F[フォーマット確認]
        G[リンク確認]
        H[INDEX更新]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H

    classDef temp fill:#e1bee7,stroke:#7b1fa2
    classDef cont fill:#c8e6c9,stroke:#2e7d32
    classDef val fill:#ffcc80,stroke:#ef6c00

    class A,B temp
    class C,D,E cont
    class F,G,H val
```

---

## 5. エラーハンドリングフロー

```mermaid
flowchart TD
    subgraph Error["エラー検出"]
        E1[実行エラー]
        E2[スキーマ違反]
        E3[タイムアウト]
        E4[キャンセル]
    end

    subgraph Classify["分類"]
        C1{再試行可能?}
        C2[エラー分類]
    end

    subgraph Action["アクション"]
        A1[バックオフ再試行]
        A2[コンテキスト追加]
        A3[ログ記録]
        A4[ユーザー通知]
    end

    subgraph Result["結果"]
        R1[成功]
        R2[失敗]
    end

    E1 --> C1
    E2 --> C1
    E3 --> C1
    E4 --> C1

    C1 -->|Yes| C2
    C1 -->|No| A4

    C2 -->|runtime_limit| A1
    C2 -->|schema_violation| A2
    C2 -->|timeout| A1

    A1 --> A3
    A2 --> A3
    A3 --> R1
    A3 --> R2

    A4 --> R2

    classDef error fill:#ffcdd2,stroke:#c62828
    classDef classify fill:#fff9c4,stroke:#f57f17
    classDef action fill:#c8e6c9,stroke:#2e7d32
    classDef result fill:#b3e5fc,stroke:#0277bd

    class E1,E2,E3,E4 error
    class C1,C2 classify
    class A1,A2,A3,A4 action
    class R1,R2 result
```

---

## 6. モジュール境界図

```mermaid
graph TB
    subgraph Extension["拡張機能モジュール"]
        E1[subagents]
        E2[agent-teams]
        E3[loop]
        E4[plan]
        E5[dynamic-tools]
        E6[search]
    end

    subgraph CoreLib["コアライブラリ"]
        L1[agent-common]
        L2[execution-rules]
        L3[agent-errors]
        L4[output-schema]
        L5[retry-with-backoff]
    end

    subgraph Runtime["ランタイム"]
        R1[agent-runtime]
        R2[cross-instance-coordinator]
        R3[adaptive-rate-controller]
    end

    subgraph Storage["ストレージ"]
        S1[semantic-memory]
        S2[run-index]
        S3[storage-lock]
    end

    E1 --> L1
    E1 --> L2
    E1 --> R1

    E2 --> L1
    E2 --> L2
    E2 --> R1

    E3 --> E1
    E3 --> E4

    E5 --> L1

    L1 --> L5
    R1 --> R2
    R1 --> R3

    E1 --> S1
    E4 --> S2

    classDef ext fill:#e1bee7,stroke:#7b1fa2
    classDef lib fill:#bbdefb,stroke:#1565c0
    classDef runtime fill:#ffcc80,stroke:#ef6c00
    classDef storage fill:#c8e6c9,stroke:#2e7d32

    class E1,E2,E3,E4,E5,E6 ext
    class L1,L2,L3,L4,L5 lib
    class R1,R2,R3 runtime
    class S1,S2,S3 storage
```

---

## 関連ドキュメント

- [レビューサマリー](./01-summary.md)
- [判断基準フロー](./03-decision-flow.md)
- [改善推奨事項](./04-recommendations.md)
- [Subagents & Agent Teams Sequence Diagrams](../subagents-agent-teams-sequence-diagrams.md)

[ → 判断基準フローを見る](./03-decision-flow.md)
