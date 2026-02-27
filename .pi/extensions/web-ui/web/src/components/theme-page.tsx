/**
 * @abdd.meta
 * path: .pi/extensions/web-ui/web/src/components/theme-page.tsx
 * role: テーマ選択画面を表示し選択イベントを発火する。
 * why: ユーザーがテーマを探索し変更できるUIを提供するため。
 * related: .pi/extensions/web-ui/web/src/theme/registry.ts, .pi/extensions/web-ui/web/src/theme/runtime.ts, .pi/extensions/web-ui/web/src/app.tsx
 * public_api: ThemePage, Mode, THEMES, applyThemeToDOM
 * invariants: 表示対象テーマはTHEMESに存在する。
 * side_effects: テーマ変更時にDOMとlocalStorageを更新する。
 * failure_modes: /api/theme失敗時はlocalStorageにフォールバックする。
 *
 * @abdd.explain
 * overview: テーマ一覧の検索・選択・プレビューを提供する画面。
 * what_it_does: APIからテーマ設定を読み込み、テーマ変更を反映する。
 * why_it_exists: Web UIで一貫した配色設定体験を提供するため。
 * scope(in/out): in=テーマ設定と操作, out=サーバ保存の実装
 */

import { useState, useEffect, useMemo } from "preact/hooks";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { cn } from "@/lib/utils";
import { THEMES } from "@/theme/registry";
import { applyThemeToDOM } from "@/theme/runtime";
import type { Mode, Theme } from "@/theme/types";

export { THEMES } from "@/theme/registry";
export { applyThemeToDOM } from "@/theme/runtime";
export type { Mode } from "@/theme/types";

interface FilterState {
  search: string;
  category: "all" | "dark" | "light";
  sortBy: "name" | "popularity";
}

interface ThemePageProps {
  onThemeChange?: (themeId: string, mode: Mode) => void;
}

// ============= MAIN COMPONENT =============

/**
 * @summary テーマ画面を表示
 * @param onThemeChange テーマ変更時の通知関数
 * @returns テーマ設定画面
 */
