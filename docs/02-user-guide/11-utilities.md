---
title: ユーティリティ
category: user-guide
audience: daily-user
last_updated: 2026-02-14
tags: [utilities, monitoring, analytics, status]
related: [../README.md, ./01-extensions.md]
---

# ユーティリティ

> パンくず: [Home](../../README.md) > [User Guide](./) > ユーティリティ

## 概要

piには作業状況の監視・分析・可視化を行うためのユーティリティ拡張機能が含まれています。

| 拡張機能 | 説明 |
|-----------|------|
| **usage-tracker** | LLM使用量とコスト、日次ヒートマップの表示 |
| **agent-usage-tracker** | 拡張機能の使用統計、エラー率、コンテキスト占有率の分析 |
| **context-usage-dashboard** | 現在のコンテキスト使用状況と直近7日間の分析ダッシュボード |
| **agent-idle-indicator** | エージェント実行状況の視覚的インジケーター |
| **skill-inspector** | スキル割り当て状況の表示と分析 |

## usage-tracker - LLM使用状況

### 概要

モデルコストと日次使用量のヒートマップを表示します。セッション履歴から使用状況を集計し、コスト管理に役立ちます。

### 使用方法

```bash
/usage
```

### 主な機能

- **総コスト表示**: 全期間および選択範囲のコスト合計
- **モデル別使用量**: モデルごとのコストとシェア
- **日次ヒートマップ**: 過去12週間の使用量を可視化
- **週単位切替**: 1週間/12週間で表示範囲を切り替え

### 画面構成

```
LLM Usage
Model cost + daily heatmap for selected range (12w)

Total Cost  $12.3456
Models      8

Top Models (USD)
#  model                 cost        share   bar
 1  claude-3-5-sonnet   $8.3421   67.6%  ###################
 2  gpt-4o              $2.1234   17.2%  #####
 3  claude-3-opus        $1.5678   12.7%  ###

Daily Activity (last 12 weeks)
Sun ░░▓▓░▓░░▓
Mon ░▓░░▓▓░░▓
Tue ░░░▓▓░░▓▓
Wed ░▓░░▓░░▓░
Thu ░░▓▓░░▓░░
Fri ░▓░░▓▓░░░
Sat ░░░▓░░▓░░
Range 2025-12-01 .. 2026-02-11
Scale (cost/day): - $0, ░ <=$0.12, ▒ <=$0.42, ▓ <=$0.84, █ >$0.84

[1] 1w  [2] 12w  [r] refresh  [q] close
```

### キーボード操作

| キー | 説明 |
|------|------|
| `1` | 1週間表示 |
| `2` | 12週間表示 |
| `r` | データのリフレッシュ |
| `q` / `ESC` | 閉じる |

### ヒートマップの記号

| 記号 | 説明 |
|------|------|
| `-` | 未使用 |
| `░` | 低使用 |
| `▒` | 中使用 |
| `▓` | 高使用 |
| `█` | ピーク |

## agent-usage-tracker - エージェント使用状況

### 概要

拡張機能ごとの使用回数、エラー率、平均コンテキスト占有率を追跡します。どの機能がどの程度使用され、信頼性が高いかを分析できます。

### 使用方法

```bash
# サマリー表示
/agent-usage

# 最近のイベント履歴
/agent-usage recent [n]

# 統計のリセット
/agent-usage reset

# JSONエクスポート
/agent-usage export [path]
```

### 使用可能なツール

| ツール | 説明 |
|--------|------|
| `agent_usage_stats` | 統計の読み取り/リセット/エクスポート |

### ツールパラメータ

| パラメータ | 型 | 説明 | 必須 | デフォルト |
|-----------|----|------|------|----------|
| `action` | string | アクション種類 | 省略可 | `summary` |
| `limit` | number | summary/recent の件数制限 | 省略可 | 20 |
| `exportPath` | string | export 時のパス | 省略可 | 自動生成 |

### actionパラメータの値

| 値 | 説明 |
|----|------|
| `summary` | サマリーを表示 |
| `recent` | 最近のイベント履歴を表示 |
| `reset` | 全統計をリセット |
| `export` | JSON形式でエクスポート |

