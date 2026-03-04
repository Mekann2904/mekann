/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/index.ts
 * @role Hooks export index
 * @why Centralized access to all custom hooks
 * @related All hook files in this directory
 * @public_api All hooks
 */

export { useToast, ToastProvider, toast } from "./useToast";
export type { Toast, ToastType, ToastContextValue } from "./useToast";

export {
  useKeyboardShortcuts,
  useGlobalShortcuts,
  usePageShortcuts,
  COMMON_SHORTCUTS,
} from "./useKeyboardShortcuts";
export type {
  ShortcutConfig,
  ShortcutCategory,
} from "./useKeyboardShortcuts";

export { useVisualFeedback } from "./useVisualFeedback";
export type { VisualFeedbackType } from "./useVisualFeedback";

export { useFetch } from "./useFetch";
export { useRuntimeStatus } from "./useRuntimeStatus";
export { useTaskDataNew as useTaskData } from "./useTaskDataNew";
export { useTaskFilters } from "./useTaskFilters";
export { useInstancesNew as useInstances } from "./useInstancesNew";
export { useUsageData } from "./useUsageData";
