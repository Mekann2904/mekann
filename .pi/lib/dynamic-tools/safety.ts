/**
 * コード安全性解析モジュール
 * 生成されたコードの安全性を評価し、危険な操作を検出
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 安全性解析結果
 */
export interface SafetyAnalysisResult {
  /** 安全性スコア（0.0-1.0） */
  score: number;
  /** 検出された問題 */
  issues: SafetyAnalysisIssue[];
  /** 許可された操作 */
  allowedOperations: string[];
  /** 禁止された操作の検出 */
  blockedOperations: string[];
  /** 推奨事項 */
  recommendations: string[];
  /** 安全と判定されたか */
  isSafe: boolean;
  /** 信頼度 */
  confidence: number;
}

/**
 * 安全性の問題（解析用）
 */
export interface SafetyAnalysisIssue {
  /** 重大度 */
  severity: "critical" | "high" | "medium" | "low";
  /** 問題の種類 */
  type: SafetyAnalysisIssueType;
  /** 説明 */
  description: string;
  /** コード内の位置 */
  location?: {
    line?: number;
    snippet?: string;
  };
  /** 修正提案 */
  suggestion?: string;
}

/**
 * 安全性問題の種類（解析用）
 */
export type SafetyAnalysisIssueType =
  | "file-system-write"
  | "file-system-delete"
  | "network-access"
  | "command-injection"
  | "eval-usage"
  | "process-spawn"
  | "environment-access"
  | "sensitive-data"
  | "resource-exhaustion"
  | "unbounded-operation"
  | "prototype-pollution"
  | "unsafe-regex";

// ============================================================================
// Dangerous Patterns
// ============================================================================

/**
 * 禁止パターンの定義
 */
interface DangerousPattern {
  pattern: RegExp;
  type: SafetyAnalysisIssueType;
  severity: SafetyAnalysisIssue["severity"];
  description: string;
  suggestion: string;
}

/**
 * 禁止パターンリスト
 * 
 * カテゴリ:
 * 1. ファイルシステム操作（削除、書き込み）
 * 2. プロセス実行
 * 3. ネットワークアクセス
 * 4. 動的コード実行
 * 5. 機密データアクセス
 */
