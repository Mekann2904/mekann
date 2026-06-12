/**
 * review-fixer-demo — utility module for testing the review_fixer workflow.
 *
 * Provides typed transaction processing, basic arithmetic, item aggregation,
 * and result formatting helpers.
 */

// ─── Types ─────────────────────────────────────────────

/** Actor role that determines discount rates. */
export type Role = "user" | "admin" | "guest";

/** Supported transaction actions. */
export type Action = "order" | "refund" | "browse";

export interface TransactionData {
  amount?: number;
  vip?: boolean;
}

export interface TransactionInput {
  role: string;
  action: string;
  data: TransactionData;
}

interface TransactionResult {
  label: string;
  amount: number;
  unknown: boolean;
}

export interface ResultObject {
  total?: number;
  count?: number;
}

// ─── Discount policy (data-driven, no spaghetti) ───────

type DiscountRule = { base: number; vip: number };

const DISCOUNT_TABLE: Record<string, DiscountRule> = {
  user: { base: 1.0, vip: 0.9 },
  admin: { base: 0.95, vip: 0.8 },
  guest: { base: 1.0, vip: 1.0 },
};

function applyDiscount(role: string, amount: number, vip: boolean): number {
  const rule = DISCOUNT_TABLE[role];
  if (!rule) return 0;
  return amount * (vip ? rule.vip : rule.base);
}

// ─── Transaction processing ────────────────────────────

function computeOrder(role: string, data: TransactionData): TransactionResult {
  if (data.amount == null) {
    return { label: `${role}_order_0`, amount: 0, unknown: false };
  }
  const discounted = applyDiscount(role, data.amount, data.vip === true);
  return { label: `${role}_order_${discounted}`, amount: discounted, unknown: false };
}

function computeRefund(role: string, data: TransactionData): TransactionResult {
  if (data.amount == null) {
    return { label: `${role}_refund_0`, amount: 0, unknown: false };
  }
  const refundAmount = data.amount * -1;
  return { label: `${role}_refund_${Math.abs(refundAmount)}`, amount: refundAmount, unknown: false };
}

function computeAction(role: string, action: string, data: TransactionData): TransactionResult {
  // Unknown role → always mark as unknown regardless of action
  if (!DISCOUNT_TABLE[role]) {
    return { label: `unknown_${role}`, amount: 0, unknown: true };
  }
  if (action === "order") return computeOrder(role, data);
  if (action === "refund") return computeRefund(role, data);
  if (role === "guest" && action === "browse") {
    return { label: "guest_browse", amount: 0, unknown: false };
  }
  return { label: `${role}_unknown`, amount: 0, unknown: false };
}

function formatTransactionOutput(result: TransactionResult): string {
  const status = result.unknown ? "unknown" : result.amount > 0 ? "ok" : result.amount < 0 ? "refund" : "zero";
  const displayAmount = result.amount < 0 ? Math.abs(result.amount) : result.amount;
  return `${status}|${result.label}|${displayAmount}`;
}

/**
 * Process a transaction and return a formatted summary string.
 *
 * The summary format is `status|label|amount` where status is one of
 * "ok", "refund", "zero", or "unknown".
 */
export function processTransaction(input: TransactionInput): string {
  const result = computeAction(input.role, input.action, input.data);
  return formatTransactionOutput(result);
}

/**
 * @deprecated Use `processTransaction` instead.
 * Preserved for backward compatibility with existing tests.
 */
export function doTheThing(t: string, a: string, d: TransactionData): string {
  return processTransaction({ role: t, action: a, data: d });
}

// ─── Arithmetic calculator ─────────────────────────────

type BinOp = (a: number, b: number) => number;

const BINARY_OPS: Record<string, BinOp> = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (_a, b) => (b === 0 ? 0 : _a / b),
};

/** Supported arithmetic operation names. */
export type CalcOp = keyof typeof BINARY_OPS;

/**
 * Perform a basic arithmetic operation on two numbers.
 * Returns 0 for division by zero or unknown operations.
 */
export function calc(op: string, a: number, b: number): number {
  const fn = BINARY_OPS[op];
  return fn ? fn(a, b) : 0;
}

// ─── Item aggregation ──────────────────────────────────

export interface AggregationItem {
  type: string;
  val: number;
}

const TYPE_MULTIPLIERS: Record<string, number> = {
  a: 1.2,
  b: 1.1,
  c: 1.05,
};

/**
 * Aggregate an array of items by applying type-specific multipliers.
 * Unknown types are skipped (multiplier = 0).
 */
export function aggregateItems(items: AggregationItem[]): number {
  return items.reduce((sum, item) => {
    const multiplier = TYPE_MULTIPLIERS[item.type] ?? 0;
    return sum + item.val * multiplier;
  }, 0);
}

/**
 * @deprecated Use `aggregateItems` instead.
 * Preserved for backward compatibility with existing tests.
 */
export function processData(items: AggregationItem[]): number {
  return aggregateItems(items);
}

// ─── Formatting helpers ────────────────────────────────

/**
 * Join a label and value with a colon separator.
 */
export function formatLabel(label: string, value: number | string): string {
  return `${label}:${value}`;
}

/** @deprecated Use `formatLabel` instead. */
export function helper(s: string, n: number | string): string {
  return formatLabel(s, n);
}

/** @deprecated Use `formatLabel` instead. */
export function helper2(s: string, n: number | string): string {
  return formatLabel(s, n);
}

/**
 * Format a result object into a human-readable string.
 */
export function formatResult(r: ResultObject): string {
  const parts: string[] = [];
  if (r.total !== undefined) parts.push(`total:${r.total}`);
  if (r.count !== undefined) parts.push(`count:${r.count}`);
  return parts.join(" ");
}
