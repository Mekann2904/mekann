function collectPromptMetrics(prompt, params) {
  const charCount = prompt?.length ?? 0;
  const estimatedTokens = Math.ceil(charCount / 4);
  return {
    charCount,
    estimatedTokens,
    skillCount: params?.skills?.length ?? 0,
    hasSystemPrompt: params?.hasSystemPrompt ?? containsSystemPrompt(prompt),
    hasExamples: params?.hasExamples ?? containsExamples(prompt),
    constraintCount: countConstraints(prompt)
  };
}
function containsSystemPrompt(prompt) {
  if (!prompt) return false;
  const markers = ["@abdd.meta", "SYSTEM PROMPT", "You are running as", "operating instructions"];
  return markers.some((marker) => prompt.includes(marker));
}
function containsExamples(prompt) {
  if (!prompt) return false;
  const markers = ["Example:", "\u4F8B:", "For example:", "Sample output:"];
  return markers.some((marker) => prompt.includes(marker));
}
function countConstraints(prompt) {
  if (!prompt) return 0;
  const constraintPatterns = [
    /MANDATORY/gi,
    /REQUIRED/gi,
    /MUST/gi,
    /PROHIBITED/gi,
    /CRITICAL/gi,
    /必須/g,
    /禁止/g
  ];
  let count = 0;
  for (const pattern of constraintPatterns) {
    const matches = prompt.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}
function collectOutputMetrics(output) {
  const charCount = output?.length ?? 0;
  const estimatedTokens = Math.ceil(charCount / 4);
  const thinkingPatterns = [
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /\[Thinking\][\s\S]*?(?=\[CLAIM\]|$)/gi,
    /```thinking[\s\S]*?```/gi
  ];
  let thinkingBlockChars = 0;
  for (const pattern of thinkingPatterns) {
    const matches = output?.match(pattern) || [];
    for (const match of matches) {
      thinkingBlockChars += match.length;
    }
  }
  const thinkingBlockPresent = thinkingBlockChars > 0;
  const thinkingBlockTokens = Math.ceil(thinkingBlockChars / 4);
  const structureType = detectStructureType(output);
  return {
    charCount,
    estimatedTokens,
    thinkingBlockPresent,
    thinkingBlockChars,
    thinkingBlockTokens,
    structureType
  };
}
function detectStructureType(output) {
  if (!output) return "unstructured";
  const hasInternalMarkers = /\[CLAIM\]/i.test(output) && /\[EVIDENCE\]/i.test(output) && /\[CONFIDENCE\]/i.test(output);
  const hasExternalMarkers = /SUMMARY:/i.test(output) || /##\s/.test(output) || /```/.test(output);
  if (hasInternalMarkers && hasExternalMarkers) {
    return "mixed";
  }
  if (hasInternalMarkers) {
    return "internal";
  }
  if (hasExternalMarkers) {
    return "external";
  }
  return "unstructured";
}
function collectQualityMetrics(output, params) {
  const hasRequiredLabels = checkRequiredLabels(output);
  const formatComplianceScore = hasRequiredLabels ? 1 : 0.5;
  const claimResultConsistency = calculateClaimResultConsistency(output);
  const evidenceCount = countEvidenceItems(output);
  const resultCompleteness = calculateResultCompleteness(output);
  return {
    formatComplianceScore: params?.isValid !== void 0 ? params.isValid ? 1 : 0 : formatComplianceScore,
    claimResultConsistency,
    hasRequiredLabels,
    evidenceCount,
    resultCompleteness
  };
}
function checkRequiredLabels(output) {
  if (!output) return false;
  const hasInternalLabels = /\[CLAIM\]/i.test(output) && /\[EVIDENCE\]/i.test(output) && /\[CONFIDENCE\]/i.test(output);
  const hasUserFacingLabels = /SUMMARY:/i.test(output) && /RESULT:/i.test(output);
  return hasInternalLabels || hasUserFacingLabels;
}
function calculateClaimResultConsistency(output) {
  if (!output) return 0;
  const claimMatch = output.match(/\[CLAIM\]\s*(.+?)(?=\[EVIDENCE\]|\n\n)/is);
  const resultMatch = output.match(/\[RESULT\]([\s\S]*?)(?=\[CONFIDENCE\]|$)/is);
  if (!claimMatch || !resultMatch) {
    const summaryMatch = output.match(/SUMMARY:\s*(.+?)(?=\n\n|RESULT:)/is);
    const resultMatch2 = output.match(/RESULT:\s*(.+?)(?=\n\n|NEXT_STEP:|$)/is);
    if (!summaryMatch || !resultMatch2) return 0.5;
    return calculateTermOverlap(summaryMatch[1], resultMatch2[1]);
  }
  return calculateTermOverlap(claimMatch[1], resultMatch[1]);
}
function calculateTermOverlap(text1, text2) {
  const terms1 = extractKeyTerms(text1);
  const terms2 = extractKeyTerms(text2);
  if (terms1.length === 0) return 0;
  const overlap = terms1.filter((t) => terms2.includes(t)).length;
  return Math.min(1, overlap / terms1.length * 1.5);
}
function extractKeyTerms(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const stopWords = /* @__PURE__ */ new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "\u3092",
    "\u306B",
    "\u304C",
    "\u306F",
    "\u306E",
    "\u3067",
    "\u3068",
    "\u304B\u3089",
    "\u307E\u3067",
    "\u3057",
    "\u3066",
    "\u305F",
    "\u3067\u3059",
    "\u307E\u3059",
    "\u3057\u305F",
    "\u3055\u308C\u305F"
  ]);
  return words.filter((w) => w.length > 1 && !stopWords.has(w));
}
function countEvidenceItems(output) {
  if (!output) return 0;
  const evidenceSection = output.match(/\[EVIDENCE\]([\s\S]*?)(?=\[CONFIDENCE\]|$)/i);
  if (evidenceSection) {
    const bullets = evidenceSection[1].match(/^[\s]*[-*]\s+/gm) || [];
    return bullets.length;
  }
  const fileRefs = output.match(/[a-zA-Z0-9_/.-]+\.ts:[0-9]+/g) || [];
  return fileRefs.length;
}
function calculateResultCompleteness(output) {
  if (!output) return 0;
  let score = 0;
  if (/SUMMARY:|\[CLAIM\]/i.test(output)) score += 0.25;
  if (/\[EVIDENCE\]|EVIDENCE:/i.test(output)) score += 0.25;
  if (/RESULT:|\[RESULT\]/i.test(output)) score += 0.25;
  if (/\[CONFIDENCE\]|CONFIDENCE:|NEXT_STEP:/i.test(output)) score += 0.25;
  return score;
}
function collectExecutionMetrics(params) {
  return {
    durationMs: params.durationMs,
    retryCount: params.retryCount,
    outcomeCode: params.outcomeCode,
    modelUsed: params.modelUsed,
    thinkingLevel: params.thinkingLevel
  };
}
function extractExecutionContext(task, agentId, parentRunId) {
  const taskType = detectTaskType(task);
  const agentRole = detectAgentRole(agentId);
  const filePatterns = extractFilePatterns(task);
  return {
    taskType,
    agentRole,
    parentRunId,
    filePatterns
  };
}
function detectTaskType(task) {
  if (!task) return "other";
  const taskLower = task.toLowerCase();
  if (taskLower.includes("research") || taskLower.includes("\u8ABF\u67FB") || taskLower.includes("investigate") || taskLower.includes("\u5206\u6790")) {
    return "research";
  }
  if (taskLower.includes("implement") || taskLower.includes("\u5B9F\u88C5") || taskLower.includes("create") || taskLower.includes("\u4F5C\u6210") || taskLower.includes("fix") || taskLower.includes("\u4FEE\u6B63")) {
    return "implementation";
  }
  if (taskLower.includes("review") || taskLower.includes("\u30EC\u30D3\u30E5\u30FC") || taskLower.includes("check") || taskLower.includes("\u78BA\u8A8D")) {
    return "review";
  }
  if (taskLower.includes("plan") || taskLower.includes("\u8A08\u753B") || taskLower.includes("design") || taskLower.includes("\u8A2D\u8A08")) {
    return "planning";
  }
  return "other";
}
function detectAgentRole(agentId) {
  const roleMap = {
    researcher: "researcher",
    architect: "architect",
    implementer: "implementer",
    tester: "tester",
    reviewer: "reviewer",
    coordinator: "coordinator"
  };
  return roleMap[agentId] || agentId;
}
function extractFilePatterns(task) {
  if (!task) return [];
  const patterns = [];
  const filePaths = task.match(/[a-zA-Z0-9_/.-]+\.(ts|js|md|json|yaml|yml)/g) || [];
  patterns.push(...filePaths);
  const dirPaths = task.match(/[a-zA-Z0-9_/.-]+\/[a-zA-Z0-9_/.-]+/g) || [];
  patterns.push(...dirPaths.slice(0, 5));
  return [...new Set(patterns)].slice(0, 10);
}
export {
  collectExecutionMetrics,
  collectOutputMetrics,
  collectPromptMetrics,
  collectQualityMetrics,
  extractExecutionContext
};