### 出力例

#### summary

```
Agent Usage Tracker
Updated: 2026-02-11T10:30:00.000Z

Tool calls: 1,234
Tool errors: 15 (1.2%)
Agent runs: 456
Agent run errors: 8 (1.8%)
Average context occupancy: 65.3% (1,234 samples)
Average context tokens: 12,456 (1,234 samples)

Discovered extension tools: 42
Discovered extension commands: 12

By extension:
- core: calls=890, errors=5 (0.6%), avg_ctx=60.5%, features=6
- subagents: calls=234, errors=7 (3.0%), avg_ctx=70.2%, features=4
- agent-teams: calls=89, errors=3 (3.4%), avg_ctx=75.8%, features=4

Top features:
- [tool] core/bash: calls=456, errors=2 (0.4%), avg_ctx=55.3%
- [tool] core/read: calls=345, errors=1 (0.3%), avg_ctx=45.6%
- [tool] subagents/subagent_run: calls=123, errors=4 (3.3%), avg_ctx=68.9%
- [agent_run] subagents/subagent_run: calls=456, errors=8 (1.8%), avg_ctx=72.1%

Commands:
- /agent-usage                summary
- /agent-usage recent [n]     recent logs
- /agent-usage reset          reset all stats
- /agent-usage export [path]  write json snapshot
```

#### recent

```
Recent events (10/10):
- 2026-02-11T10:29:15.000Z | [tool] subagents/subagent_run | ok | ctx=68.9% | tok=12,345
  input=このプロジェクトの構造を調査してください
- 2026-02-11T10:28:30.000Z | [tool] core/read | ok | ctx=45.6% | tok=8,765
  input={"path":"src/index.ts"}
```

#### export

```
Exported: .pi/analytics/agent-usage-export-2026-02-11-103000.json
```

### 保存されるファイル

```
.pi/analytics/
└── agent-usage-stats.json    # 統計データ
```

### トラッキングされる項目

| 項目 | 説明 |
|------|------|
| 拡張機能別ツール呼び出し回数 | 各拡張機能のツールが何回呼ばれたか |
| ツールエラー率 | ツール呼び出しのエラー率 |
| エージェント実行回数とエラー率 | エージェントの実行回数とエラー率 |
| コンテキスト占有率 | 平均的なコンテキスト使用率 |
| イベント履歴 | 最大5000件の詳細な履歴 |

## context-usage-dashboard - コンテキスト使用状況ダッシュボード

### 概要

現在のコンテキスト使用状況と直近7日間の使用状況を表示するダッシュボードです。ツールごとの使用傾向と空き容量を可視化し、拡張機能の取捨選択を助けます。

### 使用方法

```bash
/context-usage
```

### 画面構成

```
Context Usage Dashboard
scope: current workspace (/path/to/project)

Current Context
used 12,456 / 128,000 (9.7%)
free 115,544 tokens
usage=12,456 trailing=0

estimate: user 15.3% | assistant 35.2% | tools 42.1% | other 7.4%

Current Tool Occupancy (estimate)
tool                       tokens    share   calls
subagent_run                5234     42.0%      3
agent_team_run             4123     33.1%      1
read                        1987     16.0%     12
bash                         892      7.2%      5

Last 7 Days
2026-02-04 .. 2026-02-11 | files=156
usage tokens    145,678
input 89,234 | output 52,345
cacheRead 3,456 | cacheWrite 567
cost $12.3456

Weekly Model Breakdown
model                                usage tokens   share
claude-3-5-sonnet                     98,234     67.4%
gpt-4o                                42,345     29.1%
claude-3-opus                           5,099      3.5%

Weekly Tool Breakdown
tool                       calls  context(est)  usage(est)
subagent_run                 23        12,456       67,890
agent_team_run               8         8,901        42,345
read                       145       5,234        18,901
bash                        67        4,567         9,876
```

### キーボード操作

| キー | 説明 |
|------|------|
| `r` | データのリフレッシュ |
| `q` / `ESC` | 閉じる |

### 表示される項目

