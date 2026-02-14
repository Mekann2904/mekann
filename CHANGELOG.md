# 変更履歴

## [v0.3.1] - 2026-02-15

### 変更
- **ULモード: 適応型委任モードへ刷新**
  - 固定3フェーズ (subagent_run_parallel → agent_team_run → reviewer) を廃止
  - フェーズ数はLLMの裁量に変更（最小1、上限なし）
  - 完了前の `reviewer` 実行を必須化（品質保証）
  - タスク規模に応じた推奨パターンを提示:
    - 小規模: `subagent_run` または直接実行
    - 中規模: `subagent_run_parallel(subagentIds: researcher, architect, implementer)`
    - 大規模: `agent_team_run(teamId: core-delivery-team)`

### ドキュメント
- docs/02-user-guide/10-ul-dual-mode.md: 適応型モードの説明に更新

---

## [v0.3.0] - 2026-02-15

### 追加
- **プロバイダー/モデル別レート制限システム**
  - `lib/provider-limits.ts`: プロバイダー/モデル別のレート制限定義
    - Anthropic (Claude 4.x, 3.5, 3系)
    - OpenAI (GPT-4o, GPT-4, o1系)
    - Google (Gemini 2.5, 2.0, 1.5系)
    - Mistral, Groq, Cerebras, xAI
    - ティア別制限 (pro, max, plus, free等)
  - `lib/adaptive-rate-controller.ts`: 適応学習システム
    - 429エラー検知 → 制限を30%削減
    - 成功継続 → 5分後に10%ずつ回復
    - プロバイダー/モデル単位で独立管理
  - `cross-instance-coordinator.ts` 拡張: モデル使用追跡
    - 各インスタンスのアクティブモデルを記録
    - 同一モデル使用インスタンス数で配分
  - 新ツール: `pi_model_limits` - モデル別制限確認
  - 新コマンド: `/pi-limits` - 制限一覧表示

### アルゴリズム
```
有効並列数 = floor(
  (プリセット制限 × 学習済み調整) /
  同一モデル使用中のインスタンス数
)
```

### 環境変数
- `PI_PROVIDER_TIER`: プロバイダー全体のティア
- `PI_{PROVIDER}_TIER`: プロバイダー固有のティア (例: PI_ANTHROPIC_TIER)

### 変更
- `agent-runtime.ts`: モデル別制限を考慮するヘルパー関数追加
  - `getModelAwareParallelLimit()`: モデル固有の並列制限取得
  - `shouldAllowParallelForModel()`: 並列実行可否判定
  - `getLimitsSummary()`: 制限サマリー取得

---

## [v0.2.2] - 2026-02-15

### 追加
- **クロスインスタンスコーディネーター**
  - `lib/cross-instance-coordinator.ts`: 複数piインスタンス間の並列数を自動調整
  - `cross-instance-runtime.ts` 拡張機能: ライフサイクル管理とステータス表示
  - `/pi-instances` コマンド: アクティブなpiインスタンス一覧と並列配分を表示
  - `pi_instance_status` ツール: プログラムからステータス取得

### 動作
- pi起動時に `~/.pi/runtime/instances/` にロックファイル作成
- 15秒ごとにハートビート更新
- 60秒以上更新がないインスタンスは自動削除
- 並列数 = floor(PI_TOTAL_MAX_LLM / アクティブインスタンス数)

### 環境変数
- `PI_TOTAL_MAX_LLM`: 全インスタンス合計の最大並列LLM呼び出し（デフォルト: 6）
- `PI_HEARTBEAT_INTERVAL_MS`: ハートビート間隔（デフォルト: 15000）
- `PI_HEARTBEAT_TIMEOUT_MS`: タイムアウト（デフォルト: 60000）

### 変更
- `agent-runtime.ts`: コーディネーターが初期化されている場合、動的に並列制限を適用
- README.md: cross-instance-runtime をオーケストレーションセクションに追加

---

## [v0.2.1] - 2026-02-14

### 追加
- **skill-inspector拡張機能**
  - `skill_status` ツール: 現在のスキル割り当て状況を表示
  - `/skill-status` コマンド: スキル情報のクイックアクセス

- **新しいエージェントチーム**
  - `mermaid-diagram-team`: コード視覚化タスクフォース（シーケンス図、フローチャート等）
  - `research-team`: データ分析・科学研究プロジェクト専用チーム

### ドキュメント
- README.mdのチーム一覧に design-discovery-team, file-organizer-team, mermaid-diagram-team, research-team を追加
- README.mdのスキル数を正確な27個に更新
- docs/02-user-guide/09-agent-teams.md に mermaid-diagram-team, research-team の詳細を追加
- docs/02-user-guide/08-subagents.md に skills パラメータの説明を追加

---

## [v0.2.0] - 2026-02-12

### 追加
- **エージェントチームプロンプトの Markdown 外部化**
  - チーム定義を `.pi/agent-teams/definitions/` 以下の Markdown ファイルで管理
  - YAML frontmatter を使用した型安全な定義フォーマット
  - チームテンプレート (`template-team.md`) の追加
  - 新しいチーム追加ワークフローの文書化

### 変更
- `agent-teams.ts` に Markdown ローダー関数を追加
- `parseFrontmatter` を `@mariozechner/pi-coding-agent` からインポート
- `createDefaultTeams()` を Markdown ファイルからの読み込みに置換
- ハードコードされたチーム定義を `getHardcodedDefaultTeams()` としてフォールバック化
- `TEAM_DEFAULTS_VERSION` を 2 → 3 に更新

### 改善
- 長いプロンプトの記述性向上（Markdown 形式）
- 新しいチーム追加の障壁低減（1ファイル追加のみ）
- チーム定義のバージョン管理（Git での差分表示が容易）

### ドキュメント
- `docs/agent-teams-reference.md` に「新しいチームを追加する」セクションを追加
- `README.md` のプロジェクト構造を更新

---

## [未公開] - 2026-02-11

### 追加
- Deepwikiスタイルのドキュメント構造
- 読者別ナビゲーションパス（新規ユーザー、日常ユーザー、開発者、貢献者）
- パンくずリストと関連トピックリンク
- メタデータ標準（YAMLフロントマター）

### 変更
- README.mdをポータル化（500行以内に短縮）
- docs/README.mdを強化
- ドキュメント構造を3レベルの階層に再編

### ドキュメントの移動
- インストールガイド → `docs/01-getting-started/02-installation.md`
- クイックスタート → `docs/01-getting-started/01-quick-start.md`
- 初回ステップ → `docs/01-getting-started/03-first-steps.md`
- 拡張機能一覧 → `docs/02-user-guide/01-extensions.md`
- question詳細 → `docs/02-user-guide/02-question.md`
- rsa_solve詳細 → `docs/02-user-guide/03-rsa-solve.md`
- 開発者ガイド → `docs/03-development/01-getting-started.md`

---

## [v0.1.0] - 2026-02-10

### 初期リリース

#### コア拡張機能
- question, rsa_solve, loop_run, fzf, abbr

#### オーケストレーション
- plan_*, subagent_*, agent_team_*, ul-dual-mode

#### ユーティリティ
- usage-tracker, agent-usage-tracker, context-dashboard, agent-idle-indicator, kitty-status-integration

---

## バージョン命名規則

- **Major**: 破壊的な変更
- **Minor**: 新機能の追加
- **Patch**: バグ修正
