# agent-guidelines

`agent-guidelines` は、通常の coding-agent 作業に常時適用する agent guideline を prompt fragment として提供します。

## 役割

- 小さく正しい変更を優先する
- unrelated refactor や formatting churn を避ける
- user work を壊さない
- 実行した検証を正直に報告する
- review では重要度順に findings を出す

Skill は task-specific workflow ですが、agent guideline は広く常時適用される行動規則です。
