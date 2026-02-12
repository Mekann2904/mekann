#!/bin/bash

echo "=== UI Enhancement Extension テスト ==="
echo ""

# カラー設定
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 成功・失敗のカウント
success_count=0
fail_count=0

# 成功メッセージ
success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((success_count++))
}

# 失敗メッセージ
fail() {
    echo -e "${RED}❌ $1${NC}"
    ((fail_count++))
}

# 警告メッセージ
warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. 拡張機能ファイルの存在確認
echo "1. 拡張機能ファイルの存在確認:"
if [ -f ".pi/extensions/ui-enhancement.ts" ]; then
    success ".pi/extensions/ui-enhancement.ts が存在します"
else
    fail ".pi/extensions/ui-enhancement.ts が見つかりません"
fi

# 2. .piディレクトリの確認
echo ""
echo "2. プロジェクトディレクトリの確認:"
if [ -d ".pi" ]; then
    success ".pi ディレクトリが存在します"

    if [ -d ".pi/extensions" ]; then
        success ".pi/extensions ディレクトリが存在します"
    else
        fail ".pi/extensions ディレクトリが見つかりません"
    fi
else
    fail ".pi ディレクトリが見つかりません"
fi

# 3. 拡張機能ファイルの内容確認（シンタックスチェック）
echo ""
echo "3. 拡張機能ファイルの内容確認:"
if [ -f ".pi/extensions/ui-enhancement.ts" ]; then
    if grep -q "registerTool" .pi/extensions/ui-enhancement.ts; then
        success "registerTool が定義されています"
    else
        fail "registerTool が定義されていません"
    fi

    if grep -q 'name: "ask"' .pi/extensions/ui-enhancement.ts; then
        success "ask ツールが定義されています"
    else
        fail "ask ツールが定義されていません"
    fi

    if grep -q "executeSingle" .pi/extensions/ui-enhancement.ts; then
        success "single モードが実装されています"
    else
        fail "single モードが実装されていません"
    fi

    if grep -q "executeForm" .pi/extensions/ui-enhancement.ts; then
        success "form モードが実装されています"
    else
        fail "form モードが実装されていません"
    fi

    if grep -q "executeWizard" .pi/extensions/ui-enhancement.ts; then
        success "wizard モードが実装されています"
    else
        fail "wizard モードが実装されていません"
    fi
fi

# 4. READMEの確認
echo ""
echo "4. ドキュメントの確認:"
if [ -f "README.md" ]; then
    success "README.md が存在します"

    if grep -q "## 機能" README.md; then
        success "README.md に 機能 セクションがあります"
    else
        warn "README.md に 機能 セクションが見つかりません"
    fi

    if grep -q "### Single モード" README.md || grep -q "single モード" README.md; then
        success "README.md に single モードの説明があります"
    else
        warn "README.md に single モードの説明が見つかりません"
    fi

    if grep -q "### Form モード" README.md || grep -q "form モード" README.md; then
        success "README.md に form モードの説明があります"
    else
        warn "README.md に form モードの説明が見つかりません"
    fi

    if grep -q "### Wizard モード" README.md || grep -q "wizard モード" README.md; then
        success "README.md に wizard モードの説明があります"
    else
        warn "README.md に wizard モードの説明が見つかりません"
    fi

    if grep -q "## トラブルシューティング" README.md; then
        success "README.md にトラブルシューティングセクションがあります"
    else
        warn "README.md にトラブルシューティングセクションが見つかりません"
    fi
else
    fail "README.md が見つかりません"
fi

# 5. .mdファイルの確認（テスト用）
echo ""
echo "5. テスト用ファイルの確認:"
md_count=$(find . -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)
if [ "$md_count" -gt 0 ]; then
    success "$md_count 個の .md ファイルが見つかりました"
    echo "   見つかったファイル:"
    find . -maxdepth 1 -name "*.md" -type f | while read -r file; do
        echo "   - $file"
    done
else
    warn ".md ファイルが見つかりません（テスト用ファイルが不足しています）"
fi

# 6. piコマンドの確認
echo ""
echo "6. pi コマンドの確認:"
if command -v pi &> /dev/null; then
    success "pi コマンドが見つかりました"
    pi_version=$(pi --version 2>/dev/null || echo "バージョン取得不可")
    echo "   バージョン: $pi_version"
else
    fail "pi コマンドが見つかりません。インストールしてください"
fi

# 7. 実行モードの確認
echo ""
echo "7. 実行モードの確認:"
if [ -n "$PI_SESSION" ] || [ -n "$PI_SESSION_ID" ]; then
    success "pi セッション内で実行されています"
else
    warn "pi セッション外で実行されています（正常）"
fi

# 結果サマリー
echo ""
echo "=== テスト結果サマリー ==="
echo -e "${GREEN}成功: $success_count${NC}"
echo -e "${RED}失敗: $fail_count${NC}"

if [ $fail_count -eq 0 ]; then
    echo ""
    success "すべてのチェックが完了しました！"
    echo ""
    echo "次の手順:"
    echo "  1. pi を起動:"
    echo "     pi"
    echo ""
    echo "  2. single モード（単一質問・select）のテスト:"
    echo '     "プロジェクト内の.mdファイルをすべて調べて、その中から読みたいものを選んで中身を表示して"'
    echo ""
    echo "  3. single モード（単一質問・confirm）のテスト:"
    echo '     "README.mdの末尾に「## テスト完了」と追加して。追加する前に私に確認して"'
    echo ""
    echo "  4. single モード（単一質問・multi_select）のテスト:"
    echo '     "プロジェクト内の.mdファイルから、ドキュメント化したいものを複数選んで中身を表示して"'
    echo ""
    echo "  5. form モード（複数質問・同時）のテスト:"
    echo '     "プロジェクトの設定をまとめて聞いて。言語、フレームワーク、テストの有無を一覧表示して、最後に決定して"'
    echo ""
    echo "  6. wizard モード（複数質問・順次）のテスト:"
    echo '     "新規プロジェクト作成ウィザードを表示して。言語、フレームワーク、テストの有無を順番に確認して"'
    echo ""
    echo "  7. 変更を反映させるには:"
    echo "     /reload"
else
    echo ""
    fail "一部のチェックが失敗しました。上記のエラーを修正してください。"
    echo ""
    echo "よくある問題と解決策:"
    echo "  - .pi/extensions/ ディレクトリがない: 作成してください"
    echo "  - 拡張機能ファイルがない: ui-enhancement.ts を配置してください"
    echo "  - piがインストールされていない: npm install -g @mariozechner/pi-coding-agent"
fi

echo ""
