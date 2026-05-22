# goal

`goal` は、session/thread に一般目的を保持し、予算内で agent が作業を継続できるようにする autonomy feature です。

## 使う場面

- 「この目的をしばらく追い続けてほしい」
- metric-driven な実験ではない
- autoresearch ほど重い候補評価ループは不要

## Command

- `/goal <objective>`: goal を作成
- `/goal`: 現在の goal を表示
- `/goal edit`: objective を編集
- `/goal pause` / `/goal resume`: 一時停止・再開
- `/goal clear`: goal を削除
- `/goal budget <n|none>`: token budget を設定

## Tool

- `get_goal`: 現在の goal を確認
- `create_goal`: user が明示したときだけ goal を作成
- `update_goal`: objective 達成時に `complete` にする

## 境界

`goal` は experiment contract ではありません。候補生成・繰り返し評価・acceptance decision が必要な場合は [`autoresearch`](../autoresearch/) を使います。
