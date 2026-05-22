# autoresearch-create skill

`autoresearch-create` は、user が「autoresearch して」「この指標を改善して」などと依頼したときに、autoresearch の開始準備を支援する skill です。

## 役割

- 目的・metric・改善方向を整理する
- benchmark command と checks を確認する
- plan / contract draft の作成を支援する
- autoresearch tool の使いどころを案内する

## 境界

Skill は runtime feature ではありません。Pi coding agent が読む task-specific instruction package です。

詳細な手順は [`SKILL.md`](./SKILL.md) にあります。
