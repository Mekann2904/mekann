/**
 * @abdd.meta
 * path: .pi/lib/context-engineering.ts
 * role: コンテキストウィンドウ管理とチャンキング戦略の最適化モジュール
 * why: LLMの推論能力を最大化するため、論文「Large Language Model Reasoning Failures」のP1推奨事項に基づき、トークン制約下で最適なコンテキスト構成を維持するため
 * related: .pi/lib/context-window.ts, .pi/lib/memory-manager.ts, .pi/types/context.types.ts
 * public_api: ContextItem, ContextPriority, ContextCategory, ContextWindowConfig, OptimizedContext, TrimmedItem, SemanticBoundary
 * invariants:
 *   - OptimizedContextのtotalTokensはbudget以下である
 *   - priorityWeightsは正の数である
 *   - TrimmedItemのpreservedTokensはoriginalTokens以下である
 * side_effects:
 *   - トークン予算超過時の低優先度アイテム削除
 *   - カテゴリ制限に基づくコンテンツの除外
 * failure_modes:
 *   - トークン見積もりの大幅なズレによるバジェット超過
 *   - 全アイテムが削除されるコンテキスト枯渇
 *   - サマリー生成による重要情報の喪失
 * @abdd.explain
 * overview: コンテキストアイテムの定義、優先度制御、トークン管理を行い、LLMへの入力コンテキストを構造化・最適化する
 * what_it_does:
 *   - コンテキストの優先度、カテゴリ、トークン推定値を定義する
 *   - 最適化されたコンテキストセットとトリムされたアイテムの履歴を管理する
 *   - 意味的な境界情報を定義してチャンキング戦略を支援する
 * why_it_exists:
 *   - 有限のコンテキストウィンドウ内で、推論に必要な情報を確実に維持するため
 *   - 重要度に基づく動的なコンテキストフィルタリングを実現するため
 * scope:
 *   in: コンテキスト設定、優先度重み、生コンテンツ
 * out: トークン制約内で最適化されたコンテキストコレクション
 */

/**
 * Context Engineering Optimization Module
 * 論文「Large Language Model Reasoning Failures」のP1推奨事項
 * コンテキストウィンドウ管理、チャンク戦略、状態サマリー最適化
 */

// ============================================================================
// Types
// ============================================================================

/**
 * コンテキストの優先度レベル
 * @summary 優先度を定義
 */
export type ContextPriority = "critical" | "high" | "medium" | "low" | "optional";

/**
 * コンテキストアイテム
 * @summary アイテムを定義
 * @param id ID
 * @param content コンテンツ
 * @param priority 優先度
 * @param tokenEstimate トークン見積もり
 * @param category カテゴリ
 * @param timestamp タイムスタンプ
 * @param source 送信元
 * @param metadata メタデータ
 */
