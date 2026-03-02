/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks-page.tsx
 * @role Main tasks page with GitHub Projects style Kanban board
 * @why Provide intuitive task management matching GitHub UX
 * @related app.tsx, kanban-task-card.tsx, task-detail-panel.tsx
 * @public_api TasksPage
 * @invariants Data is fetched from API and cached locally
 * @side_effects Fetches from /api/tasks, creates/updates/deletes tasks via API
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview GitHub Projects style Kanban board
 * @what_it_does Displays tasks in columns by status, supports drag-and-drop, inline add
 * @why_it_exists Familiar UX for GitHub users
 * @scope(in) User interactions, drag-and-drop events
 * @scope(out) API calls, rendered Kanban board
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import { Plus, RefreshCw, Search, X, Trash2, Filter, ChevronDown, Check } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { KanbanTaskCard, type Task, type TaskStatus, type TaskPriority } from "./kanban-task-card";
import { TaskDetailPanel } from "./task-detail-panel";
import { useRuntimeStatus } from "../hooks/useRuntimeStatus";
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  LoadingState,
  ErrorBanner,
  TYPOGRAPHY,
  FORM_STYLES,
  PATTERNS,
  SPACING,
} from "./layout";

interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  failed: number;
  overdue: number;
}

const API_BASE = "";

// UL Workflow Task interface (extends Task)
interface UlWorkflowTask extends Task {
  isUlWorkflow: true;
  phase: string;
  ownerInstanceId?: string;
}

// Column configuration - GitHub Projects style
interface ColumnConfig {
  id: TaskStatus;
  label: string;
  icon: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: "todo", label: "Todo", icon: "○" },
  { id: "in_progress", label: "In progress", icon: "◐" },
  { id: "completed", label: "Done", icon: "●" },
  { id: "cancelled", label: "Cancelled", icon: "⊘" },
  { id: "failed", label: "Failed", icon: "✕" },
];

