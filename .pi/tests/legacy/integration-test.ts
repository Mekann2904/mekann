/**
 * Integration test for semantic repetition detection with actual embeddings.
 * Requires embedding provider to be configured via /embedding command.
 */

import {
  detectSemanticRepetition,
  isSemanticRepetitionAvailable,
} from "../lib/semantic-repetition.js";

import {
  classifyIntent,
  getIntentBudget,
} from "../lib/intent-aware-limits.js";

async function main(): Promise<void> {
  console.log("=== Semantic Repetition Integration Test ===\n");

  // Check provider availability
  const available = await isSemanticRepetitionAvailable();
  console.log(`Embedding provider available: ${available}\n`);

  if (!available) {
    console.log("No embedding provider configured.");
    console.log("Run: /embedding openai <your-api-key>");
    console.log("Or: /embedding set mock  (for testing)\n");
    return;
  }

  // Test 1: Semantically similar texts
  console.log("Test 1: Semantically similar texts");
  const text1a = "The quick brown fox jumps over the lazy dog.";
  const text1b = "A fast brown fox leaps over a sleepy dog.";
  
  const result1 = await detectSemanticRepetition(text1a, text1b, {
    threshold: 0.85,
    useEmbedding: true,
  });
  console.log(`  Text A: "${text1a}"`);
  console.log(`  Text B: "${text1b}"`);
  console.log(`  Is Repeated: ${result1.isRepeated}`);
  console.log(`  Similarity: ${result1.similarity.toFixed(4)}`);
  console.log(`  Method: ${result1.method}\n`);

  // Test 2: Semantically different texts
  console.log("Test 2: Semantically different texts");
  const text2a = "TypeScript is a programming language developed by Microsoft.";
  const text2b = "Mount Fuji is the highest mountain in Japan.";
  
  const result2 = await detectSemanticRepetition(text2a, text2b, {
    threshold: 0.85,
    useEmbedding: true,
  });
  console.log(`  Text A: "${text2a}"`);
  console.log(`  Text B: "${text2b}"`);
  console.log(`  Is Repeated: ${result2.isRepeated}`);
  console.log(`  Similarity: ${result2.similarity.toFixed(4)}`);
  console.log(`  Method: ${result2.method}\n`);

  // Test 3: Exact match (fast path)
  console.log("Test 3: Exact match (fast path)");
  const text3 = "This is exactly the same text.";
  
  const result3 = await detectSemanticRepetition(text3, text3);
  console.log(`  Text: "${text3}"`);
  console.log(`  Is Repeated: ${result3.isRepeated}`);
  console.log(`  Similarity: ${result3.similarity}`);
  console.log(`  Method: ${result3.method}\n`);

  // Test 4: Intent classification with semantic stagnation
  console.log("Test 4: Intent classification for coding tasks");
  
  const tasks = [
    "Find all TypeScript files that import React",
    "How to configure ESLint for a monorepo",
    "Analyze the performance impact of different state management approaches",
  ];

  for (const task of tasks) {
    const intent = classifyIntent({ task });
    const budget = getIntentBudget(intent.intent);
    console.log(`  Task: "${task.slice(0, 50)}..."`);
    console.log(`    Intent: ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)`);
    console.log(`    Max iterations: ${budget.maxIterations}`);
    console.log(`    Repetition tolerance: ${budget.repetitionTolerance}\n`);
  }

  console.log("=== Integration Test Complete ===");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