export interface ContextItem {
  id: string;
  content: string;
  priority: ContextPriority;
  tokenEstimate: number;
  category: ContextCategory;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * コンテキストのカテゴリ種別
 * @summary カテゴリを定義
 */
export type ContextCategory =
  | "task-instruction"    // The main task/request
  | "system-prompt"       // System-level instructions
  | "execution-rules"     // Execution guidelines
  | "file-content"        // File contents being analyzed
  | "conversation"        // Conversation history
  | "agent-output"        // Output from other agents
  | "verification-result" // Verification outputs
  | "working-memory"      // Current working state
  | "skill-content"       // Skill-related content
  | "reference-doc"       // Reference documentation
  | "error-context";      // Error information

/**
 * コンテキストウィンドウの設定
 * @summary 設定を定義
 * @param maxTokens 最大トークン数
 * @param reservedTokens 予約トークン数
 * @param priorityWeights 優先度の重み
 * @param categoryLimits カテゴリ別制限
 * @param preserveOrder 順序保持フラグ
 */
export interface ContextWindowConfig {
  maxTokens: number;
  reservedTokens: number;        // Tokens reserved for response
  priorityWeights: Record<ContextPriority, number>;
  categoryLimits: Partial<Record<ContextCategory, number>>;
  preserveOrder: boolean;        // Whether to preserve order within priorities
  enableSummarization: boolean;  // Whether to summarize when over budget
}

/**
 * 最適化されたコンテキスト情報
 * @summary コンテキストを最適化
 * @param items コンテキストアイテム
 * @param totalTokens 総トークン数
 * @param budget 予算
 * @param utilizationRatio 利用率
 * @param trimmedItems トリムされたアイテム
 */
export interface OptimizedContext {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
  utilizationRatio: number;
  trimmedItems: TrimmedItem[];
  summaryGenerated: boolean;
  warnings: string[];
}

/**
 * トリムされたアイテムの情報を表すインターフェース
 * @summary トリムアイテム定義
 * @param item トリムされたコンテキストアイテム
 * @param reason トリム理由
 * @param originalTokens 元のトークン数
 * @param preservedTokens 保持されたトークン数
 */
export interface TrimmedItem {
  item: ContextItem;
  reason: "budget-exceeded" | "category-limit" | "low-priority" | "duplicate";
  originalTokens: number;
  preservedTokens: number;
}

/**
 * 意味的な境界情報を表すインターフェース
 * @summary 意味的境界定義
 * @param position 境界の位置
 * @param type 境界タイプ
 * @param confidence 信頼度
 * @param metadata メタデータ
 */
export interface SemanticBoundary {
  position: number;
  type: BoundaryType;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * テキストの境界種別を定義する型
 * @summary 境界種別定義
 * @returns 境界種別
 */
export type BoundaryType =
  | "paragraph"      // Paragraph break
  | "section"        // Section heading
  | "code-block"     // Code block boundary
  | "list-end"       // End of list
  | "dialogue-turn"  // Speaker change in dialogue
  | "topic-shift"    // Detected topic change
  | "file-boundary"  // File change
  | "agent-output"   // Agent output boundary
  | "semantic-gap";  // Detected semantic gap

/**
 * 分割されたテキストチャンクを表すインターフェース
 * @summary テキストチャンク定義
 * @param id チャンクID
 * @param content チャンクの内容
 * @param tokenEstimate トークン推定数
 * @param boundaries 境界情報の配列
 * @param priority 優先度
 */
export interface TextChunk {
  id: string;
  content: string;
  tokenEstimate: number;
  boundaries: SemanticBoundary[];
  priority: ContextPriority;
  metadata: {
    startPosition: number;
    endPosition: number;
    hasCodeBlock: boolean;
    hasMarkdownHeadings: boolean;
    lineCount: number;
  };
}

/**
 * テキスト分割設定を定義するインターフェース
 * @summary 分割設定を定義
 * @param maxChunkTokens チャンクの最大トークン数
 * @param minChunkTokens チャンクの最小トークン数
 * @param overlapTokens チャンク間のオーバーラップトークン数
 * @param respectBoundaries 境界を尊重するか
 * @param boundaryTypes 境界タイプの配列
 */
export interface ChunkingConfig {
  maxChunkTokens: number;
  minChunkTokens: number;
  overlapTokens: number;
  respectBoundaries: boolean;
  boundaryTypes: BoundaryType[];
  preserveCodeBlocks: boolean;
  preserveMarkdownSections: boolean;
}

/**
 * ワーキングメモリの状態概要
 * @summary 状態概要
 */
export interface StateSummary {
  id: string;
  timestamp: number;
  carriedForward: string[];      // Key facts to carry forward
  pendingTasks: string[];        // Unfinished tasks
  decisions: string[];           // Made decisions
  blockers: string[];            // Current blockers
  assumptions: string[];         // Active assumptions
  evidence: EvidenceSummary[];   // Collected evidence
  confidence: number;
}

/**
 * エビデンス概要
 * @summary エビデンス定義
 */
export interface EvidenceSummary {
  claim: string;
  evidence: string;
  source: string;
  confidence: number;
  contradicted: boolean;
}

/**
 * 要約抽出設定
 * @summary 設定定義
 */
export interface SummaryExtractionConfig {
  maxCarriedForward: number;
  maxPendingTasks: number;
  maxDecisions: number;
  maxBlockers: number;
  maxAssumptions: number;
  maxEvidence: number;
  minConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default context window configuration
 */
export const DEFAULT_CONTEXT_WINDOW_CONFIG: ContextWindowConfig = {
  maxTokens: 128000,
  reservedTokens: 16000,
  priorityWeights: {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
    optional: 0.05,
  },
  categoryLimits: {
    "file-content": 50000,
    "agent-output": 20000,
    "conversation": 15000,
    "reference-doc": 10000,
    "working-memory": 5000,
  },
  preserveOrder: true,
  enableSummarization: true,
};

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkTokens: 4000,
  minChunkTokens: 500,
  overlapTokens: 200,
  respectBoundaries: true,
  boundaryTypes: ["paragraph", "section", "code-block", "file-boundary", "semantic-gap"],
  preserveCodeBlocks: true,
  preserveMarkdownSections: true,
};

/**
 * Default summary extraction configuration
 */
export const DEFAULT_SUMMARY_CONFIG: SummaryExtractionConfig = {
  maxCarriedForward: 5,
  maxPendingTasks: 3,
  maxDecisions: 5,
  maxBlockers: 3,
  maxAssumptions: 3,
  maxEvidence: 5,
  minConfidence: 0.5,
};

/**
 * Average characters per token (rough estimate for planning)
 */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * テキストトークン数推定
 * @summary テキスト推定
 * @param text 対象テキスト
 * @returns 推定トークン数
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Count whitespace-separated tokens
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  
  // Count CJK characters (roughly 1 token per character)
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  
  // Count code tokens (punctuation, operators)
  const codeTokens = (text.match(/[{}()[\];:,.<>=!&|+\-*/\\@#$%^~?]/g) || []).length;
  
  // Combine estimates
  return Math.ceil(words + cjkChars * 0.5 + codeTokens * 0.3);
}

/**
 * コンテキストトークン数推定
 * @summary トークン数推定
 * @param item コンテキストアイテム
 * @returns 推定トークン数
 */
export function estimateContextItemTokens(item: ContextItem): number {
  return item.tokenEstimate || estimateTokens(item.content);
}

// ============================================================================
// Context Window Management
// ============================================================================

/**
 * コンテキストウィンドウを最適化する
 * @summary ウィンドウを最適化
 * @param {ContextItem[]} items - コンテキストアイテム配列
 * @param {ContextWindowConfig} config - ウィンドウ設定
 * @returns {OptimizedContext} 最適化されたコンテキスト情報
 */
export function optimizeContextWindow(
  items: ContextItem[],
  config: ContextWindowConfig = DEFAULT_CONTEXT_WINDOW_CONFIG
): OptimizedContext {
  const budget = config.maxTokens - config.reservedTokens;
  const warnings: string[] = [];
  const trimmedItems: TrimmedItem[] = [];
  
  // Step 1: Calculate total tokens
  let totalTokens = items.reduce((sum, item) => sum + estimateContextItemTokens(item), 0);
  
  // Step 2: Check category limits
  const categoryTokens = new Map<ContextCategory, number>();
  for (const item of items) {
    const current = categoryTokens.get(item.category) || 0;
    categoryTokens.set(item.category, current + estimateContextItemTokens(item));
  }
  
  // Step 3: Build working copy with scores
  type ScoredItem = ContextItem & { score: number; trimmed: boolean };
  const scoredItems: ScoredItem[] = items.map(item => ({
    ...item,
    score: calculateItemScore(item, config, categoryTokens),
    trimmed: false,
  }));
  
  // Step 4: Sort by score (descending) for trimming decision
  const sortedByScore = [...scoredItems].sort((a, b) => b.score - a.score);
  
  // Step 5: Trim items if over budget
  while (totalTokens > budget) {
    // Find the lowest score item that hasn't been trimmed
    const toTrim = sortedByScore.find(item => !item.trimmed && item.priority !== "critical");
    
    if (!toTrim) {
      warnings.push(`Cannot reduce context further: all remaining items are critical`);
      break;
    }
    
    toTrim.trimmed = true;
    const itemTokens = estimateContextItemTokens(toTrim);
    
    // For low priority items, remove completely
    // For higher priority, try to summarize
    if (toTrim.priority === "low" || toTrim.priority === "optional") {
      trimmedItems.push({
        item: toTrim,
        reason: toTrim.priority === "optional" ? "low-priority" : "budget-exceeded",
        originalTokens: itemTokens,
        preservedTokens: 0,
      });
      totalTokens -= itemTokens;
    } else if (config.enableSummarization) {
      // Summarize to preserve key information
      const summarized = summarizeItem(toTrim);
      const newTokens = estimateTokens(summarized);
      trimmedItems.push({
        item: toTrim,
        reason: "budget-exceeded",
        originalTokens: itemTokens,
        preservedTokens: newTokens,
      });
      totalTokens -= (itemTokens - newTokens);
      toTrim.content = summarized;
      toTrim.tokenEstimate = newTokens;
      toTrim.trimmed = false; // Keep summarized version
    }
  }
  
  // Step 6: Collect final items preserving original order if configured
  const finalItems = config.preserveOrder
    ? scoredItems.filter(item => !item.trimmed)
    : sortedByScore.filter(item => !item.trimmed);
  
  const utilizationRatio = totalTokens / budget;
  
  if (utilizationRatio > 0.9) {
    warnings.push(`Context window utilization high: ${(utilizationRatio * 100).toFixed(1)}%`);
  }
  
  return {
    items: finalItems,
    totalTokens,
    budget,
    utilizationRatio,
    trimmedItems,
    summaryGenerated: trimmedItems.some(t => t.preservedTokens > 0),
    warnings,
  };
}

/**
 * Calculate score for an item (higher = more important to keep)
 */
function calculateItemScore(
  item: ContextItem,
  config: ContextWindowConfig,
  categoryTokens: Map<ContextCategory, number>
): number {
  const priorityWeight = config.priorityWeights[item.priority] || 0.5;
  const categoryLimit = config.categoryLimits[item.category];
  
  // Penalize items in over-budget categories
  let categoryPenalty = 0;
  if (categoryLimit && (categoryTokens.get(item.category) || 0) > categoryLimit) {
    categoryPenalty = 0.3;
  }
  
  // Bonus for recent items
  const ageMs = Date.now() - item.timestamp;
  const recencyBonus = Math.max(0, 1 - (ageMs / (30 * 60 * 1000))); // Decay over 30 minutes
  
  // Bonus for smaller items
  const sizeBonus = item.tokenEstimate < 1000 ? 0.1 : 0;
  
  return priorityWeight - categoryPenalty + recencyBonus * 0.2 + sizeBonus;
}

/**
 * Summarize a context item to preserve key information
 */
function summarizeItem(item: ContextItem): string {
  const content = item.content;
  
  // Extract key sentences/lines
  const lines = content.split("\n");
  const importantLines: string[] = [];
  
  // Priority patterns for important content
  const importantPatterns = [
    /^SUMMARY:/i,
    /^CLAIM:/i,
    /^EVIDENCE:/i,
    /^CONFIDENCE:/i,
    /^RESULT:/i,
    /^NEXT_STEP:/i,
    /^ERROR:/i,
    /^WARNING:/i,
    /^TODO:/i,
    /^FIXME:/i,
    /^IMPORTANT:/i,
    /^CARRIED_FORWARD:/i,
    /^#{1,3}\s/,  // Markdown headings
    /^[-*]\s/,    // List items
  ];
  
  for (const line of lines) {
    if (importantPatterns.some(p => p.test(line.trim()))) {
      importantLines.push(line);
    }
    if (importantLines.length >= 10) break;
  }
  
  if (importantLines.length === 0) {
    // Fallback: take first and last portions
    const firstLines = lines.slice(0, 3);
    const lastLines = lines.slice(-2);
    return `[Summary of ${item.category}] ${firstLines.join(" ")} ... ${lastLines.join(" ")}`;
  }
  
  return importantLines.join("\n");
}

// ============================================================================
// Semantic Boundary Detection
// ============================================================================

/**
 * テキストから意味的な境界を検出する
 * @summary 境界を検出
 * @param {string} text - 分析対象のテキスト
 * @returns {SemanticBoundary[]} 検出された意味的境界の配列
 */
export function detectSemanticBoundaries(text: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];
  const lines = text.split("\n");
  let position = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : "";
    const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
    
    // Empty line after content (paragraph boundary)
    if (line.trim() === "" && prevLine.trim() !== "") {
      boundaries.push({
        position: position,
        type: "paragraph",
        confidence: 0.9,
      });
    }
    
    // Markdown heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      boundaries.push({
        position: position,
        type: "section",
        confidence: 0.95,
        metadata: {
          level: headingMatch[1].length,
          title: headingMatch[2],
        },
      });
    }
    
