#!/bin/bash
#
# create-skill.sh - テンプレートから新しいスキルを作成
#
# 使用方法:
#   ./create-skill.sh <スキル名> ["説明"] [--with-all]
#
# 使用例:
#   ./create-skill.sh data-validation "データファイルを検証"
#   ./create-skill.sh pdf-tools "PDF処理" --with-all
#

set -e

# 色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 色なし

# 引数を解析
WITH_ALL=false
SKILL_NAME=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --with-all|-a)
            WITH_ALL=true
            shift
            ;;
        --help|-h)
            echo "使用方法: ./create-skill.sh <スキル名> [\"説明\"] [--with-all]"
            echo ""
            echo "オプション:"
            echo "  --with-all, -a    全テンプレートファイル付きで作成"
            echo "  --help, -h        このヘルプを表示"
            exit 0
            ;;
        *)
            if [ -z "$SKILL_NAME" ]; then
                SKILL_NAME="$1"
            elif [ -z "$DESCRIPTION" ]; then
                DESCRIPTION="$1"
            fi
            shift
            ;;
    esac
done

# デフォルト値設定
DESCRIPTION="${DESCRIPTION:-特定タスク用の新しいスキル。}"

# スキル名チェック
if [ -z "$SKILL_NAME" ]; then
    echo -e "${RED}エラー: スキル名が必要です${NC}"
    echo "使用方法: ./create-skill.sh <スキル名> [\"説明\"] [--with-all]"
    exit 1
fi

# スキル名を検証
if [[ ! "$SKILL_NAME" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo -e "${RED}エラー: 無効なスキル名です${NC}"
    echo "名前は小文字、数字、ハイフンのみ使用可能"
    echo "先頭と末尾にハイフンは使用不可、連続ハイフンも不可"
    exit 1
fi

if [ ${#SKILL_NAME} -gt 64 ]; then
    echo -e "${RED}エラー: スキル名が長すぎます（最大64文字）${NC}"
    exit 1
fi

# パスを決定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(dirname "$SCRIPT_DIR")"
SKILL_DIR="$SKILLS_DIR/$SKILL_NAME"

# スキルが既に存在するかチェック
if [ -d "$SKILL_DIR" ]; then
    echo -e "${YELLOW}警告: スキルディレクトリが既に存在します: $SKILL_DIR${NC}"
    read -p "上書きしますか？ (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "中止しました。"
        exit 1
    fi
    rm -rf "$SKILL_DIR"
fi

# ディレクトリ構造を作成
echo -e "${GREEN}スキルを作成中: $SKILL_NAME${NC}"
mkdir -p "$SKILL_DIR"/{scripts,references,assets}

# テンプレートからSKILL.mdを作成
SKILL_MD="$SKILL_DIR/SKILL.md"
AUTHOR_NAME=$(git config user.name 2>/dev/null || echo "開発者")
sed -e "s/skill-template/$SKILL_NAME/g" \
    -e "s/{スキル名}/${SKILL_NAME//-/ }/g" \
    -e "s/特定タスク用の新しいスキル。/$DESCRIPTION/g" \
    -e "s/{作成日}/$(date +%Y-%m-%d)/g" \
    -e "s/{作成者名}/$AUTHOR_NAME/g" \
    "$SCRIPT_DIR/SKILL-TEMPLATE.md" > "$SKILL_MD"

# --with-allフラグに基づいてテンプレートファイルを作成
if [ "$WITH_ALL" = true ]; then
    echo -e "${BLUE}全テンプレート付きで作成中...${NC}"
    
    # リファレンステンプレートを作成
    REF_MD="$SKILL_DIR/references/${SKILL_NAME}-reference.md"
    sed -e "s/{skill-name}/$SKILL_NAME/g" \
        -e "s/{リファレンスタイトル}/${SKILL_NAME//-/ } リファレンス/g" \
        "$SCRIPT_DIR/REFERENCE-TEMPLATE.md" > "$REF_MD"
    echo -e "  ${GREEN}作成完了:${NC} references/${SKILL_NAME}-reference.md"
    
    # アセットテンプレートを作成
    ASSET_MD="$SKILL_DIR/assets/${SKILL_NAME}-template.md"
    sed -e "s/{skill-name}/$SKILL_NAME/g" \
        -e "s/{アセットタイトル}/${SKILL_NAME//-/ } テンプレート/g" \
        "$SCRIPT_DIR/ASSET-TEMPLATE.md" > "$ASSET_MD"
    echo -e "  ${GREEN}作成完了:${NC} assets/${SKILL_NAME}-template.md"
    
    # スクリプトテンプレートを作成
    SCRIPT_PY="$SKILL_DIR/scripts/${SKILL_NAME}.py"
    sed -e "s/{skill-name}/$SKILL_NAME/g" \
        -e "s/{スクリプト名}/$SKILL_NAME/g" \
        -e "s/{スクリプトタイトル}/${SKILL_NAME//-/ } スクリプト/g" \
        -e "s/{スクリプトの説明}/$SKILL_NAME スキル用スクリプト/g" \
        -e "s/{作成者}/$(git config user.name 2>/dev/null || echo "開発者")/g" \
        "$SCRIPT_DIR/SCRIPT-TEMPLATE.py" > "$SCRIPT_PY"
    chmod +x "$SCRIPT_PY"
    echo -e "  ${GREEN}作成完了:${NC} scripts/${SKILL_NAME}.py"
fi

# 空ディレクトリに.gitkeepを作成
if [ -z "$(ls -A "$SKILL_DIR/scripts" 2>/dev/null)" ]; then
    touch "$SKILL_DIR/scripts/.gitkeep"
fi
if [ -z "$(ls -A "$SKILL_DIR/references" 2>/dev/null)" ]; then
    touch "$SKILL_DIR/references/.gitkeep"
fi
if [ -z "$(ls -A "$SKILL_DIR/assets" 2>/dev/null)" ]; then
    touch "$SKILL_DIR/assets/.gitkeep"
fi

# サマリー
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}スキル作成完了！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}ディレクトリ:${NC} $SKILL_DIR"
echo ""
echo -e "${BLUE}構造:${NC}"
echo "  $SKILL_DIR/"
echo "  ├── SKILL.md              ${GREEN}# このファイルを編集${NC}"
echo "  ├── scripts/              ${YELLOW}# ヘルパースクリプトを追加${NC}"
if [ "$WITH_ALL" = true ]; then
    echo "  │   └── ${SKILL_NAME}.py"
fi
echo "  ├── references/           ${YELLOW}# 詳細ドキュメントを追加${NC}"
if [ "$WITH_ALL" = true ]; then
    echo "  │   └── ${SKILL_NAME}-reference.md"
fi
echo "  └── assets/               ${YELLOW}# テンプレートを追加${NC}"
if [ "$WITH_ALL" = true ]; then
    echo "      └── ${SKILL_NAME}-template.md"
fi
echo ""
echo -e "${BLUE}次のステップ:${NC}"
echo "  1. SKILL.mdをスキルの詳細で編集"
if [ "$WITH_ALL" = true ]; then
    echo "  2. scripts/${SKILL_NAME}.pyをカスタマイズ"
    echo "  3. references/${SKILL_NAME}-reference.mdを更新"
    echo "  4. assets/${SKILL_NAME}-template.mdを修正"
else
    echo "  2. scripts/ にスクリプトを追加（任意）"
    echo "  3. references/ にリファレンスを追加（任意）"
    echo "  4. assets/ にアセットを追加（任意）"
fi
echo ""
echo -e "${BLUE}使用方法:${NC} /skill:$SKILL_NAME"
echo ""
