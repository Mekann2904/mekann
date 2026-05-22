# skills

`skills` は、pi coding agent が特定の作業手順を読み込むためのスキル定義をまとめたディレクトリです。

## スキル

| スキル | 説明 |
|---|---|
| [`autoresearch-create`](./autoresearch-create/) | ユーザーの自然文依頼から autoresearch の目的・指標・実行コマンドを整理し、実験ループを開始する |
| [`grill-with-docs`](./grill-with-docs/) | 計画を既存のドメイン語彙・コード実態・ADR に照らして詰め、必要に応じて CONTEXT.md / ADR を更新する |
| [`improve-codebase-architecture`](./improve-codebase-architecture/) | codebase の浅い module、悪い seam、低い locality / leverage を調査し、architecture 改善候補を HTML report として提示する |