    // Code block boundaries
    if (line.trim().startsWith("```")) {
      boundaries.push({
        position: position,
        type: "code-block",
        confidence: 0.95,
        metadata: {
          language: line.trim().slice(3).trim() || "unknown",
          isOpening: !prevLine.includes("```"),
        },
      });
    }
    
    // File boundary markers
    if (line.match(/^---+$|^===+$|^File:\s+/i)) {
      boundaries.push({
        position: position,
        type: "file-boundary",
        confidence: 0.8,
      });
    }
    
    // Agent output markers
    if (line.match(/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP|DISCUSSION):/i)) {
      boundaries.push({
        position: position,
        type: "agent-output",
        confidence: 0.9,
      });
    }
    
    // List end detection
    if (line.match(/^[-*]\s/) && !nextLine.match(/^[-*]\s/)) {
      boundaries.push({
        position: position + line.length,
        type: "list-end",
        confidence: 0.7,
      });
    }
    
    // Dialogue turn (Q&A pattern)
    if (line.match(/^(Q:|A:|Question:|Answer:|User:|Assistant:|Human:|AI:)/i)) {
      boundaries.push({
        position: position,
        type: "dialogue-turn",
        confidence: 0.85,
      });
    }
    
    position += line.length + 1; // +1 for newline
  }
  
  // Detect semantic gaps (topic shifts) using heuristics
  const semanticGapBoundaries = detectSemanticGaps(text, boundaries);
  boundaries.push(...semanticGapBoundaries);
  
  // Sort by position
  return boundaries.sort((a, b) => a.position - b.position);
}

