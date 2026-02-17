/**
 * Search Extension Error Types
 *
 * Categorized error types with recovery hints for better error handling
 * and user guidance across all search tools.
 */

// ============================================
// Error Categories
// ============================================

/**
 * Categories for search tool errors.
 * Each category has different recovery strategies.
 */
export type SearchErrorCategory =
	| "dependency"   // External tool not available (rg, fd, ctags)
	| "parameter"    // Invalid input parameters
	| "execution"    // Command execution failed
	| "timeout"      // Operation timed out
	| "index"        // Index-related issues
	| "filesystem";  // File system errors (permission, not found, etc.)

// ============================================
// SearchToolError Class
// ============================================

/**
 * Base error class for search tools with categorization and recovery hints.
 *
 * @example
 * ```typescript
 * throw new SearchToolError(
 *   "ripgrep (rg) not found",
 *   "dependency",
 *   "Install ripgrep: brew install ripgrep"
 * );
 * ```
 */
export class SearchToolError extends Error {
	/**
	 * Category of the error for programmatic handling.
	 */
	public readonly category: SearchErrorCategory;

	/**
	 * Optional recovery suggestion for the user.
	 */
	public readonly recovery?: string;

	/**
	 * Original error that caused this error, if any.
	 */
	public readonly cause?: Error;

	constructor(
		message: string,
		category: SearchErrorCategory,
		recovery?: string,
		cause?: Error
	) {
		super(message);
		this.name = "SearchToolError";
		this.category = category;
		this.recovery = recovery;
		this.cause = cause;

		// Maintain proper stack trace in V8 environments
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, SearchToolError);
		}
	}

	/**
	 * Format error for display to users.
	 */
	format(): string {
		let result = this.message;

		if (this.recovery) {
			result += `\nRecovery: ${this.recovery}`;
		}

		return result;
	}

	/**
	 * Create a JSON-serializable representation.
	 */
	toJSON(): {
		name: string;
		message: string;
		category: SearchErrorCategory;
		recovery?: string;
	} {
		return {
			name: this.name,
			message: this.message,
			category: this.category,
			recovery: this.recovery,
		};
	}
}

// ============================================
// Error Factory Functions
// ============================================

/**
 * Create a dependency error (external tool not available).
 */
export function dependencyError(
	tool: string,
	recovery?: string
): SearchToolError {
	const defaultRecovery = getInstallHint(tool);
	return new SearchToolError(
		`${tool} not found. Please install ${tool} to use this feature.`,
		"dependency",
		recovery ?? defaultRecovery
	);
}

/**
 * Get installation hint for common tools.
 */
function getInstallHint(tool: string): string {
	const hints: Record<string, string> = {
		rg: "Install ripgrep: brew install ripgrep (macOS) or apt install ripgrep (Ubuntu)",
		fd: "Install fd: brew install fd (macOS) or apt install fd-find (Ubuntu)",
		ctags:
			"Install universal-ctags: brew install universal-ctags (macOS) or apt install universal-ctags (Ubuntu)",
	};

	return hints[tool] ?? `Please install ${tool} to your system PATH.`;
}

/**
 * Create a parameter validation error.
 */
export function parameterError(
	parameter: string,
	reason: string,
	recovery?: string
): SearchToolError {
	return new SearchToolError(
		`Invalid parameter '${parameter}': ${reason}`,
		"parameter",
		recovery
	);
}

/**
 * Create an execution error (command failed).
 */
export function executionError(
	command: string,
	stderr: string,
	recovery?: string
): SearchToolError {
	const message = stderr
		? `Command '${command}' failed: ${stderr}`
		: `Command '${command}' failed`;

	return new SearchToolError(message, "execution", recovery);
}

/**
 * Create a timeout error.
 */
export function timeoutError(
	operation: string,
	timeoutMs: number,
	recovery?: string
): SearchToolError {
	return new SearchToolError(
		`Operation '${operation}' timed out after ${timeoutMs}ms`,
		"timeout",
		recovery ?? "Try reducing the search scope or increasing the timeout."
	);
}

/**
 * Create an index-related error.
 */
export function indexError(
	message: string,
	recovery?: string
): SearchToolError {
	return new SearchToolError(message, "index", recovery);
}

/**
 * Create a filesystem error.
 */
export function filesystemError(
	operation: string,
	path: string,
	cause?: Error
): SearchToolError {
	return new SearchToolError(
		`Filesystem error during ${operation}: ${path}`,
		"filesystem",
		cause?.message,
		cause
	);
}

// ============================================
// Error Detection Utilities
// ============================================

/**
 * Check if an error is a SearchToolError.
 */
export function isSearchToolError(error: unknown): error is SearchToolError {
	return error instanceof SearchToolError;
}

/**
 * Check if an error is of a specific category.
 */
export function isErrorCategory(
	error: unknown,
	category: SearchErrorCategory
): boolean {
	return isSearchToolError(error) && error.category === category;
}

/**
 * Get a user-friendly error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
	if (isSearchToolError(error)) {
		return error.format();
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

// ============================================
// Result Type Helpers
// ============================================

/**
 * Result type for operations that can fail.
 * Provides a type-safe way to handle errors without exceptions.
 */
export type SearchResult<T, E = SearchToolError> =
	| { ok: true; value: T }
	| { ok: false; error: E };

/**
 * Create a successful result.
 */
export function ok<T>(value: T): SearchResult<T> {
	return { ok: true, value };
}

/**
 * Create a failed result.
 */
export function err<E = SearchToolError>(error: E): SearchResult<never, E> {
	return { ok: false, error };
}

/**
 * Check if a result is successful.
 */
export function isOk<T, E>(result: SearchResult<T, E>): result is { ok: true; value: T } {
	return result.ok === true;
}

/**
 * Check if a result is a failure.
 */
export function isErr<T, E>(result: SearchResult<T, E>): result is { ok: false; error: E } {
	return result.ok === false;
}