#### 現在のコンテキスト

| 項目 | 説明 |
|------|------|
| used | 使用中のトークン数 |
| free | 空きトークン数 |
| usage | 実際の使用トークン |
| trailing | 末尾のトークン |
| estimate | 推定カテゴリ別シェア |

#### 現在のツール占有率

| 項目 | 説明 |
|------|------|
| tool | ツール名 |
| tokens | 推定トークン数 |
| share | 総トークン数に対するシェア |
| calls | 呼び出し回数 |

#### 直近7日間

| 項目 | 説明 |
|------|------|
| usage tokens | 総使用トークン |
| input/output | 入力/出力トークン |
| cacheRead/cacheWrite | キャッシュ読み書き |
| cost | コスト |
| models | モデル別使用量 |
| tools | ツール別使用量 |

### トークン推定方法

- `context(est)`: toolResult ペイロードサイズの推定（文字数/4 + 固定画像予算）
- `usage(est)`: assistant 使用トークンを呼び出したツールに分配

## kitty-status-integration - Kittyターミナル統合

### 概要

piとkittyターミナルを連携し、作業状態をウィンドウタイトルや通知に反映する拡張機能です。kittyターミナルを使用している場合、自動的に検出して機能が有効になります。

### 機能

| 機能 | 説明 |
|------|------|
| **ウィンドウタイトルの自動更新** | piの処理状態に合わせてタイトルが変化 |
| **タブ名の同期** | kittyのタブ名にも同じ情報が表示 |
| **デスクトップ通知** | LLMレスポンス完了時などの通知 |
| **kitty以外では何もしない** | 自動検出して安全 |

### 使用例

#### 自動更新されるタイトル

| 状態 | タイトル表示 |
|------|-------------|
| セッション開始時 | `pi: project-name` |
| プロンプト送信時 | `pi: project-name [Processing... T1]` |
| ツール実行中 | `pi: project-name [Running: read]` |
| 完了時 | `pi: project-name` （通知あり） |

#### 通知例

- `✓ Done: 3 tool(s) in project-name` - ターン完了
- `[Model]Model: anthropic/claude-3-5-sonnet` - モデル変更
- `[Tool failed: bash` - ツールエラー

### コマンド

#### /kitty-title `[title]`

ウィンドウタイトルをカスタム設定します。

```bash
/kitty-title               # デフォルト（現在のディレクトリ名）に戻す
/kitty-title My Project   # カスタムタイトルを設定
```

#### /kitty-notify `<message>`

kitty通知を送信します。

```bash
/kitty-notify Building complete!
```

#### /kitty-status

現在の統合ステータスを表示します。

```bash
/kitty-status
```

出力:
```
✓ Kitty Status Integration: Active
  Window ID: 1
  Working dir: my-project
  Turn count: 5
  Status: Running: read
```

### 動作条件

- kittyターミナルを使用していること（環境変数 `KITTY_WINDOW_ID` で判定）
- kittyのshell integrationが有効であること（デフォルトで有効）

### トラブルシューティング

#### kittyでタイトルが変わらない場合

kittyの設定でshell integrationが有効になっているか確認：

`~/.config/kitty/kitty.conf`:
```conf
# デフォルトで有効（無効化されている場合は有効化）
shell_integration enabled
```

#### 通知が表示されない場合

kittyの通知設定を確認：

`~/.config/kitty/kitty.conf`:
```conf
# 通知許可（Linuxの場合）
allow_remote_control yes
```

### 技術詳細

#### エスケープシーケンス

- **ウィンドウタイトル**: `OSC 2 ; title ST`
- **通知**: `OSC 99 ; i=ID:d=duration:text ST`

#### イベント

以下のpiイベントに反応します：

- `session_start` - セッション開始
- `agent_start` / `agent_end` - エージェント処理
- `turn_start` / `turn_end` - ターン処理
- `tool_call` / `tool_result` - ツール実行
- `session_shutdown` - セッション終了
- `model_select` - モデル変更

## skill-inspector - スキル割り当て状況

### 概要

スキルの割り当て状況を表示・分析するツールです。どのスキルが利用可能で、どのチームやメンバーに割り当てられているかを確認できます。

