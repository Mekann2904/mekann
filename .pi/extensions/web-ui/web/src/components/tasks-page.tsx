/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks-page.tsx
 * @role Main tasks page with GitHub Projects style Kanban board
 * @why Provide intuitive task management matching GitHub UX
 * @related app.tsx, kanban-task-card.tsx, task-detail-panel.tsx, useTaskData.ts, useTaskFilters.ts, TaskKanban.tsx
 * @public_api TasksPage
 * @invariants Data is fetched from API and cached locally
 * @side_effects Fetches from /api/tasks, creates/updates/deletes tasks via API
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview GitHub Projects style Kanban board (refactored)
 * @what_it_does Displays tasks in columns by status, supports drag-and-drop, inline add
 * @why_it_exists Familiar UX for GitHub users, uses extracted hooks and components
 * @scope(in) User interactions, drag-and-drop events
 * @scope(out) API calls, rendered Kanban board
 */

import { useState, useMemo, useEffect } from "preact/hooks";
import { Search, X, Trash2, Filter, ChevronDown, Check } from "lucide-preact";
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
import type { Task, TaskStatus, TaskPriority } from "./kanban-task-card";
import { TaskDetailPanel } from "./task-detail-panel";
import { TaskKanban, DEFAULT_COLUMNS } from "./tasks/TaskKanban";
import { useRuntimeStatus } from "../hooks/useRuntimeStatus";
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { useTaskDataNew as useTaskData } from "../hooks/useTaskDataNew";
import { useTaskFilters } from "../hooks/useTaskFilters";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  SkeletonBoard,
  ErrorBanner,
} from "./layout";

export function TasksPage() {
  // Use extracted hooks
  const {
    tasks,
    stats,
    loading,
    error,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    clearError,
  } = useTaskData();

  const {
    searchQuery,
    statusFilters,
    priorityFilter,
    setSearchQuery,
    toggleStatusFilter,
    setPriorityFilter,
    tasksByColumn,
  } = useTaskFilters(tasks);

  // UI state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [deleteConfirmSubtaskId, setDeleteConfirmSubtaskId] = useState<string | null>(null);

  // Runtime status for execution indicators
  const { sessions: runtimeSessions } = useRuntimeStatus();

  // Derive selectedTask from tasks array (always fresh after polling)
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const taskId = new URLSearchParams(window.location.search).get("taskId");
    if (!taskId) {
      return;
    }

    setSelectedTaskId(taskId);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    COMMON_SHORTCUTS.escape(() => {
      // Close dropdowns first
      if (showStatusDropdown || showPriorityDropdown) {
        setShowStatusDropdown(false);
        setShowPriorityDropdown(false);
        return;
      }
      // Close detail panel
      if (selectedTaskId) {
        setSelectedTaskId(null);
        return;
      }
    }),
  ]);

  // Handlers
  const handleAddTask = async (title: string, status: TaskStatus): Promise<boolean> => {
    return createTask(title, status, "medium");
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus): Promise<boolean> => {
    return updateTaskStatus(taskId, newStatus);
  };

  const handleDelete = async (taskId: string) => {
    const success = await deleteTask(taskId);
    if (success && selectedTaskId === taskId) {
      setSelectedTaskId(null);
    }
    setDeleteConfirmTaskId(null);
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    await deleteSubtask(subtaskId);
    setDeleteConfirmSubtaskId(null);
  };

  const handleUpdateTask = async (updatedTask: Task) => {
    await updateTask(updatedTask);
  };

  const handleCreateSubtask = async (parentId: string, title: string) => {
    await createSubtask(parentId, title);
  };

  const handleUpdateSubtask = async (subtask: Task) => {
    await updateSubtask(subtask);
  };

  return (
    <PageLayout variant="board">
      {/* Main board area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div class="shrink-0 flex items-center justify-between p-4 border-b border-border bg-background">
          <div class="flex items-center gap-4">
            <h1 class="text-lg font-semibold">Tickets</h1>
            {stats && (
              <span class="text-sm text-muted-foreground">
                {stats.total} tickets
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
                    onClick={() => toggleStatusFilter(status)}
                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {DEFAULT_COLUMNS.find(c => c.id === status)?.label || status}
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
                    statusFilters.forEach(s => toggleStatusFilter(s));
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
                  {DEFAULT_COLUMNS.map((column) => {
                    const isSelected = statusFilters.has(column.id);
                    return (
                      <button
                        key={column.id}
                        onClick={() => toggleStatusFilter(column.id)}
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
                placeholder="Search tickets..."
                class="h-8 w-48 pl-8 text-sm"
              />
            </div>
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
              onRetry={() => clearError()}
              onDismiss={() => clearError()}
              showCard={false}
            />
          </div>
        )}

        {/* Kanban board */}
        {loading ? (
          <div class="flex-1 p-4">
            <SkeletonBoard columns={3} />
          </div>
        ) : (
          <div class="flex-1 overflow-x-auto p-4">
            <TaskKanban
              tasks={tasks}
              tasksByColumn={tasksByColumn}
              columns={DEFAULT_COLUMNS}
              selectedTaskId={selectedTaskId}
              runtimeSessions={runtimeSessions}
              onTaskClick={setSelectedTaskId}
              onTaskDelete={setDeleteConfirmTaskId}
              onStatusChange={handleStatusChange}
              onAddTask={handleAddTask}
            />
          </div>
        )}
      </div>

      {/* Detail panel - GitHub style side panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
          onDelete={() => setDeleteConfirmTaskId(selectedTask.id)}
          onStatusChange={async (status) => {
            await handleStatusChange(selectedTask.id, status);
          }}
          onCreateSubtask={handleCreateSubtask}
          onUpdateSubtask={handleUpdateSubtask}
          onDeleteSubtask={setDeleteConfirmSubtaskId}
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
              <AlertDialogTitle>チケットを削除しますか？</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              この操作は取り消せません。チケットとすべてのサブチケットが完全に削除されます。
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
              <AlertDialogTitle>サブチケットを削除しますか？</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              この操作は取り消せません。サブチケットが完全に削除されます。
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