// Priority order for sorting
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter state
  const [statusFilters, setStatusFilters] = useState<Set<TaskStatus>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [deleteConfirmSubtaskId, setDeleteConfirmSubtaskId] = useState<string | null>(null);
  
  // Runtime status for execution indicators
  const { sessions: runtimeSessions } = useRuntimeStatus();

  // Derive selectedTask from tasks array (always fresh after polling)
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [selectedTaskId, tasks]);

  // Inline add state per column
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const addInputRefs = useRef<Record<TaskStatus, HTMLTextAreaElement | null>>({} as Record<TaskStatus, HTMLTextAreaElement | null>);

  // Refs for keyboard handler (avoid re-registering event listener)
  const addingToColumnRef = useRef(addingToColumn);
  const selectedTaskIdRef = useRef(selectedTaskId);

  useEffect(() => {
    addingToColumnRef.current = addingToColumn;
  }, [addingToColumn]);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  // URL query parameter sync for filters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Read status filters from URL
    const statusParam = params.get("status");
    if (statusParam) {
      const statuses = statusParam.split(",") as TaskStatus[];
      setStatusFilters(new Set(statuses.filter(s => ["todo", "in_progress", "completed", "cancelled", "failed"].includes(s))));
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
    
    if (statusFilters.size > 0 && statusFilters.size < COLUMNS.length) {
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

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const [regularRes, ulRes] = await Promise.all([
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/ul-workflow/tasks`),
      ]);
      
      const regularData = regularRes.ok ? await regularRes.json() : { data: [] };
      const ulData = ulRes.ok ? await ulRes.json() : { data: [] };
      
      const mergedTasks: Task[] = [
        ...(regularData.data || []),
        ...(ulData.data || []),
      ];
      setTasks(mergedTasks);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tasks";
      setError(message);
      console.error("Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }, []);

  // Initial load + polling (silently refresh on poll to avoid flicker)
  useEffect(() => {
    let isInitialLoad = true;

    const fetchAllTasks = async () => {
      // Only show loading spinner on initial load, not on polls
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      try {
        const [regularRes, ulRes] = await Promise.all([
          fetch(`${API_BASE}/api/tasks`),
          fetch(`${API_BASE}/api/ul-workflow/tasks`),
        ]);

        const regularData = regularRes.ok ? await regularRes.json() : { data: [] };
        const ulData = ulRes.ok ? await ulRes.json() : { data: [] };

        const mergedTasks: Task[] = [
          ...(regularData.data || []),
          ...(ulData.data || []),
        ];
        setTasks(mergedTasks);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to fetch tasks";
        setError(message);
        console.error("Failed to fetch tasks:", e);
      } finally {
        if (isInitialLoad) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    };

    fetchAllTasks();
    fetchStats();
    const interval = setInterval(fetchAllTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

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
    if (statusFilters.size > 0 && statusFilters.size < COLUMNS.length) {
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

  // Create task inline
  const handleInlineAdd = async (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          status,
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create task");
      }

      setNewTaskTitle("");
      setAddingToColumn(null);
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  };

  // Update task status (drag and drop)
  const handleStatusChange = async (taskId: string, newStatus: TaskStatus): Promise<boolean> => {
    // Check if moving parent task to "completed" - all subtasks must be completed first
    if (newStatus === "completed") {
      const task = tasks.find((t) => t.id === taskId);
      const subtasks = tasks.filter((t) => t.parentTaskId === taskId);
      const incompleteSubtasks = subtasks.filter((t) => t.status !== "completed");

      if (incompleteSubtasks.length > 0) {
        setError(
          `Cannot complete this task: ${incompleteSubtasks.length} subtask(s) are not done yet.`
        );
        return false;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
      return false;
    }
  };

  // Request delete confirmation
  const handleDeleteRequest = (id: string) => {
    setDeleteConfirmTaskId(id);
  };

  // Confirm and execute delete
  const handleDelete = async (id: string) => {
    setDeleteConfirmTaskId(null);
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete task");
      }

      if (selectedTaskId === id) {
        setSelectedTaskId(null);
      }
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  };

  // Request subtask delete confirmation
  const handleDeleteSubtaskRequest = (subtaskId: string) => {
    setDeleteConfirmSubtaskId(subtaskId);
  };

  // Confirm and execute subtask delete
  const handleDeleteSubtask = async (subtaskId: string) => {
    setDeleteConfirmSubtaskId(null);
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${subtaskId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete subtask");
      }

      // fetchTasks() updates tasks array, selectedTask is auto-updated via useMemo
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete subtask");
    }
  };

  // Create subtask
  const handleCreateSubtask = async (parentId: string, title: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          parentTaskId: parentId,
          status: "todo",
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create subtask");
      }

      // fetchTasks() updates tasks array, selectedTask is auto-updated via useMemo
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create subtask");
    }
  };

  // Update subtask
  const handleUpdateSubtask = async (subtask: Task) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${subtask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subtask.title,
          status: subtask.status,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update subtask");
      }

      // fetchTasks() updates tasks array, selectedTask is auto-updated via useMemo
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update subtask");
    }
  };

  // Update task
  const handleUpdateTask = async (updatedTask: Task) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${updatedTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updatedTask.title,
          description: updatedTask.description,
          status: updatedTask.status,
          priority: updatedTask.priority,
          tags: updatedTask.tags,
          dueDate: updatedTask.dueDate,
          assignee: updatedTask.assignee,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  };

  // Drag handlers
  const handleDragStart = (e: DragEvent, task: Task) => {
    setDraggedTask(task);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    }
  };

  const handleDragOver = (e: DragEvent, columnId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: DragEvent, columnId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedTask && draggedTask.status !== columnId) {
      handleStatusChange(draggedTask.id, columnId);
    }
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  // Focus input when adding to column
  useEffect(() => {
    if (addingToColumn && addInputRefs.current[addingToColumn]) {
      addInputRefs.current[addingToColumn]?.focus();
    }
  }, [addingToColumn]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    COMMON_SHORTCUTS.escape(() => {
      // Close dropdowns first
      if (showStatusDropdown || showPriorityDropdown) {
        setShowStatusDropdown(false);
        setShowPriorityDropdown(false);
        return;
      }
      // Close add form
      if (addingToColumnRef.current) {
        setAddingToColumn(null);
        setNewTaskTitle("");
        return;
      }
      // Close detail panel
      if (selectedTaskIdRef.current) {
        setSelectedTaskId(null);
        return;
      }
    }),
    COMMON_SHORTCUTS.newTask(() => {
      // Open add form in first column (todo)
      if (!addingToColumnRef.current && !selectedTaskIdRef.current) {
        setAddingToColumn("todo");
      }
    }),
  ]);

  // Render column
  const renderColumn = (column: ColumnConfig) => {
    const columnTasks = tasksByColumn[column.id];
    const isDropTarget = dragOverColumn === column.id;
    const isAdding = addingToColumn === column.id;

    return (
      <div
        key={column.id}
        class={cn(
          "flex flex-col w-[280px] shrink-0 bg-muted/30 rounded-md transition-all duration-150",
          isDropTarget && "ring-2 ring-primary/50 bg-accent/10"
        )}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
      >
        {/* Column header */}
        <div class={cn("flex items-center justify-between px-3 py-2", PATTERNS.divider)}>
          <div class={cn("flex items-center", SPACING.element)}>
            <span class={TYPOGRAPHY.body}>{column.icon}</span>
            <span class={TYPOGRAPHY.labelLarge}>{column.label}</span>
            <span class={cn(PATTERNS.badge, "bg-muted")}>
              {columnTasks.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 opacity-0 hover:opacity-100 data-[show]:opacity-100"
            data-show={isAdding ? "" : undefined}
            onClick={() => setAddingToColumn(column.id)}
            title="Add task"
          >
            <Plus class="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Task cards */}
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          {columnTasks.map((task) => {
            // Check if this is a subtask
            const isSubtask = !!task.parentTaskId;
            // Calculate subtask progress (only for parent tasks)
            const taskSubtasks = isSubtask ? [] : tasks.filter((t) => t.parentTaskId === task.id);
            const subtaskProgress = taskSubtasks.length > 0 ? {
              completed: taskSubtasks.filter((t) => t.status === "completed").length,
              total: taskSubtasks.length,
            } : null;
            // Find runtime session for this task
            const taskSession = runtimeSessions.find((s) => s.taskId === task.id);

            const card = (
              <KanbanTaskCard
                key={task.id}
                task={task}
                subtaskProgress={subtaskProgress}
                isSubtask={isSubtask}
                session={taskSession}
                onClick={() => setSelectedTaskId(task.id)}
                onDragStart={(e) => handleDragStart(e, task)}
                onDragEnd={handleDragEnd}
                onDelete={() => handleDeleteRequest(task.id)}
                isDragging={draggedTask?.id === task.id}
                isSelected={selectedTask?.id === task.id}
              />
            );

            // Indent subtasks slightly
            if (isSubtask) {
              return <div key={task.id} class="ml-3">{card}</div>;
            }
            return card;
          })}
        </div>

        {/* Add task form at bottom - GitHub style */}
        {isAdding ? (
          <div class="p-2 border-t border-border/50">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInlineAdd(column.id);
              }}
              class="space-y-2"
            >
              <textarea
                ref={(el) => {
                  if (el) addInputRefs.current[column.id] = el as unknown as HTMLTextAreaElement;
                }}
                value={newTaskTitle}
                onInput={(e) => setNewTaskTitle((e.target as HTMLTextAreaElement).value)}
                placeholder="Add a task... (⌘+Enter to add)"
                rows={2}
                class={cn(
                  "w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                )}
                onKeyDown={(e) => {
                  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleInlineAdd(column.id);
                  }
                }}
              />
              <div class="flex items-center gap-2">
                <Button type="submit" size="sm" class="h-7 text-xs" disabled={!newTaskTitle.trim()}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs"
                  onClick={() => {
                    setAddingToColumn(null);
                    setNewTaskTitle("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <button
            class="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-b-md"
            onClick={() => setAddingToColumn(column.id)}
          >
            <Plus class="h-3.5 w-3.5" />
            <span>Add item</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <PageLayout variant="board">
      {/* Main board area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div class="shrink-0 flex items-center justify-between p-4 border-b border-border bg-background">
          <div class="flex items-center gap-4">
            <h1 class="text-lg font-semibold">Tasks</h1>
            {stats && (
              <span class="text-sm text-muted-foreground">
                {stats.total} tasks
                {stats.overdue > 0 && (
                  <span class="text-red-500 ml-1">({stats.overdue} overdue)</span>
                )}
              </span>
            )}
          </div>
          <div class="flex items-center gap-2">
            {/* Active filter chips */}
            {(statusFilters.size > 0 || priorityFilter) && (
              <div class="flex items-center gap-1">
                {Array.from(statusFilters).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      const newFilters = new Set(statusFilters);
                      newFilters.delete(status);
                      setStatusFilters(newFilters);
                    }}
                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {COLUMNS.find(c => c.id === status)?.label || status}
                    <X class="h-3 w-3" />
                  </button>
                ))}
                {priorityFilter && (
                  <button
                    onClick={() => setPriorityFilter(null)}
                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {priorityFilter}
                    <X class="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setStatusFilters(new Set());
                    setPriorityFilter(null);
                  }}
                  class="text-xs text-muted-foreground hover:text-foreground ml-1"
                >
                  クリア
                </button>
              </div>
            )}
            
            {/* Status filter dropdown */}
            <div class="relative">
              <Button
                variant="outline"
                size="sm"
                class="h-8 gap-1"
                onClick={() => {
                  setShowStatusDropdown(!showStatusDropdown);
                  setShowPriorityDropdown(false);
                }}
              >
                <Filter class="h-3.5 w-3.5" />
                <span class="text-xs">ステータス</span>
                <ChevronDown class="h-3 w-3" />
              </Button>
              {showStatusDropdown && (
                <div class="absolute top-full right-0 mt-1 w-40 bg-card border border-border rounded-md shadow-lg z-50 py-1">
                  {COLUMNS.map((column) => {
                    const isSelected = statusFilters.has(column.id);
                    return (
                      <button
                        key={column.id}
                        onClick={() => {
                          const newFilters = new Set(statusFilters);
                          if (isSelected) {
                            newFilters.delete(column.id);
                          } else {
                            newFilters.add(column.id);
                          }
                          setStatusFilters(newFilters);
                        }}
                        class={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                          isSelected && "bg-muted/30"
                        )}
                      >
                        <span class="w-4 h-4 flex items-center justify-center">
                          {isSelected && <Check class="h-3 w-3" />}
                        </span>
                        <span>{column.icon}</span>
                        <span>{column.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Priority filter dropdown */}
            <div class="relative">
              <Button
                variant="outline"
                size="sm"
                class="h-8 gap-1"
                onClick={() => {
                  setShowPriorityDropdown(!showPriorityDropdown);
                  setShowStatusDropdown(false);
                }}
              >
                <Filter class="h-3.5 w-3.5" />
                <span class="text-xs">優先度</span>
                <ChevronDown class="h-3 w-3" />
              </Button>
              {showPriorityDropdown && (
                <div class="absolute top-full right-0 mt-1 w-32 bg-card border border-border rounded-md shadow-lg z-50 py-1">
                  {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((priority) => {
                    const isSelected = priorityFilter === priority;
                    const labels: Record<TaskPriority, string> = {
                      urgent: "緊急",
                      high: "高",
                      medium: "中",
                      low: "低",
                    };
                    return (
                      <button
                        key={priority}
                        onClick={() => {
                          setPriorityFilter(isSelected ? null : priority);
                          setShowPriorityDropdown(false);
                        }}
                        class={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                          isSelected && "bg-muted/30"
                        )}
                      >
                        <span class="w-4 h-4 flex items-center justify-center">
                          {isSelected && <Check class="h-3 w-3" />}
                        </span>
                        <span>{labels[priority]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Search */}
            <div class="relative">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                placeholder="Search tasks..."
                class="h-8 w-48 pl-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchTasks(); fetchStats(); }}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw class={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Click outside to close dropdowns */}
        {(showStatusDropdown || showPriorityDropdown) && (
          <div 
            class="fixed inset-0 z-40" 
            onClick={() => {
              setShowStatusDropdown(false);
              setShowPriorityDropdown(false);
            }}
          />
        )}

        {/* Error banner */}
        {error && (
          <div class="shrink-0 mx-4 mt-4">
            <ErrorBanner
              message={error}
              onDismiss={() => setError(null)}
              showCard={false}
            />
          </div>
        )}

        {/* Kanban board */}
        {loading ? (
          <div class="flex-1 flex items-center justify-center">
            <LoadingState message="Loading..." showCard={false} />
          </div>
        ) : (
          <div class="flex-1 overflow-x-auto p-4">
            <div class="flex gap-4 h-full min-w-max">
              {COLUMNS.map(renderColumn)}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel - GitHub style side panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={(updated) => {
            handleUpdateTask(updated);
            // selectedTask auto-updates via useMemo when tasks changes
          }}
          onDelete={() => handleDeleteRequest(selectedTask.id)}
          onStatusChange={async (status) => {
            await handleStatusChange(selectedTask.id, status);
            // selectedTask auto-updates via useMemo when tasks changes
          }}
          onCreateSubtask={handleCreateSubtask}
          onUpdateSubtask={(subtask) => {
            handleUpdateSubtask(subtask);
            // selectedTask auto-updates via useMemo when tasks changes
          }}
          onDeleteSubtask={handleDeleteSubtaskRequest}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmTaskId && (
        <AlertDialogContent
          size="sm"
          open={!!deleteConfirmTaskId}
          onOpenChange={(open) => !open && setDeleteConfirmTaskId(null)}
        >
          <AlertDialogHeader>
            <div class="flex items-center gap-3 mb-2">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 class="h-5 w-5" />
              </div>
              <AlertDialogTitle>タスクを削除しますか？</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              この操作は取り消せません。タスクとすべてのサブタスクが完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmTaskId(null)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => handleDelete(deleteConfirmTaskId)}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}

      {/* Subtask delete confirmation dialog */}
      {deleteConfirmSubtaskId && (
        <AlertDialogContent
          size="sm"
          open={!!deleteConfirmSubtaskId}
          onOpenChange={(open) => !open && setDeleteConfirmSubtaskId(null)}
        >
          <AlertDialogHeader>
            <div class="flex items-center gap-3 mb-2">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 class="h-5 w-5" />
              </div>
              <AlertDialogTitle>サブタスクを削除しますか？</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              この操作は取り消せません。サブタスクが完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmSubtaskId(null)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => handleDeleteSubtask(deleteConfirmSubtaskId)}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </PageLayout>
  );
}
