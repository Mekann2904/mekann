# goal

`goal` は、session/thread に一般目的を保持し、予算内で agent が作業を継続できるようにする autonomy feature です。

## 使う場面

- 「この目的をしばらく追い続けてほしい」
- metric-driven な実験ではない
- 継続的に目的を追跡したい

## Command

- `/goal <objective>`: goal を作成。完了済み goal は確認なしで置換し、未完了 goal は確認後に置換
- `/goal`: 現在の goal を表示
- `/goal edit`: objective を編集
- `/goal pause` / `/goal resume`: 一時停止・再開
- `/goal clear`: goal を削除
- `/goal budget <n|none>`: token budget を設定

## Tool

- `get_goal`: 現在の goal を確認
- `create_goal`: user が明示したときだけ goal を作成。完了済み goal は新しい goal として置換
- `update_goal`: objective 達成時に `complete` にする

## 境界

`goal` は main mode 上で一般目的、調査、反復作業を継続します。専用の metric contract や candidate escrow は持ちません。評価には通常の checks、Subagent による fresh review、human review を使用します。

Pi session fork では選択 branch の goal snapshot（identity・usage を含む）を新 session に継承します。fork 直後の自動 continuation は抑止し、最初の明示 turn が開始された後に通常の continuation を再開します。terminal error は retry/compaction が尽きた `agent_settled` 時点で `blocked`、usage/rate limit は `usage_limited` に遷移します。状態・usage はローカルの `goal:telemetry` event でも観測できます。