/**
 * Detect semantic gaps where topic shifts occur
 */
function detectSemanticGaps(text: string, existingBoundaries: SemanticBoundary[]): SemanticBoundary[] {
  const gaps: SemanticBoundary[] = [];
  const paragraphs = text.split(/\n\n+/);
  
  // Track existing boundary positions for deduplication
  const existingPositions = new Set(existingBoundaries.map(b => b.position));
  
  // Topic shift indicators
  const topicShiftPatterns = [
    /^However,?/i,
    /^On the other hand,?/i,
    /^In contrast,?/i,
    /^Meanwhile,?/i,
    /^Furthermore,?/i,
    /^Moreover,?/i,
    /^Additionally,?/i,
    /^Next,?/i,
    /^Then,?/i,
    /^Finally,?/i,
    /^In conclusion,?/i,
    /^To summarize,?/i,
    /^一方、/i,
    /^次に、/i,
    /^最後に、/i,
    /^結論として、/i,
    /^まとめると、/i,
  ];
  
  let position = 0;
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    for (const pattern of topicShiftPatterns) {
      if (pattern.test(trimmed) && !existingPositions.has(position)) {
        gaps.push({
          position,
          type: "semantic-gap",
          confidence: 0.6,
          metadata: {
            indicator: trimmed.split(/\s+/)[0],
          },
        });
        break;
      }
    }
    position += paragraph.length + 2; // +2 for paragraph separator
  }
  
  return gaps;
}

