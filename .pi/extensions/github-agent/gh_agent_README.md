# GitHub Agent Tool (`gh_agent.sh`)

AgentがGitHubリポジトリを効率的に探索・操作するための統合ツールです。
既存の `gh_search.sh` を拡張し、ファイル閲覧やツリー取得などの機能を追加しました。

## 特徴
- **Search**: コード、Issue、リポジトリの検索（コンテキスト付き）
- **Tree**: リポジトリのファイル構造を把握
- **Read**: ファイル内容の取得（Base64デコード自動化）
- **Info**: リポジトリの概要（Star数、言語、説明など）

## 設置場所
`.pi/extensions/github-agent/gh_agent.sh`

## 使用方法

### 1. リポジトリ情報の取得
```bash
./.pi/extensions/github-agent/gh_agent.sh info <owner/repo>
```
例: `facebook/react` の概要を表示
```bash
./.pi/extensions/github-agent/gh_agent.sh info facebook/react
```

### 2. ファイルツリーの探索
```bash
./.pi/extensions/github-agent/gh_agent.sh tree <owner/repo> [path]
```
例: `src` ディレクトリ配下のファイルを表示
```bash
./.pi/extensions/github-agent/gh_agent.sh tree facebook/react compiler/packages/snap/src/
```

### 3. ファイル内容の閲覧
```bash
./.pi/extensions/github-agent/gh_agent.sh read <owner/repo> <file_path>
```
例: `README.md` を読む
```bash
./.pi/extensions/github-agent/gh_agent.sh read facebook/react README.md
```

### 4. 検索 (Code, Issue, Repo)
```bash
./.pi/extensions/github-agent/gh_agent.sh search <query> [options]
```
オプション:
- `-t, --type`: `code` (default), `issues`, `repositories`
- `-r, --repo`: 対象リポジトリ (例: `facebook/react`)
- `-l, --limit`: 件数 (default: 5)
- `-e, --ext`: 拡張子 (code検索のみ)

例: `useEffect` をTypeScriptファイルから検索
```bash
./.pi/extensions/github-agent/gh_agent.sh search "useEffect" -r facebook/react -e ts
```

## Agentへのヒント
- まず `info` でリポジトリの概要を掴んでください。
- `tree` でディレクトリ構造を確認し、当たりをつけてから `read` でファイルを読んでください。
- 特定の機能を探す場合は `search` を活用してください。
