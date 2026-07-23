# Issue Candidates (バグ・改善候補の蓄積)

> このファイルは issue を作成せず、探索で見つけたバグ・改善候補を蓄積するためのもの。
> ユーザが止めるまで延々と探索し、追記していく。
>
> 記録フォーマット:
> - **ID** / **カテゴリ** / **重要度(推定)** / **対象ファイル:行** / **概要** / **根拠** / **提案**
>
> 重要度目安: 🔴高(バグ・データ損失・セキュリティ) / 🟠中(保守性・堅牢性) / 🟡低(整理・軽微)

---

## まとめ (探索サマリー)

- 探索日: 2026-06-17 開始
- 対象リポジトリ: `Mekann2904/mekann` (pi extension suite, TS monorepo + workspaces)
- コード規模: 非テスト `.ts` 約 44,430 行 / 550 ファイル
- 主な観点: 型安全性・エラー処理・同期 IO・重複コード・巨大ファイル・セキュリティ・テストカバレッジ・CI

### → GitHub issue 化 (2026-06-17)

155 個の候補を 17 個のテーマ別 issue に整理して作成。各 issue は `bug`/`enhancement` + `needs-triage` ラベル付き。以下、issue → 対応 IC 番号の対応表。

| Issue | タイトル(略) | 対応 IC |
| --- | --- | --- |
| [#137](https://github.com/Mekann2904/mekann/issues/137) | sandbox: SBPL インジェクション + rm -rf/curl\|sh バイパス + realpath symlink 脱出 | IC-100, IC-101, IC-103, IC-104, IC-115, IC-116, IC-117 |
| [#139](https://github.com/Mekann2904/mekann/issues/139) | data-integrity: JSONL 追記の非アトミック・並列混線 | IC-017, IC-036, IC-140 |
| [#140](https://github.com/Mekann2904/mekann/issues/140) | command-normalization: grep 正規表現 + SHELL_OPERATORS + quote() | IC-061, IC-062, IC-065, IC-066 |
| [#141](https://github.com/Mekann2904/mekann/issues/141) | type-safety: 非テスト 117 件の as any を削減 | IC-002, IC-027, IC-028, IC-046, IC-047, IC-050, IC-084, IC-086, IC-124, IC-132, IC-144, IC-146 |
| [#142](https://github.com/Mekann2904/mekann/issues/142) | perf: 同期 IO / 同期 git をホットパスから排除 | IC-006, IC-087, IC-091 |
| [#143](https://github.com/Mekann2904/mekann/issues/143) | bug: truncate-utils / output-accumulator / estimateTokens の CJK 破綻 | IC-053, IC-121, IC-122, IC-127, IC-133, IC-135 |
| [#144](https://github.com/Mekann2904/mekann/issues/144) | data-integrity: プロセスローカルカウンタ ID を暗号学的乱数へ | IC-015, IC-044, IC-145, IC-157 |
| [#145](https://github.com/Mekann2904/mekann/issues/145) | refactor: runner.ts / report.ts の責務分割 | IC-001 |
| [#146](https://github.com/Mekann2904/mekann/issues/146) | observability: best-effort catch の握り潰しを構造化ログへ | IC-007, IC-016, IC-026, IC-037, IC-041, IC-056, IC-072, IC-092, IC-136, IC-143 |
| [#147](https://github.com/Mekann2904/mekann/issues/147) | i18n: 日本語クエリ正規表現の脆さ | IC-060, IC-094, IC-095, IC-119, IC-128, IC-129 |
| [#148](https://github.com/Mekann2904/mekann/issues/148) | security: dashboard の esc() + innerHTML + HTTP + GraphQL | IC-024, IC-025, IC-075, IC-076, IC-077, IC-078, IC-079 |
| [#149](https://github.com/Mekann2904/mekann/issues/149) | security: kittyControl + terminal-shortcuts の sh 文字列結合を argv 化 | IC-068, IC-102, IC-105, IC-109, IC-110, IC-111, IC-112, IC-113, IC-137, IC-138, IC-141, IC-148 |
| [#150](https://github.com/Mekann2904/mekann/issues/150) | reliability: 設定保存の非アトミック + stale-lock + SharedArrayBuffer + fs.watch | IC-032, IC-033, IC-034, IC-035, IC-036 |
| [#151](https://github.com/Mekann2904/mekann/issues/151) | safety: candidate worktree rmSync + 成果物非アトミック + retention | IC-039, IC-040, IC-069, IC-070, IC-071, IC-072, IC-099 |
| [#152](https://github.com/Mekann2904/mekann/issues/152) | reliability: subagent mailbox/socket/apply/semantic 競合検出 | IC-029, IC-038, IC-041, IC-082, IC-084, IC-086, IC-090, IC-092, IC-098, IC-119, IC-123, IC-156, IC-158, IC-159, IC-160, IC-161, IC-162, IC-163 |
| [#153](https://github.com/Mekann2904/mekann/issues/153) | ci/docs: lint 無し + Node 不整合 + カバレッジ + 設定文書化 + docs ドリフト | IC-014, IC-018, IC-019, IC-020, IC-030, IC-031, IC-045, IC-049, IC-051, IC-052, IC-149, IC-150, IC-151, IC-152, IC-155 |

> 未対応 IC(軽微・副産物・取り下げ): IC-004, IC-005, IC-008〜014, IC-021〜023, IC-042, IC-043, IC-045, IC-048, IC-054〜060, IC-063, IC-064, IC-067, IC-073, IC-074, IC-080, IC-081, IC-083, IC-085, IC-087〜090, IC-093〜097, IC-103〜108, IC-114(取り下げ), IC-118(取り下げ), IC-120, IC-124〜131, IC-135, IC-137, IC-139, IC-140, IC-142, IC-145, IC-147, IC-148, IC-153, IC-154(取り下げ), IC-155 は各 issue 本文内に包含または follow-up 待ち。

### → 第2弾 GitHub issue 化 (2026-06-18)

第22〜42バッチの候補 IC-164〜IC-275(約 112 件)を 20 個のテーマ別 issue に整理して作成。各 issue は `bug`/`enhancement` + `needs-triage` ラベル付きで、第1弾(#137〜#153)の「続き(第2弾)」として本文で相互参照。重たいテーマ(型安全性 15 件・reliability 10 件・config 15 件)は 2 分割、軽量な ci/scripts と portability は統合。

| Issue | タイトル(略) | 対応 IC |
| --- | --- | --- |
| [#154](https://github.com/Mekann2904/mekann/issues/154) | type-safety 第2弾: tool handler params/ctx as any 削減 + 空 details 廃止 | IC-170, IC-179, IC-187, IC-194, IC-200, IC-209, IC-260, IC-264 |
| [#155](https://github.com/Mekann2904/mekann/issues/155) | type-safety 第2弾: pi SDK 内部 API 掘り下げ + contractV1/schema/misc 型付け | IC-168, IC-171, IC-188, IC-208, IC-222, IC-238, IC-262 |
| [#156](https://github.com/Mekann2904/mekann/issues/156) | bug: dashboard terminal の CJK/絵文字表示幅・truncate・stripAnsi・kitty 検出 | IC-231, IC-240, IC-241, IC-242 |
| [#157](https://github.com/Mekann2904/mekann/issues/157) | bug: CJK byte-safe truncate 波及(既存 safeUtf8Slice を 5 サイトへ統一) | IC-164, IC-178, IC-193, IC-195, IC-220, IC-265, IC-269, IC-270(メモ), IC-271(取り下げ) |
| [#158](https://github.com/Mekann2904/mekann/issues/158) | observability 第2弾: best-effort catch 握り潰しを構造化ログ/エラー化 | IC-182, IC-183, IC-184, IC-186, IC-217, IC-224, IC-244, IC-259 |
| [#159](https://github.com/Mekann2904/mekann/issues/159) | security 第2弾: token/secret マスク・SSRF・不完全エスケープ(redactSecrets 補強) | IC-165, IC-167, IC-214, IC-218, IC-225, IC-232, IC-243 |
| [#160](https://github.com/Mekann2904/mekann/issues/160) | reliability: 数値計算の堅牢化(Infinity/NaN/0 返却/クランプ欠落) | IC-185, IC-190, IC-198, IC-219, IC-223 |
| [#161](https://github.com/Mekann2904/mekann/issues/161) | reliability: 並行性/ID 衝突/正規表現同期/破壊的 sort/TZ ずれ | IC-172, IC-177, IC-180, IC-192, IC-213, IC-237 |
| [#162](https://github.com/Mekann2904/mekann/issues/162) | data-integrity 第2弾: 非アトミック書き込み + manifest read-modify-write 競合 | IC-181, IC-272 |
| [#163](https://github.com/Mekann2904/mekann/issues/163) | i18n/検索品質 第2弾: 英語バイアス正規表現 + 日本語ハードコード | IC-166, IC-191, IC-201, IC-206, IC-227, IC-248, IC-267 |
| [#164](https://github.com/Mekann2904/mekann/issues/164) | perf/起動 第2弾: ホットパス deep clone・同期IO・suite 直列・O(n²) | IC-169, IC-173, IC-203, IC-245, IC-255, IC-256, IC-257, IC-258 |
| [#165](https://github.com/Mekann2904/mekann/issues/165) | context-control 閾値の一元化 + dashboard 固定 UI 値 | IC-174, IC-175, IC-176, IC-196, IC-233, IC-236, IC-239 |
| [#166](https://github.com/Mekann2904/mekann/issues/166) | model/codex/goal/settings 設定値の一元化と文書化 | IC-210, IC-211, IC-228, IC-229, IC-230, IC-261, IC-263 |
| [#167](https://github.com/Mekann2904/mekann/issues/167) | resource: モジュールレベル Map/Set 無限成長 + tmpdir 衛生 | IC-204, IC-212, IC-226, IC-235 |
| [#168](https://github.com/Mekann2904/mekann/issues/168) | security: output-gate の gate 判定 + artifact path(symlink/traversal)堅牢化 | IC-273, IC-274, IC-275 |
| [#169](https://github.com/Mekann2904/mekann/issues/169) | UX: 引数パーサの共通化 + 表示フォーマット | IC-199, IC-207, IC-215 |
| [#170](https://github.com/Mekann2904/mekann/issues/170) | design: スコープ判定・monkey-patch・replay 順序・orchestration ゲート明確化 | IC-189, IC-197, IC-216, IC-246, IC-247 |
| [#171](https://github.com/Mekann2904/mekann/issues/171) | ci/scripts + portability: husky/workflow/prepush 堅牢化 + 外部コマンド依存フォールバック | IC-221, IC-234, IC-249, IC-250, IC-251, IC-252, IC-253, IC-254 |
| [#172](https://github.com/Mekann2904/mekann/issues/172) | queryEvaluation 設計: empty scores/risk 判定の意図明確化 | IC-266, IC-268 |
| [#173](https://github.com/Mekann2904/mekann/issues/173) | cacheable-context 堅牢化: 用語定義途切れ・prefix 生成の一貫性 | IC-202, IC-205 |

---

## 第22バッチ (issue 化後に探索再開)

> 2026-06-17: 17 issue 作成(#137〜#153)後に探索を再開。

### IC-164 `sandbox/truncation.ts truncateForLlm` も同じ CJK バイトカットバグ (IC-143 の第4実例)
- **カテゴリ**: バグ (計算精度) / 国際化 — IC-143 と同根
- **対象**: `mekann/safety/sandbox/truncation.ts:25`
- **概要**: `Buffer.from(out, "utf8").subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/u, "")` で、#143 の `output-accumulator` / `output-gate/search.ts` / `truncate-utils` と**同一の不完全 UTF-8 カット**。sandbox の bash 出力(日本語エラーメッセージ、CJK ログ)が maxBytes カットで文字化け/欠損。LLM に渡る表示テキストが壊れる。
- **提案**: IC-143 で計画した byte-safe 共通カットヘルパを、sandbox 側にも適用。本バッチで**4 実例目**(sandbox/output-gate-search/output-accumulator/truncate-utils)を確認、共通化の必要性が確定。

### IC-165 `sandbox/output.ts` が `redactSecrets` と `gateTextForLlm` を組み合わせ (IC-138 と対照的に sandbox は安全側)
- **カテゴリ**: 整理 / 一貫性
- **対象**: `mekann/safety/sandbox/output.ts:24-29`
- **概要**: `source: { kind: "sandboxed_bash", command: redactSecrets(input.command).text.slice(0, 2000) }` で、sandbox 経路は **`tool-output/redact.ts` の `redactSecrets` を正しく使用**(IC-138 で一本化を推奨した関数)。sandbox出力は既存の共通redaction経路を正しく利用している。


### IC-166 `sandbox executionControl.executeBash` の権限エラー正規表現が英語のみ
- **カテゴリ**: 国際化 / 堅牢性 — IC-060 群と同根
- **対象**: `mekann/safety/sandbox/executionControl.ts:50`
- **概要**: `/Operation not permitted|Permission denied|EPERM|EACCES/` で権限エラーを検出し `SANDBOX_BLOCK_HINT` を付加。これは OS/シェルの英語メッセージのみ。日本語ロケール(`LANG=ja_JP`)の macOS/Linux で「操作は許可されません」「許可がありません」等のメッセージが抜け、ユーザに `request_elevation` ヒントが表示されない。日本語プロジェクトで sandbox 拒否時の UX 低下。
- **提案**: 日本語ロケールメッセージを追加、または `error.code === "EACCES"`/`"EPERM"` の数値/コード比較(言語非依存)を併用。

---

## 第23バッチ (探索継続)

### IC-167 🔴 read-only モードの SAFE_PATTERNS が秘密情報抽出を許す (security)
- **カテゴリ**: セキュリティ (read-only mode bypass) — 🔴高
- **対象**: `mekann/safety/policy-core/modes.ts:130-138` (`SAFE_PATTERNS`)
- **概要**: `classifyCommandIntent` は `cat`/`head`/`tail`/`grep`/`env`/`printenv` 等を「read_only」と分類し許可するが、これらは**秘密情報の抽出に悪用可能**:
  - `cat ~/.ssh/id_rsa` → 秘密鍵の読み出し → read_only (ALLOWED)
  - `cat .env` / `cat .pi/mekann.json` → API トークン/秘密の読み出し → ALLOWED
  - `printenv` / `printenv GITHUB_TOKEN` / `env` → 全環境変数(トークン類)のダンプ → ALLOWED
  - `grep -r password .` → パスワード記述の検出 → ALLOWED
  - `cat /etc/passwd` → システム情報 → ALLOWED
  SHELL_META/DESTRUCTIVE チェックは `
$(
`/`;`/`|` 等は弾くが、単体コマンドには効かない。`git-safety`(IC-013 関連)は git/gh コマンドのみ対象で `cat`/`env` は素通り。
- **境界の前提**: コメントは「UX guard, NOT a security boundary。security は sandbox の OS-level policy」と明記。**しかし read_only sandbox モードは書き込みのみ拒否し読み込みは許可する**(`~/.ssh` 配下の読み出しも、環境変数の取得も阻止しない)。つまり read-only モードでは、LLM エージェントがこれら「read-only」コマンドで**秘密を会話に持ち込み**、ユーザの意図しない外部送信(次の turn の web 検索、HTTP ツール等)に使える。
- **検証**: `node` で `classify('cat ~/.ssh/id_rsa')` 等が全て `read_only (ALLOWED)` になることを確認。
- **提案**:
  1. `~/.ssh`/`.env`/`.aws`/`.gnupg` 等の秘密ファイルパスを read-only でも追加確認または拒否(PROTECTED_DIRS(IC-118 副産物)を secret files へ拡張)。
  2. `env`/`printenv` を SAFE_PATTERNS から除外、または「全文ダンプ禁止」(特定変数のみ許可)。
  3. sandbox read_only モードで HOME 配下の秘密ディレクトリ読み込みを deny する SBPL ルール追加。
  4. ADR-0014 で「read-only モードの脅威モデル(秘密抽出)」を明文化。
- **備考**: IC-100(rm -rf バイパス)/IC-138(filterSecrets)と並ぶ sandbox/security 周りの重要候補。#137 または新規 issue で扱うべきか要判断。

> **2026-06-17 重要度下方修正**: `mekann/safety/sandbox/macSeatbelt.ts:54`(`HOME: isolatedHome`)と `buildSandboxEnv` が限定的環境変数のみ渡す設計のため、**sandbox 経路では `env`/`printenv`/`~/.ssh` ベクトルは強力に緩和される**(isolated HOME と env サブセットで実本物トークンは見えない)。ただし **workspace 内ファイル(`.env`/`.pi/mekann.json`/`.aws/` 等の repo 配下秘密)は readableRoots に含まれ読み取り可能**なので、この経路の残存リスクは残る。深刻度は 🔴高 → 🟠中 に下方修正。主提案は「workspace 内秘密ファイルの read-only モードでの読み取り制限」に絞り込む。

### IC-169 `settings store.ts snapshotLoaded` が都度ディープクローン (ホットパス性能)
- **カテゴリ**: パフォーマンス
- **対象**: `mekann/settings/store.ts:54-56, 97-100`
- **概要**: `loadSettings` がキャッシュヒット時も `snapshotLoaded(cached)` で `cloneSettings`(再帰的 JSON クローン)を実施し、**毎回独立コピー**を返す。キャッシュの毒防止意図だが、sandbox bash 実行/hot paths で `loadSettings` が頻回呼ばれ、巨大 settings(many features × many keys)ではクローンコストが無視できない。`getBashMode`/`getBashAllowlist`/`featureRawConfig` 等が毎回 clone する。
- **提案**: 読み取り専用アクセサ(`getSettingsReadonly`)は clone せず直接返し、変更を許す経路のみ clone。または structural-sharing(変更時のみ新コピー)。

---

## 第24バッチ (探索継続)

### IC-174 `context-control planner.ts` の圧力/子算閾値が全てハードコード (チューニング性)
- **カテゴリ**: 設計 / チューニング性
- **対象**: `mekann/context/context-control/planner.ts:55-67, 96-160`
- **概要**: 圧力判定(`85/70/45`)、圧力別子算(`4/8/12/16 KB`, `8/16/24 KB`, `8/16/32 KB`)、メッセージ要約閾値(`budget*2`/`budget`)、推定節約率(`0.75/0.5/0.6/0.2/0.15/0.25`)、キャッシュヒット率警告閾値(`warmHitRate`)等、15 箇所以上のマジックナンバーがコード埋め込み。モデルの context 窓(128k/200k 世代)、プロバイダの cache TTL、コストポリシーに応じて最適値が変わるが、設定経由で調整不可。
- **提案**: `mekann.json` の `context-control` 設定(または `MEKANN_CONTEXT_CONTROL_*` env)に閾値テーブルを切り出し。デフォルトは現状値、実験的に変更可能に。

### IC-175 `context-control report.ts` の推奨閾値が planner と重複・不一致 (IC-012 と同根)
- **カテゴリ**: 重複コード / 整理 / 一貫性
- **対象**: `mekann/context/context-control/report.ts:38-42` vs `planner.ts:96-160`
- **概要**: `report.ts` の推奨生成(largestMessage > 24KB, msg.pct > 65, toolTotal > 64KB, sys.pct > 25)が `planner.ts` の判定と**並列で別閾値**。同じ概念「メッセージ/ツール出力/システムプロンプトの大きさ」を2箇所で異なる数値で評価。例: planner は `budget.largestInlineMessageBytes`(8/16/24KB 圧力依存)、report は固定 `24 * 1024`。結果として「planner は summarize を出すが report は推奨しない」(または逆)の矛盾。
- **提案**: 共通のしきい値テーブルを抽出し、report/planner で共有。IC-174 の設定化とセット。

### IC-176 `context-control analysis.ts computeContextHealth` のスコア減点が決め打ち (IC-174 と同根)
- **カテゴリ**: 設計 / チューニング性
- **対象**: `mekann/context/context-control/analysis.ts:179-200`
- **概要**: health score(100 始点)の減点が `-45/-30/-15/-12/-10/-10/-12` の決め打ち。risk 閾値(`35/55/75`)も固定。成長率閾値(`tokensPerRequest > 5000 || payloadBytesPerRequest > 24 * 1024`)も固定。モデルの context 窓やプロジェクト特性で最適が変わりうる。IC-174 の設定化で一括調整可能に。
- **提案**: health score 減点テーブルを設定化。risk 閾値のカスタマイズ。

### IC-177 `planner.outputGateArtifactId` の正規表現が output-gate ID 形式変更で壊れる (IC-015 と連動)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/context/context-control/planner.ts:71-73` ("\\bog_[a-z0-9]+_[a-z0-9]+\\b")
- **概要**: メッセージテキストから output-gate artifact ID を抽出する正規表現。IC-015 で提案した「output-gate ID にランダムサフィックス追加(`og_<time>_<counter>_<rand>`)」を実施すると、この正規表現(`/\\bog_[a-z0-9]+_[a-z0-9]+\\b/`)が新 ID にマッチしなくなり、planner が artifact を「既に外部化済み」と検出できず重複 externalize 推奨を出す。
- **提案**: IC-015 の ID 形式変更時に `outputGateArtifactId` 正規表現を緩和(`\\bog_[a-z0-9_]+\\b`)。`store.ts:267` の manifest ID 検証正規表現(
/^og_[a-z0-9]+_[a-z0-9]+$/
)ともセットで更新。

### IC-178 `analysis.ts estimateTokens` が `Math.ceil(bytes / 4)` (IC-127/IC-133 と同根、第5実例)
- **カテゴリ**: バグ (計算精度) / 国際化
- **対象**: `mekann/context/context-control/analysis.ts:152, 163`
- **概要**: `estimatedTokens: Math.ceil(bytes / 4)` と `Math.round(tokens / (percent / 100))`。IC-127/IC-133(prompt-core estimateTokens/hashFragment tokenEstimate)と同じ CJK 過小評価。dashboard の「Top contributors」表(analysis.ts 出力)が日本語プロジェクトで実態より 4-8 倍小さく表示され、ユーザが誤ったサイズ認識を持つ。IC-143 の CJK byte-safe 共通化にこの経路も統合すべき。
- **提案**: IC-127/IC-143 の改善を analysis.ts に波及。

---

## 第26バッチ (探索継続)

### IC-186 `subagentSurfaceSync.hasPendingResults` が `catch { return false }` (IC-146 同根、第N実例)
- **カテゴリ**: デバッグ性 / 堅牢性
- **対象**: `mekann/autonomy/subagent/subagentSurfaceSync.ts:43-49`
- **概要**: `try { return resultStore.list({ status: "pending" }).length > 0; } catch { return false; }` で、resultStore の読み取り失敗(IC-007 の握り潰し/破損)を「pending 無し」と同視。ユーザには結果ストアが壊れていても「agent_results」ツールが非表示のままになり、気付けない。
- **提案**: IC-146 の構造化ログに統合。surface 制御の判断材料として「不明」状態を区別。

### IC-188 `resultStoreAdapter` / `subagentSurfaceSync` の分離は良好だが、pi SDK 依存の型が thin (整理)
- **カテゴリ**: 整理 / 型安全性
- **対象**: `mekann/autonomy/subagent/{resultStoreAdapter,subagentSurfaceSync}.ts`
- **概要**: 両モジュールは pi SDK 型を取り込みつつ thin に保たれている点は良好(positive note)。ただし `createSurfaceSyncSubscriber` の `resultStoreForCwd: (cwd) => SubagentResultStore` が呼び出し毎に store を解決し、`syncSubagentToolSurface` 内で `resultStore.list` を呼ぶ。subagentFinalizer が cwd 別に store をキャッシュしているが、surface sync が別経路で store を取り直すため、一貫性(IC-163 の並行性)に関わる。
- **提案**: store 解決を single source(`SubagentLifecycle.resultStore`)に統一し、surface sync もそこから取得。

### IC-189 `context-control scope.matchesScope` の `projectScoped`/`globalScoped` 判定が複雑 (テスト困難)
- **カテゴリ**: 堅牢性 / 可読性
- **対象**: `mekann/context/context-control/scope.ts:11-23`
- **概要**: `matchesScope` が `mode` strict/include-global の2軸 × `cwd`/`sessionId` の有無 × `projectScoped`(sample に cwd 一致で sessionId 無し)/`globalScoped`(include-global かつ sample が完全 unscoped)の組み合わせで分岐。意図は「スコープ無し observation を include-global で拾う」だが、分岐が多く意図が追いにくい。将来のスコープ軸追加(branchId 等)で組み合わせ爆発。
- **提案**: スコープマッチングをルールベース(設定可能な関数群)に整理、またはプロパティテストで網羅して意図を文書化。CONTEXT.md の「Context scope」用語と整合。

### IC-190 `tool-schemas.recordToolSchemaCurrent` が同名 tool の schemaBytes 差分を単純加減 (一貫性)
- **カテゴリ**: 場牢性 / 計算精度
- **対象**: `mekann/context/context-control/tool-schemas.ts:9-13`
- **概要**: `const previous = state.tools.get(name); if (previous) state.toolSchemaTotalBytes -= previous.schemaBytes; state.tools.set(name, { name, schemaBytes, registeredAt: previous?.registeredAt ?? Date.now() }); state.toolSchemaTotalBytes += schemaBytes;`。schemaBytes が同一 tool で変動する場合(動的 schema 生成、バージョン違い)を正しく加減算するが、負の schemaBytes や NaN/Infinity が渡ると `toolSchemaTotalBytes` が壊れる(IC-185 の Infinity と同根)。また `registeredAt` は初回登録時刻を保持するが、schema が変わっても更新されず「いつ schema 変更されたか」が追えない。
- **提案**: schemaBytes の検証(`Number.isFinite` & `>= 0`)、`lastUpdatedAt` 追加、schema 変更時のイベント記録。

---

## 第28バッチ (探索継続)

### IC-191 `ledger query.ts matchQuery` が単純部分一致 + `toLocaleLowerCase` のみ (検索品質)
- **カテゴリ**: 機能 / 検索品質 / 国際化
- **対象**: `mekann/context/ledger/query.ts:94-99`
- **概要**: `matchQuery(event, query)` が `query.toLocaleLowerCase()` で `title`/`summary`/`refs[].value` を `.includes(q)` するだけ。(a) 複数単語の順序入れ替え(`bug login` vs `login bug`)にマッチしない、(b) トークン化無し(空白区切り AND/OR 検索不可)、(c) 複数形/活用(`login` vs `logins`, `fix` vs `fixed`)に非寛容、(d) ダイアクリティカル正規化無し(`café` vs `cafe`)、(e) `toLocaleLowerCase` が環境依存(Turkish 環境で `I` → `ı`)、(f) 日本語の形態素分割無し。結果として、agent が context ledger を効率的に検索できず、関連イベントを見逃す。
- **提案**: トークン分割 + AND/OR 検索、正規化(NFKC/diacritics strip)、または meilisearch/ripgrep ベースの全文検索へ。CONTEXT.md の「Context event relation」「Context control plane」用語と整合する検索品質へ。

### IC-192 `ledger query.ts sortByPriorityThenNewest` が入力配列を破壊的ソート (非純粋)
- **カテゴリ**: 場牢性 / 設計
- **対象**: `mekann/context/ledger/query.ts:76-81`
- **概要**: `return events.sort((a, b) => ...)` が入力 `events` 配列を**破壊的**にソート(`Array.prototype.sort` は in-place)。`searchEvents` 内で `events = events.filter(...)` の後 `sortByPriorityThenNewest(events)` を呼ぶので、呼び出し元が同じ配列を使わなければ実害は無いが、関数名から「新しい配列を返す」期待に反する。IC-098(sortedSnapshotEvents の複数回ソート)と同じ sort 設計問題。
- **提案**: `return [...events].sort(...)` で非破壊化。プロパティテストで入力配列の不変を保証。

### IC-193 `ledger formatSearchResult` の truncate が char 数のみ (IC-073/CJK 同根)
- **カテゴリ**: 国際化 / バグ
- **対象**: `mekann/context/ledger/query.ts:71-74, 113-130`
- **概要**: `truncate(str, maxLen)` が `str.slice(0, maxLen - 1) + "…"` の char 数カット。title=160, summary=800, refs=200。日本語の title/summary は char数は小さく見えてもバイト・トークンでは大きく、LLM の context 消費で予想より重い。逆に ASCII の場合は char=byte で問題ないが、モデルによっては char ≠ token(IC-127)。結果表示の一貫性が取れない。
- **提案**: byte/token ベースの truncate(IC-143 の共通化)に統一。title/summary の上限をトークンで指定。

### IC-194 `ledger index.ts` の tool handler が `details: {} as Record<string, unknown>` で空 details を強制
- **カテゴリ**: 型安全性 / 設計
- **対象**: `mekann/context/ledger/index.ts:96, 119`
- **概要**: `return { content: [{ type: "text", text }], details: {} as Record<string, unknown> };` で、search/summarize ツールが常に空 `details` を返す。検索結果の構造化データ(event IDs, score, matched fields)を details に入れないため、呼び出し元(agent)が「どの event がヒットしたか」を機械的に取得できず、text を再パースする必要がある。IC-184(構造化エラー)と対で、**構造化成功レスポンス**も不足。
- **提案**: `details: { eventIds: [...], count, query, scope }` のような構造化 details を返す。output-gate の search も同様に統一。

---

## 第29バッチ (探索継続)

### IC-195 `output-gate preview.ts buildStructuredPreview` も同じ壊れた UTF-8 カット (IC-143 同根、第5実例)
- **カテゴリ**: バグ (計算精度) / 国際化
- **対象**: `mekann/context/output-gate/preview.ts:86`
- **概要**: `Buffer.from(preview, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/�$/u, "")` で、IC-143(IC-121/IC-122/IC-135/IC-164)と**同一の不完全 UTF-8 カット**。構造化 preview が日本語含みだと文字化け。これで本バグは **5 実例**(truncate-utils / output-accumulator / output-gate-search / sandbox-truncation / output-gate-preview)を確認。共通 byte-safe カットヘルパの必要性は確定的。
- **提案**: IC-143 の byte-safe 共通カットをこの経路にも適用。5 実例を一括解決。

### IC-196 `output-gate preview.ts lineFocusedPreview` のコンテキスト窓が非対称 (hit-2 〜 hit+3)
- **カテゴリ**: 設計 / 一貫性
- **対象**: `mekann/context/output-gate/preview.ts:62-66`
- **概要**: `for (let i = Math.max(0, hit - 2); i <= Math.min(lines.length - 1, hit + 3); i++) kept.add(i);` で、ヒット行の**前 2 行・後 3 行**を保持。非対称(前より後が多い)の意図が読めない。ユーザが「ヒット行の前文脈を見たい」場合に後ろに比べて前が少なく、コード理解に支障。search_tool_outputs の contextLines(既定 3)とは別の固定値。
- **提案**: コンテキスト窓を設定可能、または対称化(hit±N)。`contextLines` パラメータと統一。

### IC-197 `tool-registration-observer.ts` が `pi.registerTool` を monkey-patch (decorator 副作用)
- **カテゴリ**: 場牢性 / 設計
- **対象**: `mekann/context/tool-registration-observer.ts:26-35`
- **概要**: `const registerTool = pi.registerTool.bind(pi); pi.registerTool = ((tool) => { const result = registerTool(tool); recordToolRegistrationObservation(...); return result; }) as ExtensionAPI["registerTool"];` で、pi API オブジェクトのメソッドを**実行時書き換え**(monkey-patch)。`decoratedApis = new WeakSet<ExtensionAPI>()` で重複装飾を防ぐが、(a) 他拡張が `pi.registerTool` を呼ぶと全て計測される(意図的だが副作用大)、(b) pi SDK が `registerTool` を getter/プロキシで実装していると壊れる、(c) 複数拡張が同様の patch をすると競合。設計として pi に公式の registration フックが無いことの workaround。
- **提案**: pi SDK に `onToolRegistered` フックを要求。それまで patch は継続するが、ドキュメント化と副作用テストを追加。

### IC-198 `tool-registration-observer byteLen` が canonical 失敗時に 0 を返す (合計不正)
- **カテゴリ**: バグ (計算精度) / 場牢性
- **対象**: `mekann/context/tool-registration-observer.ts:7-10`
- **概要**: `function byteLen(value) { if (typeof value === "string") return Buffer.byteLength(value, "utf8"); try { return Buffer.byteLength(canonicalizeJson(value), "utf8"); } catch { return 0; } }` で、canonical 失敗時に **0** を返す。`recordToolSchemaCurrent` が `state.toolSchemaTotalBytes += schemaBytes`(0)するので、実際は大きい schema を持つ tool が「0 バイト」と集計され、`toolSchemaTotalBytes` が過小評価。IC-190 と合わさると、dashboard の「Tool schema bytes」が不正確。
- **提案**: canonical 失敗時は `JSON.stringify(value).length` 等のフォールバック、または「不明」として集計から除外。

### IC-199 `output-gate index.ts parseShowArg` が `show <id>` のみ(`show` 単独や `--id=` 非対応)
- **カテゴリ**: UX / 場牢性
- **対象**: `mekann/context/output-gate/index.ts:65-68`
- **概要**: `if (trimmed.startsWith("show ")) return trimmed.slice(5).trim();` で、`show <id`(スペース区切り)のみ対応。`show` 単独(usage 表示)や `show --id <id>`/`show=<id>`/`show '<id>'`(クォート)に非対応。引数構文が手書きで分散(IC-097 の ledger と同根)。`output-gate show og_xxx_yyy` をクォート付きで実行すると `show 'og_xxx_yyy'` が slice(5) で `'og_xxx_yyy'`(クォート残り)になる。
- **提案**: 共通のミニ引数パーサを output-gate/ledger で共有(IC-097 と統合)。クォート剥がし。

### IC-200 `output-gate index.ts` の command handler が `ctx: any` (IC-141 同根)
- **カテゴリ**: 型安全性
- **対象**: `mekann/context/output-gate/index.ts:171` (`async handler(args, ctx: any)`)
- **概要**: `/output-gate` コマンドハンドラが `ctx: any` で受ける。`ctx?.cwd`/`ctx?.ui?.notify?.` のオプショナルチェーンが連発。pi の `ExtensionCommandContext` 型を使えば型安全だが、IC-114(副産物)/IC-141 と同じ型放棄。
- **提案**: pi SDK の command context 型を取り込み、`ctx: ExtensionCommandContext` へ。

---

## 第30バッチ (探索継続)

### IC-201 `cacheable-context builder.ts summarizeAgents` の抽出正規表現が構造変化で黙空転 (IC-060 群と同根)
- **カテゴリ**: 場牢性 / 国際化
- **対象**: `mekann/context/cacheable-context/builder.ts:48-52`
- **概要**: `const lines = text.split(/\r?\n/).filter(l => /^###\s+|^[-*]\s+|^Issues and PRDs|^This repo uses|^.*See `/.test(l.trim()))`。AGENTS.md の markdown 構造(ヘッダ/リスト/特定フレーズ)に強く依存。ヘッダレベル変化、リストマーカ変更(`-` → `*`)、または日本語 AGENTS.md で「Issues and PRDs」フレーズ不在だと、抽出が黙って空になり `text.slice(0, 1200)` にフォールバック。このフォールバックも 1200 char 固定切り詰めで意味論的途切れ。CONTEXT.md 用語の「Boundary」変動で気付かず stale。
- **提案**: 抽出失敗をログ、または markdown パーサで構造抽出。日本語 AGENTS.md 対応。

### IC-202 `cacheable-context builder.ts parseContextGlossary` の `_Avoid:` 行抽出が `def.join(" ").length < 220` で打ち切り (定義途切れ)
- **カテゴリ**: バグ (内容途切れ) / 設計
- **対象**: `mekann/context/cacheable-context/builder.ts:103-118`
- **概要**: CONTEXT.md の `**Term**: definition` を抽出する際、`if (l.trim() && def.join(" ").length < 220) def.push(l.trim())` で **220 char** 超えると後続行の追記を止める。長い用語定義(日本語 CONTEXT.md では文字数制限が厳しい、IC-127 の char/token 問題と合わさる)が途中で切れ、`_Avoid:` 行に到達する前に途切れると avoid 情報も消失。maxContextTerms(既定 100)と別軸の固定値で、ユーザ調整不可。
- **提案**: 長さ判定を byte/token に切り替え、または設定可能に。定義が途切れた場合は `[...]` マーカ。

### IC-203 `cacheable-context index.ts` の `getFragments(providerCtx: any)` が非同期でビルドを待つ (遅延/キャッシュ影響)
- **カテゴリ**: パフォーマンス / 場牢性
- **対象**: `mekann/context/cacheable-context/index.ts:79-103`
- **概要**: `async getFragments(providerCtx: any) { ... await ensureBuilt(cwd); ... }` で、prompt provider の fragment 取得が**同期的でなければならない**べきタイミングで `ensureBuilt`(ファイル読み取り + 必要ならビルド)を待つ。session_start で一度ビルド済みだが、fragment 取得時に再度 `ensureBuilt` を呼ぶ。sourceHashes 変更検出のために毎回 hash 計算(`collectSourceHashes` で AGENTS.md/CONTEXT.md/ADR 全ファイル読んで sha256)。プロンプト構築がプロバイダリクエストの都度遅延し、cache-friendly-prompt の prefix 計算にジッタ。
- **提案**: `ensureBuilt` を session_start のみで実行、fragment は manifest 読み取りのみ。fs.watch で sourceHashes 変更を検知して rebuild。

### IC-204 `cacheable-context index.ts` の `lastTrackedPrefixByCwd` がモジュールレベル Map (cwd 増で無限増殖)
- **カテゴリ**: リソース管理 / 場牢性
- **対象**: `mekann/context/cacheable-context/index.ts:23` (`const lastTrackedPrefixByCwd = new Map<string, string>()`)
- **概要**: cwd ごとの「最後に追跡した prefix」をキャッシュする Map がモジュールレベル。長時間稼働で多数 cwd(autopilot の issue worktree 等)を扱うと際限なく増加。メモリリークではないが、古い cwd のエントリが残り続ける。IC-131(snapshot-registry MAX)と同じく上限なしモジュール状態。
- **提案**: LRU 上限を設ける、または session_shutdown でクリア。

### IC-205 `cacheable-context builder.ts buildCacheableContext` の prefix 生成が「残り > 200 なら切り詰め」で中途半端 (IC-040 と同根)
- **カテゴリ**: 場牢性 / 内容途切れ
- **対象**: `mekann/context/cacheable-context/builder.ts:175-185`
- **概要**: `if (f.content.length > remaining) { if (remaining > 200) { const content = trimLines(\`${f.content.slice(0, Math.max(0, remaining - 80))}\n\n[Fragment truncated]\`); kept.push({ ...f, content, hash, chars }); } break; }`。残り余裕が 200 char 未満だと「そのフラグメントは諦めて break」、200 以上なら切り詰めて採用。200 char 未満のフラグメントが無駄になり、prefix が maxPrefixChars に届かない。また slice が char 数で、日本語(CJK)の場合は IC-127/IC-193 と同じくバイト/トークン不一致。
- **提案**: 残り空間の利用方針を明文化(小フラグメント優先か、サイズ順か)。byte/token ベースのカットに(IC-143 共通化)。

### IC-206 `cacheable-context` の ADR 抽出が `Status:` 行のみで、ADR 形式差異に未対応
- **カテゴリ**: 場牢性
- **対象**: `mekann/context/cacheable-context/builder.ts:124-135` (`adrFragment`)
- **概要**: `const status = text.match(/^Status:\s*(.+)$/m)?.[1]?.trim();` で、ADR のステータスを「Status:」行から取得。プロジェクトの ADR 形式が MADR(madr-template)や他形式(「Decided:」「Accepted:」等の別見出し)だとステータス抽出が空になる。結果として ADR 一覧にステータス無しで表示され、「Accepted/Drafted」判別ができない。
- **提案**: 複数 ADR 形式(Status:/Accepted:/Decided:/State:)に対応、または ADR 種別を自動判別。

---

## 🔴 高重要度候補

### IC-001 重範な巨大ファイル (1000行超) の分割未実施
- **カテゴリ**: 保守性 / アーキテクチャ
- **対象**:
  - `mekann/core/cache-friendly-prompt/report.ts` (1056 行)
- **概要**: `runner.ts` は git 操作・checks 実行・spawn・秘密情報フィルタ・ログ切り詰めなど複数責務を1ファイルに抱え込み、`report.ts` は集計・SVG レンダリング・HTML 生成まで巨大化している。
- **根拠**: `wc -l` で上記2ファイルが 1000 行超。変更の衝突リスクとテスト分離が困難。
- **提案**: 責務ごとにモジュール分割 (例: `runner/git.ts`, `runner/checks.ts`, `runner/secrets.ts`, `report/aggregate.ts`, `report/svg.ts`, `report/html.ts`)。

### IC-002 `normalizeGoal` が全面的に `as any` で型安全性を破壊
- **カテゴリ**: 型安全性 / バグ潜伏
- **対象**: `mekann/autonomy/goal/state.ts:120-137`
- **概要**: `normalizeGoal` が全フィールドを `(goal as any).xxx` で取得しており、フィールド追加・型変更が一切検出されない。
- **根拠**:
  ```ts
  function normalizeGoal(goal: Goal | Record<string, unknown>): Goal {
    return {
      thread_id: (goal as any).thread_id,
      goal_id: (goal as any).goal_id,
      ... // 全フィールド as any
    };
  }
  ```
- **提案**: `Record<string, unknown>` を `unknown` 値として型安全に検証する zod / manual guard に置換。少なくとも `as Goal` への単一キャストに集約し、フィールドアクセスを型付きで行う。

### IC-005 `settings-editor` のログパスが `/tmp` 直書き (非ポータブル)
- **カテゴリ**: 堅牢性 / ポータビリティ
- **対象**: `mekann/utils/settings-editor/index.ts:29`
- **概要**: `const logPath = `/tmp/mekann-settings-${process.pid}.log`;` でハードコード。Windows やカスタム TMPDIR で壊れる。他モジュールは `os.tmpdir()` 使用中で不整合。
- **根拠**: 同リポジトリで `subagent/kittyControl.ts:92` や `agentControl.ts:140` は `path.join(os.tmpdir(), ...)`。
- **提案**: `os.tmpdir()` 使用に統一。

---

## 🟠 中重要度候補

### IC-006 同期ファイル IO の多用 (イベントループ阻塞リスク)
- **カテゴリ**: パフォーマンス / 堅牢性
- **対象**: 広範 (非テスト `.ts` で `readFileSync|writeFileSync|existsSync` 計 158 件)
- **代表例**:
  - `mekann/autonomy/subagent/resultStore.ts:69,74` — `load`/`list` が `readFileSync` で JSON を同期的に読み込み、`list` はディレクトリを全走査して同期パース。
  - `mekann/context/ledger/store.ts` — append/replay 経路で同期 IO。
- **提案**: リクエストパス(拡張のホットパス)上の同期 IO を `fs/promises` に移行。結果ストアの `list()` はストリーム or 非同期 + キャッシュ。

### IC-007 `subagent/resultStore.list()` がエラーを握り潰し
- **カテゴリ**: デバッグ性 / データ整合性
- **対象**: `mekann/autonomy/subagent/resultStore.ts:74`
- **概要**: `try { return [this.validateStored(...)]; } catch { return []; }` で破損 JSON・スキーマ違反・ディスクエラーを全て無言で除外。破損に気付けない。
- **提案**: エラーを構造化ログ/メトリクスに出力、破損ファイルを別途保持して修復を促す。

### IC-008 `sleep()` ヘルパーの重複定義
- **カテゴリ**: 重複コード / 整理
- **対象**:
  - `mekann/utils/pr-workflow/index.ts:135`
  - `mekann/utils/codex-web-search/runtime.ts:29`
  - `mekann/core/model-manager.ts:51`
  - `mekann/settings/store.ts:103` (`sleepSync`)
- **概要**: 実質同一の `sleep(ms)` が3箇所、同期版が1箇所で重複。
- **提案**: 共有ユーティリティ (`mekann/utils/timers` 等) に集約し、`AbortSignal` 対応版を1つ用意。

### IC-009 `goal/command.ts` の try/catch ボイラープレート重複
- **カテゴリ**: 重複コード
- **対象**: `mekann/autonomy/goal/command.ts:68,103,153,182,254` ほか
- **概要**: `try { ... } catch (e) { ctx.ui.notify("Error: ...", "error"); }` が5箇所以上ほぼ同一。
- **提案**: `withErrorNotify(ctx, fn)` のようなラッパで集約。

### IC-010 detached 子プロセスの孤立リスク (`context-tracker`)
- **カテゴリ**: リソース管理 / 堅牢性
- **対象**: `mekann/context/context-tracker/index.ts:35`
- **概要**: `spawn(command, args, { detached: true, stdio: "ignore" })` で fire-and-forget。親プロセス異常終了時にクリーンアップパスが不明確。
- **提案**: 子プロセス参照を保持し `SIGTERM`/`SIGINT` でクリーンアップ、または `detached` の必要性を再検討。

### ~~IC-006a~~ (訂正: 取り下げ)
- 調査メモ: `git ls-files` で確認したところ、`memo.md`・`*.onnx`・`*.onnx.ok` はいずれも **Git 管理外**(`.gitignore` 対象) だった。ローカルのみの存在であり、リポジトリ肥大の原因ではない。誤報として取り下げ。
- 副産物の軽微候補: ルート直下に巨大未追跡ファイル(ONNX 計約193MB, `memo.md` 42KB)が平置きされており、`ls` やエディタのファインダが重くなる。`docs/` や `assets/` の外部ストレージ参照、または `.gitignore` の明示的グルーピングで整理の余地あり(優先度 低)。

---

## 🟡 低重要度候補

### IC-011 ルート `tsconfig.json` が空 (`{}`)
- **カテゴリ**: 整理 / 型安全性
- **対象**: `tsconfig.json` (実質 `{}`)
- **概要**: ルート tsconfig が空で型チェックは `tsconfig.prod.json` と各 workspace の個別 config に依存。エディタでルートを開いたとき型情報が貧弱。
- **提案**: ルートに `extends` ベースの共通設定を置き、`tsconfig.prod.json` はそれを extend。

### IC-012 dashboard のリフレッシュ間隔がマジックナンバー
- **カテゴリ**: 設計 / 柔軟性
- **対象**: `mekann/context/context-control/views/dashboard.ts:197,348`
- **概要**: `setInterval(refresh, 5000)` / `setInterval(refresh, 2000)` がハードコード。負荷調整やポーリング戦略の切り替えが困難。
- **提案**: 定数化 or 設定経由で調整可能に。

### IC-013 `macSeatbelt.ts` の 200ms マジックディレイ
- **カテゴリ**: 堅牢性 / 意図不明
- **対象**: `mekann/safety/sandbox/macSeatbelt.ts:393`
- **概要**: `killProcessGroup(child); await new Promise(r => setTimeout(r, 200));` の 200ms 待機の根拠がコメントなし。早すぎると子プロセス残存、遅すぎるとレイテンシ。
- **提案**: 根拠をコメント化、または子の `close` を待つイベント駆動に変更。

### IC-014 リポジストリルートに重複 benchmark スクリプト
- **カテゴリ**: 整理
- **対象**: `benchmark-startup.ts`, `benchmark-startup.mjs` (共に `as any`多用)
- **概要**: ルート直置きの `.ts` と `.mjs` が実質重複。monorepo 配下 (`scripts/` 等) に統合されていない。
- **提案**: `scripts/benchmark-startup.*` へ移動、or 廃止して `scripts/coverage-benchmark.sh` 等に統合。

---

(以降、探索を継続して追記)

---

## 第3バッチ (探索継続)

---

## 第2バッチ (探索継続)

### IC-015 output-gate のアーティファクト ID がプロセス間で衝突する可能性
- **カテゴリ**: データ整合性 / 堅牢性
- **対象**: `mekann/context/output-gate/store.ts:103-116`
- **概要**: `nextArtifactId` は `og_<createdAt(36)>_<counter(36)>` のみ。`artifactCounter` はプロセスローカルの `let` で、同時刻に2つの pi プロセスが立ち上がると `og_<同時刻>_0` のような重複 ID が生じうる。一方 `ledger/store.ts:54` の `nextEventId` は `crypto.randomBytes(3)` の乱数サフィックスを併用しており、安全側に倒れているのに output-gate だけ不整合。
- **根拠**:
  ```ts
  // output-gate (衝突リスク)
  export function nextArtifactId(createdAt, counter) { return `og_${...}_${counter.toString(36)}`; }
  // ledger (安全)
  export function nextEventId(createdAt) { eventCounter += 1; return createEventId(createdAt, eventCounter, crypto.randomBytes(3).toString("hex")); }
  ```
- **提案**: output-gate ID にもランダムサフィックスを付与し、ledger 側と同じ安全設計に統一。`og_<time>_<counter>_<rand>` の形式拡張(既存正規表現 `^og_[a-z0-9]+_[a-z0-9]+$` の緩和が必要)。

### IC-016 ledger のローテーション/プルーニングがエラーを完全に握り潰す
- **カテゴリ**: データ整合性 / デバッグ性
- **対象**: `mekann/context/ledger/store.ts:300-302` (`rotateIfNeeded` の catch) および `345-347` (`pruneEventLog` の catch)
- **概要**: 両関数とも `} catch { /* Rotation must never break event appending */ }` でエラーを無言破棄。ディスク満杯や権限エラーが起きても呼び出し元もユーザも気づけず、JSONL だけ肥大化して最終的にクラッシュする。
- **根拠**: `sed -n '300,302p;345,347p'` で空 catch を確認。
- **提案**: エラーを構造化ログ(context event として記録、またはデバッグ出力)に逃す。最低限「ローテーション失敗 N 回」のような内部カウンタで表面化。

### IC-017 ledger にアトミック追記の排他制御が無い (並列プロセスで行 interleaving)
- **カテゴリ**: データ整合性 / 並行性
- **対象**: `mekann/context/ledger/store.ts:174` (`appendEvent`)
- **概要**: `await fsp.appendFile(filePath, line+"\n")` のみでロック/フラグなし。同一 cwd で複数 pi プロセス(メイン+サブエージェント+issue pi)が同時追記すると、OS の `O_APPEND` は行アトミックを保証しない環境もあり、JSONL 行が混線する恐れ。読み取り側は `JSON.parse` 失敗でその行を黙ってスキップ(IC-016 と重畳)するため、**イベントが静かに消失**する。
- **根拠**: append 後の rotate は「rename → write」の非アトミック2段階(`store.ts:303-306`)で、クラッシュ直後は current/rotated のどちらにも未保存ウィンドウがある。
- **提案**: `proper-lockfile` / ファイルロックディレクトリ、または単一ライターモデル(key agent 経由)への集約。rotate は一時ファイル + rename のアトミック置換に変更。

### IC-018 CI の Node バージョンが `engines`/`.nvmrc` と不整合
- **カテゴリ**: CI / 再現性
- **対象**: `.github/workflows/ci.yml` (全ジョブ `node-version: "22"`) vs `package.json` (`>=22.19.0`) vs `.nvmrc` (`22.19.0`)
- **概要**: CI は最新の `22.x`(現在 22.x の最新マイナー)を使う一方、`.nvmrc` は `22.19.0` に固定。ローカルと CI で Node のマイナーが食い違うと、`node:test` API や `fs` の挙動差で再現しない不具合が出うる。
- **根拠**: `grep node-version` で全ジョブ `"22"`、`.nvmrc` は `22.19.0`。
- **提案**: CI を `22.19.0`(`.nvmrc` 同期) に揃えるか、`.nvmrc`/`engines` を緩和して方針を明文化。できれば matrix で LTS 最低ライン+最新を検証。

### IC-019 CI に lint / 整形のステップが無い
- **カテゴリ**: 品質ゲート / CI
- **対象**: `.github/workflows/ci.yml` (test + typecheck + coverage のみ)
- **概要**: ESLint/Prettier/Biome などの linter やフォーマットチェックが CI に無い。`tsconfig.prod.json` の `strict: true` 型チェックはあるが、未使用 import / `any` 滥用(IC-002 等) / `require()` in ESM(IC-023) などを弾けない。
- **根拠**: workflow ファイル・package.json scripts に lint 系が存在しない(`rg -n "lint|eslint|prettier|biome" package.json scripts/` で該当なし)。
- **提案**: Biome か ESLint flat-config を導入し、`no-explicit-any` / `no-unused-vars` / `require-await` 等を CI gate に追加。

### IC-020 CI のカバレッジ閾値が `modes`/`sandbox` の2ワークスペースのみ
- **カテゴリ**: テスト / 品質ゲート
- **対象**: `.github/workflows/ci.yml:117-130` (`modes` 85%) と `160-175` (`sandbox` 89%)
- **概要**: カバレッジ閾値チェックは `mekann/safety/modes` と `mekann/safety/sandbox` だけ。`core/`, `autonomy/`, `context/`, `utils/` の大半は「テスト実行」のみで数値ゲートが無く、カバレッジ低下が黙認される。
- **根拠**: workflow 内で `Coverage threshold check` ステップが上記2ジョブにしか無い。
- **提案**: 各 workspace に `check:coverage:*` スクリプトと閾値を設定、`scripts/check-coverage-threshold.sh` を全ワークスペースに拡張。

### IC-022 `dashboard/cleanup.ts` が SIGINT を奪って常に `process.exit(130)` する
- **カテゴリ**: プロセス制御 / 副作用
- **対象**: `mekann/utils/dashboard/cleanup.ts:13-18`
- **概要**: `process.once("SIGINT", ...)` でクリーンアップ後に `process.exit(130)` を呼ぶ。pi 本体や他の拡張も SIGINT ハンドラを持つ場合、プロセス終了コードやリソース解放順序が dashboard 拡張に支配される。`process.once` なので1回限りだが、他ハンドラとの協調が不明確。
- **根拠**: SIGINT ハンドラ内で直接 `process.exit`。
- **提案**: 終了コード決定は pi 本体に委ね、拡張はクリーンアップのみ行う設計へ。または ADR-0009(terminal shortcuts are user-owned)の精神でシグナル処理も本体集中に。

### IC-023 `issue/app.ts` が ESM ファイル内で `require("react")` を使う
- **カテゴリ**: 型安全性 / 実行時堅牢性
- **対象**: `mekann/utils/issue/app.ts:22` (`el()` ヘルパ内の `require("react")`)
- **概要**: モジュールロード時に毎回 `require("react")` を呼ぶ遅延ロード。ESM 環境では `createRequire` 経由でないと失敗しうる上、`as any` だらけで型安全性ゼロ(`React.createElement(type as any, props as any, ...)`)。
- **根拠**: `el()` 実装と、行 224-270 の `useState as any` / `useEffect as any` / `useKeyboard as any` の連続。
- **提案**: `import React from "react"` に切り替え、OpenTUI/React の型を正しく取得。`as any` を除去し型定義を整備。

### IC-024 dashboard の `esc()` がシングルクォートをエスケープしない (XSS 属性注入の余地)
- **カテゴリ**: セキュリティ (XSS)
- **対象**: `mekann/context/context-control/views/dashboard.ts:30-32`
- **概要**: `esc()` は `& < > "` のみ置換し `'`(単一引用符) をそのまま通す。HTML 属性値に `esc()` 出力を埋め込む箇所が複数あり(`alt="${esc(alt)}"`, `title="..."`)、コンテンツが単一引用符属性の文脈で使われるとインジェクション余地が残る。現状はダブルクォート属性が多いので即時被害は限定的だが、エスケープ関数として不完全で将来の迂回リスク。
- **根拠**:
  ```ts
  function esc(v: unknown): string {
    return String(v ?? "—").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
  }
  ```
- **提案**: `'` → `&#39;` も追加。テキスト/属性両用のエスケーパとして OWASP 推奨の5文字エスケープに揃える。

### IC-025 dashboard のクライアント側 `innerHTML` 差し替えがスクリプト注入を許す可能性
- **カテategorias**: セキュリティ (XSS) / 堅牢性
- **対象**: `mekann/context/context-control/views/dashboard.ts:197, 337-342`
- **概要**: ポーリングで取得した HTML を `DOMParser` でパースし `document.querySelector('main').innerHTML = next` で差し替え。サーバ側 `esc()` が不完全(IC-024)な場合、または将来の描画追加で未エスケープ経路が混入すると、`innerHTML` 経由でスクリプトが走る。localhost 専用とはいえ、コンテキストレジャやイベントにユーザ入力が流れるためリスク非ゼロ。
- **提案**: `innerHTML` ではなく `replaceChildren` + パース済みノードの移植、または DOMPurify 相当のサニタイズ層。最低限 IC-024 のエスケープ完全化とセットで。

### IC-027 `subagentSpawner` が `(session as any).agent?.state?.tools` で内部 API を掘る
- **カテゴリ**: 型安全性 / カプセル化侵害
- **対象**: `mekann/autonomy/subagent/subagentSpawner.ts:241-250, 302`
- **概要**: pi SDK の `Session` オブジェクトの内部プロパティ(`agent.state.tools`)を `as any` で直接書き換えている。SDK が内部表現を変えると黙って壊れ、テストでも検知困難。`resolvedOverride as any` の羅列(302行目)も同様。
- **根拠**:
  ```ts
  if (parentActiveTools && ... && (session as any).agent?.state?.tools) {
    session.agent.state.tools = session.agent.state.tools.filter((t: any) => activeSet.has(t.name));
  }
  ```
- **提案**: pi SDK に公式の「tool filter / authority 適用」API を要求/追加し、内部表現アクセスを除去。SDK バージョンアップ時の regression テストを追加。

### IC-028 `compactWaitResult` / `sanitizeArgs` が全段 `any` (型安全性ゼロ)
- **カテゴリ**: 型安全性
- **対象**: `mekann/autonomy/subagent/index.ts:99-112` (`compactWaitResult`), `152,196` (`prepareArguments`)
- **概要**: `result: any` で受けて `result.events.map((e: any) => ...)`、`mailbox.map((m: any) => ...)` と構造を想定してアクセス。`prepareArguments` も `return a as any` で型を捨てる。スキーマ(`SpawnSchema`)が存在するのに args を `unknown`→`as any` で迂回しており、スキーマと実装の不整合が検知できない。
- **提案**: `WaitResult` / `LifecycleEvent` / `MailboxItem` 型(types.ts に既存)で型付け。`prepareArguments` は zod parse 経由で型保証。

### IC-029 `mailbox.waitForEvents` のタイムアウト時に「空で解決」する (タイムアウトが分からない)
- **カテゴリ**: デバッグ性 / UX
- **対象**: `mekann/autonomy/subagent/mailbox.ts:157-163`
- **概要**: `setTimeout(() => { waiter.resolve({ events: ev, mailbox: mb }); }, timeoutMs)` で、タイムアウト時も「成功」と同じ resolve を返す。呼び出し元が「タイムアウトした」「イベントが0件だった」を区別できず、待機呼び出し側は空配列を見てエラー扱いするしかない。
- **提案**: `timed_out: true` フラグを付与するか、Reject / 専用戻り型へ分離。`compactWaitResult` が既に `timed_out` フィールドを持つ(`index.ts:101`)ので、mailbox 側で設定するべき。

### IC-030 ルート直下の `benchmark-startup.{ts,mjs}` が参照されていない
- **カテゴリ**: デッドコード / 整理
- **対象**: `benchmark-startup.ts`, `benchmark-startup.mjs`
- **概要**: `rg benchmark-startup` で参照元が他ファイルに見当たらず(`package.json` scripts にもなし)。`as any` だらけの暫定ベンチマークが放置されている。`.gitignore` 対象外で Git 管理に残り続ける。
- **提案**: `scripts/` へ移動して `package.json` に `bench:startup` スクリプトとして登録、または廃止。

### IC-031 ルート直下の個人メモ風ファイル群がGit 管理下
- **カテゴリ**: リポジトリ衛生
- **対象**: `memo.md`、`evaluate_maintenance.sh`、`results.tsv` は `.gitignore` に列挙済みで未追跡。
- **副産物**: `git ls-files` で `benchmark-startup.{ts,mjs}` は追跡されている。


---

## 第4バッチ (探索継続)

### IC-032 `saveSettingsChecked` の renameSync fallback が非アトミック (クラッシュで破損)
- **カテゴリ**: データ整合性 / 堅牢性
- **対象**: `mekann/settings/store.ts:130-131`
- **概要**: `try { renameSync(tmp, path); } catch { writeFileSync(path, json, "utf8"); rmSync(tmp, ...); }`。`renameSync` 失敗時(例: 別ボリューム/権限/Windows)のフォールバックが `writeFileSync(path, ...)` の**直接上書き**で、クラッシュすると部分書き込みの破損 JSON が残る。さらに `writeFileSync` 自体が投げると `tmp.<pid>.<ts>` がクリーンアップされずゴミとして残る。
- **根拠**: `catch { writeFileSync(path, json, "utf8"); rmSync(tmp, { force: true }); }` — finally で rmSync されていない。
- **提案**: rename をリトライするか、失敗時は「tmp を残して throw」(保存失敗を明示)に。最低限 `finally { rmSync(tmp, { force: true }); }` でゴミ回避。Windows の cross-volume rename は `fs.copyFileSync` + unlink の手順書が必要。

### IC-033 `withSettingsLock` の stale-lock 判定が 30s 固定 (長時間書き込みで誤奪取)
- **カテゴリ**: 並行性 / データ損失リスク
- **対象**: `mekann/settings/store.ts:108-116`
- **概要**: ロック取得後 30s で stale とみなし強制削除して再取得。`saveSettingsChecked` 自体は軽いが、呼び出し側 `fn()` が遅い(巨大 settings、ネットワーク I/O 混入)と、まだ動作中の他プロセスのロックを奪って**同時上書き**する恐れ。pid チェックや heartbeat ファイルが無く、「30s 経過 = 死んだ」という過激な前提。
- **根拠**: `if (Date.now() - statSync(lockPath).mtimeMs > 30_000) { rmSync(lockPath, ...); continue; }`
- **提案**: ロックディレクトリ内に `owner.<pid>` を書き、`process.kill(pid, 0)` で生存確認してから破棄。30s は heartbeat の上限として、mtime を定期的に touch する仕組みへ。

### IC-034 `withSettingsLock` が `SharedArrayBuffer` ベースの `sleepSync` に依存 (環境依存)
- **カテゴリ**: 堅牢性 / ポータビリティ
- **対象**: `mekann/settings/store.ts:103`
- **概要**: `function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }`。`SharedArrayBuffer` はブラウザ同様 Node でも `--cross-origin-isolated` 等の制約や、サンドボックス(macOS seatbelt やコンテナ)で `COOP/COEP` なしに無効化されることがある。無効な環境では `Atomics.wait` が `TypeError` で**ロック取得ループそのもの**がクラッシュする。
- **根拠**: 当リポジトリは sandbox 機能を提供しており、サンドボックス内で settings を書く経路が存在しうる。
- **提案**: `setTimeout`-free の busy-wait でなく `Atomics.wait` の可用性を検出して通常の `setTimeout` ベースの async ロックへフォールバック。または `proper-lockfile` のような外部堅牢実装へ置換。

### IC-035 `settingsCache` がプロセス内でパス別キャッシュするが fs.watch が無い (設定変更が反映されない)
- **カテゴリ**: UX / 堅牢性
- **対象**: `mekann/settings/store.ts:29` (`settingsCache`) + コメントに「there is no live-reload/fs.watch」
- **概要**: コメント自体が制限を明記している通り、外部プロセス(`mekann settings-editor` CLI やエディタ)が settings を編集しても、実行中 pi のキャッシュは更新されない。`saveSettingsChecked` 経由なら更新されるが、CLI 直書きや外部エディタでは `invalidateSettingsCache` を手動呼び出しする術が UI 側に無い。
- **提案**: `fs.watch` ベースのキャッシュ無効化を追加(デバウンス付き)。ADR-0013(Mekann settings 用 専用 mekann.json)の精神で、settings 変更イベントを context ledger にも記録。

### IC-038 `image-worker-pool` の `taskId: Date.now()` が同一ms内で衝突
- **カテゴリ**: データ整合性 / 並行性
- **対象**: `mekann/utils/image-worker-pool/index.ts:82`
- **概要**: `worker.postMessage({ taskId: Date.now(), input })` でタスク ID に `Date.now()`(ms精度)を使用。1ms以内に複数ディスパッチすると同じ `taskId` が複数ワーカーに流れ、応答紐付けが壊れる可能性。`worker.once("message")` で都度 resolve しているので実害は限定的だが、ID の一意性保証が無い。
- **提案**: 単調増加カウンタ(`let taskSeq = 0; ...taskId: ++taskSeq`)または `crypto.randomUUID()` に置換。

### IC-041 `agentControl.shutdown` の `.catch(() => undefined)` で close エラーが全て無視
- **カテゴリ**: デバッグ性 / リソースリーク
- **対象**: `mekann/autonomy/subagent/agentControl.ts:559`
- **概要**: `for (const path of ...) await this.closeSingle(path).catch(() => undefined);` で、個別 close 失敗(残留プロセス、kitty ペーン残存)を全て無言で握り潰す。shutdown 後にゾンビワーカーが残っても気付けない。
- **提案**: 失敗を集計して `ctx.ui.notify` またはログへ。最低限デバッグログ出力。

### IC-042 `model-manager.ts` のスタートアップ再試行が固定遅延 `[0,100,300]`
- **カテゴリ**: 堅牢性 / 設計
- **対象**: `mekann/core/model-manager.ts:55-64`
- **概要**: `const delays = [0, 100, 300]` の3回固定再試行。pi の起動直後に model registry が非同期ロードされる状況向けだが、ネットワーク遅延や多数プロバイダでは 400ms 総計で足りず、ユーザに「モデル未検出」と誤表示される。指数バックオフではなく線形。
- **提案**: 指数バックオフ + 最大試行回数/タイムアウトを設定経由で調整可能に。失敗時は「registry まだ初期化中」の明示メッセージ。

### IC-043 `codex-limits app-server-client` の `dispose` がプロセスグループを kill しない
- **カテゴリ**: リソース管理 / ゾンビプロセス
- **対象**: `mekann/utils/codex-limits/app-server-client.ts:142-152`
- **概要**: `dispose()` は `child.kill()`(デフォルト SIGTERM) のみで、`detached` やプロセスグループ kill を使わない。codex app-server が子プロセスを spawn している場合、それらが孤児として残る。また SIGTERM 后の SIGKILL フォローも無い。
- **根拠**: `if (!child.killed) child.kill();` — シグナル指定なし、グループ kill なし。
- **提案**: `spawn(..., { detached: true })` + `process.kill(-child.pid, 'SIGTERM')` でグループ kill。タイムアウト後に SIGKILL。当リポジトリの `macSeatbelt.ts` の `killProcessGroup` パターンと統合。

### IC-045 `verify/index.ts` が `npm run` を順次実行 (並列化の余地)
- **カテゴリ**: パフォーマンス / UX
- **対象**: `mekann/utils/verify/index.ts:64-66`
- **概要**: `for (const script of selection.selected) results.push(await runScript(ctx.cwd, script));` で `typecheck`/`test` 等を直列実行。`scripts/prepush-parallel.sh` は並列化しているのに、ユーザ向け `/verify` コマンドは直列で時間がかかる。
- **提案**: `Promise.allSettled` で並列化、または依存関係(typecheck → test)だけ直列に。

---

## 第6バッチ (探索継続)

### IC-048 `review-quality` が branch diff と working diff を単純加算 (二重カウント)
- **カテゴリ**: バグ (計算精度)
- **対象**: `mekann/utils/review-quality/index.ts:62-70` (`mergeStats`)
- **概要**: `mergeStats(branch, working)` は branch(`base...HEAD`) と working(`HEAD`) の numstat を足し合わせる。未コミットの作業が既に branch に含まれる変更と重なる場合、同じ行が2回カウントされ「Large change」誤検知→不要なレビュー提案。逆に stash 済み等では過小評価。
- **提案**: working 変更を branch に含まれるファイルだけ除外、または `base...HEAD` と `HEAD..working` の和集合を正しく計算。

### IC-049 `review-quality` の `resolveBaseRef` が `origin/HEAD` → `main` の順で fallback (リポジトリ依存)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/utils/review-quality/index.ts:72-78`
- **概要**: `git merge-base HEAD origin/HEAD` 失敗時に `git merge-base HEAD main` へ。`origin/HEAD` が未設定(clone 直後)や `main` ブロックが `master`/`develop` のリポジトリで失敗し、`collectStats` は catch で空 numstat に落ちて working のみになる。ベース検出失敗がユーザに通知されない。
- **提案**: ベース解決失敗を `ctx.ui.notify` で明示。`git symbolic-ref refs/remotes/origin/HEAD` や設定可能な base ブランチを追加。

### IC-050 `as any` が非テストソースに 117 件 (型安全性の技術的負債)
- **カテゴリ**: 型安全性 (横断)
- **対象**: リポジトリ全体(非テスト `.ts` 117件、内 `autonomy` 65件)
- **概要**: `as any` のトップ: `output-gate/index.ts`(14), `goal/state.ts`(11), `issue/app.ts`(10), `toolsRegistration.ts`(9), `subagentSpawner.ts`(8), `subagent/index.ts`(8), `ledger/index.ts`(6)。IC-002/027/028/046/047 の局所版が点在。`tsconfig.prod.json` は `strict: true` だが `as any` で迂回されているため実質 strict でない。
- **提案**: ESLint `@typescript-eslint/no-explicit-any`/`no-unsafe-assignment` を warning→error に段階導入。各ファイルごとに削減タスクを切れるようベースライン計測を CI 化。

### IC-051 pre-commit フックが存在せず、品質ゲートが pre-push に集中
- **カテゴリ**: 開発体験 / CI
- **対象**: `.husky/` (`_` と `pre-push` のみ、`pre-commit` 無し)
- **概要**: `.husky/pre-push` は `npm run prepush`(typecheck + 並列テスト)を実行するが、`pre-commit` フックが無い。コミット時点では何も検査されず、push 段階で初めて型エラーやテスト失敗が発覚 → 複数コミットの積み戻しが必要になる。`prepare-husky.js` が何を設置しているかも確認要。
- **提案**: 軽量な pre-commit(例: lint-staged でフォーマット/型チェック対象ファイルのみ)を追加。重い全テストは pre-push 維持。

### IC-052 各 workspace に tsconfig.json が無い (型チェック分散)
- **カテゴリ**: 型安全性 / 整理
- **概要**: workspace ごとの tsconfig が無く、`tsc -p tsconfig.prod.json`(ルート) のみで型チェックされる。workspace 単位で `npm test`/`typecheck` を走らせても型チェックが含まれない場合がある。エディタで workspace を開いたときの型解決も不安定。
- **提案**: 各 workspace にルートを extend する `tsconfig.json` を配置。`typecheck` スクリプトを各 workspace に統一。

---

## 第7バッチ (探索継続)

### IC-053 `truncate-utils.findByteBoundaryFromEnd` にデッドコードと maxBytes 違反バグ
- **カテゴリ**: バグ (計算精度) / デッドコード
- **対象**: `mekann/utils/truncate-utils/index.ts:163-188`
- **概要**: 2つの問題:
  1. **デッドコード**: 行166-168 の `let charPos = content.length; while (charPos > 0 && Buffer.byteLength(content.slice(charPos),"utf-8") === 0) charPos--;` は `charPos` を計算するが、直後の二分探索(`lo`/`hi`)で一切使われない。意図不明の残骸。
  2. **maxBytes 違反**: 二分探索で `lo` を求めた後、`const nlPos = content.indexOf("\n", lo); if (nlPos !== -1 ...) return nlPos + 1;` で**次の改行まで前進**する。これにより `content.slice(nlPos+1)` は `maxBytes` を**超過**しうる(`truncateTail` の呼び出し側は「byte 制限を守る」前提)。テストは「<=50 bytes」を確認するだけなので、超過ケースを網羅していない。
- **根拠**: コード読解 + `index.test.ts` が `expect(...).toBeLessThanOrEqual(50)` しか検証せず、改行スナップ後の超過をテストしない。
- **提案**: デッドコード削除。改行スナップ後に byte 再チェックを入れ、超過する場合は `lo` を使うか、行頭ではなくバイト境界で安全に切る。プロパティテスト(ランダムな日本語/絵文字混在)を追加。

### IC-054 `extractTextFromProviderPayload` が preferred/非preferred を二重走査 (効率と意図の不一致)
- **カテゴリ**: パフォーマンス / 設計一貫性
- **対象**: `mekann/core/prompt-core/extract.ts:38-44`
- **概要**: `visit()` が `for (k of keys.filter(preferred.has)) visit(...)` の後 `for (k of keys.filter(!preferred.has)) visit(...)` と**同じオブジェクトの全キーを2回走査**。`visit` 内は `if (!key || preferred.has(key)) add(value)` で文字列採集するので、2回目のループでは非preferredキー下の文字列は `key` が preferred でないため **add されない**。つまり2回目のループは「非preferredキーを再帰下降するため」だけだが、コメントと実装が錯綜していて意図が読みづらい。巨大な payload(500k上限)では冗長な `Object.keys().filter()` が2回走る。
- **提案**: 単一ループで `const isPreferred = preferred.has(k); visit(obj[k], isPreferred ? k : key)` のように文脈を引き継ぐ形式に統一。意図をコメント明示。

### IC-055 `agent-guidelines` のプロンプトフラグメントがソースコードに埋め込み (i18n/編集性)
- **カテゴリ**: 保守性 / i18n
- **対象**: `mekann/core/agent-guidelines/index.ts:7-90` (SYSTEM_PROMPT_EXTRA 等の長文テンプレートリテラル)
- **概要**: プロンプト追加ガイドライン(日本語+英語混在)が TS ファイル内の長大なテンプレート文字列。文言変更のたびにコードを編集し、差分が大きくなる。CONTEXT.md の用語(`Goal`, `Issue worktree` 等)との整合も手動。ADR-0006(context ledger)や cacheable-context の精神からも、静的フラグメントは外部データ化が自然。
- **提案**: `agent-guidelines/fragments/*.md` への外部化。ビルド時に埋め込み or 実行時読み込み。i18n(日本語ポリシー(CONTEXT.md『Japanese interaction policy』))を切り替え可能に。

### IC-056 `cacheable-context/builder.ts readManifest` が `JSON.parse` を無検証で返す
- **カテゴリ**: 堅牢性 / データ整合性
- **対象**: `mekann/context/cacheable-context/builder.ts:205`
- **概要**: `export async function readManifest(cwd): Promise<Manifest | undefined> { const text = await readIfExists(manifestPath(cwd)); return text ? JSON.parse(text) : undefined; }`。壊れた manifest.json や想定外スキーマを `Manifest` と断定して返す。呼び出し側(manifest.json の fragments/sourceHashes を信頼)が `.fragments[i].id` 等へアクセスすると実行時 `undefined`。
- **提案**: zod/guard で検証、失敗時は `undefined` を返すか再生成。既存 `readIfExists`/`exists` の堅牢パターンと組み合わせ。

### IC-057 `codex-shared auth.ts` の JWT デコードが base64url パディング欠落に依存 (環境差)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/utils/codex-shared/auth.ts:17-20`
- **概要**: `Buffer.from(parts[1] ?? "", "base64url")` は Node 20+ で base64url をネイティブサポートするが、古い Node や非パディングの jwt ペイロードで稀に失敗。`try/catch` で `undefined` に落ちるため silent だが、「アカウントID取得失敗 = codex 機能全体が無効化」になるルートがあり、ユーザに原因が伝わらない。
- **提案**: デコード失敗時の通知/ログ。パディング補完(`+= "=".repeat((4 - len % 4) % 4)`)の明示。

### IC-058 `codex-shared client.ts` が `User-Agent: pi-codex-search` をハードコード (バージョン欠落)
- **カテゴリ**: 運用性 / API エチケット
- **対象**: `mekann/utils/codex-shared/client.ts:45`
- **概要**: `headers.set("User-Agent", "pi-codex-search")` で UA が固定文字列。mekann/pi のバージョン情報が載らず、API 側からのトラブルシュートやレートリミット緩和交渉で不利。`clientVersion` は別途 `client_version` クエリパラで送るが UA には反映されない。
- **提案**: `pi-codex-search/<version> (mekann/<pkg-version>)` のようにバージョン付与。`package.json` から読み込み。

### IC-059 `codex-shared client.ts` が `PI_CODEX_WEB_SEARCH_CLIENT_VERSION` 経由でクライアント版を上書き可能 (API 互換性リスク)
- **カテゴリ**: セキュリティ / 運用
- **対象**: `mekann/utils/codex-shared/client.ts:48`
- **概要**: `process.env.PI_CODEX_WEB_SEARCH_CLIENT_VERSION ?? DEFAULT_CLIENT_VERSION` で環境変数からクライアント版を自由に設定可能。悪意/誤設定で未来の API 版を叩いて予期せぬ挙動やレート制限を招く恐れ。dev 用とはいえドキュメント化されていない隠しノブ。
- **提案**: 当該 env のドキュメント化、または dev/CI 限定のフラグで制限。本番では固定。

### IC-061 `grep.ts` のフラグ検出正規表現が過剰マッチ (フラグ重複/欠落バグ)
- **カテゴリ**: バグ (確定)
- **対象**: `mekann/context/command-normalization/grep.ts:14-26`
- **概要**: フラグ重複追加回避の判定が `/^-.*n/.test(a)` のような「`-` で始まり任意の文字を挟んで `n` を含む」緩い正規表現。これが**広範に誤マッチ**する:
  - `/^-.*0/.test("-10")` → true(`-10` を `--null`(`-0`) が既にあると誤認)
  - `/^-.*n/.test("-inferior")` → true(`--line-number` 追加を誤ってスキップ)
  - `/^-.*H/.test("-Help")` → true(`--with-filename` 追加をスキップ)
  結果、ユーザの意図しない引数がフラグ検出を狂わせ、normalize が機能しないか逆に重複フラグを生む。
- **検証**: `node` で各正規表現を直接評価し、上記の偽陽性を確認済み。
- **提案**: `/^-[a-zA-Z]*n/.test(a)`(単一文字オプション内のみ)またはトークン分解して `-` の直後1文字ずつを判定。専用ユニットテストで `-10`/`-A2`/`-Help` 等の非マッチを保証。

### IC-062 `splitSimpleCommand` の SHELL_OPERATORS が改行を許容 (コマンドインジェクション回避漏れ)
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/context/command-normalization/command.ts:3`
- **概要**: `const SHELL_OPERATORS = /[|;&<>` + backtick + `$(){}]/` はパイプ/リダイレクト/コマンド置換を弾くが、**改行(`\n`/`\r`)を含まない**。改行区切りの複文(`ls\nrm -rf x`)やバックスラッシュ継続(`ls \\
rm`)を「シンプルコマンド」と誤認し、normalize 対象にしてしまう恐れ。tab やその他のホワイトスペース経由のエスケープも同様。
- **検証**: `node` で `/[|;&<>` + backtick + `$(){}]/.test("a\nb")` → `false`(改行を通す)。
- **提案**: 正規表現に `\n\r` とバックスラッシュ継続パターンを追加、または「ASCII 表示可能文字+空白のみ」のホワイトリスト方式に切り替え。

### IC-063 `modes/utils.ts loadPrompt` の変数置換が `replaceAll` の順序依存 (テンプレートインジェクション)
- **カテゴリ**: 堅牢性 / 設計
- **対象**: `mekann/safety/modes/utils.ts:36-46`
- **概要**: `loadPrompt(name, vars)` が `content.replaceAll("\${"+k+"}", v)` で変数展開。`vars` の `Object.entries` 順序に依存し、ある変数値が別の変数のプレースホルダ文字列を含むと二重展開される。プロンプトインジェクション経路になりうる(ユーザ制御可能値を渡す場合)。
- **提案**: 1パスのトークン置換(正規表現で `\${([a-zA-Z_]+)}` を一度に処理)、または循環参照ガード。変数値に `${` を含む場合はエスケープ。

### IC-064 `config.ts` の `MEKANN_CODEX_WEB_SEARCH_DEFAULTS.nonCodexDefaultModel: "gpt-5.5"` がハードコード
- **カテゴリ**: 保守性 / 設定の一元化
- **対象**: `mekann/config.ts:152`
- **概要**: 非 Codex プロバイダ向けのデフォルトモデル `gpt-5.5` が文字列ハードコード。モデルIDの命名規則が変わったり新モデルが出たりすると手動更新が必要。`effort: "low"` も同様。他の `MEKANN_*_DEFAULTS` は定数化されているが、ここだけ実値。
- **提案**: モデル定数を集約(例: `CODEX_FALLBACK_MODEL`)、または codex-shared のモデルリストから動的解決。設定経由で上書き可能に。

### IC-065 `command.ts normalizeList` の `tree -I` が `|` セパレータでパス衝突
- **カテゴリ**: バグ (エッジケース)
- **対象**: `mekann/context/command-normalization/command.ts:34`
- **概要**: `out.push("-I", IGNORE_DIRS.join("|"))` で無視ディレクトリを `|` 区切り。`tree -I` のパターンは glob だが `|` は alternative 区切り。`IGNORE_DIRS` に `|` を含むディレクトリ名は無いが、将来の拡張やユーザ追加で壊れる。また `tree -I node_modules|.git|...` を既存 `-I` 引数と単純マージせず新たに追加すると、既存パターンが上書きされる(tree は最後の `-I` を使う)。
- **提案**: 既存 `-I` を検出した場合はマージ、または複数 `-I` を許可する設計に。ディレクトリ名のエスケープ方針を明文化。

### IC-066 `command.ts quote()` が `~` をクオートしてしまう (HOME 展開が消える)
- **カテゴリ**: バグ (UX)
- **対象**: `mekann/context/command-normalization/command.ts:11`
- **概要**: `quote()` は `/^[A-Za-z0-9_./:=@%+,-]+$/` にマッチしないと `'...'` で囲む。`~`(チルダ)は含まれないため `~/path` は `'~/path'` とクオートされ、シェルの HOME 展開が**無効化**される。`ls ~/Documents` が正規化後に `ls -1 '~/Documents'` となり、リテラル `~` ディレクトリを探して失敗。
- **提案**: `~` を安全文字に追加、または先頭の `~/` だけはクオート外に出すロジック。

### IC-067 `modes` 拡張が `safeEmit` でイベント失敗を握り潰し (サイレント機能不全)
- **カテゴリ**: デバッグ性
- **対象**: `mekann/safety/modes/index.ts:28-29, 290-292`
- **概要**: `safeEmit` とロード時の `try { ... } catch { /* events not available */ }` で、sandbox拡張が未ロード時のイベント発火失敗を無言化。設計意図(拡張の疎結合)は理解できるが、本番でイベントリスナが壊れた場合(タイポ、API 変更)に「モード遷移したのに sandbox プロファイルが変わらない」等が無言で起きる。
- **提案**: デバッグログまたはメトリクス出力。初回失敗時のみ `ctx.ui.notify` で軽く警告。

---

## 第9バッチ (探索継続)

### IC-068 `terminal-shortcuts.parseShortcutEnv` がカンマを含むコマンドを壊す
- **カテゴリ**: バグ (エッジケース) / 設計制約
- **対象**: `mekann/utils/terminal-shortcuts/index.ts:40-52`
- **概要**: `value.split(",")` でエントリ分割後、各エントリを `split("=")` で key/command に分ける。コマンド内にカンマがある(`foo=echo a,b`、`git log --pretty=%h,%s` 等)と**エントリ境界が壊れ**、`{ foo: "echo a", b: "" }` のように誤パースされる。`=` の分割は `commandParts.join("=")` で安全だが、カンマは救済無し。
- **検証**: `node` で `"foo=echo a,b".split(",")` → `["foo=echo a", "b"]` を確認。
- **提案**: エスケープ(`\,`)または別セパレータ(`;`/改行)を許可。または env ではなく設定ファイル(mekann.json)経由を推奨。ドキュメントで制約明記。

### IC-069 `issue/worktree.removeWorktree` の `rmSync(recursive)` はガード付きだが候補側(IC-039)と安全度が不整合
- **カテゴリ**: 一貫性 / セーフティ
- **対象**: `mekann/utils/issue/worktree.ts:132-147`
- **概要**: `removeWorktree` は `isRegisteredWorktree(repoRoot, wt)` + `isExpectedWorktree(path, branch)` の二重チェックを経てから `rmSync` する堅牢設計。一方 `candidate.ts removeCandidateWorktree`(IC-039)は `c.trial?.worktree_path` を JSON から読んでガード無しで `rmSync`。同じ「ワークツリー削除」で安全度がバラバラ。
- **提案**: 共通の `safeRemoveWorktree(repoRoot, { path, branch, expectedRootPrefix })` ヘルパに集約。candidate 側も issue 側と同等のガードを適用。

### IC-070 `issue/worktree.createWorktree` がブランチ名/パスをエスケープせず git に渡す (パストラバーサル)
- **カテゴリ**: セキュリティ / 入力検証
- **対象**: `mekann/utils/issue/worktree.ts:96-122`
- **概要**: `branch` と `worktreePath` を `execFileSync("git", ["worktree", "add", ...])` の引数として渡す。`execFileSync` はシェルを経由しないのでコマンドインジェクションは無いが、`branch` に `../` や絶対パスが入ると git の ref 解釈で意図しないブランチ操作、`worktreePath` に絶対パスが入るとリポジトリ外へワークツリー作成になる。`branch = "issue-" + issueNumber` 由来なら数値保証だが、呼び出し経路によってはユーザ入力到達の恐れ。
- **提案**: branch 名は `refs/heads/` プレフィックス強制または `git check-ref-format` で検証。`worktreePath` は期待プレフィックス(`.pi-worktrees/` 等)内であることを assert。

### IC-073 `autopilot` の `appearTimeoutMs: 30_000` と `maxLaunchAttempts: 3` が固定 (環境依存)
- **カテゴリ**: 堅牢性 / 設定可能性
- **対象**: `mekann/utils/issue/orchestration/autopilot/lifecycle.ts:91-93, 99`
- **概要**: ワーク Pi ペーンの出現を 30s、最大 3 回リトライとハードコード。低速マシン、重いモデル初回ロード、kitty 起動遅延環境では 30s×3=90s で打ち切り、候補が「起動失敗」と誤判定されて ready-for-human に格下げされる恐れ。`initialIntervalMs` 等は設定スキーマにあるがこれらは無い。
- **提案**: `mekann.json` の issue 設定(`issueSettingsSchema`)に `autopilot.appearTimeoutMs` / `maxLaunchAttempts` を追加。タイムアウト時の詳細ログ。

### IC-074 `bulk-launch.ts` のエラー継続ポリシーがドキュメント依存 (テスト不十分の恐れ)
- **カテゴリ**: テスト / 堅牢性
- **対象**: `mekann/utils/issue/bulk-launch.ts:1-40` (コメント中の issue #68 方針)
- **概要**: 「1件失敗しても残りは継続」ポリシーが JSDoc コメントで詳細に述べられているが、ポリシーの核心(部分失敗時の skip リスト伝播)が実装とテストで保証されているか要確認。コメントが厚い割にテスト網羅度が不明。
- **提案**: 部分失敗/全成功/全失敗/ブロック済み除外の各シナリオを property-based または table-driven テストで網羅。コメント参照の issue #66/#67/#68 の現状(解決済み?)を確認。

---

## 第10バッチ (探索継続)

### IC-075 `context-tracker` HTTP サーバが内部エラーメッセージを応答に漏洩
- **カテゴリ**: セキュリティ (情報漏洩)
- **対象**: `mekann/context/context-tracker/server.ts:99`
- **概要**: `}).catch((error) => json(res, ..., 500, { error: "internal_error", message: String(error?.message ?? error) }));` で、内部エラーのメッセージ(スタックのヒント、ファイルパス、ユーザ名、環境変数値等)をそのまま JSON 応答に乗せる。localhost 専用とはいえ、他ローカルプロセスやブラウザの悪意あるページ(DNS rebinding 等)が `http://127.0.0.1:<port>` を叩いて内部情報を取得できる。CORS/Host ヘッダ検証も無し。
- **提案**: 本番では `message` を汎用文字列("internal_error")にし、詳細はサーバ側ログへ。Host ヘッダが `127.0.0.1`/`localhost` のみ許可、CORS `Access-Control-Allow-Origin` を厳格化。

### IC-076 `context-tracker` HTTP サーバが HTTP メソッドを検証しない (CSRF/意図せぬ副作用)
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/context/context-tracker/server.ts:75-98`
- **概要**: `/llm/context-decision` だけ `req.method === "POST"` をチェック。他の全エンドポイント(`/snapshot`/`/events`/`/tools`/`/llm/*` 等)は GET/POST/PUT/DELETE どんなメソッドでも同じ処理を実行する。読み取り専用とはいえ、ブラウザの `fetch`(simple request)や form POST でローカルサーバに意図せぬリクエストが届く。`recordContextDecision`(POST)は状態を変更するが、GET でも通ってしまうとキャッシュ/proxy で再生される恐れ。
- **提案**: ルーティング層でメソッド許可リストを定義(`GET /snapshot` 等を明示)。書き込みエンドポイントは POST のみ + Origin/CSRF トークン検証。

### IC-077 `context-tracker` が `readRequestBody` の 64KB 制限をすべての POST に適用
- **カテゴリ**: 堅牢性 / 制約
- **対象**: `mekann/context/context-tracker/server.ts:42-58` (`maxBytes = 64 * 1024`)
- **概要**: `readRequestBody(req, maxBytes = 64 * 1024)` で全 POST を 64KB 上限。`/llm/context-decision` 用途なら十分だが、将来的に大きいペイロード(テスト結果、プロファイルデータ)を受け付ける場合は上限が暗黙。413 エラーは IC-075 で応答に乗るが、呼び出し側(agent)には分かりにくい。
- **提案**: エンドポイント別の上限設定、または `Content-Length` で事前拒否して 413 を明示。ドキュメント化。

### IC-078 `dashboard github.ts` の GraphQL クエリが ISO 日付を文字列補間 (現状安全だが脆い)
- **カテゴリ**: セキュリティ / 保守性
- **対象**: `mekann/utils/dashboard/github.ts:24-33` (`dashboardQuery(from, to)`)
- **概要**: `contributionsCollection(from: "${from}", to: "${to}")` で `from`/`to` を文字列補間。現在は `new Date().toISOString()` 由来で安全(ISO 形式のみ)だが、将来的にユーザ入力や env 変数が入ると GraphQL インジェクション(`"` で抜けて任意クエリ)。`runGhGraphql` は `gh api graphql -f query=...` で送るので、`-f` がエスケープしてくれるとも限らない。
- **提案**: GraphQL variables(`query($from: DateTime!, $to: DateTime!)`)経由に変更。`runGhGraphql` に variables 渡しを追加。

### IC-079 `dashboard github.ts` が `GITHUB_TOKEN`/`GH_TOKEN` を平文で HTTP ヘッダ送信 (トークン取り扱い)
- **カテゴリ**: セキュリティ / 運用
- **対象**: `mekann/utils/dashboard/github.ts:65-72`
- **概要**: `githubToken(env)` で `GITHUB_TOKEN`/`GH_TOKEN` を取得し `authorization: Bearer ${token}` で GitHub API へ送信。通信自体は HTTPS なので経路上は安全だが、トークンが `fetch` の `headers` オブジェクトに乗り、エラーログ/デバッグ出力経由で漏れる可能性。`runTokenGraphql` の `catch` で `tokenError` を文字列化して `collectGitHubDashboard` の戻り値に含め、それが dashboard に表示される経路がある。
- **提案**: エラーメッセージからトークン由来文字列をマスク。トークンを `fetch` 呼び出し後に速やかにスコープ外へ。debug ログで headers を出さない。

### IC-080 `dashboard args.ts` が `--interactive` を即時エラーにする (レガシー処理が不明確)
- **カテゴリ**: UX / 整理
- **対象**: `mekann/utils/dashboard/args.ts:40-42`
- **概要**: `--interactive` を渡すと「Interactive mode has been removed」で即エラー。後方互換のためのレガシー拒否だが、`interactive` フィールド自体は `DashboardArgs` 型に残り(`env.MEKANN_DASHBOARD_INTERACTIVE === "1"` で true になりうる)、実装が中途半端。`--text` は `interactive = false` を強制するが、env で `interactive=1` の場合は結局 true になり挙動が混在。
- **提案**: `interactive` フィールドを完全削除、または env とフラグの優先順位を明文化。レガシー `--interactive` は警告のみで text モードへフォールバック。

### IC-081 `dashboard cleanup.ts` が kitty 検出を `TERM` 部分一致で判定 (誤検知)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/utils/dashboard/cleanup.ts:41`
- **概要**: `!process.env.KITTY_WINDOW_ID && !process.env.TERM?.toLowerCase().includes("kitty")` で kitty 環境を推定。`TERM=xterm-kitty` は正しいが、`TERM=st-kitty-256color` のような派生や、`kitty` を含む無関係ターミナル設定で誤って kitty 用エスケープ(`\x1b_Ga=d,d=A`)を送る。逆に `KITTY_WINDOW_ID` 未設定+`TERM` 変更環境ではクリーンアップが走らない。
- **提案**: `KITTY_WINDOW_ID` または `TERM` の完全一致(`xterm-kitty`)/厳密プレフィックスで判定。`TERM_PROGRAM=kitty` などの追加シグナルも活用。

---

## 第11バッチ (探索継続)

### IC-082 `voice-notify` が macOS 専用 `say` コマンドに依存 (他 OS で無言失敗)
- **カテゴリ**: ポータビリティ / UX
- **対象**: `mekann/utils/voice-notify/index.ts:36-42`
- **概要**: `execFile("say", [text], ...)` は macOS の `say` のみ。Linux(`espeak`/`spd-say`/`pico2wave`)や Windows(`powershell SAPI`/`msedge TTS`)ではコマンド不在で `ENOENT`、stderr に `[voice-notify] say failed:` を出すだけでユーザには何も伝わらない。CI(ubuntu)でも読み上げ不可。
- **提案**: プラットフォーム別バックエンド検出(`process.platform`)、フォールバック連鎖。バックエンド不在時は初回のみ `ui.notify` で案内。

### IC-083 `voice-notify` が `<voice>` タグ抽出を `speak()` の同期キューに貯める (大量通知で結合・切り捨ね)
- **カテゴリ**: 堅牢性 / UX
- **対象**: `mekann/utils/voice-notify/index.ts:73-91`
- **概要**: `voiceQueue.push(content)` でメッセージを貯め、`agent_end` で `voiceQueue.join("。")` して一括 `say`。複数 `<voice>` ブロックや長文が続くと 1 つの `say` 引数が OS のコマンドライン長制限(macOS では約 1MB、実用上はもっと短い)に達して失敗する。また `say` への巨大テキストは音声合成が異常に長くなる。
- **提案**: テキスト長の上限(`MAX_VOICE_CHARS`、例: 500)を設けて切り捭て、またはブロックごとに分割 `say`。`execFile` の引数長制限も考慮。

### IC-084 `model-optimizer overflow.ts` が `modelStub` を `as any` で合成 (型安全性)
- **カテゴリ**: 型安全性 / 設計
- **対象**: `mekann/core/model-optimizer/overflow.ts:67`
- **概要**: `const modelStub = { provider: state.provider!, id: state.modelId!, api: state.api } as any;` で、`state.provider!`/`state.modelId!` の非 null アサーションと `as any` が重なっている。`state.activeModule` が非 null でも `provider`/`modelId` が未設定のレース(state 更新と message_end の競合)でスタブが `{provider:undefined, ...}` になり、`module.detectOverflow` が未定義挙動。
- **提案**: stub 生成前に `provider`/`modelId` の存在チェック、欠落時は早期 return。stub を `OptimizerModel` 型で安全構築。

### IC-085 `model-optimizer overflowPatterns.ts` の検出パターンがわずか3件 (他プロバイダ抜け)
- **カテゴリ**: 堅牢性 / カバレッジ
- **対象**: `mekann/core/model-optimizer/overflowPatterns.ts:5-9`
- **概要**: `DEFAULT_OVERFLOW_PATTERNS` は `context_length_exceeded`/`maximum context length`/`exceeds the context window` のみ。コメントには「pi は 22 パターン持つ」とあるのに mekann 側は狭く、Anthropic(`prompt is too long`)、Google(`Request too large`/`content length`)、DeepSeek、ローカル LLM の各種メッセージが抜ける。結果としてプロバイダ最適化が発火せず、pi 本体のフォールバックに丸投げ。
- **提案**: プロバイダ別モジュール(deepseek/openai 配下)に検出パターンを集約し、デフォルトは包括的なセットに。pi の 22 パターンを参考に拡充。

### IC-086 `review-fixer issueContext.ts` が `issueJson: any` + `labels.map((l: any))` で型放棄
- **カテゴリ**: 型安全性
- **対象**: `mekann/autonomy/review-fixer/issueContext.ts:53-75`
- **概要**: `let issueJson: any;` で `gh issue view --json` の結果を受け、`issueJson.labels ?? []).map((l: any) => typeof l === "string" ? l : l.name)` でラベル抽出。`gh` の JSON スキーマ(`number`/`title`/`url`/`body`/`labels[].name`/`state`)は文書化されているのに `any` で受け、フィールド追加・型変更が無検知。
- **提案**: `type GhIssueJson = { number: number; title?: string; url?: string; body?: string; labels?: Array<string | { name?: string }>; state?: string }` を定義し parse。`issueJson.state !== "OPEN"` 等の比較も型安全に。

### IC-087 `review-fixer changedFiles.ts` の `git hash-object` バッチが改行含むパスで破綻
- **カテゴリ**: バグ (エッジケース)
- **対象**: `mekann/autonomy/review-fixer/changedFiles.ts:38-48`
- **概要**: `execFileSync("git", ["hash-object", ...files])` で全ファイルを1 fork でハッシュ化し、出力を `\n` で split して `files[i]` と対応付ける。ファイル名に改行が含まれる(レアだが `git status -z` で扱う必要があるケース)と、`files` の長さと `hashLines` の長長さが合わずズレる。`git status --porcelain`(非 `-z`)自体が改行名を壊すので、そもそも `parseDirtyFiles` の時点で破綻している可能性。
- **提案**: `git status -z` + `git hash-object --stdin-paths` で NUL 区切りに統一。改行含むパスのプロパティテスト追加。

### IC-088 `kitty/control.ts renderImage` の `spawnSync` が UI スレッドをブロック
- **カテゴリ**: パフォーマンス / UX
- **対象**: `mekann/utils/terminal/kitty/control.ts:411`
- **概要**: `spawnSync(this.kittenBin, ["icat", ...])` で同期的に画像描画。`kitten icat` が画像転送を終えるまで(数100ms〜秒)Node イベントループを止め、他の拡張処理(footer 更新、IPC)が遅延する。他の kitty 操作は `execFile`(非同期)なのにここだけ `spawnSync`。
- **提案**: `execFile`(非同期)に変更。`--place` のレイアウト計算後に await。描画失敗時のフォールバックも非同期で。

### IC-089 `patchApplicationPipeline` の `.husky` 特別扱いがハードコード (ポリシー不透明)
- **カテゴリ**: セキュリティ / 設計
- **対象**: `mekann/autonomy/subagent/patchApplicationPipeline.ts:62-64`
- **概要**: `isReviewOnlyPath(file)` が `file === ".husky" || file.startsWith(".husky/")` をハードコード。サブエージェントのパッチが `.husky/pre-commit` を触る場合を特別扱いしていると思われるが、なぜ `.husky` だけか(他の `.github/`/`scripts/`/`.circleci/` は?)ポリシーがコードから読めない。`isUnderDir` と混在して境界が曖昧。
- **提案**: 「review-only パス」の定義を設定 or ADR で明文化。`.husky` 以外の CI/CD/ Git フック類も含めるか判断。

### IC-090 `kitty/control.ts` の `kitty @ ls` タイムアウトが 2000ms 固定 (低速環境で空振り)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/utils/terminal/kitty/control.ts:310, 383`
- **概要**: `execFile(this.kittenBin, ["@", "ls"], { timeout: 2000 })` が2箇所。多数ウィンドウ、重い kitty、リモート X 転送では 2s でタイムアウトし、空配列に落ちて「ワーク Pi ペーン無し」と誤判定（autopilot の `hasActiveWorkPi` に直結）。呼び出し側はタイムアウトと「ペーン無し」を区別できない。
- **提案**: タイムアウトを設定可能に(env/setting)、タイムアウト時は「不明」状態を返して呼び出し側が再試行できるように。

---

## 第12バッチ (探索継続)

### IC-091 `validationRunner.run` の `npm run` が `--` で args を渡すが PATH 解決に依存
- **カテゴリ**: 堅牢性
- **対象**: `mekann/autonomy/subagent/validationRunner.ts:92-98`
- **概要**: `execFile("npm", ["run", cmd.script, "--", ...(cmd.args ?? [])], { cwd })` で `npm` を直接呼ぶ。`npm` が PATH に無い環境(サンドボックス、Docker、カスタム Node インストール)で `ENOENT`。`process.execPath`/`npm exec`/`npx` 経由の方が堅牢。また `npm run` は終了コード以外に `npm` 自体のオーバーヘッド(数百 ms)が毎回乗る。
- **提案**: `process.env.npm_execpath`/`npm` CLI パスを明示解決、または `node` + `package.json` の script コマンドを直接組み立て。サンドボックス環境での動作保証テスト。

### IC-092 `gitPatchAdapter.rollback` が部分適用状態を検出できない
- **カテゴリ**: データ整合性 / セーフティ
- **対象**: `mekann/autonomy/subagent/gitPatchAdapter.ts:30-32`
- **概要**: `rollback(ref)` = `git apply -R ref` のみ。パッチが途中まで適用された状態(一部ファイルは変更、一部は未変更)で `git apply -R` は**全ファイルがクリーンでないと失敗**し、部分適用が残ったまま。`patchApplicationPipeline` の catch は `rollbackOk = false` で `needs_review` にするが、残存変更の詳細がユーザに伝わらない。
- **提案**: `git checkout -- <touched paths>` / `git restore` によるファイル個別リカバリをフォールバック。`git status` で残存変更を取得し `details` に含める。

### IC-093 `codex-web-search stream.ts parseSse` が最終フレームを二重処理しうる
- **カテゴリ**: バグ (エッジケース)
- **対象**: `mekann/utils/codex-web-search/stream.ts:25-40`
- **概要**: ループ内で `\n\n` 区切りでフレームを切り出し、ループ後に `buffer += decoder.decode(); const event = parseSseFrame(buffer);` で残りを処理。もしストリームが `\n\n` で終わっていた場合、ループ内で最終フレームが処理済みで buffer は空だが、**空文字列の `parseSseFrame("")`** が呼ばれる(`dataLines.length === 0` で undefined を返すので実害は無いが、無駄)。逆に `\n\n` 無しで終わった場合は最終フレームが処理される。Edge: サーバが `data: x\n\n` を送り、Reader が `done` を返した直後に buffer が `""` ではなく `"\n"` 等を保持すると挙動が曖昧。
- **提案**: 最終処理前に `if (buffer.trim())` ガード。プロパティテストでランダムチャンク分割を網羅。

### IC-096 `ledger projection.ts summarizeSessionContextText` が `unknown` 入力を `clampInt` で握る
- **カテゴリ**: 堅牢性 / 型安全性
- **対象**: `mekann/context/ledger/projection.ts:94-100`
- **概要**: `maxBytes: unknown` を `clampInt(input.maxBytes, 4096, 512, 65536)` で数値化。文字列(`"8192"`)や無効値(`NaN`/`Infinity`/負数)を黙って範囲内に丸め、ユーザに「指定が無視された」が伝わらない。呼び出し側は tool params 経由で `unknown` を渡すため、型検証が実質 `clampInt` 一枚。
- **提案**: zod/ガードで明示検証、範囲外の場合は警告メッセージを返す。`clampInt` の境界(512/65536)も定数化。

### IC-097 `ledger projection.ts` の引数パースが正規表現 `--max-bytes (\d+)` のみ (柔軟性欠如)
- **カテゴリ**: UX / 堅牢性
- **対象**: `mekann/context/ledger/projection.ts:122,134` (`arg.match(/--max-bytes\s+(\d+)/)`)
- **概要**: `snapshot --max-bytes 8192 --write` 等の引数を正規表現で抽出。`--max-bytes=8192`(`=` 区切り)や `--max-bytes 8192`(複数スペース/TAB)に対応しない。`--write`/`--rebuild`/`--unbounded` は `arg.includes` で拾うが、順序や重複に依存。引数構文がコマンドごとに手書きで分散。
- **提案**: 共通のミニ引数パーサ(`parseFlags(arg)`)を導入し、`snapshot`/`restore`/`clear` 等で再利用。`=`/スペース両対応。

### IC-098 `ledger snapshot.ts` の `sortedSnapshotEvents` が都度全ソート (大規模ログで O(n log n) 反復)
- **カテゴリ**: パフォーマンス
- **対象**: `mekann/context/ledger/snapshot.ts:34-36, 50-58`
- **概要**: `computeSnapshotWatermark` が `sortedSnapshotEvents(events)` を呼び(全ソート)、さらに内部で `snapshotLastEventId` もまた `sortedSnapshotEvents` を呼ぶ(もう一回全ソート)。同じ関数内で 2 回 O(n log n) ソート。イベント数が 2000(MAX_EVENTS) になると無視できない。`buildSnapshot` 側でも優先度ソート等が走る。
- **提案**: `sortedSnapshotEvents` の結果を使い回す(引数で渡す、または一度だけ呼ぶ)。`lastEventId` は最大 `createdAt` を線形走査で取得すれば十分。

### IC-099 `ledger` の `writeLatestSnapshot` が retention で世代ファイルを削除 (IC-039 同様の破壊的操作)
- **カテゴリ**: セーフティ / データ損失
- **対象**: `mekann/context/ledger/snapshot-store.ts` (推定、MEKANN_CONTEXT_LEDGER_DEFAULTS.snapshotRetentionMaxFiles=50 適用経路)
- **概要**: `--write` でタイムスタンプ付きスナップショットを生成し、`snapshotRetentionMaxFiles`(50) を超えると古いものを削除。`latest.xml` は保護されるが、誤って 50 を超える連続 `--write` を走らせると初期のスナップショットが失われる。`config.ts` に「Issue #76 / C-018」とコメントがあるが、retention 失敗時のログ経路が不明。
- **提案**: retention 削除を dry-run/確認付きにするオプション、または削除ファイルを `.trash/` に退避。retention 実行の記録を context ledger へ。

---

## 第13バッチ (探索継続)

### IC-102 `shellArgs` が shell-mode terminal アクションで `-lc` を使う (セキュリティと pi-session 修正の精神の不整合)
- **カテゴリ**: セキュリティ / 一貫性
- **対象**: `mekann/utils/terminal/actions.ts:14-25`
- **概要**: `terminal-shortcuts` の `mode: "shell"` アクションは `shellArgs` 経由で `[shell, "-lc", command]` を構築し `spawnSync` に渡す。`command` は `MEKANN_TERMINAL_SHORTCUTS` env 由来(IC-068 でパース問題有)でユーザ設定可能。CHANGELOG の直近修正(`pi-session.ts` で sh 文字列結合を廃止し argv 直渡しに)と対照的に、shortcuts 経路はまだシェル文字列実行。env に細工されたコマンドがそのままシェルで走る。
- **提案**: shortcuts の `mode: "shell"` を非推奨とし `mode: "argv"` を推奨。`shell` モードを使う場合はコマンドをトークン分解して argv 化、または明示的な危険コマンド検出。

### IC-105 `terminal actions.ts` が `process.env.SHELL || "/bin/sh"` でログインシェルを信用
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/utils/terminal/actions.ts:10` と `action-runner.ts:93`
- **概要**: `const shell = process.env.SHELL || "/bin/sh"` でユーザの SHELL env をそのまま使用。SHELL が悪意ある/破損パス(例: `SHELL=/tmp/malware`)を指す場合、全 shell-mode アクションがそれを起動。pi が信頼するシェル(`/bin/bash`/`/bin/zsh` 等のホワイトリスト)を使うべき。
- **提案**: SHELL 値を `/bin/` や `/usr/bin/` プレフィックス等でホワイトリスト検証。不正値はデフォルトへフォールバック。

### IC-106 subagent `agentSession.ts clampTimeout` の max がハードコード 600_000
- **カテゴリ**: 設計 / 一貫性
- **対象**: `mekann/autonomy/subagent/agentSession.ts:10`
- **概要**: `clampTimeout(value, min, max = 600_000)` の max が固定 10 分。`MEKANN_SUBAGENT_DEFAULTS.maxWaitTimeoutMs = 600_000` と同じ値だが、`clampTimeout` は `MEKANN_SUBAGENT_DEFAULTS` を参照せず直接数値。defaults を変更しても clamp は追従しない。
- **提案**: `max = MEKANN_SUBAGENT_DEFAULTS.maxWaitTimeoutMs` を default 引数で参照。設定変更が clamp に伝播するよう統一。

### IC-107 `contextFork.ts` の FORK_CONTEXT_MAX_CHARS (12000) がハードコード
- **カテゴリ**: 設計 / チューニング性
- **対象**: `mekann/autonomy/subagent/contextFork.ts:12-13`
- **概要**: `FORK_CONTEXT_MAX_CHARS = 12_000` と `FORK_CONTEXT_MESSAGE_MAX_CHARS = 2_000` が定数。モデルのコンテキスト窓(128k/200k 世代)やコストポリシーに応じて調整したいが、設定経由で変更不可。大規模コンテキストモデルでは 12k は保守的すぎ、小規模モデルでは大きすぎる。
- **提案**: `mekann.json` の subagent 設定に `forkContextMaxChars` を追加。モデル別プロファイルとの連携(IC-064 と同根)。

### IC-108 `flags.ts` の `subagent-display` デフォルトが `external-split` (非 kitty 環境で問題)
- **カテゴリ**: UX / 堅牢性
- **対象**: `mekann/autonomy/subagent/flags.ts:35-38`
- **概要**: `default: MEKANN_SUBAGENT_DEFAULTS.display`(`"external-split"`)。説明文に「outside kitty は none」とあるが、デフォルト値自体は `external-split` 固定で、非 kitty 環境(tmux/Alacritty/Windows Terminal 等)で起動すると外部 split 試行が失敗するか意図しない挙動になる。実行時に kitty 検出して `none` に切り替えるロジックが別途要るはずだが、flag のデフォルト表記は誤解を招く。
- **提案**: flag の default を実行時解決を示す `"auto"` にするか、説明で「kitty 時のみ external-split、それ以外は none に自動切替」と明記。

---

## 第14バッチ (探索継続)

### IC-109 `kittyControl.buildChildScript` が sh 文字列結合で subagent 起動 (pi-session 修正と同根の設計負債)
- **カテゴリ**: セキュリティ / 一貫性 (CHANGELOG の直近修正と同根)
- **対象**: `mekann/autonomy/subagent/kittyControl.ts:42-84` (`buildChildScript`)
- **概要**: 直近の CHANGELOG で `pi-session.ts` の `sh -lc "..."` JSON.stringify 結合が **バッククォート/シェル置換発火で pi が起動前異常終了**する致命バグとして修正され、argv 直渡しへ移行された。しかし `kittyControl.ts` の `buildChildScript` は**依然として** `sh -lc <script>` に shellQuote(`'...'`)で結合したスクリプトを渡している(subagent 子 Pi 起動経路)。`shellQuote` は POSIX 単一引用符で内容をリテラル化するので**JSON.stringify 版より安全**だが、`initialMessage`/`modelId`/`thinkingLevel`/`extensionPath` に単一引用符を含む場合の `'"'"'` エスケープは複雑でバグりやすい。またスクリプト全体を `; ` で結合し、`export PI_SUBAGENT_INITIAL_MESSAGE=<quoted>` 等を埋め込む設計自体が pi-session が放棄したのと同じ「シェル文字列で状態構築」パターン。
- **根拠**: `argv: ["sh", "-lc", script]`(105, 152行目)、`script = [...].join("; ")`、`shellQuote` 使用。
- **提案**: pi-session.ts と同様に argv 配列で `pi` を直接起動する設計へ統合。env 変数は `--env`/`--copy-env` で、`--append-system-prompt` 等は argv トークンで。subagent 子 Pi と Issue Work Pi で起動経路を一本化。

### IC-110 `kittyControl.launchPiWindow/Split` が `--allow-remote-control` を常に付与 (攻撃面拡大)
- **カテゴリ**: セキュリティ
- **対象**: `mekann/autonomy/subagent/kittyControl.ts:116, 158`
- **概要**: `kitten @ launch` に `--allow-remote-control` を常に指定。これは起動した Pi ウィンドウが `kitty @` リモートコントロールAPIを使えるようにするもので、分離されたはずの subagent 子 Pi が親ウィンドウや他ペーンを操作可能になる。`--copy-env` と組み合わさると子 Pi が親の env/token を引き継ぎつつ他ペーン制御もできる。ADR-0021(pane 集約)の都合上必要だが、権限スコープが広い。
- **提案**: 子 Pi が本当に remote-control を必要とする操作だけに絞る(自身の終了等)。kitty の `--instance-group` 分離や `--allow-remote-control=socket` 等でスコープ制限可能か検討。

### IC-111 `kittyControl.buildChildScript` の `PATH` が `process.execPath` のディレクトリで上書き (他 PATH エントリ消失リスク)
- **カテゴリ**: 堅牢性
- **対象**: `mekann/autonomy/subagent/kittyControl.ts:73`
- **概要**: ``export PATH=${shellQuote(path.dirname(process.execPath))}:$PATH`` で、現在の node のあるディレクトリを PATH の先頭に追加。`$PATH` を後ろに残すので「消失」ではないが、親 Pi と異なる node バージョンのディレクトリを先頭に置くことで、子 Pi が想定と違う `node`/`pi`/`npm` を拾う可能性。`--copy-env` で既に親 PATH は継承されているはずで、二重設定。
- **提案**: PATH 操作の意図(「親と同じ node を子に使わせる」)をコメント明示、または `--copy-env` に任せて明示設定を削除。

### IC-112 `kittyControl` が `exec '${SHELL:-sh}' -l` で終了後シェルを起動 (セキュリティ/意図不明)
- **カテゴリ**: 堅牢性 / セキュリティ
- **対象**: `mekann/autonomy/subagent/kittyControl.ts:81`
- **概要**: スクリプト末尾 `exec "${SHELL:-sh}" -l` で、子 Pi 終了後に**ログインシェルを exec**。pi が exit してもウィンドウが閉じず、ユーザがシェルで残留できる親切設計だが、(a) IC-105 の SHELL 信頼問題、(b) 子 Pi が異常終了した場合でもシェルが残りリソース/セキュリティ状態が不明瞭、(c) 自動テストや autopilot で「終了したはずのペーン」がシェルとして生き残る。
- **提案**: デバッグ時のみシェル残留(`MEKANN_SUBAGENT_DEBUG=1` 等で制御)。通常は pi exit でウィンドウを閉じるか、明示的な保持フラグ。

### IC-113 `subagent prepareLaunchFiles` が initialMessage を一時ファイルに書き出し (クリーンアップ不明確)
- **カテゴリ**: リソース管理 / セキュリティ
- **対象**: `mekann/autonomy/subagent/kittyControl.ts:90-103`
- **概要**: `initialMessage` を `os.tmpdir()/pi-subagent-<agentId>.prompt.md` または `logDir` 配下に書き出し、`@<path>` で子 Pi に読ませる。tmpdir 版は agentId ベースの固定名で、再利用時に前の内容が残る恐れ。また書き出したファイルのクリーンアップ(子 Pi 読込後の削除)がこの関数には無く、`/tmp` にプロンプト(機密情報含む可能性)が蓄積する。
- **提案**: `flag: "w"` で上書き保証、子 Pi 起動後のクリーンアップフック、または `mkdtemp` で一意ディレクトリ。機密プロンプトの tmp 残留を避ける。

### IC-114 ~~subagent contextLedger session_start 再読込漏れ~~ (訂正: 取り下げ)
- 調査メモ: `mekann/context/ledger/index.ts:151-167` で `session_start` ハンドラが `postCompactionRestoreEnabled = featureBooleanValue(...)` を**再読み込み**していた。コメント通りに動作しており、設定変更は次セッションで反映される。誤報として取り下げ。
- 副産物の軽微候補: `session_start` ハンドラの引数が `(event: any, ctx: any)` で型放棄。pi の ExtensionContext 型が使えるはずで、IC-028/IC-046 と同根。優先度 低。

---

## 第15バッチ (探索継続)

### IC-115 🔴 `macSeatbelt.escapeSbplString` が改行/括弧をエスケープせず SBPL インジェクション可能 (セキュリティ)
- **カテゴリ**: セキュリティ (サンドボックスバイパス) — 🔴高
- **対象**: `mekann/safety/sandbox/macSeatbelt.ts:33-35` (`escapeSbplString`)
- **概要**: `escapeSbplString` は `\` と `"` のみエスケープ。SBPL(scheme 風言語)の文字列リテラル内に**改行(`\n`/`\r`)** を含むパスが渡ると、改行でリテラルが終了し、続く文字列が**新しい SBPL フォームとして解釈**される。例えば `pathLiteral("/safe\n(allow network-outbound)")` は `(literal "/safe\n(allow network-outbound)")` となり、改行後に `(allow network-outbound)` が独立したルールとして走る。
- **到達可能性**: `workspaceRoots`/`writableRoots` は mekann.json 設定から取り込まれ、`resolveSafeRealPath`(permissions.ts:185) は `realpath` 失敗時に `resolve(p)` へフォールバックし**改行を除去しない**。スキーマ検証(settingsSchema.ts)に改行/制御文字拒否が見当たらない。設定ファイル経由で悪意ある/破損パスが注入されると、read_only モードの書き込み拒否や network 拒否を**サンドボックス設定ファイルから迂回**できる恐れ。
- **検証**: `node` で `pathLiteral('/safe\n(extra)')` が `(literal "/safe\n(extra)")` を返し、改行が残ることを確認。
- **提案**: `escapeSbplString` を強化し、改行/CR/タブ/その他制御文字(`< 0x20`)を `\\n` 等の SBPL 安全表現にエスケープ。パス入力時のバリデーション(制御文字拒否)を `validateWorkspaceRoot`/`resolveSafeRealPath` に追加。ファズテストでランダムパスが SBPL を壊さないか検証。

### IC-116 `macSeatbelt` の `(allow process-exec)` がサンドボックス内プロセスに無制限 (子プロセス権限)
- **カテゴリ**: セキュリティ / 設計
- **対象**: `mekann/safety/sandbox/macSeatbelt.ts:189` (`sbplBaseRules`)
- **概要**: `(allow process-exec)` にパス制限が無く、サンドボックス内の bash が `/bin/bash` から任意の実行ファイル(許可された read パス配下のもの)を exec 可能。意図「サンドボックス内でコマンド実行」は理解できるが、`/usr/bin` 配下の全バイナリ(curl/rm/ssh 等)が実行可能で、ネットワークだけ deny しても `curl file://` やローカル権限昇格バイナリが使える。realpath 制限や実行可能バイナリ許可リストが無い。
- **提案**: `process-exec` を `(subpath "/usr/bin")` 等でスコープ、または実行バイナリを許可リスト化。ワークスペース配下の実行ファイル(node_modules/.bin 等)は個別許可。

### IC-117 `resolveSafeRealPath` が realpath 失敗時に `resolve` へ無検証フォールバック (シンボリックリンク脱出)
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/safety/sandbox/permissions.ts:185-190`
- **概要**: `try { return await realpath(resolve(p)); } catch { return resolve(p); }`。`realpath` が失敗する(存在しない、権限不足)と `resolve(p)` の文字列結合へ。存在しないパスへの将来の symlink 作成攻撃(TOCTOU)や、`realpath` が EACCES で失敗した悪意パスがそのまま SBPL に埋め込まれる。IC-103 と同根だが sandbox 設定経路。
- **提案**: realpath 失敗時はエラーにするか、最低限「制御文字/`..`/絶対パス脱出」を検証してから resolve。`O_NOFOLLOW` 等で symlink 経由の脱出を防止。

### IC-118 ~~`protectedDirsSbplAlternation` regex エスケープ漏れ~~ (訂正: 取り下げ)
- 調査メモ: `mekann/safety/sandbox/permissions.ts:133-135` を再確認したところ、`PROTECTED_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))` で**regex メタ文字を正しくエスケープ**していた。誤報として取り下げ。
- 副産物の軽微候補: `PROTECTED_DIRS` がハードコード(`[".git", ".pi", ".codex", ".agents"]`)で、ユーザ/プロジェクト固有の保護ディレクトリ(例: `.env`, `.vault`, `secrets/`)を追加できない。`safeRepoRelativePath`/SBPL regex の両方に効く単一設定があると便利。優先度 低。

### IC-119 `subagentCostPolicy.evaluateSpawnCost` の「小さいタスク」検出が英語のみ (IC-060 同根)
- **カテゴリ**: 国際化 / 堅牢性
- **対象**: `mekann/autonomy/subagent/subagentCostPolicy.ts:60` (`/\b(simple|quick|small|...)\b/`)
- **概要**: タスク文面から「simple/quick/small/one-file/single-file/just/only」を検出してコスト警告を出すが、`\b` + 英語のみ。日本語の「簡単/小さい/少し/だけ/1ファイル」が抜け、日本語ユーザにはコスト助言が機能しない。IC-060/IC-094/IC-095 と同じ日本語正規表現問題が点在。
- **提案**: 日本語キーワード(簡単/小さい/少し/軽い/だけ/のみ)を追加。または「タスク文字数 < N」等の言語非依存ヒューリスティック併用。

### IC-120 `patchProposalPolicy.defaultWriteScopeMatcher` が文字列プレフィックス一致のみ (ディレクトリ境界の罠)
- **カテゴリ**: セキュリティ / バグ (エッジケース)
- **対象**: `mekann/autonomy/subagent/patchProposalPolicy.ts:153`
- **概要**: `writeScope.some((scope) => file === scope.replace(/\/$/, "") || file.startsWith(scope.replace(/\/$/, "") + "/"))`。`writeScope=["foo"]` のとき `foo` と `foo/...` は許可するが、`foobar`/`foo.txt` は `startsWith("foo")` で true になってしまう…と見せかけて、実際は `+ "/"` なので `foo.txt` は `startsWith("foo/")` false。しかし大文字小文字(Case-sensitive FS vs insensitive)、trailing slash の有無、symlink 経由の同名ファイル等で境界が曖昧。
- **提案**: `path.relative` で `..` で始まらないことを検証する堅牢な matcher へ。Windows 区切り文字対応。プロパティテストで `foo` vs `foobar`/`foo.txt`/`Foo/`(case) を網羅。

---

## 第16バッチ (探索継続)

### IC-121 `output-accumulator RollingTextBuffer.trimTail` のバイト推定が CJK で大幅に超過
- **カテゴリ**: バグ (計算精度) / リソース管理
- **対象**: `mekann/utils/output-accumulator/index.ts:60-87`
- **概要**: `trimTail` が `targetBytes = tailText.length - Math.floor(maxBytes * 0.8)` で「文字数 = バイト数」と想定してカット位置を推定(コメント「UTF-8 safe: chars <= bytes」)。これは ASCII では成り立つが、**CJK/絵文字(1文字=3〜4バイト)では大きく破綻**する。例: 2000文字の「あ」(6000バイト)、maxBytes=1000 のとき、`targetBytes = 2000-800 = 1200`、`cutCharPos=1200`、`slice(1200)` で 800文字 = **2400バイト**保持(maxBytes の 2.4 倍)。行境界スナップが無いとさらに膨張。
- **検証**: `node` で純 CJK 2000文字・maxBytes=1000 をシミュレートし、`kept bytes: 2400 max: 1000` を確認。
- **テストの抜け**: `index.test.ts:55-72` は「文字化けしないこと」は検証するが、「`maxBytes` を超過しないこと」を**検証しない**。バグがテストを素通り。
- **提案**: バイト正確なカット(`truncate-utils` の `findByteBoundaryFromEnd` の修正版 IC-053 と統合)、または `Buffer.byteLength` で二分探索。テストに「`expect(byteLength(result)) <= maxBytes * K`」のプロパティ追加。

### IC-123 `model-optimizer metrics` の `pendingAssistantStart` が module-level mutable (並行リスク)
- **カテゴリ**: 堅牢性 / 並行性
- **対象**: `mekann/core/model-optimizer/metrics.ts:20` (`let pendingAssistantStart`)
- **概要**: `registerMetrics` のクロージャ内で `let pendingAssistantStart: number | undefined`。`message_start`/`message_end` が同じ pi プロセスで連続発火する分には機能するが、複数セッション(model-optimizer がグローバル拡張)で状態が共有され、セッションAの `message_start` がセッションBの `message_end` で消費される可能性。pi がシングルセッション前提なら問題ないが、subagent 子 Pi が同じ拡張を読み込む場合は要注意。
- **提案**: sessionId ごとの Map で保留開始時刻を管理、または `event.message.id` でペアリング。

### IC-124 `model-optimizer` の `state.provider!`/`modelId!` 非 null アサーション多用
- **カテゴリ**: 型安全性 / 堅牢性
- **対象**: `mekann/core/model-optimizer/{index.ts:59,89, activeProfile.ts:53-54, overflow.ts:67, compaction.ts:72}` など多数
- **概要**: `state.provider!`/`state.modelId!` の `!` が散在。`state.activeModule` が非 null でも `provider`/`modelId` は別フィールドで、設定更新とモデル選択のレースで未設定のまま stub 構築に進む恐れ(IC-084 と同根)。`!` は「ここでは必ず非 null」という開発者宣言だが、不変条件がコードから読めない。
- **提案**: `applyModel` で `provider`/`modelId`/`api` を常にセットで更新する不変条件を型で表現(タプル/オブジェクト)。stub 生成時に `!` を使わず検証。

### IC-125 `model-optimizer command.ts` のステータス表示がメモリ上 metrics のみ (永続化無し)
- **カテゴリ**: 機能 / UX
- **対象**: `mekann/core/model-optimizer/command.ts` (`showStats`)
- **概要**: `/model-optimizer stats` が `state.metrics`(in-memory, セッションローカル)のみ表示。セッション終了で消失し、履歴比較や長期トレンドが見えない。cache-friendly-prompt が `.pi-cache-friendly/` に永続化するのと対照的。
- **提案**: metrics を context ledger か専用 JSONL に永続化。`/model-optimizer stats --session <id>` で過去セッション比較。

### IC-126 `model-optimizer metrics` の input tokens 計算が `input + cacheRead` を合算 (二重カウントリスク)
- **カテゴリ**: バグ (計算精度) 要確認
- **対象**: `mekann/core/model-optimizer/metrics.ts:50` (`const inputTokens = (usage?.input ?? 0) + (usage?.cacheRead ?? 0);`)
- **概要**: `inputTokens = usage.input + usage.cacheRead`。プロバイダによって `input` が「cacheRead 含む全体」「cacheRead 除く新規のみ」の両方の定義があり、含む定義だと cacheRead を二重カウント。OpenAI の `prompt_tokens`(全体)と `prompt_tokens_details.cached_tokens`(内訳)の関係を確認要。結果としてトークン統計が実際より大きく表示される恐れ。
- **提案**: プロバイダ別の usage 仕様(OpenAI/Anthropic/DeepSeek)を整理し、モデル別に正確な計算。テストで `usage.input` が cached を含む/含まない両ケースを網羅。

---

## 第17バッチ (探索継続)

### IC-127 `prompt-core estimateTokens` が `length/4` で CJK を大幅に過小評価
- **カテゴリ**: バグ (計算精度) / 国際化
- **対象**: `mekann/core/prompt-core/canonicalize.ts:39` (`estimateTokens`)
- **概要**: `Math.ceil(text.length / 4)` は英語の「約4文字=1トークン」経験則。CJK(日本語/中国語/韓国語)では**1文字=1〜2トークン**が実態で、`estimateTokens` は CJK を**4〜8倍過小評価**する。この値は `stablePrefixTokenEstimate`/`providerPrefixTokenEstimate`/`totalPromptTokenEstimate`(request-snapshot.ts:397,402,409,485,557)や `inspect.ts:76` の「SHORT_STABLE_PREFIX 警告(1024 token 閾値)」に伝播。日本語メインのプロジェクト(CONTEXT.md の「Japanese interaction policy」)で、cache 効率警告が全く発火せず、最適化機会が見逃される。
- **検証**: `node` で `'あ'.repeat(100)` → 25 token 推定(実態 100-200)。
- **提案**: 文字種別の重み付け(ASCII=1/4, CJK/絵文字=1)で推定、またはプロバイダ報告の `inputTotalTokens`(actual usage)があればそれで補正。CHANGELOG にも「`totalPromptTokenEstimate` は実 input tokens でない」と明記されているが、CJK バイアスには未対応。

### IC-128 `inspect.ts` の `volatileValuePatterns` が `/Users/` `/tmp/` パスで Mac 専用 (他 OS 抜け)
- **カテゴリ**: 堅牢性 / 国際化
- **対象**: `mekann/core/prompt-core/inspect.ts:25-26`
- **概要**: `/\/Users\/[^\s)]+/` と `/\/tmp\/[^\s)]+/` で macOS/Linux の典型的パスを volatile として検出。Windows パス(`C:\\Users\\...`/`%USERPROFILE%`)や WSL(`/mnt/c/`)、その他 Unix variant(`/home/`)が抜ける。結果として Windows ユーザのプロンプトで volatile なパスが stable prefix に残り、provider cache が効かなくても警告が出ない。
- **提案**: `/^(?:[A-Z]:\\\\|\/|(?:\/Users\/|\/home\/|\/tmp\/|\/mnt\/|[A-Z]:\\\\Users\\\\))/` のように包括的パス検出、または OS別パターン。

### IC-129 `inspect.ts containsVolatileSignal` の volatile 検出が英語キーワードのみ
- **カテゴリ**: 国際化
- **対象**: `mekann/core/prompt-core/inspect.ts:6-21, 22-34`
- **概要**: `volatileWarningTerms`(`current time/date`, `now()`, `Date(` 等)と `volatileValuePatterns`(`request_id`/`session_id` 等)が英語中心。日本語の「現在時刻」「現在日時」「最新の検索結果」「ツール結果」等の volatile 表現が抜け、日本語プロンプトの volatile 検出が不完全。IC-060/IC-094/IC-095/IC-119/IC-127 と同じ「英語バイアスの正規表現」問題の集大成。
- **提案**: 日本語/中国語/韓国語の volatile 語彙を追加。または「値の形(日付フォーマット/UUID/パス)」で検出する言語非依存アプローチへ段階移行。

### IC-130 `prompt-core canonicalizeText` が行末空白削除 + 3連改行圧縮 (意図せぬ差分発生)
- **カテゴリ**: 堅牢性 / 設計
- **対象**: `mekann/core/prompt-core/canonicalize.ts:3-5`
- **概要**: `canonicalizeText` は「行末 `[ \t]+` 削除」「`\n{3,}` → `\n\n` 圧縮」「trim」を適用。cache prefix の安定化が目的だが、ユーザが意図的に入れたインデント(Swift/Python の有意な行末)や、コードブロック内の複数空行(Markdown の段落区切り)が書き換えられ、プロバイダに送る内容が**ユーザ入力と一致しない**。ハッシュ計算用なら良いが、`hashFragment` が `content: canonicalizeText(...)` をハッシュし、表示用とは別物になる。
- **提案**: canonical 化の対象範囲(コードブロック内は保持等)を整理。ハッシュ用と表示用の分離、またはドキュメントで挙動明示。

### IC-131 `snapshot-registry` の `MAX_RUN_STATES=128` 等がハードコード (大規模で eviction)
- **カテゴリ**: 堅牢性 / チューニング性
- **対象**: `mekann/core/cache-friendly-prompt/snapshot-registry.ts:23-25`
- **概要**: `MAX_RUN_STATES=128`/`MAX_PROVIDER_MODEL_QUEUE=32`/`MAX_ACTUAL_USAGE_KEYS=512` が固定。多セッション・多プロバイダ環境(autopilot の並列 issue pi 等)でこれら上限に達し、FIFO eviction で必要なスナップショットが消える。メトリクス相関(actual usage ↔ request log)が切れると cache ヒット率計算が不正確。
- **提案**: 設定経由(mekann.json)で調整可能に。eviction 発生時のメトリクス/ログ。

### IC-132 `request-correlation.contextCwd/modelProvider/modelId` が `event: any, ctx: any` (型放棄)
- **カテゴリ**: 型安全性
- **対象**: `mekann/core/cache-friendly-prompt/request-correlation.ts:43-55`
- **概要**: `contextCwd(event: any, ctx: any)` 等、相関ロジックの核が `any` で受けて `event?.systemPromptOptions?.cwd ?? ctx?.cwd ?? process.cwd()` のように深ドットアクセス。pi SDK がフィールド名を変えると無言で `process.cwd()` フォールバックに落ち、相関が壊れる。IC-028/IC-046 と同根だが、相関精度は cache 分析の根幹。
- **提案**: pi の event/ctx 型を取り込み、`any` を段階廃止。フォールバック発生時に warning log。

### IC-133 `prompt-core hash.ts hashFragment` の `tokenEstimate` が `length/4` (IC-127 と同根)
- **カテゴリ**: バグ (計算精度)
- **対象**: `mekann/core/prompt-core/hash.ts:7` (`tokenEstimate: Math.ceil(fragment.content.length / 4)`)
- **概要**: フラグメントの `tokenEstimate` が `length/4`。IC-127 と同じ CJK 過小評価で、`fragment.chars`/`tokenEstimate` が dashboard の「Fragments」表(cacheableContextTable)等に表示され、ユーザが誤ったサイズ認識を持つ。
- **提案**: IC-127 の改善を `hashFragment` にも適用。`tokenEstimate` を `estimateTokens` 経由で統一。

---

## 第18バッチ (探索継続)

### IC-135 `output-gate search.ts capText` の UTF-8 末端処理が不完全
- **カテゴリ**: バグ (エッジケース) / 国際化
- **対象**: `mekann/context/output-gate/search.ts:33-36`
- **概要**: `Buffer.from(text,"utf-8").subarray(0,maxBytes).toString("utf-8").replace(/�$/u,"")` で、バイト途中切断による `U+FFFD` を**末尾1文字だけ**除去。理論上 1 箇所しか発生しないので実害は限定的だが、(a) `U+FFFD` 以外のcombined surrogate 等の処理が無い、(b) `toString("utf-8")` 自体が不正シーケンスを `U+FFFD` に置換するので、マルチバイト境界ギリギリでは表示が崩れる、(c) `[output-gate search results truncated]` の改行が無く前の行に繋がる。
- **検証**: `node` で `'あ'.repeat(10)` を 5 バイトカット → `あ\n[truncated]` となることを確認(1文字だけ残り奇妙)。
- **提案**: `truncate-utils` の byte-safe カット(IC-053/IC-121)に統合。改行を前置。

### IC-136 `output-gate controller` の context-ledger 記録がベストエフォート握り潰し
- **カテゴリ**: デバッグ性 / データ整合性
- **対象**: `mekann/context/output-gate/controller.ts:185-190`
- **概要**: `try { await this.recorder.recordToolOutputArtifact(...); } catch { /* Best-effort: ledger recording must not break output-gate. */ }`。output-gate のアーティファクト生成は成功するが、context ledger への記録(証跡・検索用)が失敗しても無言。結果として「output-gate に保存したが ledger から見えない」アーティファクトが発生しうる。IC-007/IC-016/IC-037 と同じ握り潰しパターンの別実例。
- **提案**: 失敗をメトリクス/ログへ。`details` に `ledgerRecorded: false` を伝える選択肢。

### IC-137 `KittyTerminalAdapter.launch` の `catch { return { ok: false, reason: "failed" } }` が原因を消失
- **カテゴリ**: デバッグ性
- **対象**: `mekann/utils/terminal/kitty/adapter.ts:50-52`
- **概要**: `try { ... } catch { return { ok: false, reason: "failed" }; }` で、kitty 起動失敗の**根本原因**(`kitten @ launch` の終了コード、stderr、env 不在等)を捨てる。`renderImage` も `catch { /* cosmetic */ }`。呼び出し側(subagent/review-fixer/issueautopilot)は「failed」しか見えず、デバッグに回数を重ねる。
- **提案**: `reason` にエラーメッセージを含める、またはログ出力。`TerminalLaunchResult` 型に `error?: string` を追加。

### IC-138 `terminal actions.ts terminalActionArgv` が shell-mode で SHELL env を信頼 (IC-105 と同根)
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/utils/terminal/actions.ts:8-12`
- **概要**: `terminalActionArgv` は shell-mode のとき `process.env.SHELL || "/bin/sh"` でシェルを決定し `[shell, ...shellArgs(shell, command)]` を返す。IC-105 と同じく SHELL env を無検証で信頼。`action-runner.ts:93` も同様。`terminal-shortcuts` の shell-mode アクションがこの argv を `spawnSync` に渡す。
- **提案**: IC-105 の SHELL ホワイトリスト検証を `terminalActionArgv`/`action-runner` にも適用。

### IC-139 `terminal index.ts` が 5 行で他モジュールへの re-export のみ (整理)
- **カテゴリ**: 整理
- **対象**: `mekann/utils/terminal/index.ts` (5 行)
- **概要**: `index.ts` が薄い re-export のみ。barrel ファイルとして機能するが、依存関係追跡時に「どこで実装されているか」を辿りにくい。`actions.ts`(24行)や `pi-session.ts`(143行)等と混在。
- **提案**: 現状維持でも良いが、`README.md` でモジュール構成を明示。または `actions.ts` を `index.ts` に統合。

### IC-140 `output-gate saveArtifact` の `appendFile` が非アトミック (IC-017/IC-036 と同根)
- **カテゴリ**: データ整合性 / 並行性
- **対象**: `mekann/context/output-gate/store.ts:232` (`await fsp.appendFile(manifestPath, line)`)
- **概要**: manifest.jsonl への追記が `appendFile` のみでロック無し。複数 pi プロセス(または subagent 子 pi)が同時にアーティファクト保存すると、manifest 行が混線し、`readManifest` の `JSON.parse` が壊れた行をスキップ(`store.ts:271` の `catch { /* skip corrupt jsonl */ }`)。結果としてアーティファクトは存在するのに manifest に載らず、検索(`searchToolOutputs`)で見つからない。IC-017（ledger）と同じ「並列書き込みの行混線」の実例。
- **提案**: 共通のアトミック追記ヘルパ（ロック + rename）を `output-gate`/`ledger` の2経路に適用。CONTEXT.md の「Context ledger」「Output gate」両用語の実装が一致するよう。

---

## 第19バッチ (探索継続)

### IC-141 `detectTerminalEmulatorAdapters` が kitty 専用で他ターミナル非対応
- **カテゴリ**: 機能 / ポータビリティ
- **対象**: `mekann/utils/terminal/launch.ts:3-5`
- **概要**: `return [new KittyTerminalAdapter()].filter(a => a.isAvailable())` で kitty アダプタのみ。CONTEXT.md に「Terminal emulator adapter」「Kitty-first terminal integration」の用語がある通り kitty 中心だが、`TerminalEmulatorAdapter` インターフェースは抽象化されているのに実装が1つ。tmux/wezterm/iTerm2ユーザは `subagent-display`/dashboard 画像描画が機能しない。
- **提案**: tmux(画像は未対応だが split は可能)・wezterm(画像・split 対応)アダプタを追加。`isAvailable` で適切検出。非 kitty 環境でのフォールバック挙動を ADR-0012 に追記。

### IC-142 `startup-clear.ts` が `[2J[H` を stdout に直接 (scrollback 消失)
- **カテゴリ**: UX / 副作用
- **対象**: `mekann/utils/terminal/startup-clear.ts:11`
- **概要**: `process.stdout.write("\x1b[2J\x1b[H")` で画面クリア + ホーム移動。`\x1b[2J` は**scrollback も含めて消去**する端末エミュレータが多い(kitty/iTerm2 は消去、tmux は設定依存)。起動直前のユーザ出力(直前のセッション履歴、エラーログ)が消失。`clearOnStartup` で無効化可能だがデフォルト有効。
- **提案**: scrollback を保持する `\x1b[H\x1b[2J`(カーソル以下のみ)や `\x1b[3J`(scrollback 含む、明示的)の使い分け。または `tput clear` 相当。ADR の「Startup terminal clear」用語で挙動明示。

### IC-145 `modes index.ts readOnlySandboxOverrideToken` が `Math.random` ベース (衝突・予測可能)
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/safety/modes/index.ts:127`
- **概要**: ``readOnlySandboxOverrideToken = `read-only-${Date.now()}-${Math.random().toString(36).slice(2, 8)}``` で、`Math.random`(暗号学的でない) 使用。sandbox profile override のトークンとして使われ、`popSandboxOverride` がこれを突き合わせて profile を pop。悪意ある拡張がトークンを予測・偽造できれば、他モードの sandbox profile を不正 pop できる(読み取り専用モードを勝手に解除)。
- **提案**: `crypto.randomUUID()` または `crypto.randomBytes(16).toString("hex")` を使用。token はプロセス内メモリで検証。

### IC-146 `modes snapshotMain` が `ctx.model` を `as ModelRef` で扱う (型の不整合)
- **カテゴリ**: 型安全性
- **対象**: `mekann/safety/modes/index.ts:69-72`
- **概要**: `const mainRef = _m ? { provider: _m.provider, modelId: _m.id } as ModelRef : undefined;` で、`ctx.model`(pi の OptimizerModel 型)から `ModelRef` への変換を `as` で実施。`_m.provider`/`_m.id` の型が `ModelRef` の `provider`/`modelId` と一致することを型が保証しない。pi SDK の型変更で不正な `ModelRef` が生成されうる。
- **提案**: 型変換関数(`toModelRef(model): ModelRef | undefined`)を設け、`as` を廃止。検証付き変換。

### IC-147 `modes restoreMainModelAndThinking` のフォールバック順序が暗黙 (設定 vs スナップショット)
- **カテゴリ**: 堅牢性 / 設計
- **対象**: `mekann/safety/modes/index.ts:85-93`
- **概要**: `if (mainRef) await trySetModel(mainRef) else if (state.savedMainModel) await trySetModel(savedMainModel)` で、`state.modelConfig.models.main`(設定)を優先し、無ければ `savedMainModel`(実行時スナップショット)。意図は読めるが、ユーザが「main モード復帰時に直前のモデルに戻ってほしい」と思う場合と「設定のモデルに戻ってほしい」と思う場合があり、優先順位がドキュメント化されていない。
- **提案**: ADR-0014(設定 vs 実行時)で方針明示、または設定で「復元元(設定/スナップショット/都度問合せ)」を選択可能に。

### IC-148 `TerminalLaunchResult.reason` が文字列リテラル固定 (詳細不足)
- **カテゴリ**: 型安全性 / デバッグ性
- **対象**: `mekann/utils/terminal/types.ts:27-32`
- **概要**: `reason?: "unsupported" | "failed" | "invalid-action"` の3値のみ。IC-137 で指摘した通り、`"failed"` は情報量ゼロ。`adapter.ts` の catch は原因を捨て、この型に押し込める。呼び出し側は「なぜ失敗したか」をユーザに伝えられない。
- **提案**: `error?: string` または `reason: { kind: "unsupported" | "failed" | ...; detail?: string }` の構造化。IC-137 と組み合わせて。

---

## 第20バッチ (探索継続)

### IC-149 `docs/configuration.md` が22 feature中7しか文書化 (15 feature文書未カバー)
- **カテゴリ**: ドキュメント / 保守性
- **対象**: `docs/configuration.md` vs `mekann/settings/registry.ts:30` (22 settingsSchemas)
- **概要**: `registry.ts` が読み込む設定スキーマは 22(modes/sandbox/goal/subagent/review-fixer/command-normalization/output-gate/context-ledger/context-tracker/cacheable-context/codex-shared/codex-web-search/model-optimizer/terminal/issue/codex-limits/dashboard/zip-repo/terminal-shortcuts/settings-editor/skill-surface)。一方 `docs/configuration.md` の `###` セクションは **7**(Sandbox/Subagent/Command Normalization/Output Gate/Collaboration Modes/Cacheable Context/Codex Web Search)のみ。残り 15 feature(goal/review-fixer/context-ledger/context-tracker/codex-shared/model-optimizer/terminal/issue/codex-limits/dashboard/zip-repo/terminal-shortcuts/settings-editor/skill-surface)の設定が**非文書化**。ユーザは設定エディタ(`/mekann-settings`)無しには何が設定可能か分からず、CHANGELOG の migration note が追えない。
- **提案**: 各 feature の settingsSchema から設定項目を自動抽出して `docs/configuration.md` を生成、または手動で 15 セクション追加。CI で「スキーマ数 > ドキュメント数」を警告。

### IC-150 `docs/architecture/prompt-control-budget.md` の 50 bullet 目標と実態の乖離検証不足
- **カテゴリ**: ドキュメント / 一貫性
- **対象**: `docs/architecture/prompt-control-budget.md`(50 bullet 目標) vs `mekann/core/agent-guidelines/index.ts` 等の実際の stable fragment
- **概要**: 予算目標「always-on prompt controls は 50 bullet 以下」を掲げるが、実際の bullet 数を CI 等で計測する仕組みが不明。`agent-guidelines/index.ts` 内は 17 bullet だが、他の stable fragment(skill-surface/mekann skills 説明、goal、sandbox 等)を合算すると 50 を超える可能性。手動集計に頼っており、新しい always-on 制御が追加されても予算違反が検知されない。
- **提案**: `scripts/` で stable fragment の bullet 数を集計し CI gate 化。`prompt-control-budget.md` の分類(Core behavior 8/Git safety 6/...)と実装の対応表を機械生成。

### IC-151 `docs/performance/pi-startup-2026-06-02.md` が単発計測で継続追跡無し
- **カテゴリ**: ドキュメント / パフォーマンス
- **対象**: `docs/performance/pi-startup-2026-06-02.md`
- **概要**: 「Pi startup が 3758ms(default) vs 818ms(--no-extensions)、拡張オーバーヘッド約 2939ms」という重要な計測があるが、ファイル名の日付(2026-06-02)のまま一度きり。コード変更(フラグメント追加、スキーマ増加、startup フック追加)で startup が劣化しても検知する CI が無く、ユーザは最新の実態を知れない。`benchmark-startup.{ts,mjs}`(IC-030)が未整備なため再計測も手動。
- **提案**: `benchmark-startup` を CI 化して回帰検知。startup profile を PR ベースで比較。劣化閾値(例: +200ms)で警告。

### IC-152 README の「Kitty 推奨」表記と IC-141(他ターミナル非対応)の整合
- **カテゴリ**: ドキュメント / 一貫性
- **対象**: `README.md`(「Kitty を推奨端末として最適化」「非 Kitty 環境でも一部機能は fallback」)
- **概要**: README は「fallback する」と書くが、IC-141 で判明した通り `detectTerminalEmulatorAdapters` は kitty アダプタのみで、**fallback 先のアダプタが存在しない**。wezterm/iTerm2/Tmux ユーザには split/image が単に「unsupported」になるだけで、実装済みの fallback 挙動ではない。README の表記が実装より楽観的。
- **提案**: README に「現状 kitty 専用、他将来対応予定」または「非 kitty では外部 split 不可、subagent は in-process で動作」と明記。IC-141 の解決とセット。

### IC-153 `docs/configuration.md` の例示 JSON に `bashMode: "ask"` と `"sandboxed"` が混在 (デフォルト不明確)
- **カテゴリ**: ドキュメント / UX
- **対象**: `docs/configuration.md`(Common settings 例示)
- **概要**: 上部の Shape 例では `"bashMode": "sandboxed"`、Common settings 例では `"bashMode": "ask"`。`config.ts` の `MEKANN_SANDBOX_DEFAULTS` には bashMode が無く(`bashPolicy.ts` の `getBashMode` は undefined → `"sandboxed"` フォールバック)。文書例が2種類でデフォルトが読めず、ユーザが「ask」をコピペして意図せず毎回承認を求められる可能性。
- **提案**: デフォルト(`sandboxed`)を明示し、各モードの意味(off/ask/sandboxed/yolo)を表で整理。`ask` が非推奨なら注記。

### IC-154 ~~`docs/configuration.md` の例示キーが schema に不在~~ (訂正: 取り下げ)
- 調査メモ: `mekann/safety/sandbox/settingsSchema.ts:28-32` を確認したところ、`allowPersistentBashApprovals`/`llmOutputMaxBytes`/`llmOutputMaxLines`/`bashMode`/`bashAllowlist` は**全て実装済み**。ドキュメント例示は正確だった。誤報として取り下げ。
- 副産物の軽微候補: IC-153 の「デフォルトが `sandboxed` なのに例示が `ask`」は残存。ただしこれはユーザが両方の例を見られる意図的な可能性もあり、要確認。優先度 低。

### IC-155 `docs/skills.md`(353行) と skill-surface 実装の同期検証不足
- **カテゴリ**: ドキュメント / 一貫性
- **対象**: `docs/skills.md` vs `mekann/skill-surface/` および `mekann/skills/`
- **概要**: 353 行ある `skills.md` が skill の一覧・使い方を記載するが、`mekann/skills/`(diagnose/grill-with-docs/improve-codebase-architecture/prototype/setup-matt-pocock-skills/tdd/thermo-nuclear-code-quality-review/to-issues/to-prd/triage)と OSS skill mirror(mattpocock/gsap/cursor-plugins)の追加・変更に対し、手動で同期する必要がある。スキル追加時に `skills.md` の更新忘れが起きると、ユーザが存在しないスキルを探す。
- **提案**: `scripts/` で `mekann/skills/*/SKILL.md` と OSS manifest から `skills.md` の一覧表を生成。差分を CI 検知。

---

## 第21バッチ (探索継続)

### IC-156 `patchProposalIntake.withinAny` がワイルドカード `*` を解釈しない (権限スコープの誤表示)
- **カテゴリ**: バグ (セキュリティ意味論) / 設計
- **対象**: `mekann/autonomy/subagent/patchProposalIntake.ts:139-145` (`withinAny`)
- **概要**: `canonicalizeScopePatterns` は `*` を一時プレースホルダ化して `safeRepoRelativePath` で検証した後**`*` を復元**する(111行目)。しかし `withinAny` は `norm === scope || norm.startsWith(scope + "/")` の**リテラル比較**のみで、`*` を glob として解釈しない。結果: `write_scope: ["src/*"]` を指定しても `src/foo` はマッチせず(`'src/*' !== 'src/foo'` かつ `'src/foo'.startsWith('src/*/')` は false)、「権限スコープ外」として**誤って拒否**される。ユーザは `src/*` で全ファイル許可したつもりが、何も許可されない。
- **検証**: `node` で `withinAny('src/foo', ['src/*'])` → `false` を確認。
- **提案**: `*` を正規 glob(`minimatch`/自前 `*` → `[^/]*`)として解釈、または「`*` はサポート外、明示パスのみ」とドキュメント化し schema で拒否。現状の「`*` を受け付けるが無視」は最悪の UX。

### IC-157 `subagent registry.reservationCounter` がモジュールレベル mutable (IC-044 同根)
- **カテゴリ**: データ整合性
- **対象**: `mekann/autonomy/subagent/registry.ts:18` (`let reservationCounter = 0`)
- **概要**: 予約トークン用カウンタが `let`。複数 pi プロセス(subagent 子 Pi が独自 registry を持つ場合)でトークン衝突の恐れ。IC-015(output-gate)/IC-044(candidate)/IC-002(goal)と同じ「プロセスローカルカウンタ」問題が第4の実例。トークンはメモリ内の `reservations` Set で検証されるので実害は限定的だが、デバッグログでトークン衝突が紛らわしい。
- **提案**: `crypto.randomUUID()` ベースに統一、またはプロセス ID + 単調カウンタ。

### IC-158 `semanticConflict.evaluateSemanticConflict` の競合検出が `keyOfTarget` 完全一致のみ (部分一致を見逃す)
- **カテゴリ**: バグ (意味論的競合検出)
- **対象**: `mekann/autonomy/subagent/semanticConflict.ts:11-22`
- **概要**: `incomingReads.has(key)` / `incomingWrites.has(key)` で `kind:name` 完全一致のみ検出。例えば proposal A が `function:renderHeader` を write し、proposal B が `function:renderHeaderAsync`(派生)を read しても**検出されない**。また `public_surface_delta` の検査(16行目)は `[...incomingReads].some(r => r.includes(delta.name))` と `includes` で部分一致するが、`delta.name` が `renderHeader` のとき `function:renderHeader` だけでなく `function:renderHeaderV2` にもマッチしてしまい**過検知**。検出粒度が一貫しない。
- **提案**: 意味的ターゲットの階層(モジュール/クラス/関数)を考慮した一致、または明示的な依存宣言。`includes` ベースの過検知を防ぐため `keyOfTarget` 整合へ。

### IC-159 `applyQueue.applyAgentResults` の `max_results ?? Infinity` で一括適用が無制限
- **カテゴリ**: 堅牢性 / セーフティ
- **対象**: `mekann/autonomy/subagent/applyQueue.ts:67` (`.slice(0, params.max_results ?? Infinity)`)
- **概要**: `max_results` 未指定時 `Infinity` で全 `pending` 結果を一括適用。サブエージェントが大量の patch を生成した場合(バッチ検証等)、1 回の `apply_agent_results` で数十〜数百パッチが連続適用され、途中で失敗しても前のパッチは already applied。HARD_MAX 系の上限(IC-042 の `HARD_MAX_SUBAGENTS` 等)が `max_results` に無い。
- **提案**: `HARD_MAX_APPLY_BATCH`(例: 20)を設定、超過時は警告 + 残りは次回へ。または dry-run モード。

### IC-160 `applyQueue.showAgentResult` の `includePatch` が `isUnderDir` 検査後に readFileSync
- **カテゴリ**: セキュリティ / 堅牢性
- **対象**: `mekann/autonomy/subagent/applyQueue.ts:32-37`
- **概要**: `if (includePatch && s.result.outcome === "patch" && s.result.patch.ref) { if (!isUnderDir(s.result.patch.ref, this.store.dir)) throw ...; s.patch_body = readFileSync(...); }`。`isUnderDir` ガード付きで読むので基本安全だが、`patch.ref` が `resultStore.dir` 配下の**シンボリックリンク**を指す場合、`path.relative` はリンクを解決せず、実体が外部ファイルでも `isUnderDir` を通過する。IC-103/IC-117 と同じ symlink 脱出の懸念。
- **提案**: `fs.realpathSync` で実体解決後に `isUnderDir` 判定。または `O_NOFOLLOW` で開く。

### IC-161 `subagent semantic.ts keyOfTarget` が `kind:name` の単純結合 (名前衝突)
- **カテゴリ**: バグ (意味論的一意性)
- **対象**: `mekann/autonomy/subagent/semantic.ts:3` (`return \`${target.kind}:${target.name}\``)
- **概要**: `function:foo` と `type:foo` は区別されるが、異なるモジュール/名前空間の同名 `function:render`(`a.render` と `b.render`)が同じキーになり衝突。IC-158 と関連し、意味的競合検出の精度を下げる根因。`SemanticTarget` 型が module/path を持たない限り解決しない。
- **提案**: `SemanticTarget` に `module`/`filePath` を追加し、`kind:module:name` で一意化。または fingerprint.ts のパス情報を活用。

### IC-162 `subagent mailbox.wait` の `Math.max(...mailbox.map, ...events.map, beforeSeq)` が巨大配列でスタックオーバーフロー
- **カテゴリ**: バグ (パフォーマンス / 堅牢性)
- **対象**: `mekann/autonomy/subagent/agentSession.ts:122`
- **概要**: `Math.max(...result.mailbox.map(m => m.seq), ...result.events.map(e => "seq" in e ? e.seq : 0), beforeSeq)` でスプレッド構文。mailbox/events が数千件を超えると `Math.max` の引数展開で**コールスタックを消費**し `RangeError: Maximum call stack length exceeded`。長時間稼働の subagent で蓄積すると再現する。
- **提案**: `for` ループまたは `reduce` で線形集計。`Math.max` のスプレッドは小配列向け。

### IC-163 `applyQueue.applyAgentResults` が `recoverStaleApplying` + `pruneOrphanedPending` を同期的に前処理 (レース)
- **カテゴリ**: 並行性 / 堅牢性
- **対象**: `mekann/autonomy/subagent/applyQueue.ts:62-63`
- **概要**: `applyAgentResults` 開始時に `this.store.recoverStaleApplying()` と `pruneOrphanedPending()` を呼ぶ。これらは `applyOne` と競合する可能性: 別プロセスが並行して `apply_agent_results` を呼ぶと、両者が同じ `pending` 結果を `load` し、`markApplying` が競合。`store.ts` にロックが無い(IC-007)ため、二重適用が発生しうる。
- **提案**: ファイルロック(`withSettingsLock` 相当)で apply セッションを直列化。または `markApplying` を atomic test-and-set。

---

## 第31バッチ (探索継続)

### IC-207 `goal command.ts parseObjectiveInput` が `--budget` をトークン完全一致で判定 (構文制約)
- **カテゴリ**: バグ (UX) / 堅牢性
- **対象**: `mekann/autonomy/goal/command.ts:257-289`
- **概要**: `const tokens = input.trim().split(/\s+/); const budgetIndex = tokens.indexOf("--budget");` で objective をトークン分割後 `--budget` を**完全一致**で探す。構文制約:
  - `--budget=100`(`=` 区切り)に非対応 → objective 扱いされて「objective が空」エラー
  - `-b 100` 等の短縮形に非対応
  - objective 内に `--budget` という単語を含められない(例: "optimize --budget handling")
  - 複数空白の正規化(`\s+`)でユーザの意図的空白が消失
  また `Number(raw)` の前に `/^\d+$/` で弾くので科学的表記(`1e5`)やカンマ(`10,000`)を拒否。
- **提案**: 共通のミニ引数パーサ(IC-097/IC-199 と統合)で `--budget=100`/`--budget 100`/`-b 100` をサポート。objective に `--` 終端オプションを導入。

### IC-208 `goal command.ts` が `(ctx.sessionManager as any).isPersisted?.()` で SDK 内部 API 掘り下げ (IC-027 同根)
- **カテゴリ**: 型安全性 / SDK 結合度
- **対象**: `mekann/autonomy/goal/command.ts:36` および `runtime.ts:230`
- **概要**: `if (!(ctx.sessionManager as any).isPersisted?.())` で、pi SDK の SessionManager の内部メソッド `isPersisted` を `as any` で呼ぶ。SDK がメソッド名変更・削除すると黙って `undefined?.()` → falsy → 「Goals require a persisted session」エラーを誤表示。IC-027(subagentSpawner の session.agent 掘り下げ)と同じ SDK 内部 API 依存。
- **提案**: pi SDK に公式の `isPersistedSession()` / `requiresPersistedSessionForGoals()` API を要求。または context 側で型付き判定。

### IC-209 `goal goalTools.ts` の tool handler が `(params) as any` を多用 (IC-046 同根)
- **カテゴリ**: 型安全性
- **対象**: `mekann/autonomy/goal/goalTools.ts:137, 168, 215`
- **概要**: create/update goal ツールハンドラで `try { ... } catch (e) { ... }` 内で `(params as any).xxx` のパターンと、`as any` のスキーマ生成。IC-046(output-gate/ledger の params as any)と同根だが、goal 系は budget 数値や status 遷移など重要な状態操作に係るため、型不整合が silent corruption を招く恐れ。
- **提案**: IC-046 の共通デコーダ `parseParams<T>` で goal ツールも型安全化。

### IC-210 `goal state.ts HARD_MAX_OBJECTIVE_LENGTH = 500_000` が非常に緩い (リソース懸念)
- **カテゴリ**: 堅牢性 / リソース管理
- **対象**: `mekann/autonomy/goal/state.ts:79`
- **概要**: `HARD_MAX_OBJECTIVE_LENGTH = 500_000` で、goal の objective を 50 万文字まで許可。goal objective はプロンプトに都度埋め込まれ(postCompactionRestore/continuation prompt で)、500KB の objective はプロンプト肥大化で context 圧迫と cache 不効率を招く。他の HARD_MAX(SUBAGENTS=4, RESULT_RETRIES=10)が控えめな中で、objective だけ桁違いに緩い。
- **提案**: 500KB は大きすぎる旨を docs/configuration.md に明記、または 50KB 等のより実用的な上限に。IC-127(CJK token 推定)と合わさり、日本語 objective で token 消費が読めない。

### IC-211 `goal runtime.ts COMPACT_RESERVE_TOKENS = 16384` が pi デフォルトと同期前提 (IC-018/IC-064 と同根)
- **カテゴリ**: 堅牢性 / 設定同期
- **対象**: `mekann/autonomy/goal/runtime.ts:17-23`
- **概要**: コメント「Matches Pi's default CompactionSettings.reserveTokens (16384)」と明記の上でハードコード。pi がデフォルト変更したりユーザが設定で reserveTokens を変更すると、goal の continuation 前の compact 判定(`contextWindow - COMPACT_RESERVE_TOKENS`)が実際とズレ、过早/過少 compaction になる。pi SDK から値を取り込まず固定コピー。
- **提案**: pi SDK から `getCompactionSettings().reserveTokens` を取得、設定経由で上書き可能に。

### IC-212 `goal runtime.ts accountUsage` の `accounted_assistant_usage_keys` が Set で無限成長 (IC-204 同根)
- **カテゴリ**: リソース管理 / 堅牢性
- **対象**: `mekann/autonomy/goal/runtime.ts:113-115`
- **概要**: `private accounted_assistant_usage_keys: Set<string> = new Set();` が、各 assistant message usage イベントのキー(`[msg.timestamp, inputTotal, output, cacheRead].join(":")`)を記録し重複計上を防ぐ。長時間セッションで際限なく成長。またキーが単純 join なので、同一 timestamp+同一 token 数の異なるメッセージ(レアだが再送等)が誤ってスキップされる恐れ。
- **提案**: LRU 上限、または message.id ベースのキー。session_shutdown でクリア。

### IC-213 `goal runtime.ts tokenDelta` の inputTotal - cacheRead が inputSemantics 依存 (IC-126 と同根)
- **カテゴリ**: バグ (計算精度) 要確認
- **対象**: `mekann/autonomy/goal/runtime.ts:122`
- **概要**: `const tokenDelta = Math.max(0, inputTotal - (usage.cacheRead ?? 0)) + (usage.output ?? 0);`。コメント「inputTotal/input means total input tokens INCLUDING cache-read/cache-write」と前提するが、プロバイダによって inputTotal が「cache 含む」「cache 除く」異なる。cache **除く**定義のプロバイダでは、更に cacheRead を引くことで**二重減算**で token 使用量を過少報告。IC-126(model-optimizer metrics の `input + cacheRead` 逆方向問題)と対で、`actualUsage.ts` の `InputSemantics` 正規化を goal runtime にも適用すべき。
- **提案**: `actualUsage.ts` の `normalizeActualCacheUsage` を goal runtime でも利用し、inputSemantics に応じて `cacheRead` 減算を切替。

---

## 第32バッチ (探索継続)

### IC-214 `goal prompts.ts escapeXmlText` が `& < >` のみで `'`/`"` をエスケープしない (IC-024 同根)
- **カテゴリ**: セキュリティ (XML インジェクションの余地) / 一貫性
- **対象**: `mekann/autonomy/goal/prompts.ts:8-10`
- **概要**: `escapeXmlText(text)` が `&`/`<`/`>` のみ置換し `'`/`"` をそのまま通す。`<objective>${escapeXmlText(goal.objective)}</objective>` のように要素テキストとして埋め込むので、要素テキスト文脈では実害は限定的だが、(a) 将来この関数が属性値(`attr="${escapeXmlText(x)}"`)に使われると `'`/`"` で抜けられる、(b) OWASP 推奨の XML エスケープは5文字(`& < > " '`)。IC-024(dashboard esc)と同じ不完全エスケープの別実装。`escapeXmlText` という名前からして属性用途も想定するなら危険。
- **提案**: `'` → `&apos;`、`"` → `&quot;` を追加し、5文字エスケープへ統一。IC-024 と共通のエスケーパへ。

### IC-215 `goal prompts.ts formatDuration` が秒未満を切り捨て (精密表示の欠落)
- **カテゴリ**: UX / 堅牢性
- **対象**: `mekann/autonomy/goal/prompts.ts:11-18`
- **概要**: `formatDuration(seconds)` が秒未満を表示せず、`< 60` 秒は `${seconds}s`。`seconds` が小数(例: 0.5s)の場合 `${0.5}s` となり、整数でない場合は奇妙な表示。`goal.time_used_seconds` は整数(`Math.round(elapsedMs / 1000)` @ runtime.ts:337)なので実害は限定的だが、関数の契約として「秒整数」が前提なのに型は `number`。
- **提案**: `Math.floor` で整数化、または `seconds: number` を `seconds: integer` に(ブランド型)。

### IC-216 `goal goalLifecycle.ts` の branch replay が `for (let i = branch.length - 1; i >= 0; i--)` で逆順 (意図確認)
- **カテゴリ**: 堅牢性 / 可読性
- **対象**: `mekann/autonomy/goal/goalLifecycle.ts:76`
- **概要**: persisted goal entries の replay が「branch は leaf→root なので逆順で chronological replay」とコメントにある通り逆順ループ。pi の entry branch の順序前提に強く依存。pi SDK が branch 順序を変更すると誤った順序で replay され、goal 状態再構築が壊れる。テストで順序不変を保証する仕組みが不明。
- **提案**: pi SDK の branch セマンティクスを型/ドキュメントで固定、または replay 関数を pi SDK 提供に。プロパティテストで順序依存を明示。

### IC-217 `goal goalEvents.ts` の `recordGoalAction` がサイレント失敗しうる (IC-146 同根)
- **カテゴリ**: デバッグ性 / 場牢性
- **対象**: `mekann/autonomy/goal/goalEvents.ts`(134 行)
- **概要**: goal の action(create/pause/resume/clear/budget 等)を context ledger 等へ記録する経路。IC-146(best-effort catch 共通化)の対象だが、goal の状態遷移記録が失敗してもユーザに伝わらないと「pause したのに履歴が無い」等の監査性低下。
- **提案**: IC-146 の構造化ログに統合。goal action の記録失敗は特に warn レベルで通知。

---

## 第33バッチ (探索継続)

### IC-218 `codex-web-search index.ts` の `formatUserErrorMessage` が token 由来情報をマスクするか要確認 (IC-079 同根)
- **カテゴリ**: セキュリティ / デバッグ性
- **対象**: `mekann/utils/codex-web-search/index.ts:303-312`
- **概要**: `catch (error) { if (error instanceof CodexError) { throw new CodexError(error.kind, formatUserErrorMessage(error.kind), error.status); } ... }` で、CodexError をユーザ向けメッセージに変換。`formatUserErrorMessage` の実装次第だが、`error.message` に token や accountId(IC-079)が含まれている場合、そのまま再スローすると pi の UI/ログに漏れる。`auth.token`/`auth.accountId` が `runtime.execute` に渡り、内部でエラーメッセージに埋め込まれる可能性。
- **提案**: `formatUserErrorMessage` が token/accountId/Authorization ヘッダを確実にマスクすることをテスト。エラーは構造化(`kind`/`status`/`safeMessage`)で伝達。

### IC-219 `context-tracker byteLen` が `JSON.stringify` 失敗時に 0 を返す (IC-198 同根、第2実例)
- **カテゴリ**: バグ (計算精度)
- **対象**: `mekann/context/context-tracker/index.ts:12-14`
- **概要**: `try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }`。循環参照や BigInt 含みオブジェクトで `JSON.stringify` が失敗すると 0 を返し、`messageBreakdown` の `bytes`/`estimatedTokens` が 0 になる。結果、dashboard のメッセージサイズ集計が実際より小さく表示。IC-198(tool-registration-observer の byteLen)と同じ 0 返却問題の別実装。
- **提案**: 共通の `safeByteLen` ヘルパを導入し、両方で利用。失敗時は `String(value).length` 等のフォールバック。

### IC-220 `context-tracker messageBreakdown` の `estimatedTokens: Math.ceil(bytes / 4)` (IC-127 の第7実例)
- **カテゴリ**: バグ (計算精度) / 国際化
- **対象**: `mekann/context/context-tracker/index.ts:52`
- **概要**: `estimatedTokens: Math.ceil(bytes / 4)` が IC-127(prompt-core)/IC-133(hashFragment)/IC-178(context-control analysis)に続く **第4モジュール目の同一バグ**。message breakdown の token 推定が CJK で 4-8 倍過小評価され、dashboard「Top message contributors」が不正確。IC-143 の CJK byte/token 共通化にこの経路も統合すべき。
- **提案**: IC-127/IC-143 の改善を context-tracker に波及。

### IC-221 `context-tracker openUrl` の detached spawn が環境別コマンド固定 (IC-010/IC-082 同根)
- **カテゴリ**: 場牢性 / ポータビリティ
- **対象**: `mekann/context/context-tracker/index.ts:31-39`
- **概要**: `const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";` で、3 プラットフォームのみ対応。Linux で `xdg-open` が未インストール(最小コンテナ、サーバ環境)だと ENOENT で失敗し、`catch {}` で握り潰し。WSL(`/mnt/c` 環境)や、`wslview`/`gio open` 等の代替が考慮されない。
- **提案**: コマンド候補リスト(`xdg-open`/`wslview`/`gio`/`x-www-browser`)を順に試す、または設定で上書き可能に。

### IC-222 `context-tracker index.ts` の `(event: any, ctx: any)` が多数 (IC-141/IC-200 同根)
- **カテゴリ**: 型安全性
- **対象**: `mekann/context/context-tracker/index.ts:126, 168` ほか
- **概要**: `pi.on(agentStartInspectionEvent as any, async (event: any, ctx: any) => ...)` のように、イベント名も `as any`、ハンドラ引数も `as any`。`agentStartInspectionEvent` が動的に解決されるイベント名で、pi SDK の型付いたイベント定数ではない。event/ctx のフィールドアクセス(`event.messages`/`ctx.model` 等)が全て `any` で、SDK 変更で無言破壊。
- **提案**: pi SDK に inspection イベントの型付き定数を要求。または narrow なローカル型定義で `any` を削減。

### IC-223 `codex-limits format.ts` の `clampPercent` が `Math.min(100, Math.max(0, value))` (設計良好、副産物)
- **カテゴリ**: 整理 (positive note)
- **対象**: `mekann/utils/codex-limits/format.ts:204`
- **概要**: `clampPercent` がパーセント値を [0,100] にクランプ。IC-185(parseMetricLines の Infinity)/IC-190(tool-schemas schemaBytes)で指摘した「Infinity/NaN の未検証」と対照的に、ここは適切にクランプされている。ただし `value` が `NaN` の場合は `Math.max(0, NaN)` = `NaN`、`Math.min(100, NaN)` = `NaN` となり、NaN が通過する。`BAR_SEGMENTS` 計算(`Math.round((clampPercent(percent) / 100) * BAR_SEGMENTS)`)で NaN が伝播。
- **提案**: `Number.isFinite` で NaN/Infinity を 0 に正規化してからクランプ。他の数値検証(IC-185/IC-190)と共通化。

### IC-224 `codex-limits usage.ts` の二重 catch (cause) が理由を消失 (IC-146 同根)
- **カテゴリ**: デバッグ性
- **対象**: `mekann/utils/codex-limits/usage.ts:119, 126`
- **概要**: `} catch (cause) { ... }` が2箇所。`cause` 変数が catch ブロック内で使われているか要確認だが、usage クエリの失敗(ネットワーク、API エラー)が握り潰されると「codex 使用量が取得できない」状況でユーザに原因(レートリミットか、認証切れか、ネットワークか)が伝わらない。IC-146(best-effort catch 共通化)の対象。
- **提案**: 失敗理由をステータス表示に含める、または構造化ログへ。

---

## 第34バッチ (探索継続)

### IC-225 `codex-shared client.ts fetchCodexJson` / `fetchCodexModels` がエラーに全 response body を埋め込む (IC-079/IC-218 同根)
- **カテゴリ**: セキュリティ (情報漏洩) / デバッグ性
- **対象**: `mekann/utils/codex-shared/client.ts:83-89` および `models.ts:38-43`
- **概要**: 両関数とも `throw new CodexError(classifyHttpStatus(status), \`Codex request failed: HTTP ${status} ${await response.text()}\`, status)`。`response.text()` で**レスポンスボディ全文**をエラーメッセージに埋め込む。Codex API のエラーレスポンスにリクエストのエコー(token、accountId、query)が含まれていると、それが `CodexError.message` → UI/ログ に漏れる。`formatUserErrorMessage`(IC-218)がユーザ向けメッセージに変換しても、内部ログには全文が残る可能性。
- **提案**: エラーメッセージには status + 先頭 N 文字のみ。全文は別フィールド(`debugBody`)に切り離し、PI/CODEX_DEBUG 以外では破棄。token/accountId 由来文字列をマスク。

### IC-226 `codex-shared models.ts` の cache が無限成長 (IC-204/IC-212 同根)
- **カテゴリ**: リソース管理 / 場牢性
- **対象**: `mekann/utils/codex-shared/models.ts:155-156` (`const cache = new Map<...>(); const inflight = new Map<...>();`)
- **概要**: codex models キャッシュと in-flight デデュープ Map がモジュールレベル。key は `${provider}:${baseUrl}:${accountId}` で、複数アカウント/プロバイダ切替(IPC、subagent)で増加。期限切れエントリの掃除(`cache.delete`)は明示的 invalidate のみで、TTL 期限切れエントリが自動削除されない。長時間プロセスでメモリ蓄積。
- **提案**: LRU 上限、または TTL 期限切れエントリの定期的 sweep。IC-204/IC-212 と共通の「モジュールレベル Map の無限成長」対策。

### IC-227 `codex-shared errors.ts classifyEventErrorMessage` の正規表現が英語中心 (IC-060 群と同根)
- **カテゴリ**: 国際化 / 場牢性
- **対象**: `mekann/utils/codex-shared/errors.ts:54-63`
- **概要**: `/server[-_ ]?is[-_ ]?overloaded|service[-_ ]?unavailable|overloaded|slow_down/` 等のエラー分類が英語キーワードのみ。プロバイダが日本語エラーメッセージを返す設定(ローカライズ API)、または Codex 以外の多言語エラーでは分類が "unknown" に落ち、適切なリトライ/フォールバックが発火しない。IC-060/IC-094/IC-119/IC-129 の「英語バイアス正規表現」と同根。
- **提案**: エラーコード/ステータス番号(429/503/401)ベースの分類を優先、メッセージは補助。日本語メッセージ("サーバーが過負荷"/"レート制限")を追加。

### IC-228 `codex-shared settingsSchema.ts` の `baseUrl`/`modelCacheTtlMs` が「通常は変更不要」だが未文書化 (IC-149 同根)
- **カテゴリ**: ドキュメント / 設計
- **対象**: `mekann/utils/codex-shared/settingsSchema.ts:36-37`
- **概要**: `codex-shared.baseUrl` と `modelCacheTtlMs` が「通常は変更不要」の description 付きで設定可能。しかし `docs/configuration.md` の 7 セクション(IC-149)には codex-shared が含まれず、ユーザがこれらの設定の存在を知るには `/mekann-settings` を開く必要がある。設定可能な advanced 値が non-documented。
- **提案**: IC-149 の docs/configuration.md 拡充で codex-shared セクションを追加。

### IC-229 `codex-shared types.ts CodexReasoningEffort` の `xhigh` が存在 (プロバイダ依存)
- **カテゴリ**: 場牢性 / API 整合性
- **対象**: `mekann/utils/codex-shared/types.ts:11-18` (`"none" | "minimal" | "low" | "medium" | "high" | "xhigh"`)
- **概要**: `xhigh` という effort レベルが定義されている。OpenAI 標準(o1/o3 系)は `minimal`/`low`/`medium`/`high` で、`xhigh` は一部モデル/非公式仕様。Codex API が `xhigh` を廃止・改名すると、ユーザが設定した `xhigh` がサイレントに `low` へフォールバック(`normalizeReasoningEffortForModel` @ models.ts:131)し、意図より低い推論になる。逆に未知の新レベル(`ultra` 等)は型エラーで弾かれる。
- **提案**: effort レベルを設定駆動/実行時解決にし、未知値を型エラーではなく警告付きパススルー。プロバイダ別の対応 effort 表を docs 化。

### IC-230 `codex-shared models.ts normalizeReasoningEfforts` が未知 effort を黙ドロップ (IC-229 と関連)
- **カテゴリ**: 場牢性
- **対象**: `mekann/utils/codex-shared/models.ts:99-104`
- **概要**: `raw.map(...).filter(v => VALID_REASONING_EFFORTS.has(v))` で、`VALID_REASONING_EFFORTS` に無い effort(将来の `ultra` 等)を**黙って除外**。ユーザが新しい effort を期待して使っても、対応しているはずのモデルで「supportedReasoningEfforts が空」と扱われ、`normalizeReasoningEffortForModel` がフォールバック。IC-229 の根にある設計。
- **提案**: 未知 effort を警告付きで保持、またはメトリクスで検知。VALIDReasoningEfforts を OpenAI の公式リストと同期。

---

## 第35バッチ (探索継続)

### IC-231 `dashboard avatar.ts isLikelyKitty` が `TERM` 部分一致 (IC-081 同根)
- **カテゴリ**: 場牢性
- **対象**: `mekann/utils/dashboard/avatar.ts:35`
- **概要**: `Boolean(env.KITTY_WINDOW_ID || env.TERM?.toLowerCase().includes("kitty"))` で、IC-081(dashboard cleanup.ts)と同じ部分一致検出。`TERM=xterm-kitty` は正しいが `TERM=st-kitty-256color` 等で誤検知して kitty graphics エスケープを送る。avatar/contribution graph 画像が壊れる。
- **提案**: IC-081 と共通の厳密 kitty 検出へ。

### IC-232 `dashboard avatar.ts fetchKittyAvatar` が avatar URL を無検証 fetch (SSRF/プライバシー)
- **カテゴリ**: セキュリティ (SSRF) / プライバシー
- **対象**: `mekann/utils/dashboard/avatar.ts:18-28`
- **概要**: `const response = await fetch(url)` で、`url`(`GitHubProfile.avatarUrl`)を無検証で fetch。GitHub API 由来なら安全だが、`url` が経路上で改ざん、または将来ユーザ設定可能になると、内部ネットワーク(`http://169.254.169.254/` 等の metadata endpoint、`http://localhost:port/`)への SSRF に悪用可能。fetch した bytes を PNG として `writeFile` するが、内容検証(MAGIC header `89 50 4E 47`)も無く、任意ファイルが tmpdir に書かれる。
- **提案**: URL を HTTPS + 信頼ホスト(`avatars.githubusercontent.com`)に限定。PNG MAGIC ヘッダ検証、サイズ上限。

### IC-233 `dashboard avatar.ts kittyGraphicsEscape` が base64 を 4096 char 固定チャンク (プロトコル硬直)
- **カテテゴリ**: 場牢性 / プロトコル
- **対象**: `mekann/utils/dashboard/avatar.ts:42-49`
- **概要**: `const chunks = payload.match(/.{1,4096}/g) ?? [""]` で、base64 ペイロードを 4096 char チャンクに分割。kitty graphics protocol はチャンクサイズをサポートするが、4096 が「pi/kitty 実装の安全側」なのか「kitty プロトコル要件」なのかコメント無し。巨大画像(avatar PNG + contribution graph PNG)でチャンク数が増えると、エスケープシーケンスの洪水でターミナルが重くなる。
- **提案**: チャンクサイズの根拠をコメント化、または設定/ターミナル能力に応じて調整。

### IC-234 `dashboard contribution-image.ts` が `rsvg-convert` 外部依存 (不在時サイレントフォールバック)
- **カテゴリ**: 場牢性 / ポータビリティ
- **対象**: `mekann/utils/dashboard/contribution-image.ts:68-73`
- **概要**: `await execFile("rsvg-convert", ["--format", "png", ...])` で librsvg の CLI に依存。`rsvg-convert` が未インストール(非 Linux/macOS Homebrew 環境、最小コンテナ)だと `catch {}` で握り潰し、`pngPath` が undefined。SVG パスは残るが kitty graphics protocol は PNG/JPG を要求するため、結局画像表示不可。ユーザには「画像が出ない」だけで原因(rsvg-convert 不在)が伝わらない。
- **提案**: 依存チェックと「rsvg-convert をインストールしてください」の案内。または Sharp/node-canvas 等の pure-JS フォールバック。

### IC-235 `dashboard avatar.ts` / `contribution-image.ts` が tmpdir に固定プレフィックスで mkdtemp (衝突ではないが追跡性)
- **カテゴリ**: リソース管理 / 衛生
- **対象**: `mekann/utils/dashboard/avatar.ts:22` と `contribution-image.ts:63`
- **概要**: `mkdtemp(join(tmpdir(), "mekann-dashboard-avatar-"))` と `"mekann-dashboard-graph-"`。`registerCleanupPath(dir)` で IC-113 と同じクリーンアップ経路に登録されるが、SIGKILL/クラッシュ時の残留ファイルが蓄積。`/tmp/mekann-dashboard-*` が複数プロセスで乱立し、ディスクを圧迫。プレフィックス固定なので `mkdtemp` が一意 suffix を付けるが、クリーンアップ失敗時の回収手段が手動 only。
- **提案**: 起動時に古い(`mekann-dashboard-*` で mtime 古い)`mkdtemp` ディレクトリを sweep。IC-022(cleanup.ts SIGINT)と統合。

### IC-236 `dashboard contribution-image.ts levelColor` が GitHub 四分位数をハードコード (色の硬直)
- **カテゴリ**: 設計 / カスタマイズ性
- **対象**: `mekann/utils/dashboard/contribution-image.ts:78-84`
- **概要**: `levelColor(level)` が `FOURTH_QUARTILE`/`THIRD_QUARTILE`/`SECOND_QUARTILE`/`FIRST_QUARTILE` の4レベルを GitHub 緑系(`#39d353` 等)にハードコード。テーマ変更、ダーク/ライト切替、色覚多様性(deuteranopia 配慮)に非対応。ユーザが色を変えられない。GitHub 以外の contribution source(カスタム git log 集計等)のレベル名が変わっても動かない。
- **提案**: 色テーブルを設定/テーマ経由で調整可能に。CONTEXT.md の「Dashboard avatar」「GitHub activity」用語と整合する配色。

---

## 第36バッチ (探索継続)

### IC-237 `dashboard github-parse.ts normalizeDashboardResponse` の日付比較が local TZ と UTC サーバ日付でずれる
- **カテゴリ**: バグ (タイムゾーン) / 計算精度
- **対象**: `mekann/utils/dashboard/github-parse.ts:62-77`
- **概要**: `localDateKey(now)` が `date.getFullYear()/getMonth()/getDate()`(**ローカル TZ**)で `YYYY-MM-DD` を生成し、GitHub `contributionDays[].date`(**サーバ/UTC** ISO 日付)と文字列比較(`d.date >= fromKey`)。非 UTC ユーザ(JST 等)で日付境界付近、または GitHub が UTC 日付を返す仕様と、ユーザの local 「今日」が 1 日ずれ、`contributionsThisWeek`/`contributionsThisMonth`/`activeDaysThisYear` の集計が実際より 1 日分ズレる。月跨ぎ・年跨ぎで顕著。
- **検証**: `node` で JST 0:30 に `new Date()` を取ると localDateKey は当日だが、GitHub の contribution は前日(UTC 15:30)に帰る。
- **提案**: GitHub の日付を UTC 基準で揃えるか、ユーザ TZ 設定を明示。文字列比較ではなく `Date.parse` + TZ-aware 比較。

### IC-238 `dashboard github-parse.ts sumContributionGroups` が `item?.contributions?.totalCount ?? 0` の `as any` (IC-141 同根)
- **カテゴリ**: 型安全性
- **対象**: `mekann/utils/dashboard/github-parse.ts:79-81`
- **概要**: `(Array.isArray(value) ? value : []).reduce((sum, item: any) => sum + Number(item?.contributions?.totalCount ?? 0), 0)` で、`item: any`。GraphQL レスポンスの構造(`pullRequestContributionsByRepository[].contributions.totalCount`)を型定義せず `any` で掘り下げ。GitHub が GraphQL スキーマを変えると黙って 0 集計。IC-141(as any 廃止)と同根。
- **提案**: GraphQL レスポンス型を定義(`PullRequestContributionsByRepository`)し、`any` を削除。

### IC-239 `dashboard render.ts` の `w = Math.max(20, Math.min(width, 140))` が端末幅を 20-140 にクランプ (狭端末/広端末)
- **カテゴリ**: UX / 設計
- **対象**: `mekann/utils/dashboard/render.ts:17`
- **概要**: 端末幅を `[20, 140]` にクランプ。20 未満の極狭端末(モバイル SSH、分割ペーン)では強制的に 20 になり、レイアウトが崩れる可能性(20 は画像 avatar 18 cols + padding 4 にも満たない)。140 超の広端末では余白が大量に余る。クランプ値がハードコードで、avatar サイズ(IC-233)や画像配置と整合しない場合がある。
- **提案**: 最小幅を avatar 列幅に連動、最大幅は設定可能に。クランプ値の根拠をコメント。

### IC-240 `dashboard terminal.ts visibleWidth` が surrogate pair/zero-width joiner を考慮しない (IC-143 同根)
- **カテゴリ**: バグ (表示幅) / 国際化
- **対象**: `mekann/utils/dashboard/terminal.ts:25-33`
- **概要**: `visibleWidth` が `for (const ch of stripped)` で codepoint 反復し、`isWide(cp)` で 1 or 2 を加算。ただし (a) zero-width joiner(`U+200D`)、combining diacritical(`U+0300` 系)、絵文字シーケンス(`👨‍👩‍👧` = 5 codepoints で見た目 2セル)を**codepoint 毎にカウント**し、見た目より大幅に過大評価、(b) `Variation Selector-16`(`U+FE0F`)等の幅ゼロ文字も 1 セル扱い。結果、dashboard のプロフィール/bio に絵文字を含むとレイアウト崩れ。
- **提案**: `Intl.Segmenter`、`string-width` パッケージ、またはZWJ/Variation Selector のハンドリング追加。

### IC-241 `dashboard terminal.ts truncateToWidth` がサロゲートペア境界で切る (文字化け)
- **カテゴリ**: バグ (表示) / 国際化
- **対象**: `mekann/utils/dashboard/terminal.ts:40-58`
- **概要**: `for (let i = 0; i < s.length; i++)` で **UTF-16 code unit** 反復(`s[i]` はサロゲートペアを分割)。絵文字(`👨` = `\uD83D\uDC68`)の途中で `maxWidth` に達すると、上位サロゲートだけ残して `RESET` を付加し、**文字化け**(`?` や豆腐)。IC-240 と同じ codepoint vs code unit の問題だが、truncate はより破壊的。
- **提案**: codepoint 反復(`for (const ch of s)`)に変更、またはグラフェム cluster 単位で truncate。

### IC-242 `dashboard terminal.ts stripAnsi` が一部 OSC/DCS シーケンスを取りこぼす可能性
- **カテゴリ**: バグ (表示幅)
- **対象**: `mekann/utils/dashboard/terminal.ts:21-23`
- **概要**: `s.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07|_G[^\x1b]*\x1b\\)/gs, "")`。(a) OSC は BEL(`\x07`)終端を想定しているが、`ST`(`\x1b\\`)終端の OSC(`\x1b]0;title\x1b\\`)にマッチしない(`\][^\x07]*\x07` が BEL のみ)、(b) DCS(`\x1bP`)、SOS(`\x1bX`)、PM(`\x1b^`)、APC(`\x1b_`)のうち kitty(`_G`)以外を取りこぼす、(c) CSI の中間バイト仕様(`[ -/]*` が正しいが一部拡張)で過不足。結果、プロンプト/bio にタイトル設定等の OSC が入ると `visibleWidth` が実際より大きく計算されレイアウト崩れ。
- **提案**: 標準 ANSI parser(`ansi-regex`)または ECMA-48 準拠の包括的 strip。

---

## 第37バッチ (探索継続)

### IC-243 `dashboard github.ts message()` の 300 char 切り詰めが token 由来文字をマスクしない (IC-079/IC-225 同根)
- **カテゴリ**: セキュリティ (トークン漏洩)
- **対象**: `mekann/utils/dashboard/github.ts:121-129`
- **概要**: `message(error)` がエラーメッセージを `slice(0, 300)` で切り詰め、`gh failed: ${message(ghError)}; ${token.name} failed: ${message(tokenError)}` として返り値に埋め込む。300 char 以内に token/accountId/Authorization ヘッダが含まれている場合、そのまま dashboard エラー表示に漏れる。`tokenError` は `runTokenGraphql`(IC-225 の response body 全文)経由なので、token 由来文字列が入りうる。`authHint`/`gh auth login`/`GH_TOKEN` の部分一致時は「not authenticated」に置換するが、それ以外は生メッセージ。
- **提案**: token/accountId/Bearer 由来文字列の正規表現マスクを追加(IC-138 の redactSecrets 再利用)。

### IC-244 `dashboard github.ts ghJson` 相当(`runGhGraphql`)が gh CLI の stderr を無視 (デバッグ性)
- **カテゴリ**: デバッグ性 / 場牢性
- **対象**: `mekann/utils/dashboard/github.ts:45-48` (`runGhGraphql`) と `issue/github.ts:43-55` (`ghJson`)
- **概要**: `execFileAsync("gh", [...], { maxBuffer, timeout })` で `stdout` のみ取り出し、`stderr` を破棄。`gh` が stderr に警告(rate limit warning、deprecation、認証期限)を出してもユーザに伝わらない。`gh api` の JSON エラー詳細も stdout ではなく stderr に出る場合があり、`JSON.parse(stdout)` が空/壊れて別エラーになる。
- **提案**: stderr を構造化ログまたは error details に含める。`maxBuffer: 8 * 1024 * 1024` を超過時の明確エラー。

### IC-245 `issue bulk-launch.ts bulkLaunchIssues` が順次実行で直列遅延 (IC-045 同根)
- **カテゴリ**: パフォーマンス / UX
- **対象**: `mekann/utils/issue/bulk-launch.ts:84-101`
- **概要**: `for (const issue of issues) { try { ...await deps.launchPiSession(...) } catch ... }` で、全 issue を**直列**に launch。各 `launchPiSession`(kitty split 作成 + Pi 起動)が数秒かかるため、10 issue で 30-60 秒待たされる。`maxParallel` を持つ autopilot(`runAutopilotSupervisor`)と対照的に、bulk-launch は直列。エラー継続ポリシー(IC-074)は保ちつつ、launch 自体は並列化できる(kitty は複数 split を受け付ける)。
- **提案**: `Promise.allSettled` で並列化、または `maxParallel`(autopilot と同じ設定)を導入。

### IC-246 `issue orchestration lifecycle.ts` の env marker ベース子 Pi 検出が env 上書きで壊れる (IC-109/CHANGELOG 修正と同根)
- **カテゴリ**: 場牢性 / 一貫性
- **対象**: `mekann/utils/issue/orchestration/lifecycle.ts:30-33` (`ORCHESTRATION_PARENT_ENV`/`ORCHESTRATION_CHILD_ENV`)
- **概要**: CHANGELOG で「Issue Work Pi 検出を env マーカー(`MEKANN_ISSUE_PI`/`MEKANN_AUTOPILOT_CHILD`/`MEKANN_ORCHESTRATION_CHILD`)ベースに変更。env は起動瞬間に設定され pi に上書きされないため初期化レースに強い」とある。しかし IC-111(kittyControl の PATH 上書き)や IC-109(sh -lc 文字列結合)と同じく、子 Pi の sh スクリプトが env を export する経路で、**シェルスクリプトのバグ**(`export` 忘れ、`set -e` で中断)で env マーカーが付かないと子 Pi は「非 orchestration」と誤判定され、`continueOrchestration` が発火しない。
- **提案**: env マーカーの設定を起動後に verify(子 Pi から hello でマーカーを親に送信)、欠落時は警告。

### IC-247 `issue orchestration lifecycle.ts continueOrchestration` の「PR merged」ゲートが単一条件 (設計)
- **カテゴリ**: 設計 / 場牢性
- **対象**: `mekann/utils/issue/orchestration/lifecycle.ts`(continueOrchestration の approval gate)
- **概要**: 「just-finished child's PR is merged」のみを次 launch のゲートとする。PR が closed(マージなし)や draft のままで ready_for_human に格下げされた場合、orchestration が停止するが、その「停止理由」がユーザに明確に伝わるか要確認。IC-073(autopilot appearTimeoutMs)と同じく、orchestration の停止/継続判定がユーザ調整不可。
- **提案**: ゲート条件(merged/on-closed-skip/on-draft-wait)を設定可能に、停止時の理由表示。

### IC-248 `issue orchestration lifecycle.ts formatSummaryLine` が文字列結合で表示 (i18n/構造化)
- **カテゴリ**: UX / 構造化
- **対象**: `mekann/utils/issue/orchestration/lifecycle.ts:48-50`
- **概要**: `` `done=${summary.done.length} active=${...} blocked=${...} notReady=${...} startable=${...} total=${...}` `` の固定英語フォーマット。日本語ユーザ向けローカライズ、または dashboard/構造化表示用の JSON 出力が無い。IC-184/IC-194(構造化レスポンス)と同じく、文字列表現に固定。
- **提案**: 構造化 `summary` オブジェクトを返し、表示層でフォーマット。

---

## 第38バッチ (探索継続)

### IC-249 `prepare-husky.js` が husky 未インストール時に警告のみで終了 (pre-commit フック未設定が黙認)
- **カテゴリ**: CI / 開発体験 / IC-051 同根
- **対象**: `scripts/prepare-husky.js:10-13`
- **概要**: `if (result.error?.code === "ENOENT") { console.warn("husky not found; skipping git hooks installation"); process.exit(0); }`。`npm install` 後に husky が不在(部分的インストール失敗、workspaces の依存解決問題)だと **exit 0 で成功扱い**。結果、pre-push フックが設定されず、型エラーやテスト失敗が push まで検知されない。CI(`CI=true` で早期 exit)は別として、ローカルで「hooks 無し」が黙認される。
- **提案**: husky 不在時は warn を残しつつ、明示的なリカバ案(`npm install` 再実行)を表示。または `--no-husky` フラグ明示時のみ skip。

### IC-250 `check-mattpocock-skills.js hasDescriptionFrontmatter` の正規表現が複雑で保守困難
- **カテゴリ**: 保守性 / 場牢性
- **対象**: `scripts/check-mattpocock-skills.js:38-40`
- **概要**: `/^---\n(?=[\s\S]*?^---\n)[\s\S]*^description:\s+.+$/m.test(contents)` で、frontmatter 内に `description:` があるかを検証する正規表現。lookahead + 複数行モード + greedy/non-greedy 混在で意図が追いにくい。frontmatter 形式(YAML/JSON/TOML 混在可能性)の変化、または `description:` が quoted string(`description: "..."`)の場合のマッチ具合が不明。スキル追加時に誤判定が出ると CI が落とされる。
- **提案**: frontmatter parser(gray-matter 等)で正確に parse して `description` フィールド存在を検証。プロパティテストで frontmatter 形式バリエーションを網羅。

### IC-251 `check-git-local-safety.sh` の汚染検出が固定文字列(`test@example.com`/`Test User`)のみ
- **カテゴリ**: 場牢性 / テスト品質
- **対象**: `scripts/check-git-local-safety.sh:74-88`
- **概要**: テスト汚染検出が `email === "test@example.com"` / `name === "Test User" || "Test"` の完全一致のみ。新しいテストが別の固定値(`testuser@local`、`CI Bot`、random 生成値)を使うと検出を逃す。また `core.bare=true` は検出するが、`core.repositoryFormat`、`remote.origin.url` の改ざん等、他の危険な config 汚染は対象外。テスト側が「検出されない値」を使うとセーフティネットが無意味化。
- **提案**: 汚染検出値をホワイトリスト(test 用の固定セット)とコード側で共有。`git config --get-regexp` で広範スキャン。

### IC-252 `check-workflows.sh` が `wrkflw` 外部依存で不在時に即死 (CI 環境依存)
- **カテゴリ**: CI / 場牢性
- **対象**: `scripts/check-workflows.sh:6-10`
- **概要**: `if ! command -v wrkflw >/dev/null 2>&1; then echo "wrkflw is required..."; exit 1; fi`。`wrkflw`(Homebrew 提供の workflow validator)が未インストール環境(Linux CI、Docker、新規 contributor)で即 `exit 1`。prepush でこのスクリプトが呼ばれるため、`wrkflw` 無しでは push 不可。インストール案内は出るが、強制依存。
- **提案**: `wrkflw` 不在時は warn のみで skip(`wrkflw` はベストエフォート検証)、または `package.json` の devDependencies でクロスプラットフォーム提供。

### IC-253 `prepush-parallel.sh` の busy-wait `sleep 0.2` がポーリングオーバーヘッド (設計)
- **カテゴリ**: パフォーマンス / 設計
- **対象**: `scripts/prepush-parallel.sh:66-73`
- **概要**: MAX_JOBS 上限を守るため `while true; do active=0; for n in ...; do kill -0 ${pids[$n]} ...; done; [ $active -lt $MAX_JOBS ] && break; sleep 0.2; done` のビジーループ。`wait -n` が macOS bash 3.2 で使えないための互換措置(コメント明記)だが、0.2s 間隔のポーリングで CPU を使い、ジョブ完了からの復帰が最悪 0.2s 遅れる。13 ジョブ × 数十秒で数 % のオーバーヘッド。
- **提案**: bash 4+ 環境では `wait -n`、macOS では `brew install bash` を推奨または GNU parallel/xargs 採用。

### IC-254 `prepush-parallel.sh` の `eval "$PRIORITIZE ${names[$name]}"` が eval インジェクションリスク
- **カテゴリ**: セキュリティ / 場牢性
- **対象**: `scripts/prepush-parallel.sh:75`
- **概要**: `eval "$PRIORITIZE ${names[$name]}" > "$tmpdir/$name.log" 2>&1 & pids[$name]=$!`。`names[$name]` が `npm run test:xxx` 等の固定文字列だが、`eval` 経由でシェル再解釈される。`names` 配列にユーザ入力が入る経路は無いが、将来的に env(`PREPUSH_EXTRA_JOBS` 等)から動的追加すると eval インジェクションに悪用可能。また `PRIORITIZE=""` の時の余分なスペース処理が `eval` 依存。
- **提案**: `eval` を使わず配列 + `"$@"` 展開で安全実行。

### IC-255 `mekann/index.ts suite-imports` の動的 import が失敗時に全体停止 (堅牢性)
- **カテゴリ**: 場牢性 / 設計
- **対象**: `mekann/index.ts:9-16`
- **概要**: `const [...] = await profileStartupStep("suite-imports", () => Promise.all([import("./core/..."), import("./safety/..."), ...]))`。6 つの suite を `Promise.all` で並列 import。1 つでも import 失敗(構文エラー、循環参照、モジュール解決失敗)すると**全体が reject** し、pi 起動が完全に停止。部分的 degraded モード(core だけでも動かす)へのフォールバックが無い。
- **提案**: `Promise.allSettled` で個別失敗を許容し、失敗 suite を warn 表示しつつ他を継続。または core/safety は必須、autonomy/utils/context を optional に。

### IC-256 `mekann/index.ts` の suite 初期化が直列(`await core; await safety; ...`)で起動遅延
- **カテゴリ**: パフォーマンス / 起動時間
- **対象**: `mekann/index.ts:18-23`
- **概要**: import は `Promise.all` で並列だが、実行は `await core(pi); await safety(pi); await autonomy(pi); await utils(pi); await context(pi); skillSurface();` の**直列**。docs/performance/pi-startup-2026-06-02.md(IC-151)で「suite-core 539ms, suite-safety 260ms...」と計測されている通り、直列実行が startup time の大部分。`safety` は `autonomy` の前に必要だが、`utils`/`context`/`skillSurface` は独立して並列化できる可能性。
- **提案**: 依存関係グラフ(safety → autonomy)を明示し、独立 suite を並列実行。startup profile で計測(IC-151)。

---

## 第39バッチ (探索継続)

### IC-257 `settings toolSurface.ts setToolsActive` が O(n²) で非効率 (ホットパス)
- **カテゴリ**: パフォーマンス / 場牢性
- **対象**: `mekann/settings/toolSurface.ts:13-22`
- **概要**: `const next = active ? [...current, ...toolNames.filter(name => !current.includes(name))] : current.filter(name => !wanted.has(name));` で、`current.includes(name)` が配列線形検索。`current`(pi の全 active tools、数十〜数百)×`toolNames`(feature の tools、数〜十数)で O(n*m)。`if (next.length === current.length && next.every(...))` の重複検査も O(n)。`setToolsActive` は lifecycle event 都度呼ばれ(subagent surface sync 等)、ホットパス。IC-162(Math.max spread)と同じく配列操作の計算量問題。
- **提案**: `current` を Set に変換して O(1) ルックアップ。変更検出は Set 差分で O(n) 一括。

### IC-258 `settings toolSurface.ts setToolsActive` が tool 順序を保持しない (非決定性)
- **カテゴリ**: 場牢性 / 設計
- **対象**: `mekann/settings/toolSurface.ts:13-22`
- **概要**: `next = [...current, ...toolNames.filter(...)]` で、新規 tool は**末尾に追加**。pi の tool 表示順が変わると provider prompt の tool 順序が変動し、cache-friendly-prompt の `toolOrderHash`/`toolOrderStable` が churn する(CONTEXT.md の cache 命題と矛盾)。逆に deactivate 時は `current.filter(...)` で順序保持。activate/deactivate で順序方針が一貫しない。
- **提案**: tool 順序を定義順(registration 順)で正規化、または pi SDK が順序を管理。cache-friendly-prompt の toolOrderStable 検査と整合。

### IC-259 `context observations.ts recordContextObservation` が `catch {}` 完全握り潰し (IC-146/IC-217 同根)
- **カテゴリ**: デバッグ性 / 場牢性
- **対象**: `mekann/context/observations.ts:17-19`
- **概要**: `try { appendContextObservation(input); } catch { /* Best-effort by contract */ }` で、context-control store への observation 追加失敗を無言化。キャッシュ効率分析のための観測(cacheable_context phase 等)が失敗しても気付けず、dashboard の metrics が静かに欠落。IC-146(best-effort catch 共通化)の第N実例。
- **提案**: IC-146 の構造化ログへ統合。観測失敗はメトリクス欠落として検知可能に。

### IC-260 `context clear.ts handleClear` が `ctx: any` で confirm/notify を掘る (IC-141/IC-200 同根)
- **カテゴリ**: 型安全性
- **対象**: `mekann/context/clear.ts:10` (`export async function handleClear(ctx: any, label: string, dir: string, clearFn: ...)`)
- **概要**: `ctx?.ui?.confirm` / `ctx?.ui?.notify?` のオプショナルチェーン。pi の `ExtensionCommandContext` 型を使えば型安全。output-gate/context-ledger の clear ハンドラから共有される thin helper だが、型が抜けているため、新しい ui API 要件(confirmFn の引数等)の変更が検知できない。
- **提案**: pi SDK の context 型を取り込み、`ctx: ExtensionCommandContext` へ。

### IC-261 `settings simpleSchema.ts boolSetting` の `restartRequired = true` デフォルトが過剰 (UX)
- **カテゴリ**: UX / 設計
- **対象**: `mekann/settings/simpleSchema.ts:5-19`
- **概要**: `boolSetting(key, category, defaultValue, description, restartRequired = true)` で、boolean 設定のデフォルトが「再起動必要」。`enabled` 以外の boolean 設定(例: model-optimizer の overflowRecovery.enabled)もこのデフォルトを引き継ぐ場合、ユーザが toggle しても「再起動が必要です」と表示され、即時反映されない。実際には多くの boolean は runtime で再読込可能(session_start で再評価)。IC-035(settingsCache fs.watch)と関連。
- **提案**: `restartRequired` のデフォルトを false にし、本当に再起動が必要な設定(bashMode 等)だけ明示的に true。

### IC-262 `settings toolSurfaceProjection.ts projectFeatureToolSurface` が `defaultSurface` を文字列で受ける (型安全性)
- **カテテゴリ**: 型安全性 / 設計
- **対象**: `mekann/settings/toolSurfaceProjection.ts:5-11`
- **概要**: `projectFeatureToolSurface(pi, feature, toolNames, defaultSurface: string, isActive)` で、`defaultSurface` が `string`。実際は `"always" | "active" | "on-demand" | "artifact"` 等の限定値だが型付与されておず、呼び出し元(output-gate: `"artifact"`, context-ledger: `"on-demand"`, subagent: `"always"/"active"`)で typo があっても検知できない。`surface === "always" || isActive()` の比較も文字列完全一致のみ。
- **提案**: `ToolSurfaceMode` 型を定義し、`defaultSurface: ToolSurfaceMode` へ。呼び出し元の型安全性向上。

---

## 第40バッチ (探索継続)

### IC-269 🔴 既存の byte-safe `safeUtf8Slice` が 5 つの壊れた truncate サイトで未共有 (IC-143 群の解決策が既に repo 内に存在)
- **カテゴリ**: 重複コード / バグ (CJK 計算精度) — 🔴高(解決の近道)
- **対象**: \`mekann/context/output-gate/store.ts:160-191\` (\`safeUtf8Slice\`) vs 5 つの壊れた実装
- **概要**: 重要な発見。IC-143/IC-121/IC-164/IC-195/IC-07 で指摘した「`Buffer.subarray(0, maxBytes).toString("utf8").replace(/�$/u, "")` の不完全 UTF-8 カット」バグ(5 実例)だが、**同じリポジトリ内に正しい実装 \`safeUtf8Slice\` が既に存在**する:
  - 先頭カット: \`end\` を 1 ずつ減らしながら結果が \`U+FFFD\` で終わらない境界を探す(\`while (end > 0)\`)
  - 末尾カット(\`fromEnd\`): \`start\` を 1 ずつ増やしながら結果が \`U+FFFD\` で始まらない境界を探す
  - \`maxBytes <= 0\` は空文字
  - \`store.test.ts:62-64,184\` で CJK/絵文字のテストあり
- **5 つの壊れた実装(全て safeUtf8Slice に置換可能)**:
  - \`truncate-utils/index.ts:163-188\`(\`findByteBoundaryFromEnd\`, IC-053)
  - \`output-accumulator/index.ts:60-87\`(\`trimTail\`, IC-121)
  - \`output-gate/search.ts:33-36\`(\`capText\`, IC-135)
  - \`safety/sandbox/truncation.ts:24-27\`(\`truncateForLlm\`, IC-164)
  - \`output-gate/preview.ts:86\`(\`buildStructuredPreview\`, IC-195)
- **検証**: \`node\` で \`safeUtf8Slice('あ'.repeat(10), 5)\` → \`"あ"\`(3 bytes、maxBytes 5 以内、文字化け無し)を確認。壊れた実装は同じ入力で 1 文字だけ残して奇妙な状態に。
- **提案**: \`safeUtf8Slice\` を \`mekann/utils/truncate-utils/index.ts\` 等の共通場所へ移動または export し、上記 5 サイトが \`Buffer.subarray + toString + FFFD replace\` を廃止してこれを使うよう統一。IC-143/#143 の解決が**新規実装ではなく既存コードの採用**で済むため、工数大幅削減。

### IC-270 \`safeUtf8Slice\` の末尾カットが最悪 O(n) だが実用上は問題なし (設計メモ)
- **カテゴリ**: パフォーマンス / positive note
- **対象**: \`mekann/context/output-gate/store.ts:175-184\` (\`fromEnd\` の \`while\` ループ)
- **概要**: 末尾カット時、\`start\` を 1 ずつ進めて \`U+FFFD\` 検出を避ける。最悪ケース(連続するマルチバイト境界跨ぎ)で O(maxBytes) 反復。実用的な出力(数十 KB)では高々数回の反復で境界に到達するため問題ないが、理論上は巨大入力で線形。IC-162(Math.max spread)や IC-257(setToolsActive O(n²))と違って実害は限定的。
- **提案**: 現状維持。ドキュメント化のみ。

### IC-271 \`output-gate sanitizeManifestSource\` が文字列長で切り詰め (IC-265/IC-193 同根)
- **カテゴリ**: 国際化 / バグ (計算精度)
- **対象**: \`mekann/context/output-gate/store.ts\` (\`sanitizeManifestSource\`, 行番号要確認)
- **概要**: \`store.test.ts:6\` が \`sanitizeManifestSource\` を import しているので存在するが、実装は \`source\` オブジェクトを文字列化して長さで切り詰める可能性。日本語 \`source\` 内容(command、args)が char 数で切られ、manifest の \`source\` フィールドが途切れる。IC-265(objective 120 char)/IC-193(truncate char)と同根。
- **提案**: 実装を確認の上、byte/token ベースまたは構造化保持へ。

### IC-271 ~~sanitizeManifestSource 文字列長切り詰め~~ (訂正: 取り下げ)
- 調査メモ: `mekann/context/output-gate/store.ts:133-153` を確認したところ、`sanitizeManifestSource` は `safeUtf8Slice(redactSecrets(value).text, maxStringBytes)` を使用。**byte-safe かつ秘密マスキング済み**の正しい実装。誤報として取り下げ。
- 副産物の重要 positive note: `output-gate/store.ts` は `safeUtf8Slice`(byte-safe) + `redactSecrets`(IC-138 の正本) + WeakSet で循環参照検出と、**最も堅牢に実装されたモジュールの一つ**。この堅牢パターン（safeUtf8Slice + redactSecrets + Circular検出）を他の壊れたtruncateサイト（IC-269）へ波及すべき。つまり output-gate/store.ts の設計を「リファレンス実装」として他モジュールが従う形が理想。

---

## 第42バッチ (探索継続)

### IC-272 `output-gate retainArtifacts` の manifest 全書き換えが非アトミック + saveArtifact と競合 (IC-017/IC-140 同根)
- **カテゴリ**: データ整合性 / 並行性
- **対象**: `mekann/context/output-gate/store.ts:286-308` (`retainArtifacts`)
- **概要**: retention が (1) `readManifest` → (2) unlink 古い artifact → (3) `fsp.writeFile(manifestPath, kept.map(...).join("\n"))` で **manifest を全書き換え**。問題:
  - **非アトミック**: (2)と(3)の間にクラッシュすると、artifact は削除済みだが manifest が古い(削除済み artifact への dangling reference)。次回 `searchToolOutputs` が dangling entry を引くと file not found。
  - **saveArtifact と競合**: 別プロセスが手元で `saveArtifact`(`appendFile` で manifest に行追加: IC-140)している最中に、retain が `writeFile` で全体を上書きすると、append されたばかりの新規エントリが**消失**。read-modify-write の古典的 race。
  - `writeFile` が tmp + rename でなく直接上書きなので、書き込み中クラッシュで manifest 自体が破損(部分 JSON 行)。
- **提案**:
  1. read-modify-write をやめ、行削除は manifest を append-only で "tombstone" マークするか、ロック取得後に安全に compact。
  2. tmp + rename のアトミック置換。
  3. IC-03/IC-139 の共通アトミック追記/書き換えヘルパと統合。
- **備考**: IC-099(ledger snapshot retention)と同じ「retention の破壊的全書き換え」問題の第2実例。

### IC-273 `output-gate shouldGateOutput` の toolName ブロックリストがハードコード (拡張性)
- **カテゴリ**: 設計 / 拡張性
- **対象**: `mekann/context/output-gate/store.ts:214-219`
- **概要**: `if (opts.toolName === "search_tool_outputs" || opts.toolName === "search_context_events" || opts.toolName === "summarize_session_context") return false;` で、検索系ツールの出力を gate 対象外にするブロックリストがハードコード。新しい検索/集計ツールを追加するたびにここを更新する必要があり、忘れると検索結果が output-gate に外部化されて循環参照(検索結果を保存→その保存結果を検索→保存…)を起こす。toolName の「検索系」分類が単一ソースでない。
- **提案**: ツール登録時に `bypassOutputGate: true` メタデータを付与可能にし、`shouldGateOutput` はそれを参照。ブロックリストをコードから排除。

### IC-274 `output-gate shouldGateOutput` が `[output-gate]` プレフィックスを文字列 startsWith で検出 (偽陽性回避の脆弱性)
- **カテゴリ**: 場牢性 / 設計
- **対象**: `mekann/context/output-gate/store.ts:217`
- **概要**: `if (text.startsWith("[output-gate]")) return false;` で、output-gate が生成した stub を再 gate しないための検出。ユーザが偶然 `[output-gate]` で始まるテキスト(tool output の冒頭がそうなっていた等)を出すと、本来 gate すべき大出力が素通り。また output-gate 以外の feature が同じプレフィックスを使うと衝突。マジックプレフィックスによる自己言及検出は脆い。
- **提案**: tool result の metadata(`details.outputGate?.stored`)で判定(IC-239 の syncSearchToolSurface が既にこの手法を使っている)し、文字列プレフィックスに依存しない。

### IC-275 `output-gate resolveArtifactPath` が symlink/traversal をどう扱うか要確認 (IC-103/IC-117/IC-160 同根)
- **カテゴリ**: セキュリティ / 場牢性
- **対象**: `mekann/context/output-gate/store.ts` (`resolveArtifactPath`)
- **概要**: `retainArtifacts` が `resolveArtifactPath(cwd, entry)` で manifest entry から絶対パスを復元し `unlink`。`saveArtifact` は `relPath.startsWith("..") || path.isAbsolute(relPath)` を弾く(IC-160 と同じガード)が、manifest を他プロセスが書き換えた場合や破損 manifest で、`entry.path` が `../etc/passwd` や symlink を指すと、`unlink` が workspace 外のファイルを削除しうる。IC-103/IC-117/IC-160 と同根の symlink/path traversal。
- **提案**: `resolveArtifactPath` が必ず `artifactsDir(cwd)` 配下であることを `realpath` 付きで assert。manifest の path フィールドを信頼せず再検証。
