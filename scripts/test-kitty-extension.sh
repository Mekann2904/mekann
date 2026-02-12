#!/bin/bash

# Kitty Status Integration Extension テストスクリプト
# kittyのエスケープシーケンスをテストします

# 色定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# エスケープシーケンス
OSC="\033]"
ST="\007"

echo "=========================================="
echo "Kitty Status Integration Test"
echo "=========================================="
echo ""

# kittyかどうかを確認
if [ -z "$KITTY_WINDOW_ID" ]; then
    echo -e "${YELLOW}⚠ Not running in kitty terminal${NC}"
    echo "This test script is designed for kitty terminal."
    echo "However, we can still test the escape sequences..."
    echo ""
else
    echo -e "${GREEN}✓ Detected kitty terminal${NC}"
    echo "  Window ID: $KITTY_WINDOW_ID"
    echo ""
fi

# テスト1: ウィンドウタイトル設定
echo "Test 1: Setting window title..."
printf "${OSC}2;Test: Title Change${ST}"
sleep 1
echo -e "${GREEN}✓ Window title set to 'Test: Title Change'${NC}"
echo ""

# テスト2: 通知
echo "Test 2: Sending notification..."
printf "${OSC}99;i=1:d=0:✓ Test notification from script${ST}"
echo -e "${GREEN}✓ Notification sent${NC}"
echo ""

# テスト3: 一時的な通知（3秒）
echo "Test 3: Temporary notification (3 seconds)..."
printf "${OSC}99;i=2:d=3000:⏱ This will disappear in 3 seconds${ST}"
echo -e "${GREEN}✓ Temporary notification sent${NC}"
sleep 3
echo ""

# テスト4: 元のタイトルに戻す
echo "Test 4: Restoring original title..."
printf "${OSC}2;Terminal${ST}"
echo -e "${GREEN}✓ Title restored${NC}"
echo ""

# 環境変数の表示
echo "=========================================="
echo "Environment Variables"
echo "=========================================="
echo "KITTY_WINDOW_ID: ${KITTY_WINDOW_ID:-not set}"
echo "TERM: $TERM"
echo ""

# pi拡張機能の確認
echo "=========================================="
echo "Extension File Check"
echo "=========================================="
if [ -f ".pi/extensions/kitty-status-integration.ts" ]; then
    echo -e "${GREEN}✓ Extension file found${NC}"
    echo "  Location: .pi/extensions/kitty-status-integration.ts"
    echo "  Size: $(wc -c < .pi/extensions/kitty-status-integration.ts) bytes"
else
    echo -e "${RED}✗ Extension file not found${NC}"
fi
echo ""

# 使用方法のヒント
echo "=========================================="
echo "Usage Tips"
echo "=========================================="
echo "To test the extension in pi:"
echo ""
echo "  pi"
echo "  # In pi, try:"
echo "  /kitty-status"
echo "  /kitty-title Test Title"
echo "  /kitty-notify Hello from pi!"
echo ""
echo "The extension will automatically activate when you run pi in kitty."
echo ""

echo "=========================================="
echo -e "${GREEN}Test completed!${NC}"
echo "=========================================="