// ============================================================================
// Chunking Strategy
// ============================================================================

/**
 * テキストを指定された設定で分割する
 * @summary テキストを分割
 * @param {string} text - 分割対象のテキスト
 * @param {ChunkingConfig} config - 分割設定
 * @returns {TextChunk[]} 分割されたテキストチャンク配列
 */
export function chunkText(
  text: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const boundaries = detectSemanticBoundaries(text);
  
  // Filter to requested boundary types
  const filteredBoundaries = config.respectBoundaries
    ? boundaries.filter(b => config.boundaryTypes.includes(b.type))
    : [];
  
  // Find chunk boundaries
  const chunkBoundaries = findChunkBoundaries(
    text,
    filteredBoundaries,
    config.maxChunkTokens,
    config.minChunkTokens,
    config.preserveCodeBlocks,
    config.preserveMarkdownSections
  );
  
  // Create chunks
  let chunkId = 0;
  let startPosition = 0;
  
  for (const boundary of chunkBoundaries) {
    const content = text.slice(startPosition, boundary.position).trim();
    const tokenEstimate = estimateTokens(content);
    
    if (tokenEstimate >= config.minChunkTokens || content.length > 0) {
      const endPosition = boundary.position;
      
      chunks.push({
        id: `chunk-${String(chunkId++).padStart(3, "0")}`,
        content,
        tokenEstimate,
        boundaries: boundaries.filter(
          b => b.position >= startPosition && b.position <= endPosition
        ),
        priority: determineChunkPriority(content),
        metadata: {
          startPosition,
          endPosition,
          hasCodeBlock: content.includes("```"),
          hasMarkdownHeadings: /^#{1,6}\s/m.test(content),
          lineCount: content.split("\n").length,
        },
      });
    }
    
    startPosition = boundary.position;
  }
  
  // Handle remaining content
  if (startPosition < text.length) {
    const content = text.slice(startPosition).trim();
    if (content.length > 0) {
      chunks.push({
        id: `chunk-${String(chunkId++).padStart(3, "0")}`,
        content,
        tokenEstimate: estimateTokens(content),
        boundaries: boundaries.filter(b => b.position >= startPosition),
        priority: determineChunkPriority(content),
        metadata: {
          startPosition,
          endPosition: text.length,
          hasCodeBlock: content.includes("```"),
          hasMarkdownHeadings: /^#{1,6}\s/m.test(content),
          lineCount: content.split("\n").length,
        },
      });
    }
  }
  
  // Add overlap if configured
  if (config.overlapTokens > 0 && chunks.length > 1) {
    addOverlapToChunks(chunks, config.overlapTokens);
  }
  
  return chunks;
}

/**
 * Find optimal positions to split into chunks
 */
