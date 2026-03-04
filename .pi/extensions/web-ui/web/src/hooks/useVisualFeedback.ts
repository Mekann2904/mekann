/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useVisualFeedback.ts
 * @role Visual feedback system for user actions
 * @why Provide immediate visual confirmation for user interactions
 * @related ../components/ui/toast.tsx, ./useToast.ts
 * @public_api useVisualFeedback, VisualFeedbackType
 * @invariants Feedback is temporary and auto-dismisses
 * @side_effects Shows toast notifications, triggers CSS animations
 * @failure_modes None (graceful degradation)
 *
 * @abdd.explain
 * @overview Visual feedback hook for common user actions
 * @what_it_does Provides consistent visual feedback (toasts, animations) for CRUD operations
 * @why_it_exists Users need immediate confirmation that their actions succeeded or failed
 * @scope(in) Action results, messages
 * @scope(out) Toast notifications, animation triggers
 */

import { useCallback } from "preact/hooks";
import { useToast } from "./useToast";

/**
 * Type of visual feedback
 */
export type VisualFeedbackType = "success" | "error" | "warning" | "info";

/**
 * Options for visual feedback
 */
interface FeedbackOptions {
  /** Duration in milliseconds */
  duration?: number;
  /** Whether to show a toast notification */
  showToast?: boolean;
  /** Custom message (defaults to standard message) */
  message?: string;
}

/**
 * Standard feedback messages
 */
const DEFAULT_MESSAGES: Record<string, Record<VisualFeedbackType, string>> = {
  save: {
    success: "Changes saved successfully",
    error: "Failed to save changes",
    warning: "Some changes may not be saved",
    info: "Saving...",
  },
  delete: {
    success: "Item deleted successfully",
    error: "Failed to delete item",
    warning: "This action cannot be undone",
    info: "Deleting...",
  },
  create: {
    success: "Created successfully",
    error: "Failed to create",
    warning: "Please check your input",
    info: "Creating...",
  },
  update: {
    success: "Updated successfully",
    error: "Failed to update",
    warning: "Some updates may not apply",
    info: "Updating...",
  },
  load: {
    success: "Loaded successfully",
    error: "Failed to load",
    warning: "Partial data loaded",
    info: "Loading...",
  },
};

/**
 * Hook for providing visual feedback on user actions
 * @summary 視覚的フィードバックフック
 * @returns Object with feedback methods
 */
export function useVisualFeedback() {
  const { show } = useToast();

  /**
   * Show generic feedback
   */
  const feedback = useCallback(
    (type: VisualFeedbackType, message: string, options?: FeedbackOptions) => {
      const duration = options?.duration ?? (type === "info" ? 3000 : 5000);
      
      if (options?.showToast !== false) {
        show(type, message, duration);
      }
    },
    [show]
  );

  /**
   * Show feedback for a specific action
   */
  const actionFeedback = useCallback(
    (
      action: keyof typeof DEFAULT_MESSAGES,
      type: VisualFeedbackType,
      options?: FeedbackOptions
    ) => {
      const message = options?.message ?? DEFAULT_MESSAGES[action][type];
      feedback(type, message, options);
    },
    [feedback]
  );

  /**
   * Show success feedback
   */
  const success = useCallback(
    (message: string, options?: Omit<FeedbackOptions, "message">) => {
      feedback("success", message, options);
    },
    [feedback]
  );

  /**
   * Show error feedback
   */
  const error = useCallback(
    (message: string, options?: Omit<FeedbackOptions, "message">) => {
      feedback("error", message, options);
    },
    [feedback]
  );

  /**
   * Show warning feedback
   */
  const warning = useCallback(
    (message: string, options?: Omit<FeedbackOptions, "message">) => {
      feedback("warning", message, options);
    },
    [feedback]
  );

  /**
   * Show info feedback
   */
  const info = useCallback(
    (message: string, options?: Omit<FeedbackOptions, "message">) => {
      feedback("info", message, options);
    },
    [feedback]
  );

  return {
    feedback,
    actionFeedback,
    success,
    error,
    warning,
    info,
  };
}
