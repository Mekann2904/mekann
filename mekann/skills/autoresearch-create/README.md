# autoresearch-create

`autoresearch-create` は、ユーザーが「autoresearch して」「この指標を改善して」などと依頼したときに、実験ループの準備を支援するスキルです。

## 機能

- 目的・評価指標・改善方向を整理する
- ベンチマークコマンドと正確性チェックを確認する
- `autoresearch.md` や `autoresearch.sh` の作成を支援する
- `autoresearch_init` / `autoresearch_run` / `autoresearch_log` などの利用手順を案内する

## 使い方

通常は pi の skill 読み込み機構から参照されます。統合パッケージでは `package.json` の `pi.skills` に `./mekann/skills` が登録されています。

## 実体

詳細な手順は [`SKILL.md`](./SKILL.md) に記述されています。