function findChunkBoundaries(
  text: string,
  boundaries: SemanticBoundary[],
  maxTokens: number,
  minTokens: number,
  preserveCodeBlocks: boolean,
  preserveMarkdownSections: boolean
): Array<{ position: number; reason: string }> {
  const chunkBoundaries: Array<{ position: number; reason: string }> = [];
  
  // Find code block ranges
  const codeBlockRanges: Array<{ start: number; end: number }> = [];
  const codeBlockStarts = boundaries.filter(b => b.type === "code-block" && b.metadata?.isOpening);
  const codeBlockEnds = boundaries.filter(b => b.type === "code-block" && !b.metadata?.isOpening);
  
  for (const start of codeBlockStarts) {
    const matchingEnd = codeBlockEnds.find(e => e.position > start.position);
    if (matchingEnd) {
      codeBlockRanges.push({ start: start.position, end: matchingEnd.position });
    }
  }
  
  // Find section ranges
  const sectionPositions = boundaries
    .filter(b => b.type === "section")
    .map(b => b.position);
  
  let currentPosition = 0;
  let currentTokens = 0;
  let lastGoodBoundary = 0;
  
  const lines = text.split("\n");
  let charPosition = 0;
  
  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    currentTokens += lineTokens;
    
    // Check if we're in a code block
    const inCodeBlock = codeBlockRanges.some(
      r => charPosition >= r.start && charPosition <= r.end
    );
    
    // Check if this is a section boundary
    const isSectionBoundary = sectionPositions.includes(charPosition);
    
    // Check if this is a good boundary position
    const isGoodBoundary = boundaries.some(
      b => b.position === charPosition && b.confidence >= 0.7
    );
    
    // Find potential boundary positions
    const potentialBoundaries = boundaries.filter(
      b => b.position >= lastGoodBoundary && b.position <= charPosition
    );
    
    if (currentTokens >= maxTokens) {
      // Need to split
      if (preserveCodeBlocks && inCodeBlock) {
        // Skip until end of code block
        const codeBlockEnd = codeBlockRanges.find(r => r.start <= charPosition && r.end > charPosition);
        if (codeBlockEnd) {
          chunkBoundaries.push({
            position: codeBlockEnd.end,
            reason: "after-code-block",
          });
          currentPosition = codeBlockEnd.end;
          lastGoodBoundary = codeBlockEnd.end;
          currentTokens = 0;
        }
      } else if (preserveMarkdownSections && isSectionBoundary) {
        // Split at section boundary
        chunkBoundaries.push({
          position: charPosition,
          reason: "section-boundary",
        });
        currentPosition = charPosition;
        lastGoodBoundary = charPosition;
        currentTokens = 0;
      } else {
        // Find the best boundary before this position
        const bestBoundary = potentialBoundaries
          .filter(b => b.position > currentPosition)
          .sort((a, b) => b.confidence - a.confidence)[0];
        
        if (bestBoundary && bestBoundary.position > currentPosition + minTokens * CHARS_PER_TOKEN) {
          chunkBoundaries.push({
            position: bestBoundary.position,
            reason: `boundary-${bestBoundary.type}`,
          });
          currentPosition = bestBoundary.position;
          lastGoodBoundary = bestBoundary.position;
          currentTokens = 0;
        } else {
          // Force split at this line
          chunkBoundaries.push({
            position: charPosition,
            reason: "forced-split",
          });
          currentPosition = charPosition;
          lastGoodBoundary = charPosition;
          currentTokens = 0;
        }
      }
    } else if (isGoodBoundary) {
      lastGoodBoundary = charPosition;
    }
    
    charPosition += line.length + 1;
  }
  
  return chunkBoundaries;
}

/**
 * Determine priority for a chunk based on content
 */
function determineChunkPriority(content: string): ContextPriority {
  // Check for high-priority markers
  if (/SUMMARY:|CLAIM:|RESULT:|ERROR:|CRITICAL:/i.test(content)) {
    return "critical";
  }
  
  if (/IMPORTANT:|WARNING:|TODO:|FIXME:/i.test(content)) {
    return "high";
  }
  
  // Check for task instructions
  if (/^#{1,2}\s*(Task|Instruction|Requirements?)/im.test(content)) {
    return "high";
  }
  
  // Check for code
  if (content.includes("```") || /function\s+\w+|class\s+\w+|const\s+\w+|let\s+\w+/i.test(content)) {
    return "medium";
  }
  
  // Check for documentation
  if (/^#{1,2}\s/im.test(content) || /^[-*]\s/im.test(content)) {
    return "medium";
  }
  
  // Default to low for other content
  return "low";
}

/**
 * Add overlap content between adjacent chunks
 */
function addOverlapToChunks(chunks: TextChunk[], overlapTokens: number): void {
  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const currentChunk = chunks[i];
    
    // Get last portion of previous chunk for overlap
    const prevLines = prevChunk.content.split("\n");
    let overlapContent = "";
    let overlapTokensCount = 0;
    
    for (let j = prevLines.length - 1; j >= 0 && overlapTokensCount < overlapTokens; j--) {
      overlapContent = prevLines[j] + "\n" + overlapContent;
      overlapTokensCount += estimateTokens(prevLines[j]);
    }
    
    // Prepend overlap to current chunk
    if (overlapContent.trim()) {
      currentChunk.content = overlapContent.trim() + "\n\n[...continued...]\n\n" + currentChunk.content;
      currentChunk.tokenEstimate += overlapTokensCount;
    }
  }
}

// ============================================================================
// State Summary Extraction
// ============================================================================

/**
 * 出力テキストから状態サマリーを抽出する
 * @summary サマリーを抽出
 * @param {string} text - 処理対象のテキスト
 * @param {StateSummary} [previousSummary] - 前回のサマリー（差分更新用）
 * @param {SummaryExtractionConfig} config - 抽出設定
 * @returns {StateSummary} 抽出された状態サマリー
 */
