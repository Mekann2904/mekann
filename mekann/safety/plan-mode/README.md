# plan-mode

`plan-mode` は、実装前に read-only 調査と計画を行う UX-level collaboration mode です。

## 何をするか

- `/plan` または keybinding で main / plan を切り替える
- plan 中は実装ではなく調査・設計・計画に集中させる
- main に戻ると proposed plan を実行プロンプトとして渡す
- plan 用と main 用で model / thinking effort を分けられる

## 安全上の境界

`plan-mode` は sandbox ではありません。command intent check は UX guard であり、hard runtime boundary は [`sandbox`](../sandbox/) が担当します。

## 使う場面

- 変更前に設計を固めたい
- 大きな refactor の前に影響範囲を調べたい
- user に実装計画を確認してほしい

## 関連

- [`sandbox`](../sandbox/): `bash` tool の実行制限
- [`goal`](../../autonomy/goal/): plan mode 中は autonomous continuation を抑制する