### 使用方法

```bash
# 全スキルの概要
/skill-status

# チーム一覧とスキル割り当て
/skill-status teams

# 特定チームの詳細
/skill-status team <teamId>

# 特定スキルの詳細
/skill-status skill <skillName>
```

### 使用可能なツール

| ツール | 説明 |
|--------|------|
| `skill_status` | スキル割り当て状況の表示と分析 |

### ツールパラメータ

| パラメータ | 型 | 説明 | 必須 | デフォルト |
|-----------|----|------|------|----------|
| `view` | string | 表示ビュー種類 | 必須 | - |
| `teamId` | string | team ビュー時のチームID | 省略可 | - |
| `skillName` | string | skill ビュー時のスキル名 | 省略可 | - |

### viewパラメータの値

| 値 | 説明 |
|----|------|
| `overview` | 全スキルの一覧と割り当て状況 |
| `teams` | 全チームのスキル割り当て一覧 |
| `team` | 特定チームの詳細（teamId必須） |
| `skill` | 特定スキルの詳細（skillName必須） |

### 出力例

#### overview（デフォルト）

```
SKILLS ASSIGNMENT OVERVIEW
======================================================================

Total Skills: 5
Assigned to Teams: 2
Assigned to Members: 3

ALL SKILLS
----------------------------------------------------------------------

[git-workflow]
  Status: [TEAM + MEMBER]
  Desc: Git操作・ブランチ管理スキル。コミット作成、ブランチ操作、マージ、リベース...
  Members: architect, reviewer

[code-review]
  Status: [MEMBER ONLY]
  Desc: コードレビュー専用スキル。品質チェック、ベストプラクティス検証...
  Members: reviewer

[documentation]
  Status: [TEAM ONLY]
  Desc: ドキュメント作成スキル。README、APIドキュメント、ガイド作成...

[testing]
  Status: [UNASSIGNED]
  Desc: テスト作成・実行スキル。ユニットテスト、統合テスト...
```

#### teams

```
TEAMS SKILLS OVERVIEW
======================================================================

Teams with skills: 2
Teams without skills: 1

TEAMS WITH SKILL ASSIGNMENTS
----------------------------------------------------------------------

development-team [ACTIVE]
  ID: dev-team
  Team Common: documentation, testing
  Members with skills (2/3):
    architect: git-workflow, system-design
    reviewer: code-review, git-workflow

review-team [ACTIVE]
  ID: review-team
  Team Common: code-review
  Members with skills (1/2):
    reviewer: code-review, quality-check

TEAMS WITHOUT SKILLS
----------------------------------------------------------------------
  deploy-team (2 members)
```

#### team（特定チーム詳細）

```
TEAM: development-team
======================================================================

ID: dev-team
Status: ACTIVE
Team Common Skills: documentation, testing

MEMBER SKILLS
----------------------------------------------------------------------

architect
  [T] documentation
  [M] git-workflow
  [M] system-design

reviewer
  [T+M] documentation
  [T] testing
  [M] code-review
  [M] git-workflow

developer
  [T] documentation
  [T] testing
```

#### skill（特定スキル詳細）

```
SKILL: git-workflow
======================================================================

Location: .pi/lib/skills/git-workflow/SKILL.md

Description:
  Git操作・ブランチ管理スキル。コミット作成、ブランチ操作、マージ、
  リベース、コンフリクト解決、履歴分析を支援。チーム開発での
  バージョン管理ワークフローを効率化。

Assignments:
  Team Common: development-team, release-team
  Members (3):
    dev-team/architect
    dev-team/reviewer
    release-team/release-manager
```

### 割り当てステータスの記号

| ステータス | 説明 |
|-----------|------|
| `[TEAM + MEMBER]` | チーム共通かつメンバー個別にも割り当て |
| `[TEAM ONLY]` | チーム共通のみ |
| `[MEMBER ONLY]` | メンバー個別のみ |
| `[UNASSIGNED]` | 未割り当て |

### メンバースキルの記号