export function extractStateSummary(
  text: string,
  previousSummary?: StateSummary,
  config: SummaryExtractionConfig = DEFAULT_SUMMARY_CONFIG
): StateSummary {
  const carriedForward: string[] = [];
  const pendingTasks: string[] = [];
  const decisions: string[] = [];
  const blockers: string[] = [];
  const assumptions: string[] = [];
  const evidence: EvidenceSummary[] = [];
  
  // Extract CARRIED_FORWARD
  const carriedMatch = text.match(/CARRIED_FORWARD:\s*([\s\S]+?)(?:\n\n|\n[A-Z_]+:|$)/i);
  if (carriedMatch) {
    const items = carriedMatch[1].split(/\n[-*]?\s*/).filter(s => s.trim());
    carriedForward.push(...items.slice(0, config.maxCarriedForward));
  }
  
  // Extract NEXT_STEP for pending tasks
  const nextStepMatch = text.match(/NEXT_STEP:\s*([\s\S]+?)(?:\n\n|\n[A-Z]+:|$)/i);
  if (nextStepMatch && nextStepMatch[1].trim() !== "none") {
    pendingTasks.push(nextStepMatch[1].trim());
  }
  
  // Extract decisions from RESULT
  const resultMatch = text.match(/RESULT:\s*([\s\S]+?)(?:\n\n[A-Z]+:|$)/i);
  if (resultMatch) {
    const decisionPatterns = [
      /decided?\s+(?:to\s+)?(.+?)(?:\.|,|\n)/gi,
      /will\s+(.+?)(?:\.|,|\n)/gi,
      /選択した:?\s*(.+?)(?:\n|$)/gi,
    ];
    
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(resultMatch[1])) !== null) {
        if (decisions.length < config.maxDecisions) {
          decisions.push(match[1].trim());
        }
      }
    }
  }
  
  // Extract blockers
  const blockerPatterns = [
    /blocked\s+(?:by\s+)?(.+?)(?:\.|\n)/gi,
    /cannot\s+(?:proceed|continue)\s+(?:until|without)\s+(.+?)(?:\.|\n)/gi,
    /待機中:?\s*(.+?)(?:\n|$)/gi,
    /ブロッカー:?\s*(.+?)(?:\n|$)/gi,
  ];
  
  for (const pattern of blockerPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (blockers.length < config.maxBlockers) {
        blockers.push(match[1].trim());
      }
    }
  }
  
  // Extract assumptions
  const assumptionMatch = text.match(/assuming\s+(?:that\s+)?(.+?)(?:\.|\n)/gi);
  if (assumptionMatch) {
    for (const m of assumptionMatch) {
      if (assumptions.length < config.maxAssumptions) {
        assumptions.push(m.replace(/^assuming\s+(?:that\s+)?/i, "").replace(/[.\n]+$/, "").trim());
      }
    }
  }
  
  // Extract evidence
  const evidenceMatch = text.match(/EVIDENCE:\s*([\s\S]+?)(?:\n\n|\n[A-Z]+:|$)/i);
  if (evidenceMatch) {
    const evidenceItems = evidenceMatch[1].split(/\n[-*]?\s*/).filter(s => s.trim());
    for (const item of evidenceItems.slice(0, config.maxEvidence)) {
      evidence.push({
        claim: "",
        evidence: item.trim(),
        source: "output",
        confidence: 0.7,
        contradicted: false,
      });
    }
  }
  
  // Extract confidence
  const confidenceMatch = text.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  
  // Merge with previous summary if provided
  if (previousSummary) {
    // Carry forward items that weren't contradicted
    for (const item of previousSummary.carriedForward) {
      if (!carriedForward.includes(item) && carriedForward.length < config.maxCarriedForward) {
        carriedForward.push(item);
      }
    }
    
    // Carry forward unresolved blockers
    for (const blocker of previousSummary.blockers) {
      if (!blockers.includes(blocker) && blockers.length < config.maxBlockers) {
        blockers.push(blocker);
      }
    }
    
    // Carry forward active assumptions
    for (const assumption of previousSummary.assumptions) {
      if (!assumptions.includes(assumption) && assumptions.length < config.maxAssumptions) {
        assumptions.push(assumption);
      }
    }
  }
  
  return {
    id: `summary-${Date.now()}`,
    timestamp: Date.now(),
    carriedForward,
    pendingTasks,
    decisions,
    blockers,
    assumptions,
    evidence,
    confidence,
  };
}

/**
 * 状態サマリーをフォーマット
 * @summary サマリーを整形
 * @param {StateSummary} summary - 状態サマリーオブジェクト
 * @returns {string} フォーマットされた文字列
 */
export function formatStateSummary(summary: StateSummary): string {
  const lines: string[] = [];
  
  if (summary.carriedForward.length > 0) {
    lines.push("CARRIED_FORWARD:");
    for (const item of summary.carriedForward) {
      lines.push(`  - ${item}`);
    }
  }
  
  if (summary.pendingTasks.length > 0) {
    lines.push("PENDING_TASKS:");
    for (const task of summary.pendingTasks) {
      lines.push(`  - ${task}`);
    }
  }
  
  if (summary.decisions.length > 0) {
    lines.push("DECISIONS:");
    for (const decision of summary.decisions) {
      lines.push(`  - ${decision}`);
    }
  }
  
  if (summary.blockers.length > 0) {
    lines.push("BLOCKERS:");
    for (const blocker of summary.blockers) {
      lines.push(`  - ${blocker}`);
    }
  }
  
  if (summary.assumptions.length > 0) {
    lines.push("ASSUMPTIONS:");
    for (const assumption of summary.assumptions) {
      lines.push(`  - ${assumption}`);
    }
  }
  
  lines.push(`CONFIDENCE: ${summary.confidence.toFixed(2)}`);
  
  return lines.join("\n");
}

