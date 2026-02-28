// 拡張機能がロードできるか確認

async function main() {
  console.log("=== 拡張機能ロード確認 ===\n");

  try {
    // tool-compiler拡張機能をロード
    const toolCompiler = await import("./.pi/extensions/tool-compiler.js");
    console.log("✅ tool-compiler.ts のロード: 成功");

    // デフォルトエクスポートを確認
    if (typeof toolCompiler.default === "function") {
      console.log("✅ デフォルトエクスポート: 関数");
    }

    // 統合フックを確認
    if (typeof toolCompiler.integrateWithSubagents === "function") {
      console.log("✅ integrateWithSubagents: 関数");
    }
    if (typeof toolCompiler.integrateWithTeamExecution === "function") {
      console.log("✅ integrateWithTeamExecution: 関数");
    }
    if (typeof toolCompiler.optimizeToolDefinitions === "function") {
      console.log("✅ optimizeToolDefinitions: 関数");
    }

  } catch (error) {
    console.log("❌ tool-compiler.ts のロード: 失敗");
    console.error(error);
  }

  console.log("\n=== pi SDKとの統合テスト ===\n");

  try {
    // pi SDKのモックを作成
    const mockPi = {
      registerTool: (toolDef: any) => {
        console.log(`📝 ツール登録: ${toolDef.name}`);
        console.log(`   - description: ${toolDef.description.substring(0, 50)}...`);
        console.log(`   - parameters: ${Object.keys(toolDef.parameters.properties || {}).join(", ")}`);
      },
      registerCommand: (cmdDef: any) => {
        console.log(`📝 コマンド登録: ${cmdDef.name}`);
      },
    };

    // 拡張機能を登録
    const toolCompiler = await import("./.pi/extensions/tool-compiler.js");
    toolCompiler.default(mockPi);

    console.log("\n✅ pi SDKとの統合: 成功");

  } catch (error) {
    console.log("\n❌ pi SDKとの統合: 失敗");
    console.error(error);
  }

  console.log("\n=== すべての確認完了 ===");
}

main().catch(console.error);

