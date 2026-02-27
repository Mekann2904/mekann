/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/task-form.tsx
 * @role Form for creating and editing tasks
 * @why Provide UI for task input with validation
 * @related tasks-page.tsx, task-card.tsx
 * @public_api TaskForm
 * @invariants Form validates before submit
 * @side_effects Calls onSubmit callback with form data
 * @failure_modes Validation errors
 *
 * @abdd.explain
 * @overview Form component for task CRUD operations
 * @what_it_does Renders form fields for task properties, handles validation
 * @why_it_exists Reusable form for create/edit operations
 * @scope(in) Initial task data (for edit), submit callback
 * @scope(out) Form submission events
 */

import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { X, Plus } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "./task-card";

interface TaskFormData {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate?: string;
  assignee?: string;
  parentTaskId?: string;
}

interface TaskFormProps {
  initialData?: Task | null;
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled"];
const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "urgent"];

const EMPTY_FORM: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  tags: [],
  dueDate: "",
  assignee: "",
  parentTaskId: "",
};

export function TaskForm({ initialData, onSubmit, onCancel, isOpen }: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        description: initialData.description || "",
        status: initialData.status,
        priority: initialData.priority,
        tags: initialData.tags,
        dueDate: initialData.dueDate || "",
        assignee: initialData.assignee || "",
        parentTaskId: initialData.parentTaskId || "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
    setTagInput("");
  }, [initialData, isOpen]);

  const updateField = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !formData.tags.includes(trimmed)) {
      updateField("tags", [...formData.tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    updateField(
      "tags",
      formData.tags.filter((t) => t !== tag)
    );
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    }

    if (formData.dueDate && Number.isNaN(new Date(formData.dueDate).getTime())) {
      newErrors.dueDate = "Invalid date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!validate()) return;

    const submitData: TaskFormData = {
      ...formData,
      description: formData.description || undefined,
      dueDate: formData.dueDate || undefined,
      assignee: formData.assignee || undefined,
      parentTaskId: formData.parentTaskId || undefined,
    };

    onSubmit(submitData);
  };

  if (!isOpen) return null;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card class="w-full max-w-lg max-h-[90vh] overflow-auto">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle class="text-lg">
            {initialData ? "Edit Task" : "New Task"}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X class="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} class="space-y-4">
            {/* Title */}
            <div class="space-y-1.5">
              <label class="text-sm font-medium">
                Title <span class="text-destructive">*</span>
              </label>
              <Input
                type="text"
                value={formData.title}
                onInput={(e) => updateField("title", (e.target as HTMLInputElement).value)}
                placeholder="Task title..."
                class={cn(errors.title && "border-destructive")}
              />
              {errors.title && (
                <p class="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Description</label>
              <textarea
                value={formData.description}
                onInput={(e) => updateField("description", (e.target as HTMLTextAreaElement).value)}
                placeholder="Task description..."
                rows={3}
                class={cn(
                  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                )}
              />
            </div>

            {/* Status and Priority */}
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => updateField("status", (e.target as HTMLSelectElement).value as TaskStatus)}
                  class={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div class="space-y-1.5">
                <label class="text-sm font-medium">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => updateField("priority", (e.target as HTMLSelectElement).value as TaskPriority)}
                  class={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due Date and Assignee */}
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Due Date</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onInput={(e) => updateField("dueDate", (e.target as HTMLInputElement).value)}
                  class={cn(errors.dueDate && "border-destructive")}
                />
                {errors.dueDate && (
                  <p class="text-xs text-destructive">{errors.dueDate}</p>
                )}
              </div>

              <div class="space-y-1.5">
                <label class="text-sm font-medium">Assignee</label>
                <Input
                  type="text"
                  value={formData.assignee}
                  onInput={(e) => updateField("assignee", (e.target as HTMLInputElement).value)}
                  placeholder="Name..."
                />
              </div>
            </div>

            {/* Tags */}
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Tags</label>
              <div class="flex gap-2">
                <Input
                  type="text"
                  value={tagInput}
                  onInput={(e) => setTagInput((e.target as HTMLInputElement).value)}
                  placeholder="Add tag..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  class="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={addTag}>
                  <Plus class="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div class="flex flex-wrap gap-1.5 mt-2">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      class="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        class="hover:text-destructive"
                      >
                        <X class="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div class="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">
                {initialData ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export type { TaskFormData };
