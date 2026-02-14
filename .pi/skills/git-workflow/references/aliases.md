# Gitエイリアス一覧（oh-my-zsh準拠）

oh-my-zsh git pluginベースのエイリアス一覧。

## 基本コマンド

| エイリアス | コマンド |
|-----------|----------|
| `g` | `git` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gapa` | `git add --patch` |
| `gau` | `git add --update` |
| `gav` | `git add --verbose` |
| `gap` | `git apply` |
| `gapt` | `git apply --3way` |

## ブランチ操作

| エイリアス | コマンド |
|-----------|----------|
| `gb` | `git branch` |
| `gba` | `git branch -a` |
| `gbd` | `git branch -d` |
| `gbD` | `git branch -D` |
| `gbl` | `git blame -b -w` |
| `gbnm` | `git branch --no-merged` |
| `gbr` | `git branch --remote` |

## チェックアウト

| エイリアス | コマンド |
|-----------|----------|
| `gcb` | `git checkout -b` |
| `gcm` | `git checkout $(git_main_branch)` |
| `gcd` | `git checkout $(git_develop_branch)` |
| `gco` | `git checkout` |
| `gcor` | `git checkout --recurse-submodules` |

## コミット

| エイリアス | コマンド |
|-----------|----------|
| `gc` | `git commit -v` |
| `gc!` | `git commit -v --amend` |
| `gcn!` | `git commit -v --no-edit --amend` |
| `gca` | `git commit -v -a` |
| `gca!` | `git commit -v -a --amend` |
| `gcan!` | `git commit -v -a --no-edit --amend` |
| `gcans!` | `git commit -v -a -s --no-edit --amend` |
| `gcam` | `git commit -a -m` |
| `gcas` | `git commit -a -s` |
| `gcasm` | `git commit -a -s -m` |
| `gcsm` | `git commit -s -m` |
| `gcmsg` | `git commit -m` |
| `gcs` | `git commit -S` |

## クローン・設定

| エイリアス | コマンド |
|-----------|----------|
| `gcl` | `git clone --recurse-submodules` |
| `gccd` | `git clone --recurse-submodules "$@" && cd "$(basename $_ .git)"` |
| `gcf` | `git config --list` |
| `gclean` | `git clean -id` |
| `gpristine` | `git reset --hard && git clean -dffx` |

## Cherry-pick

| エイリアス | コマンド |
|-----------|----------|
| `gcp` | `git cherry-pick` |
| `gcpa` | `git cherry-pick --abort` |
| `gcpc` | `git cherry-pick --continue` |

## Diff

| エイリアス | コマンド |
|-----------|----------|
| `gd` | `git diff` |
| `gdca` | `git diff --cached` |
| `gdcw` | `git diff --cached --word-diff` |
| `gdct` | `git describe --tags $(git rev-list --tags --max-count=1)` |
| `gds` | `git diff --staged` |
| `gdt` | `git diff-tree --no-commit-id --name-only -r` |
| `gdnolock` | `git diff $@ ":(exclude)package-lock.json" ":(exclude)*.lock"` |
| `gdup` | `git diff @{upstream}` |
| `gdv` | `git diff -w $@ \| view -` |
| `gdw` | `git diff --word-diff` |

## Fetch

| エイリアス | コマンド |
|-----------|----------|
| `gf` | `git fetch` |
| `gfa` | `git fetch --all --prune` |
| `gfg` | `git ls-files \| grep` |
| `gfo` | `git fetch origin` |

## GUI

| エイリアス | コマンド |
|-----------|----------|
| `gg` | `git gui citool` |
| `gga` | `git gui citool --amend` |

## Push/Pull（カレントブランチ）

| エイリアス | コマンド |
|-----------|----------|
| `ggf` | `git push --force origin $(current_branch)` |
| `ggfl` | `git push --force-with-lease origin $(current_branch)` |
| `ggl` | `git pull origin $(current_branch)` |
| `ggp` | `git push origin $(current_branch)` |
| `ggpnp` | `ggl && ggp` |
| `ggpull` | `git pull origin "$(git_current_branch)"` |
| `ggpush` | `git push origin "$(git_current_branch)"` |
| `ggsup` | `git branch --set-upstream-to=origin/$(git_current_branch)` |
| `ggu` | `git pull --rebase origin $(current_branch)` |
| `gpsup` | `git push --set-upstream origin $(git_current_branch)` |

## Help・Ignore

| エイリアス | コマンド |
|-----------|----------|
| `ghh` | `git help` |
| `gignore` | `git update-index --assume-unchanged` |
| `gignored` | `git ls-files -v \| grep "^[[:lower:]]"` |
| `gunignore` | `git update-index --no-assume-unchanged` |

## Gitk

| エイリアス | コマンド |
|-----------|----------|
| `gk` | `gitk --all --branches &!` |
| `gke` | `gitk --all $(git log -g --pretty=%h) &!` |

## Log

| エイリアス | コマンド |
|-----------|----------|
| `gl` | `git pull` |
| `glg` | `git log --stat` |
| `glgp` | `git log --stat -p` |
| `glgg` | `git log --graph` |
| `glgga` | `git log --graph --decorate --all` |
| `glgm` | `git log --graph --max-count=10` |
| `glo` | `git log --oneline --decorate` |
| `glol` | `git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset'` |
| `glols` | `git log --graph --pretty='...' --stat` |
| `glod` | `git log --graph --pretty='...' --date=short` |
| `glola` | `git log --graph --pretty='...' --all` |
| `glog` | `git log --oneline --decorate --graph` |
| `gloga` | `git log --oneline --decorate --graph --all` |
| `glp` | `git log --pretty=<format>` |
| `gcount` | `git shortlog -sn` |