// ============================================================================
// Utility Functions
// ============================================================================

 /**
  * コンテキストアイテムを作成する
  * @param content コンテンツ文字列
  * @param category カテゴリ
  * @param priority 優先度
  * @param options オプション設定（id, source, metadataなど）
  * @returns 作成されたContextItem
  */
export function createContextItem(
  content: string,
  category: ContextCategory,
  priority: ContextPriority = "medium",
  options: {
    id?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  } = {}
): ContextItem {
  return {
    id: options.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    content,
    priority,
    tokenEstimate: estimateTokens(content),
    category,
    timestamp: Date.now(),
    source: options.source,
    metadata: options.metadata,
  };
}

/**
 * 複数のコンテキストアイテムを結合する
 * @summary アイテムを結合
 * @param items 結合対象のコンテキストアイテム配列
 * @param strategy 結合戦略（"concat" | "summarize" | "priority-first"）
 * @returns 結合された単一のコンテキストアイテム
 */
export function mergeContextItems(
  items: ContextItem[],
  strategy: "concat" | "summarize" | "priority-first" = "concat"
): ContextItem {
  if (items.length === 0) {
    return createContextItem("", "working-memory", "low");
  }
  
  if (items.length === 1) {
    return items[0];
  }
  
  // Determine merged category and priority
  const highestPriority = items.reduce((highest, item) => {
    const priorities: ContextPriority[] = ["critical", "high", "medium", "low", "optional"];
    return priorities.indexOf(item.priority) < priorities.indexOf(highest) ? item.priority : highest;
  }, "optional" as ContextPriority);
  
  const category = items[0].category; // Use first item's category
  
  let mergedContent: string;
  
  switch (strategy) {
    case "summarize": {
      // Extract key information from each item
      const keyInfos = items.map(item => {
        const summary = summarizeItem(item);
        return `[${item.id}] ${summary}`;
      });
      mergedContent = keyInfos.join("\n\n");
      break;
    }

    case "priority-first": {
      // Sort by priority and take top items
      const sorted = [...items].sort((a, b) => {
        const priorities: ContextPriority[] = ["critical", "high", "medium", "low", "optional"];
        return priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
      });
      mergedContent = sorted.map(item => item.content).join("\n\n---\n\n");
      break;
    }

    case "concat":
    default:
      mergedContent = items.map(item => item.content).join("\n\n");
  }
  
  return createContextItem(mergedContent, category, highestPriority, {
    source: `merged-${items.length}-items`,
    metadata: {
      mergedFrom: items.map(i => i.id),
      strategy,
    },
  });
}

/**
 * コンテキストの利用率を計算する
 * @summary 利用率を計算
 * @param items コンテキストアイテム配列
 * @param maxTokens トークンの最大許容量
 * @returns 使用量と最大値、およびカテゴリ別・優先度別の内訳
 */
export function calculateUtilization(
  items: ContextItem[],
  maxTokens: number
): {
  usedTokens: number;
  maxTokens: number;
  utilizationRatio: number;
  categoryBreakdown: Record<ContextCategory, number>;
  priorityBreakdown: Record<ContextPriority, number>;
} {
  const categoryBreakdown: Record<ContextCategory, number> = {
    "task-instruction": 0,
    "system-prompt": 0,
    "execution-rules": 0,
    "file-content": 0,
    "conversation": 0,
    "agent-output": 0,
    "verification-result": 0,
    "working-memory": 0,
    "skill-content": 0,
    "reference-doc": 0,
    "error-context": 0,
  };
  
  const priorityBreakdown: Record<ContextPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    optional: 0,
  };
  
  let usedTokens = 0;
  
  for (const item of items) {
    const tokens = estimateContextItemTokens(item);
    usedTokens += tokens;
    categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + tokens;
    priorityBreakdown[item.priority] = (priorityBreakdown[item.priority] || 0) + tokens;
  }
  
  return {
    usedTokens,
    maxTokens,
    utilizationRatio: usedTokens / maxTokens,
    categoryBreakdown,
    priorityBreakdown,
  };
}

// ============================================================================
// Export all types and functions
// ============================================================================

export default {
  // Token estimation
  estimateTokens,
  estimateContextItemTokens,
  
  // Context window management
  optimizeContextWindow,
  
  // Semantic boundary detection
  detectSemanticBoundaries,
  
  // Chunking
  chunkText,
  
  // State summary
  extractStateSummary,
  formatStateSummary,
  
  // Utilities
  createContextItem,
  mergeContextItems,
  calculateUtilization,
  
  // Configurations
  DEFAULT_CONTEXT_WINDOW_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_SUMMARY_CONFIG,
};
