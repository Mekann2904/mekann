---
name: mekann-pi-skill-dev
description: Mekann の Pi 向け skill を開発・更新・導入する。mattpocock/skills 由来の skill 更新、Pi 向け編集、新規 skill 導入を行うときに使う。
disable-model-invocation: true
---

# mekann-pi-skill-dev

この skill は、Mekann リポジトリ内の Pi 向け skill を開発・更新・導入するための作業手順です。

## 基本方針

Mekann では、upstream から取得した skill をそのまま実行時に読ませるのではなく、Pi が読む場所に取り込んだうえで、Pi 開発者が Pi 向けに編集します。

- upstream mirror は `vendor/<upstream-name>` に置く。例: `mattpocock/skills` なら `vendor/mattpocock-skills`。
- Pi coding agent が読む skill は `mekann/skills` に置く。
- `vendor/<upstream-name>` は正本 mirror として扱い、直接編集しない。
- `mekann/skills` は Pi-maintained copy として扱い、Pi 固有の編集はここに行う。
- Pi coding agent は `mekann/skills` 側だけを skill として読む。

## 既存 upstream skill の更新

既存 upstream skill を更新する場合は、その upstream 用の update script を実行する。

`mattpocock/skills` 由来の skill の場合は、次を実行する。

```bash
npm run update:mattpocock-skills
```

このコマンドは以下を行う。

1. 対応する `vendor/<upstream-name>` を upstream から更新する。
2. 公開対象 skill を `mekann/skills` にコピーする。
3. 既存の copied skill directory を上書きする。

更新後は、必ず `mekann/skills` 側の diff を確認する。

```bash
git diff -- mekann/skills
```

そのうえで、Pi で問題なく動くように `mekann/skills` 側を編集する。

## Pi 向け編集の観点

upstream が Claude Code や他 harness を前提にしている場合がある。Pi 向けに編集するときは、以下を確認する。

- Claude 固有の tool 名が残っていないか。
  - 例: `Task`, `Agent`, `Grep`, `Glob`, `LS`, `TodoWrite`
- Pi に存在しない slash command や workflow を前提にしていないか。
- Pi の tool に置き換えられるか。
  - ファイル確認: `read`
  - 検索・一覧: `bash` + `rg`, `find`, `ls`
  - 編集: `edit`
  - 新規作成: `write`
  - 並列調査: `spawn_agent`, `wait_agent`, `message_agent({ mode: "task" })`
- subagent を使う場合、Pi の subagent として安全に実行できるか。
- subagent に編集・git 操作・最終意思決定を任せていないか。
- OS コマンドを実行する指示が、Pi の sandbox 方針と矛盾しないか。
- upstream の文脈と Pi 向け指示が混ざって、モデルが混乱する構造になっていないか。

重要: Pi 向け skill は、実行時に upstream `SKILL.md` を読み直して解釈する構造にしない。Pi coding agent が読む `mekann/skills` の内容だけで完結させる。

## 新しい upstream skill を導入する場合

ユーザが新しい upstream skill の導入を依頼した場合は、導入作業を行う。

手順:

1. upstream repository に対応する mirror directory 名を決める。

例:

- `mattpocock/skills` → `vendor/mattpocock-skills`
- `owner/repo` → `vendor/<owner>-<repo>` など、衝突しにくい名前

2. まだ mirror がない場合は、その upstream 用の update script を作る。既存の `scripts/update-mattpocock-skills.sh` を参考にしてよいが、repository URL、mirror path、コピー対象は新しい upstream に合わせる。

3. upstream mirror に対象 skill が存在するか確認する。

```bash
find vendor/<upstream-name>/skills -path '*/SKILL.md' -print
```

4. 対象 skill directory を `mekann/skills` にコピーする。

```bash
cp -R vendor/<upstream-name>/skills/<category>/<skill-name> mekann/skills/<skill-name>
```

5. 対応する update script のコピー対象に追加する。

6. `mekann/skills/<skill-name>/SKILL.md` を Pi 向けに編集する。

7. 必要に応じて補助ファイルも Pi 向けに編集する。

8. skill frontmatter を確認する。

```yaml
---
name: skill-name
description: 何をする skill で、いつ使うのかを具体的に書く。
---
```

9. `description` が Pi の skill discovery で有効になるよう、必ず存在させる。

10. README や docs に公開 skill として追記する。

## 新規に Mekann 独自 skill を作る場合

upstream 由来ではない Mekann 独自 skill を作る場合も、`mekann/skills/<skill-name>/SKILL.md` に作成する。

- `name` は lowercase、数字、hyphen のみ。
- `description` は必須。
- 内容は Pi で実行可能な tool と workflow を前提に書く。
- 参照資料を置く場合は同じ skill directory 配下に置く。
- トップレベルの `README.md` を `mekann/skills` 直下に置かない。Pi が skill と誤認識する可能性がある。

## 検証

作業後は最低限以下を確認する。

```bash
find mekann/skills -name SKILL.md -print
```

```bash
ruby -e 'ARGV.each do |f| s=File.read(f); abort("missing description: #{f}") unless s =~ /\A---\n(?m:.*?)^description:\s+.+\n(?m:.*?)^---\n/; puts "ok #{f}"; end' $(find mekann/skills -name SKILL.md -print)
```

必要に応じて、関連する package 設定・README・docs の記述も確認する。

## 判断基準

この skill のゴールは、Pi coding agent が読む skill を安全で明確に保つことです。

- runtime 中に agent が upstream と Pi 向け指示を自分で統合しない。
- Pi 開発者が import 後の copy を編集して責任を持つ。
- Pi が読む `mekann/skills` は、その時点で Pi 向けに成立した内容になっている。
