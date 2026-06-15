# Issue-only tools (issue_workflow / review_fixer) scoped to the Issue Work Pi session

ADR-0019 で導入した `issue_workflow` と ADR-0018 の `review_fixer` は、それぞれの feature が有効なら **全ての Pi session** に登録されていた。そのため `/issue` を起動する Main Pi の system prompt にもこれらのツール（と review_fixer の GATE policy fragment）が並び、Main Pi 側では決して実行しない処理のノイズになっていた。本来これらは `/issue` が起動した Issue Work Pi（worktree 内で Phase 2/3 を自走する session）だけで意味を持つ。

両ツールの表示を Issue Work Pi に限定する。

## Status

Accepted

## Context

`issue_workflow` は GitHub issue 対応の Phase 3 専用、`review_fixer` は Phase 2 の品質ゲート専用である。どちらも `/issue` が開いた worktree 内の Issue Work Pi だけで実行される（ADR-0017 / 0018 / 0019 のフェーズ構成）。しかし従来は feature 有無だけで登録を決めていたため、Main Pi を含む全 session のツール一覧に常時露出していた。Main Pi は Phase 2/3 を行わず、`issue_workflow` の mutating action は `actions.ts` で worktree（branch `issue-<n>`）内に、`review_fixer` は issue context 解決で worktree 内に既にガートされているため、Main Pi への露出は純増分のノイズでしかなかった。とくに `review_fixer` は `scope: "global"` の GATE policy fragment を伴うため、Main Pi の system prompt を直接肥大化させていた。

Issue Work Pi を一意に特定する信号が必要だった。worktree の branch 名（`issue-<n>`）は Main Pi でも取り得るため信頼性が足りず、起動時に git を呼ぶと startup がブロックされる。一方、`/issue` から Issue Work Pi を起動する経路は `launchPiSessionInKittySplit`（`mekann/utils/terminal/pi-session.ts`）に一本化されており、直接起動・bulk launch・orchestration の全経路がここを通る。ここが最も信頼できる「この Pi は /issue 由来である」の注入点である。

## Decisions

- **起動時に env marker を注入する**: `launchPiSessionInKittySplit` は Issue Work Pi 起動専用の関数であるため、毎回 `kitten @ launch --env MEKANN_ISSUE_PI=1` を付与する。marker 名は `ISSUE_PI_ENV = "MEKANN_ISSUE_PI"` として同ファイルから export し、読み手と共有して名前の drift を構造的に防ぐ。
- **ツール登録を marker でガートする**: `issue_workflow` を登録する `issueWorkflowExtension` と `review_fixer` を登録する `reviewFixerExtension` は、ともに `process.env[ISSUE_PI_ENV] !== "1"` のとき early return し、登録しない。`review_fixer` の場合はツールだけでなく `registerReviewFixerPromptProvider()`（GATE policy fragment）の登録もスキップされるため、Main Pi の system prompt から fragment が消える。Main Pi や他の session にはどちらのツールも現れない。
- **review_fixer の child 再帰ガートを維持する**: `review_fixer` は review 実行のために子 Pi を起動する（`--copy-env` 付き）。子 Pi は親の env を継承するため `MEKANN_ISSUE_PI=1` も受け継ぎ、marker だけでは子での再登録を防げない。そこで `PI_SUBAGENT_ROLE === "child"` ガートを ISSUE_PI ガートの**前**に置き続け、marker 継承にかかわらず子 Pi では review_fixer を登録しない（root → child → grandchild の無限再帰を防止、ADR-0018 / issue #62 の方針を維持）。
- **issue_workflow にも対称な child ガートを設ける**: subagent / review-fixer の子 Pi はすべて `--copy-env` で `MEKANN_ISSUE_PI=1` を継承するが、git/PR 操作は親 Issue Work Pi の Phase 3 の仕事であり、子で commit / push / create_pr すべきでない。プロンプトで禁止するのは soft constraint であるため、`issue_workflow` にも `review_fixer` と同じ `PI_SUBAGENT_ROLE === "child"` ガートを ISSUE_PI ガートの前に置き、子では構造的にツールを登録しない（defense in depth）。これで 2 つの issue 専用ツールは完全に対称に「子 Pi では登録しない」挙動となる。
- **既存の安全ゲートは維持する**: この変更は「ツールの表示範囲」だけを絞る。mutating action の worktree ガート（`actions.ts`）や git-safety の bash 承認ゲートはそのまま残す。marker はあくまで表示スコープ用で、認可ではない。
- **orchestration marker との併存**: orchestration 用の `MEKANN_ORCHESTRATION_PARENT` / `MEKANN_ORCHESTRATION_CHILD` は個別の目的（session_shutdown での chain 継続）のまま残し、`MEKANN_ISSUE_PI` は全起動経路に共通して付与する。orchestration 子も Issue Work Pi であるため、両方の marker が立つ。

## Considered Options

- **branch 名 `issue-<n>` で判定する**: Main Pi でも同 branch を取り得るうえ、登録時に git を呼ぶと startup がブロックされるため却下。起動由来（= `/issue` 実行）という要求に合わない。
- **`isFeatureEnabled` だけで残す（現状維持）**: Main Pi へのノイズが解消しないため却下。
- **launcher 側で marker をオプショナルにする**: `launchPiSessionInKittySplit` は現在 issue 起動専用に一本化されており、全起動で marker を付与する方が単純で安全。将来的に汎用 launcher 化する場合は marker 付与を見直す前提とする。

## Consequences

- Main Pi および `/issue` 由来でない全ての Pi session から `issue_workflow` と `review_fixer`（および review_fixer の GATE policy fragment）が消え、system prompt / ツール一覧のノイズが減る。
- Issue Work Pi（直接起動・bulk・orchestration 子の全て）では従来通り両ツールが使える。Phase 2/3 のプロンプト（`prompts.ts`・`promptProvider.ts`）は Issue Work Pi 向けのまま変わらない。
- `review_fixer` の子 Pi は親から `MEKANN_ISSUE_PI=1` を継承するが、`PI_SUBAGENT_ROLE=child` ガートが先に効くため review_fixer も issue_workflow も登録されず、再帰しないし子での git/PR 操作も構造的に起こらない。
- `MEKANN_ISSUE_PI=1` を自前で export した Pi session ではツールが現れる（テストや手動検証で利用可能）。これは env marker が「表示スコープ」の役割であることと整合する。
- 安全性は低下しない。`issue_workflow` の mutating action の worktree ガート・git-safety の bash ゲート・`review_fixer` の issue context 解決はいずれも変更せず、marker は認可ではなく表示制御に過ぎない。
