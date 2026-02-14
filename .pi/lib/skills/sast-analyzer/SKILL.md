---
name: sast-analyzer
description: 静的アプリケーションセキュリティテスト（SAST）スキル。SonarQube/Semgrep/CodeQL等の結果を解析。コード内のセキュリティ脆弱性を静的に検出し、修正提案を生成。
---

# SAST Analyzer

静的アプリケーションセキュリティテスト（SAST）ツールの結果を解析するスキル。ソースコード内の脆弱性を検出・分類・優先順位付けする。

## 概念

### SAST（Static Application Security Testing）

- ソースコードを直接解析
- 実行不要
- 早期発見（開発フェーズ）
- 高い誤検出率の傾向

### 検出可能な脆弱性

| カテゴリ | 例 |
|----------|-----|
| Injection | SQL Injection, Command Injection, XSS |
| 認証 | 認証バイパス, セッション管理不備 |
| 暗号 | 弱い暗号化, ハードコードされた鍵 |
| 設定 | デバッグモード, 不要な権限 |
| 入力検証 | パストラバーサル, SSRF |

## Semgrep

### インストール

```bash
# macOS
brew install semgrep

# pip
pip install semgrep

# Docker
docker run --rm -v "${PWD}:/src" returntocorp/semgrep semgrep --config=auto
```

### 使用方法

```bash
# 自動ルールセットでスキャン
semgrep --config=auto .

# 特定ルールセット
semgrep --config=p/default .
semgrep --config=p/python .
semgrep --config=p/security-audit .

# JSON出力
semgrep --config=auto --json . > results.json

# 出力形式
semgrep --config=auto --output=report.html --html .
```

### カスタムルール

```yaml
# .semgrep/rules.yaml
rules:
  - id: hardcoded-password
    patterns:
      - pattern: $VAR = "..."
      - metavariable-regex:
          metavariable: $VAR
          regex: '(?i)(password|passwd|pwd)'
    message: "Hardcoded password detected"
    severity: ERROR
    languages: [python, javascript, typescript]

  - id: sql-injection
    pattern: cursor.execute(f"...{$VAR}...")
    message: "Potential SQL injection"
    severity: ERROR
    languages: [python]
```

### 実行

```bash
# カスタムルールでスキャン
semgrep --config=.semgrep/rules.yaml .
```

## SonarQube

### スキャン実行

```bash
# SonarScanner
sonar-scanner \
  -Dsonar.projectKey=myproject \
  -Dsonar.sources=src \
  -Dsonar.host.url=http://localhost:9000 \
  -Dsonar.token=$SONAR_TOKEN

# Gradle
./gradlew sonarqube \
  -Dsonar.token=$SONAR_TOKEN

# Maven
mvn sonar:sonar \
  -Dsonar.token=$SONAR_TOKEN
```

### sonar-project.properties

```properties
sonar.projectKey=my-project
sonar.projectName=My Project
sonar.projectVersion=1.0
sonar.sources=src
sonar.tests=tests
sonar.test.inclusions=**/*test*.*,**/*spec*.*
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.python.coverage.reportPaths=coverage.xml
sonar.security.hotspots.preview=true
```

### APIで結果取得

```bash
# Issues取得
curl -u $SONAR_TOKEN: \
  "http://localhost:9000/api/issues/search?componentKeys=myproject&severities=CRITICAL,MAJOR"

# Hotspots取得
curl -u $SONAR_TOKEN: \
  "http://localhost:9000/api/hotspots/search?projectKey=myproject"
```

## CodeQL (GitHub)

### セットアップ

```bash
# CodeQL CLI
# https://github.com/github/codeql-cli-binaries/releases からダウンロード

# データベース作成
codeql database create db --language=javascript --source-root=.

# 分析実行
codeql database analyze db \
  --format=csv \
  --output=results.csv \
  javascript-security-and-quality.qls
```

### GitHub Actions

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, python

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
```

## 深刻度分類

### SonarQube深刻度

| 深刻度 | 対応 |
|--------|------|
| BLOCKER | 即時対応 |
| CRITICAL | 24時間以内 |
| MAJOR | 1週間以内 |
| MINOR | 計画的対応 |
| INFO | 参考 |

### CWE共通脆弱性タイプ

| CWE ID | 名称 |
|--------|------|
| CWE-79 | XSS |
| CWE-89 | SQL Injection |
| CWE-20 | 不適切な入力検証 |
| CWE-200 | 情報漏洩 |
| CWE-78 | OS Command Injection |

## 結果の分析

### 誤検出の判断基準

1. **到達不可能**: デッドコード、テスト専用
2. **誤検出**: ツールの誤り
3. **既知の緩和策**: 別層で保護済み

### JSON結果の解析

```bash
# Semgrep結果の解析
semgrep --config=auto --json . | jq '.results[] | {
  rule: .check_id,
  severity: .extra.severity,
  file: .path,
  line: .start.line,
  message: .extra.message
}'

# 深刻度別集計
semgrep --config=auto --json . | jq '[.results[].extra.severity] | group_by(.) | map({severity: .[0], count: length})'
```

## 修正パターン

### SQL Injection

```python
# Before（脆弱）
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# After（安全）
cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

### XSS

```javascript
// Before（脆弱）
element.innerHTML = userInput;

// After（安全）
element.textContent = userInput;
// または
element.textContent = DOMPurify.sanitize(userInput);
```

### Path Traversal

```python
# Before（脆弱）
with open(os.path.join(base_dir, user_path)) as f:
    return f.read()

# After（安全）
safe_path = os.path.realpath(os.path.join(base_dir, user_path))
if not safe_path.startswith(os.path.realpath(base_dir)):
    raise ValueError("Invalid path")
with open(safe_path) as f:
    return f.read()
```

## CI統合

```yaml
# Semgrep CI
- name: Semgrep Scan
  uses: returntocorp/semgrep-action@v1
  with:
    config: >-
      p/security-audit
      p/secrets

# SonarQube
- name: SonarQube Scan
  uses: sonarsource/sonarqube-scan-action@master
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}

# Quality Gate
- name: SonarQube Quality Gate
  uses: sonarsource/sonarqube-quality-gate-action@master
  timeout-minutes: 5
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

## 統合レポート

```bash
#!/bin/bash
echo "=== SAST Summary ==="

echo "Semgrep findings:"
semgrep --config=auto --json . | jq '.results | length'

echo "By severity:"
semgrep --config=auto --json . | jq '.results | group_by(.extra.severity) | map({severity: .[0].extra.severity, count: length})'

echo "Critical findings:"
semgrep --config=auto --json . | jq '.results[] | select(.extra.severity == "ERROR") | .extra.message'
```
