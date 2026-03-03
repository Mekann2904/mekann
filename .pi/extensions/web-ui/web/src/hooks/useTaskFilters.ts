/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useTaskFilters.ts
 * @role Task filtering and search state management
 * @why Extract filter logic from tasks-page.tsx (1060 lines) to reduce complexity
 * @related tasks-page.tsx, useTaskData.ts
 * @public_api useTaskFilters, TaskFiltersState, TaskFiltersActions
 * @invariants URL params are synced with filter state
 * @side_effects Updates URL query parameters
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Task filtering and search hook
 * @what_it_does Manages search query, status filters, priority filter, and URL sync
 * @why_it_exists Reduces tasks-page.tsx complexity by extracting filter logic
 * @scope(in) None
 * @scope(out) Filter state, filter actions, filtered tasks
 */

import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import type { Task, TaskStatus, TaskPriority } from "../components/kanban-task-card";

export interface TaskFiltersState {
  searchQuery: string;
  statusFilters: Set<TaskStatus>;
  priorityFilter: TaskPriority | null;
}

export interface TaskFiltersActions {
  setSearchQuery: (query: string) => void;
  toggleStatusFilter: (status: TaskStatus) => void;
  setPriorityFilter: (priority: TaskPriority | null) => void;
  clearFilters: () => void;
}

export interface UseTaskFiltersReturn extends TaskFiltersState, TaskFiltersActions {
  filteredTasks: Task[];
  tasksByColumn: Record<TaskStatus, Task[]>;
  hasActiveFilters: boolean;
}

// Column configuration
const ALL_STATUSES: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled", "failed"];

// Priority order for sorting
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function useTaskFilters(tasks: Task[]): UseTaskFiltersReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<TaskStatus>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);

  // URL query parameter sync for filters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Read status filters from URL
    const statusParam = params.get("status");
    if (statusParam) {
      const statuses = statusParam.split(",") as TaskStatus[];
      setStatusFilters(new Set(statuses.filter(s => ALL_STATUSES.includes(s))));
    }

    // Read priority filter from URL
    const priorityParam = params.get("priority") as TaskPriority | null;
    if (priorityParam && ["low", "medium", "high", "urgent"].includes(priorityParam)) {
      setPriorityFilter(priorityParam);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();

    if (statusFilters.size > 0 && statusFilters.size < ALL_STATUSES.length) {
      params.set("status", Array.from(statusFilters).join(","));
    }

    if (priorityFilter) {
      params.set("priority", priorityFilter);
    }

    const newSearch = params.toString();
    const currentSearch = window.location.search.slice(1);

    if (newSearch !== currentSearch) {
      const newUrl = newSearch
        ? `${window.location.pathname}?${newSearch}`
        : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [statusFilters, priorityFilter]);

  // Filter tasks by search, status, and priority
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description?.toLowerCase().includes(query)) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply status filter (only if some but not all statuses are selected)
    if (statusFilters.size > 0 && statusFilters.size < ALL_STATUSES.length) {
      result = result.filter((t) => statusFilters.has(t.status));
    }

    // Apply priority filter
    if (priorityFilter) {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    return result;
  }, [tasks, searchQuery, statusFilters, priorityFilter]);

  // Group tasks by status
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      failed: [],
    };

    // Separate parent tasks and subtasks
    const parentTasks = filteredTasks.filter((t) => !t.parentTaskId);
    const subtasksByParentId = new Map<string, Task[]>();
    filteredTasks.forEach((task) => {
      if (task.parentTaskId) {
        const existing = subtasksByParentId.get(task.parentTaskId) || [];
        existing.push(task);
        subtasksByParentId.set(task.parentTaskId, existing);
      }
    });

    // Sort parent tasks
    parentTasks.sort((a, b) => {
      // Overdue tasks first
      const aOverdue = a.dueDate && a.status !== "completed" && a.status !== "cancelled" && new Date(a.dueDate) < new Date();
      const bOverdue = b.dueDate && b.status !== "completed" && b.status !== "cancelled" && new Date(b.dueDate) < new Date();
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // Then by priority
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Sort subtasks by creation date
    subtasksByParentId.forEach((subtasks) => {
      subtasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });

    // Build columns:
    // - Parent task in its own status column
    // - Subtasks appear under parent ONLY if they share the same status
    // - Subtasks with different status appear independently in their own column
    parentTasks.forEach((parent) => {
      grouped[parent.status].push(parent);
      // Add subtasks that have the same status as parent, right after parent
      const subtasks = subtasksByParentId.get(parent.id) || [];
      subtasks.forEach((subtask) => {
        if (subtask.status === parent.status) {
          grouped[parent.status].push(subtask);
        }
      });
    });

    // Add orphan subtasks (subtasks whose parent is in a different column)
    subtasksByParentId.forEach((subtasks, parentId) => {
      const parent = parentTasks.find((p) => p.id === parentId);
      subtasks.forEach((subtask) => {
        // If parent doesn't exist or has different status, add independently
        if (!parent || subtask.status !== parent.status) {
          grouped[subtask.status].push(subtask);
        }
      });
    });

    return grouped;
  }, [filteredTasks]);

  const toggleStatusFilter = useCallback((status: TaskStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilters(new Set());
    setPriorityFilter(null);
  }, []);

  const hasActiveFilters = searchQuery.trim() !== "" ||
    (statusFilters.size > 0 && statusFilters.size < ALL_STATUSES.length) ||
    priorityFilter !== null;

  return {
    searchQuery,
    statusFilters,
    priorityFilter,
    setSearchQuery,
    toggleStatusFilter,
    setPriorityFilter,
    clearFilters,
    filteredTasks,
    tasksByColumn,
    hasActiveFilters,
  };
}