## Merge

| エイリアス | コマンド |
|-----------|----------|
| `gm` | `git merge` |
| `gmom` | `git merge origin/$(git_main_branch)` |
| `gmtl` | `git mergetool --no-prompt` |
| `gmtlvim` | `git mergetool --no-prompt --tool=vimdiff` |
| `gmum` | `git merge upstream/$(git_main_branch)` |
| `gma` | `git merge --abort` |

## Push

| エイリアス | コマンド |
|-----------|----------|
| `gp` | `git push` |
| `gpd` | `git push --dry-run` |
| `gpf` | `git push --force-with-lease` |
| `gpf!` | `git push --force` |
| `gpoat` | `git push origin --all && git push origin --tags` |
| `gpu` | `git push upstream` |
| `gpv` | `git push -v` |

## Rebase

| エイリアス | コマンド |
|-----------|----------|
| `grb` | `git rebase` |
| `grba` | `git rebase --abort` |
| `grbc` | `git rebase --continue` |
| `grbd` | `git rebase $(git_develop_branch)` |
| `grbi` | `git rebase -i` |
| `grbm` | `git rebase $(git_main_branch)` |
| `grbom` | `git rebase origin/$(git_main_branch)` |
| `grbo` | `git rebase --onto` |
| `grbs` | `git rebase --skip` |

## Remote

| エイリアス | コマンド |
|-----------|----------|
| `gr` | `git remote` |
| `gra` | `git remote add` |
| `grmv` | `git remote rename` |
| `grrm` | `git remote remove` |
| `grset` | `git remote set-url` |
| `grup` | `git remote update` |
| `grv` | `git remote -v` |

## Reset・Restore

| エイリアス | コマンド |
|-----------|----------|
| `grev` | `git revert` |
| `grh` | `git reset` |
| `grhh` | `git reset --hard` |
| `groh` | `git reset origin/$(git_current_branch) --hard` |
| `grm` | `git rm` |
| `grmc` | `git rm --cached` |
| `grs` | `git restore` |
| `grss` | `git restore --source` |
| `grst` | `git restore --staged` |
| `grt` | `cd "$(git rev-parse --show-toplevel \|\| echo .)"` |
| `gru` | `git reset --` |

