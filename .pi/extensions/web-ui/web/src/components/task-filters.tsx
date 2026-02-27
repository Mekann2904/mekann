/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/task-filters.tsx
 * @role Filter controls for task list
 * @why Allow users to filter tasks by status, priority, tag, and assignee
 * @related tasks-page.tsx, task-card.tsx
 * @public_api TaskFilters
 * @invariants Filter values are controlled by parent
 * @side_effects Calls onFilterChange callback
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Filter bar for task list
 * @what_it_does Provides dropdown/button filters for status, priority, search
 * @why_it_exists Enables quick task filtering
 * @scope(in) Current filter values, available tags/assignees
 * @scope(out) Filter change events
 */

import { h } from "preact";
import { Search, X, Filter } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "./task-card";

export interface TaskFilterState {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  assignee?: string;
  search?: string;
  overdue?: boolean;
}

interface TaskFiltersProps {
  filters: TaskFilterState;
  onFilterChange: (filters: TaskFilterState) => void;
  availableTags: string[];
  availableAssignees: string[];
}

const STATUS_OPTIONS: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: { value: TaskPriority | ""; label: string }[] = [
  { value: "", label: "All Priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function TaskFilters({
  filters,
  onFilterChange,
  availableTags,
  availableAssignees,
}: TaskFiltersProps) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== "");

  const updateFilter = <K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) => {
    onFilterChange({ ...filters, [key]: value || undefined });
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  return (
    <div class="space-y-3">
      {/* Search and clear */}
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tasks..."
            value={filters.search || ""}
            onInput={(e) => updateFilter("search", (e.target as HTMLInputElement).value)}
            class="pl-9"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="icon" onClick={clearFilters} title="Clear filters">
            <X class="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filter buttons */}
      <div class="flex flex-wrap gap-2">
        {/* Status filter */}
        <select
          value={filters.status || ""}
          onChange={(e) => updateFilter("status", (e.target as HTMLSelectElement).value as TaskStatus)}
          class={cn(
            "h-9 rounded-md border border-input bg-background px-3 text-sm",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={filters.priority || ""}
          onChange={(e) => updateFilter("priority", (e.target as HTMLSelectElement).value as TaskPriority)}
          class={cn(
            "h-9 rounded-md border border-input bg-background px-3 text-sm",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Tag filter */}
        {availableTags.length > 0 && (
          <select
            value={filters.tag || ""}
            onChange={(e) => updateFilter("tag", (e.target as HTMLSelectElement).value)}
            class={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            <option value="">All Tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        {/* Assignee filter */}
        {availableAssignees.length > 0 && (
          <select
            value={filters.assignee || ""}
            onChange={(e) => updateFilter("assignee", (e.target as HTMLSelectElement).value)}
            class={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            <option value="">All Assignees</option>
            {availableAssignees.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        )}

        {/* Overdue toggle */}
        <Button
          variant={filters.overdue ? "default" : "outline"}
          size="sm"
          onClick={() => updateFilter("overdue", !filters.overdue)}
          class="flex items-center gap-1"
        >
          <Filter class="h-3.5 w-3.5" />
          Overdue
        </Button>
      </div>
    </div>
  );
}