const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // ファイルシステム - 削除
  {
    pattern: /fs\.rm\s*\(|fs\.rmdir\s*\(|fs\.unlink\s*\(/,
    type: "file-system-delete",
    severity: "critical",
    description: "ファイル/ディレクトリ削除操作が検出されました",
    suggestion: "削除操作は許可リストで明示的に許可してください",
  },
  {
    pattern: /rm\s+-rf|rmdir\s+/,
    type: "file-system-delete",
    severity: "critical",
    description: "シェルコマンドによる削除操作が検出されました",
    suggestion: "ファイル削除はfsモジュール経由で許可リストに基づいて実行してください",
  },
  {
    pattern: /unlinkSync\s*\(|rmSync\s*\(/,
    type: "file-system-delete",
    severity: "critical",
    description: "同期的な削除操作が検出されました",
    suggestion: "削除操作は許可リストで明示的に許可してください",
  },

  // ファイルシステム - 書き込み
  {
    pattern: /fs\.writeFile\s*\(|fs\.writeFileSync\s*\(/,
    type: "file-system-write",
    severity: "high",
    description: "ファイル書き込み操作が検出されました",
    suggestion: "書き込み先パスをバリデーションしてください",
  },
  {
    pattern: /fs\.appendFile\s*\(|fs\.appendFileSync\s*\(/,
    type: "file-system-write",
    severity: "high",
    description: "ファイル追記操作が検出されました",
    suggestion: "追記先パスをバリデーションしてください",
  },
  {
    pattern: /fs\.mkdir\s*\(|fs\.mkdirSync\s*\(/,
    type: "file-system-write",
    severity: "medium",
    description: "ディレクトリ作成操作が検出されました",
    suggestion: "作成先パスをバリデーションしてください",
  },

  // プロセス実行
  {
    pattern: /child_process|spawn\s*\(|exec\s*\(|execSync\s*\(|spawnSync\s*\(/,
    type: "process-spawn",
    severity: "critical",
    description: "外部プロセス実行が検出されました",
    suggestion: "外部プロセスの実行は許可されたコマンドのみに限定してください",
  },

  // ネットワークアクセス
  {
    pattern: /fetch\s*\(|http\.request|https\.request|axios|superagent|node-fetch/,
    type: "network-access",
    severity: "high",
    description: "ネットワークアクセスが検出されました",
    suggestion: "外部APIアクセスは許可リストで制御してください",
  },
  {
    pattern: /WebSocket|socket\.io/,
    type: "network-access",
    severity: "high",
    description: "WebSocket接続が検出されました",
    suggestion: "WebSocket接続は許可リストで制御してください",
  },

  // 動的コード実行
  {
    pattern: /eval\s*\(|new\s+Function\s*\(|vm\.runIn/,
    type: "eval-usage",
    severity: "critical",
    description: "動的コード実行が検出されました",
    suggestion: "evalの使用は避け、静的なコード解析を使用してください",
  },

  // 環境変数アクセス
  {
    pattern: /process\.env\s*\[/,
    type: "environment-access",
    severity: "medium",
    description: "環境変数への動的アクセスが検出されました",
    suggestion: "必要な環境変数のみを明示的にアクセスしてください",
  },

  // 機密データ
  {
    pattern: /password|secret|api[_-]?key|token|credential|private[_-]?key/i,
    type: "sensitive-data",
    severity: "high",
    description: "機密データへの参照が検出されました",
    suggestion: "機密データは環境変数または安全なストレージから取得してください",
  },

  // リソース枯渇
  {
    pattern: /while\s*\(\s*true|for\s*\(\s*;\s*;/,
    type: "unbounded-operation",
    severity: "high",
    description: "無限ループの可能性があるコードが検出されました",
    suggestion: "ループには上限を設けてください",
  },
  {
    pattern: /setTimeout\s*\([^,]+,\s*[0-9]{7,}/,
    type: "resource-exhaustion",
    severity: "medium",
    description: "非常に長いタイムアウトが検出されました",
    suggestion: "タイムアウトは合理的な範囲内に設定してください",
  },

  // プロトタイプ汚染
  {
    pattern: /__proto__|constructor\.prototype|Object\.assign\s*\([^,]*\.\.\./,
    type: "prototype-pollution",
    severity: "high",
    description: "プロトタイプ汚染の可能性があるコードが検出されました",
    suggestion: "オブジェクトの深いマージは安全な方法で行ってください",
  },

  // 危険な正規表現
  {
    pattern: /(?:\+|\*|\{[0-9]+,\})(?:\+|\*|\{[0-9]+,\})/,
    type: "unsafe-regex",
    severity: "medium",
    description: "ReDoS脆弱性の可能性がある正規表現が検出されました",
    suggestion: "ネストした量指定子を避けてください",
  },
];

/**
 * 許可される安全なパターン
 */
const SAFE_PATTERNS: RegExp[] = [
  // 読み取り専用ファイル操作
  /fs\.readFile\s*\(/,
  /fs\.readFileSync\s*\(/,
  /fs\.exists\s*\(/,
  /fs\.existsSync\s*\(/,
  /fs\.stat\s*\(/,
  /fs\.statSync\s*\(/,
  /fs\.readdir\s*\(/,
  /fs\.readdirSync\s*\(/,
  /fs\.lstat\s*\(/,
  /fs\.lstatSync\s*\(/,

  // パス操作
  /path\.join\s*\(/,
  /path\.resolve\s*\(/,
  /path\.dirname\s*\(/,
  /path\.basename\s*\(/,
  /path\.extname\s*\(/,

  // JSON操作
  /JSON\.parse\s*\(/,
  /JSON\.stringify\s*\(/,

  // 文字列操作
  /\.split\s*\(/,
  /\.join\s*\(/,
  /\.slice\s*\(/,
  /\.substring\s*\(/,
  /\.replace\s*\(/,
  /\.trim\s*\(/,
  /\.toLowerCase\s*\(/,
  /\.toUpperCase\s*\(/,

  // 配列操作
  /\.map\s*\(/,
  /\.filter\s*\(/,
  /\.reduce\s*\(/,
  /\.forEach\s*\(/,
  /\.find\s*\(/,
  /\.some\s*\(/,
  /\.every\s*\(/,
  /\.sort\s*\(/,

  // オブジェクト操作
  /Object\.keys\s*\(/,
  /Object\.values\s*\(/,
  /Object\.entries\s*\(/,
];

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * コードの安全性を解析
 * 
 * @param code - 解析対象のコード
 * @param options - 解析オプション
 * @returns 安全性解析結果
 */
export function analyzeCodeSafety(
  code: string,
  options: {
    /** 許可された操作のリスト */
    allowlist?: string[];
    /** 厳格モード（より低いスコア） */
    strict?: boolean;
  } = {}
): SafetyAnalysisResult {
  const { allowlist = [], strict = false } = options;

  const issues: SafetyAnalysisIssue[] = [];
  const allowedOperations: string[] = [];
  const blockedOperations: string[] = [];
  const recommendations: string[] = [];

  // コードを行に分割
  const lines = code.split("\n");

  // 危険パターンをチェック
  for (const patternInfo of DANGEROUS_PATTERNS) {
    // 正規表現にgフラグがない場合は追加
    const regex = patternInfo.pattern.flags.includes('g') 
      ? patternInfo.pattern 
      : new RegExp(patternInfo.pattern.source, patternInfo.pattern.flags + 'g');
    const matches = Array.from(code.matchAll(regex));
    
    for (const match of matches) {
      const lineNum = findLineNumber(lines, match.index ?? 0);
      const snippet = lines[lineNum - 1]?.trim() ?? "";

      // 許可リストにある場合はスキップ
      const operationKey = `${patternInfo.type}:${snippet.slice(0, 50)}`;
      if (allowlist.includes(patternInfo.type) || allowlist.includes(operationKey)) {
        allowedOperations.push(snippet.slice(0, 100));
        continue;
      }

      // 許可されていない危険操作を記録
      blockedOperations.push(snippet.slice(0, 100));

      issues.push({
        severity: patternInfo.severity,
        type: patternInfo.type,
        description: patternInfo.description,
        location: {
          line: lineNum,
          snippet,
        },
        suggestion: patternInfo.suggestion,
      });
    }
  }

  // 安全なパターンの使用を記録
  for (const pattern of SAFE_PATTERNS) {
    // 正規表現にgフラグがない場合は追加
    const regex = pattern.flags.includes('g') 
      ? pattern 
      : new RegExp(pattern.source, pattern.flags + 'g');
    const matches = Array.from(code.matchAll(regex));
    for (const match of matches) {
      const lineNum = findLineNumber(lines, match.index ?? 0);
      const snippet = lines[lineNum - 1]?.trim() ?? "";
      allowedOperations.push(snippet.slice(0, 100));
    }
  }

  // スコア計算
  let score = 1.0;

  for (const issue of issues) {
    const penalty = getSeverityPenalty(issue.severity, strict);
    score -= penalty;
  }

  // 信頼度の計算
  let confidence = 0.7;
  if (issues.length === 0) {
    confidence = 0.9;
  } else if (issues.some(i => i.severity === "critical")) {
    confidence = 0.5;
  }

  // 推奨事項の生成
  if (issues.length > 0) {
    const criticalCount = issues.filter(i => i.severity === "critical").length;
    const highCount = issues.filter(i => i.severity === "high").length;

    if (criticalCount > 0) {
      recommendations.push(`${criticalCount}件の重大な問題を修正してください`);
    }
    if (highCount > 0) {
      recommendations.push(`${highCount}件の高優先度の問題を確認してください`);
    }

    // 操作タイプ別の推奨
    const issueTypes = new Set(issues.map(i => i.type));
    if (issueTypes.has("file-system-delete")) {
      recommendations.push("削除操作は許可リストで明示的に許可してください");
    }
    if (issueTypes.has("process-spawn")) {
      recommendations.push("外部プロセス実行は避けてください");
    }
    if (issueTypes.has("network-access")) {
      recommendations.push("ネットワークアクセスは許可されたエンドポイントのみに限定してください");
    }
  }

  // スコアを0-1の範囲に正規化
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    issues,
    allowedOperations: Array.from(new Set(allowedOperations)).slice(0, 20),
    blockedOperations: Array.from(new Set(blockedOperations)),
    recommendations,
    isSafe: score >= (strict ? 0.8 : 0.5) && blockedOperations.length === 0,
    confidence,
  };
}

/**
 * 行番号を検索
 */
function findLineNumber(lines: string[], index: number): number {
  let current = 0;
  for (let i = 0; i < lines.length; i++) {
    current += lines[i].length + 1; // +1 for newline
    if (current > index) {
      return i + 1;
    }
  }
  return lines.length;
}

/**
 * 重大度に応じたペナルティを取得
 */
function getSeverityPenalty(severity: SafetyAnalysisIssue["severity"], strict: boolean): number {
  const multipliers = strict ? 1.5 : 1.0;
  
  switch (severity) {
    case "critical": return 0.5 * multipliers;
    case "high": return 0.25 * multipliers;
    case "medium": return 0.1 * multipliers;
    case "low": return 0.05 * multipliers;
    default: return 0.1;
  }
}

// ============================================================================
// Quick Safety Check
// ============================================================================

/**
 * 高速な安全性チェック（詳細解析なし）
 * ツール実行前の簡易チェック用
 */
export function quickSafetyCheck(code: string): {
  isSafe: boolean;
  reason?: string;
} {
  // クリティカルパターンのみチェック
  const criticalPatterns = DANGEROUS_PATTERNS.filter(p => p.severity === "critical");
  
  for (const pattern of criticalPatterns) {
    if (pattern.pattern.test(code)) {
      return {
        isSafe: false,
        reason: pattern.description,
      };
    }
  }

  return { isSafe: true };
}

/**
 * コードが許可リストに準拠しているかチェック
 */
export function checkAllowlistCompliance(
  code: string,
  allowlist: string[]
): {
  compliant: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // 許可リストが空の場合はすべての操作が禁止
  if (allowlist.length === 0) {
    // 読み取り専用操作のみを許可
    const readOnlyPatterns = [
      /fs\.read/i,
      /fs\.exists/i,
      /fs\.stat/i,
      /fs\.readdir/i,
      /path\./i,
      /JSON\./i,
    ];

    const hasWriteOperation = DANGEROUS_PATTERNS.some(p =>
      (p.type === "file-system-write" || p.type === "file-system-delete") &&
      p.pattern.test(code)
    );

    if (hasWriteOperation) {
      violations.push("書き込み操作は許可リストが空の場合は禁止されています");
    }
  }

  // 許可リストに基づくチェック
  const allowedTypes = new Set(allowlist);
  
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.pattern.test(code)) {
      if (!allowedTypes.has(pattern.type)) {
        violations.push(`許可されていない操作: ${pattern.type}`);
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Default Allowlists
// ============================================================================

/**
 * デフォルトの許可リスト（読み取り専用）
 */
export const DEFAULT_READONLY_ALLOWLIST: string[] = [
  "file-system-read",
];

/**
 * 標準的な許可リスト（制限付き書き込み）
 */
export const STANDARD_ALLOWLIST: string[] = [
  "file-system-read",
  "file-system-write",
];

/**
 * フルアクセス許可リスト（使用注意）
 */
export const FULL_ACCESS_ALLOWLIST: string[] = [
  "file-system-read",
  "file-system-write",
  "file-system-delete",
  "process-spawn",
  "network-access",
];