| 記号 | 説明 |
|------|------|
| `[T]` | チーム共通スキル |
| `[M]` | メンバー固有スキル |
| `[T+M]` | チーム共通とメンバー固有の両方 |

### 主な機能

- **スキル一覧表示**: 利用可能な全スキルと割り当て状況
- **チーム別分析**: 各チームのスキル構成を確認
- **メンバー別分析**: メンバーごとのスキル割り当て
- **未割り当て検出**: 使用されていないスキルの特定

### データソース

- **スキル定義**: `.pi/lib/skills/*/SKILL.md`
- **チーム定義**: `.pi/agent-teams/definitions/*.md` または `*.json`

### 活用シナリオ

1. **スキル整理**: どのスキルが実際に使用されているか確認
2. **チーム設計**: チーム間でのスキル重複や不足を分析
3. **メンバー設定**: 各メンバーに適切なスキルが割り当てられているか確認
4. **メンテナンス**: 未使用スキルの特定と削除検討

## agent-idle-indicator - エージェント停止中インジケーター

### 概要

エージェントが実行されていない状態を視覚的に表示します。ターミナルタイトルとフッターにインジケーターを表示し、実行状況を把握しやすくなります。

### 機能

#### 1. ターミナルタイトル

| 状態 | タイトル | アイコン |
|------|----------|--------|
| 実行中 | `[[RUNNING]] pi: my-project` | [RUNNING] 緑 |
| 停止中 | `[[STOPPED]] pi: my-project` | [STOPPED] 赤 |

#### 2. ステータスバー

エージェント停止中はフッターに表示されます：

```
停止中
```

### 自動判定

- `agent_start` イベントで緑インジケーター表示
- `agent_end` イベントで赤インジケーター表示
- セッション開始時に停止中として表示
- セッション終了時に元のタイトルに復元

### 設定

拡張機能は自動的に動作し、特別な設定は不要です。

### 使用例

```
# pi起動時
[[STOPPED]] pi: my-project     # 停止中

# タスク実行中
[[RUNNING]] pi: my-project     # 実行中

# タスク完了後
[[STOPPED]] pi: my-project     # 停止中
```

## 使用上のヒント

### 複合的な利用

これらのユーティリティを組み合わせることで、piの使用状況を包括的に把握できます：

1. **コスト管理**: `/usage` でモデルコストを確認
2. **使用傾向**: `/agent-usage` でどの機能をどの程度使っているか確認
3. **リソース状況**: `/context-usage` で現在のコンテキスト使用状況を確認
4. **実行状況**: インジケーターでエージェントの実行状況を視覚的に確認

### 定期的な確認

- 毎週 `/usage` でコストを確認
- 月に一度 `/agent-usage export` で統計をエクスポート
- 大きなタスク前後に `/context-usage` でリソース使用状況を確認

### パフォーマンス最適化

`/context-usage` で以下を確認することで、パフォーマンスを最適化できます：

- どのツールが多くのコンテキストを使用しているか
- 平均的なコンテキスト占有率
- モデル別の使用傾向

これに基づいて、あまり使用していない拡張機能を無効化するなどの最適化が可能です。

## トラブルシューティング

### usage-tracker: データが表示されない

- セッション履歴が存在するか確認（`~/.pi/agent/sessions/`）
- キャッシュファイルを削除して再読み込み（`~/.pi/extensions/usage-cache.json`）

### agent-usage-tracker: エクスポートに失敗

- 出力ディレクトリに書き込み権限があるか確認
- パスが正しいか確認（相対パスはプロジェクトルートからの相対）

### context-usage-dashboard: 推定値が不正確

推定は以下の近似に基づいています：

- 文字列: 文字数 / 4
- 画像: 固定 4800 トークン
- その他: JSON stringify の文字数 / 4

実際のトークン使用状況と異なる場合があります。

### agent-idle-indicator: インジケーターが変わらない

- 拡張機能がロードされているか確認（pi起動時に通知される）
- イベントが正しく発火しているか確認（ターミナル出力を確認）

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
- [subagents](./08-subagents.md) - サブエージェント
- [agent-teams](./09-agent-teams.md) - エージェントチーム
