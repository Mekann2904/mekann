# issue_workflow tool scoped to the Issue Work Pi session

ADR-0019 で導入した `issue_workflow` ツールは、`issue-workflow` feature が有効なら **全ての Pi session** に登録されていた。そのため `/issue` を起動する Main Pi の system prompt にもツールが並び、Phase 3（commit / push / PR）を Main Pi 側で行うわけでもないのにノイズになっていた。本来このツールは `/issue` が起動した Issue Work Pi（worktree 内で Phase 3 を自走する session）だけで意味を持つ。

ツール表示を Issue Work Pi に限定する。

## Status

Accepted

## Context

`issue_workflow` は GitHub issue 対応の Phase 3 専用である。Phase 3 は `/issue` が開いた worktree 内の Issue Work Pi だけで実行される（ADR-0017 / 0018 / 0019 のフェーズ構成）。しかし従来は feature 有無だけで登録を決めていたため、Main Pi を含む全 session のツール一覧に常時露出していた。Main Pi は Phase 3 を行わず、 mutating action は `actions.ts` で worktree（branch `issue-<n>`）内に既にガートされているため、Main Pi への露出は純増分のノイズでしかなかった。

Issue Work Pi を一意に特定する信号が必要だった。worktree の branch 名（`issue-<n>`）は Main Pi でも取り得るため信頼性が足りず、起動時に git を呼ぶと startup がブロックされる。一方、`/issue` から Issue Work Pi を起動する経路は `launchPiSessionInKittySplit`（`mekann/utils/terminal/pi-session.ts`）に一本化されており、直接起動・bulk launch・orchestration の全経路がここを通る。ここが最も信頼できる「この Pi は /issue 由来である」の注入点である。

## Decisions

- **起動時に env marker を注入する**: `launchPiSessionInKittySplit` は Issue Work Pi 起動専用の関数であるため、毎回 `kitten @ launch --env MEKANN_ISSUE_PI=1` を付与する。marker 名は `ISSUE_PI_ENV = "MEKANN_ISSUE_PI"` として同ファイルから export し、読み手と共有して名前の drift を構造的に防ぐ。
- **ツール登録を marker でガートする**: `issue_workflow` を登録する `issueWorkflowExtension` は `process.env[ISSUE_PI_ENV] !== "1"` のとき early return し、登録しない。Main Pi や他の session にはツールが現れない。
- **既存の安全ゲートは維持する**: この変更は「ツールの表示範囲」だけを絞る。mutating action の worktree ガート（`actions.ts`）や git-safety の bash 承認ゲートはそのまま残す。marker はあくまで表示スコープ用で、認可ではない。
- **orchestration marker との併存**: orchestration 用の `MEKANN_ORCHESTRATION_PARENT` / `MEKANN_ORCHESTRATION_CHILD` は個別の目的（session_shutdown での chain 継続）のまま残し、`MEKANN_ISSUE_PI` は全起動経路に共通して付与する。orchestration 子も Issue Work Pi であるため、両方の marker が立つ。

## Considered Options

- **branch 名 `issue-<n>` で判定する**: Main Pi でも同 branch を取り得るうえ、登録時に git を呼ぶと startup がブロックされるため却下。起動由来（= `/issue` 実行）という要求に合わない。
- **`isFeatureEnabled` だけで残す（現状維持）**: Main Pi へのノイズが解消しないため却下。
- **launcher 側で marker をオプショナルにする**: `launchPiSessionInKittySplit` は現在 issue 起動専用に一本化されており、全起動で marker を付与する方が単純で安全。将来的に汎用 launcher 化する場合は marker 付与を見直す前提とする。

## Consequences

- Main Pi および `/issue` 由来でない全ての Pi session から `issue_workflow` が消え、system prompt / ツール一覧のノイズが減る。
- Issue Work Pi（直接起動・bulk・orchestration 子の全て）では従来通り `issue_workflow` が使える。Phase 3 のプロンプト（`prompts.ts`）は Issue Work Pi 向けのまま変わらない。
- `MEKANN_ISSUE_PI=1` を自前で export した Pi session ではツールが現れる（テストや手動検証で利用可能）。これは env marker が「表示スコープ」の役割であることと整合する。
- 安全性は低下しない。mutating action の worktree ガート・git-safety の bash ゲートは変更せず、marker は認可ではなく表示制御に過ぎない。