export function ThemePage({ onThemeChange }: ThemePageProps) {
  // Initialize state from server (global) or localStorage (fallback)
  const [selectedId, setSelectedId] = useState<string>("blue");
  const [mode, setMode] = useState<Mode>("dark");
  const [loaded, setLoaded] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    search: "",
    category: "all",
    sortBy: "popularity",
  });

  // Load theme from server on mount
  useEffect(() => {
    fetch("/api/theme")
      .then((res) => res.json())
      .then((data) => {
        if (data.themeId && data.mode) {
          setSelectedId(data.themeId);
          setMode(data.mode);
          applyThemeToDOM(data.themeId, data.mode);
        }
        setLoaded(true);
      })
      .catch(() => {
        // Fallback to localStorage
        const savedId = localStorage.getItem("pi-theme-id") || "blue";
        const savedMode = (localStorage.getItem("pi-theme-mode") as Mode) || "dark";
        setSelectedId(savedId);
        setMode(savedMode);
        setLoaded(true);
      });
  }, []);

  const selectedTheme = useMemo<Theme | undefined>(() => THEMES[selectedId], [selectedId]);

  // Filter themes
  const filteredThemes = useMemo(() => {
    return Object.entries(THEMES)
      .filter(([id, theme]) => {
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const matchesName = theme.meta.name.toLowerCase().includes(searchLower);
          const matchesAuthor = theme.meta.author.toLowerCase().includes(searchLower);
          const matchesTags = theme.meta.tags.some((t) => t.includes(searchLower));
          if (!matchesName && !matchesAuthor && !matchesTags) return false;
        }

        if (filters.category !== "all") {
          const hasMode = theme[filters.category] !== undefined;
          if (!hasMode) return false;
        }

        return true;
      })
      .sort(([, a], [, b]) => {
        if (filters.sortBy === "popularity") {
          return b.meta.popularity - a.meta.popularity;
        }
        return a.meta.name.localeCompare(b.meta.name);
      });
  }, [filters]);

  const handleThemeChange = (id: string) => {
    const theme = THEMES[id];
    if (!theme) return;

    let targetMode = mode;
    if (!theme[mode]) {
      targetMode = theme.dark ? "dark" : "light";
      setMode(targetMode);
    }

    setSelectedId(id);
    applyThemeToDOM(id, targetMode);
    onThemeChange?.(id, targetMode);

    // Also save to localStorage as backup
    localStorage.setItem("pi-theme-id", id);
    localStorage.setItem("pi-theme-mode", targetMode);
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    applyThemeToDOM(selectedId, newMode);
    onThemeChange?.(selectedId, newMode);
    localStorage.setItem("pi-theme-mode", newMode);
  };

  if (!loaded) {
    return (
      <div class="flex h-full items-center justify-center">
        <p class="text-sm text-muted-foreground">Loading theme...</p>
      </div>
    );
  }

  return (
    <div class="flex h-full gap-6 p-4">
      {/* Left Panel: Filters + Theme List */}
      <div class="w-80 shrink-0 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search themes..."
          value={filters.search}
          onInput={(e) =>
            setFilters({ ...filters, search: e.currentTarget.value })
          }
          class="w-full rounded-lg border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Category & Sort Filters */}
        <div class="flex gap-2">
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({
                ...filters,
                category: e.currentTarget.value as "all" | "dark" | "light",
              })
            }
            class="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters({
                ...filters,
                sortBy: e.currentTarget.value as "name" | "popularity",
              })
            }
            class="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="popularity">Popular</option>
            <option value="name">Name</option>
          </select>
        </div>

        {/* Theme List - Scrollable */}
        <div class="scrollbar-hide max-h-[calc(100vh-140px)] space-y-2 overflow-y-auto pr-2">
          {filteredThemes.map(([id, theme]) => {
            const colors = theme[mode] || theme.dark || theme.light;
            if (!colors) return null;

            return (
              <button
                key={id}
                class={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  "hover:bg-accent",
                  selectedId === id && "border-primary bg-accent"
                )}
                onClick={() => handleThemeChange(id)}
              >
                <div
                  class="h-10 w-10 shrink-0 rounded-lg"
                  style={{ backgroundColor: `hsl(${colors["--primary"]})` }}
                />
                <div class="min-w-0 flex-1">
                  <h3 class="truncate font-medium text-sm">{theme.meta.name}</h3>
                  <p class="truncate text-xs text-muted-foreground">{theme.meta.author}</p>
                </div>
                {selectedId === id && (
                  <svg class="h-4 w-4 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Panel: Preview */}
      <div class="sticky top-4 flex-1 space-y-4 overflow-y-auto">
        {/* Selected Theme Info */}
        {selectedTheme && (
          <Card>
            <CardHeader class="pb-3">
              <div class="flex items-start justify-between">
                <div>
                  <CardTitle>{selectedTheme.meta.name}</CardTitle>
                  <CardDescription>by {selectedTheme.meta.author}</CardDescription>
                </div>
                {(selectedTheme.light || selectedTheme.dark) && (
                  <div class="flex gap-2">
                    {selectedTheme.light && (
                      <Button
                        variant={mode === "light" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleModeChange("light")}
                      >
                        Light
                      </Button>
                    )}
                    {selectedTheme.dark && (
                      <Button
                        variant={mode === "dark" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleModeChange("dark")}
                      >
                        Dark
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div class="flex flex-wrap gap-1">
                {selectedTheme.meta.tags.map((tag) => (
                  <span key={tag} class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Cards */}
        <div class="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description goes here</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                This is the card content area where you can place any information.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
              <CardDescription>Your metrics overview</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">Total</span>
                <span class="text-2xl font-bold">1,234</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">Success</span>
                <span class="text-sm font-medium text-green-500">98.5%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Buttons Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </CardContent>
        </Card>

        {/* Colors Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Color Palette</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div class="mb-2 h-12 w-full rounded-md border bg-background" />
                <span class="text-xs text-muted-foreground">Background</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-foreground" />
                <span class="text-xs text-muted-foreground">Foreground</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-primary" />
                <span class="text-xs text-muted-foreground">Primary</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-secondary" />
                <span class="text-xs text-muted-foreground">Secondary</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-muted" />
                <span class="text-xs text-muted-foreground">Muted</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-accent" />
                <span class="text-xs text-muted-foreground">Accent</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md bg-destructive" />
                <span class="text-xs text-muted-foreground">Destructive</span>
              </div>
              <div>
                <div class="mb-2 h-12 w-full rounded-md border bg-border" />
                <span class="text-xs text-muted-foreground">Border</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