## Stash

| エイリアス | コマンド |
|-----------|----------|
| `gsta` | `git stash push` / `git stash save` |
| `gstaa` | `git stash apply` |
| `gstc` | `git stash clear` |
| `gstd` | `git stash drop` |
| `gstl` | `git stash list` |
| `gstp` | `git stash pop` |
| `gsts` | `git stash show --text` |
| `gstu` | `git stash --include-untracked` |
| `gstall` | `git stash --all` |

## Status・Show

| エイリアス | コマンド |
|-----------|----------|
| `gsb` | `git status -sb` |
| `gsh` | `git show` |
| `gsps` | `git show --pretty=short --show-signature` |
| `gss` | `git status -s` |
| `gst` | `git status` |

## Submodule

| エイリアス | コマンド |
|-----------|----------|
| `gsi` | `git submodule init` |
| `gsu` | `git submodule update` |

## Switch

| エイリアス | コマンド |
|-----------|----------|
| `gsw` | `git switch` |
| `gswc` | `git switch -c` |
| `gswm` | `git switch $(git_main_branch)` |
| `gswd` | `git switch $(git_develop_branch)` |

## Tag

| エイリアス | コマンド |
|-----------|----------|
| `gts` | `git tag -s` |
| `gtv` | `git tag \| sort -V` |
| `gtl` | `gtl(){ git tag --sort=-v:refname -n -l ${1}* }; noglob gtl` |

## Pull（Rebase）

| エイリアス | コマンド |
|-----------|----------|
| `gpr` | `git pull --rebase` |
| `gup` | `git pull --rebase` |
| `gupv` | `git pull --rebase -v` |
| `gupa` | `git pull --rebase --autostash` |
| `gupav` | `git pull --rebase --autostash -v` |
| `gupom` | `git pull --rebase origin $(git_main_branch)` |
| `gupomi` | `git pull --rebase=interactive origin $(git_main_branch)` |
| `glum` | `git pull upstream $(git_main_branch)` |
| `gluc` | `git pull upstream $(git_current_branch)` |

## Bisect

| エイリアス | コマンド |
|-----------|----------|
| `gbs` | `git bisect` |
| `gbsb` | `git bisect bad` |
| `gbsg` | `git bisect good` |
| `gbsr` | `git bisect reset` |
| `gbss` | `git bisect start` |

## SVN連携

| エイリアス | コマンド |
|-----------|----------|
| `gsd` | `git svn dcommit` |
| `gsr` | `git svn rebase` |
| `git-svn-dcommit-push` | `git svn dcommit && git push github $(git_main_branch):svntrunk` |

## AM（Apply Mail）

| エイリアス | コマンド |
|-----------|----------|
| `gam` | `git am` |
| `gamc` | `git am --continue` |
| `gams` | `git am --skip` |
| `gama` | `git am --abort` |
| `gamscp` | `git am --show-current-patch` |

## WIP（Work in Progress）

| エイリアス | コマンド |
|-----------|----------|
| `gwip` | `git add -A; git rm $(git ls-files --deleted) 2> /dev/null; git commit --no-verify --no-gpg-sign -m "--wip-- [skip ci]"` |
| `gunwip` | `git log -n 1 \| grep -q -c "--wip--" && git reset HEAD~1` |

## その他

| エイリアス | コマンド |
|-----------|----------|
| `gwch` | `git whatchanged -p --abbrev-commit --pretty=medium` |

## 注記

- `git_main_branch`: `main`ブランチを優先（`master`より）
- `git_develop_branch`: `develop`ブランチを返す
- `git_current_branch`: 現在のブランチ名を返す
- Based on oh-my-zsh git plugin
- Converted by [Carsten](https://github.com/BanditsBacon) and [ftwbzhao](https://github.com/ftwbzhao)
