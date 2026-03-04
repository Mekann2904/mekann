/**
 * @path .pi/extensions/web-ui/web/src/components/indexes-page.tsx
 * @role インデックス管理ページ
 * @why LocAgent, RepoGraph, Semanticの3つのインデックスを管理・可視化するため
 * @related app.tsx, unified-server.ts
 * @public_api IndexesPage
 */

import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Switch } from "./ui/switch";
import {
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import {
  Database,
  RefreshCw,
  Loader2,
  Trash2,
  AlertCircle,
  Folder,
  GitBranch,
  Search,
} from "lucide-preact";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  StatsCard,
  StatsGrid,
  LoadingState,
  ErrorBanner,
  SPACING,
  CARD_STYLES,
} from "./layout";

// ============================================================================
// Types
// ============================================================================

interface IndexStatus {
  exists: boolean;
  nodeCount?: number;
  edgeCount?: number;
  fileCount?: number;
  entityCount?: number;
  indexedAt?: number;
  size?: number;
  error?: string;
}

interface IndexesResponse {
  locagent: IndexStatus;
  repograph: IndexStatus;
  semantic: IndexStatus;
}

interface BuildProgress {
  index: "locagent" | "repograph" | "semantic";
  status: "idle" | "building" | "success" | "error";
  message?: string;
}

type ConfirmAction = {
  type: "rebuild" | "delete";
  index: "locagent" | "repograph" | "semantic";
  force: boolean;
} | null;

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "未構築";
  const date = new Date(timestamp);
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const INDEX_CONFIG = {
  locagent: {
    title: "LocAgent",
    description: "要素レベル異種グラフでIssueやタスクから関連コードを特定",
    icon: GitBranch,
  },
  repograph: {
    title: "RepoGraph",
    description: "行レベル依存グラフで関数の呼び出し元を詳細に追跡",
    icon: Folder,
  },
  semantic: {
    title: "Semantic",
    description: "自然言語でコードを検索（OpenAI APIキーが必要）",
    icon: Search,
  },
} as const;

// ============================================================================
// Components
// ============================================================================

interface IndexCardProps {
  indexKey: "locagent" | "repograph" | "semantic";
  status: IndexStatus;
  progress: BuildProgress;
  onRebuild: (force: boolean) => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

function IndexCard({
  indexKey,
  status,
  progress,
  onRebuild,
  onDelete,
  onToggle,
}: IndexCardProps) {
  const config = INDEX_CONFIG[indexKey];
  const Icon = config.icon;
  const isBuilding = progress.index === indexKey && progress.status === "building";
  const isProgressForThis = progress.index === indexKey;
  const isEnabled = status.exists;

  return (
    <Card class={cn(CARD_STYLES.base, "flex flex-col transition-all")}>
      <CardHeader class="pb-3">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0">
            <div class={cn(
              "p-2 rounded-md shrink-0",
              isEnabled ? "bg-primary/10" : "bg-muted"
            )}>
              <Icon class={cn(
                "h-5 w-5",
                isEnabled ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div class="min-w-0">
              <CardTitle class="text-base">{config.title}</CardTitle>
              <CardDescription class="text-xs mt-1 line-clamp-2">
                {config.description}
              </CardDescription>
            </div>
          </div>
          {/* Toggle Switch */}
          <Switch
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={isBuilding}
            aria-label={`${config.title}を有効/無効`}
          />
        </div>
      </CardHeader>

      <CardContent class="flex-1 flex flex-col gap-4">
        {/* Stats Grid - Fixed layout */}
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="flex justify-between py-1 px-2 bg-muted/50 rounded">
            <span class="text-muted-foreground">ノード</span>
            <span class="font-mono font-medium">
              {status.nodeCount !== undefined ? status.nodeCount.toLocaleString() : "-"}
            </span>
          </div>
          <div class="flex justify-between py-1 px-2 bg-muted/50 rounded">
            <span class="text-muted-foreground">エッジ</span>
            <span class="font-mono font-medium">
              {status.edgeCount !== undefined ? status.edgeCount.toLocaleString() : "-"}
            </span>
          </div>
          <div class="flex justify-between py-1 px-2 bg-muted/50 rounded">
            <span class="text-muted-foreground">ファイル</span>
            <span class="font-mono font-medium">
              {status.fileCount !== undefined ? status.fileCount.toLocaleString() : "-"}
            </span>
          </div>
          <div class="flex justify-between py-1 px-2 bg-muted/50 rounded">
            <span class="text-muted-foreground">サイズ</span>
            <span class="font-mono font-medium">{formatSize(status.size)}</span>
          </div>
          <div class="flex justify-between py-1 px-2 bg-muted/50 rounded col-span-2">
            <span class="text-muted-foreground">最終更新</span>
            <span class="font-mono text-xs">{formatTimestamp(status.indexedAt)}</span>
          </div>
        </div>

        {/* Progress indicator */}
        {isProgressForThis && isBuilding && (
          <div class="flex items-center gap-2 p-2 bg-primary/5 rounded text-sm">
            <Loader2 class="h-4 w-4 animate-spin text-primary" />
            <span class="text-muted-foreground">{progress.message || "処理中..."}</span>
          </div>
        )}

        {/* Error message */}
        {status.error && (
          <div class="flex items-start gap-2 p-2 bg-destructive/10 rounded text-sm">
            <AlertCircle class="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span class="text-destructive">{status.error}</span>
          </div>
        )}

        {/* Spacer to push buttons to bottom */}
        <div class="flex-1" />

        {/* Action buttons - Fixed at bottom */}
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRebuild(false)}
            disabled={isBuilding || !isEnabled}
            class="flex-1"
          >
            {isBuilding ? (
              <Loader2 class="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <RefreshCw class="h-4 w-4 mr-1.5" />
            )}
            差分更新
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onRebuild(true)}
            disabled={isBuilding}
            class="flex-1"
          >
            {isBuilding ? (
              <Loader2 class="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Database class="h-4 w-4 mr-1.5" />
            )}
            再構築
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isBuilding || !isEnabled}
            title="削除"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function IndexesPage() {
  const [statuses, setStatuses] = useState<IndexesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress>({
    index: "locagent",
    status: "idle",
  });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/indexes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStatuses(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "インデックス状態の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  const executeRebuild = useCallback(async (
    index: "locagent" | "repograph" | "semantic",
    force: boolean
  ) => {
    setProgress({ index, status: "building", message: "構築中..." });

    try {
      const res = await fetch(`/api/v2/indexes/${index}/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setProgress({ index, status: "success", message: "完了" });
      await fetchStatuses();

      setTimeout(() => {
        setProgress({ index: "locagent", status: "idle" });
      }, 2000);
    } catch (e) {
      setProgress({
        index,
        status: "error",
        message: e instanceof Error ? e.message : "失敗",
      });
    }
  }, [fetchStatuses]);

  const executeDelete = useCallback(async (index: "locagent" | "repograph" | "semantic") => {
    try {
      const res = await fetch(`/api/v2/indexes/${index}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await fetchStatuses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "インデックスの削除に失敗しました");
    }
  }, [fetchStatuses]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;

    if (confirmAction.type === "rebuild") {
      await executeRebuild(confirmAction.index, confirmAction.force);
    } else if (confirmAction.type === "delete") {
      await executeDelete(confirmAction.index);
    }

    setConfirmAction(null);
  }, [confirmAction, executeRebuild, executeDelete]);

  const handleToggle = useCallback((index: "locagent" | "repograph" | "semantic", enabled: boolean) => {
    if (!enabled) {
      // 無効化 = 削除確認
      setConfirmAction({ type: "delete", index, force: false });
    } else {
      // 有効化 = 再構築確認
      setConfirmAction({ type: "rebuild", index, force: false });
    }
  }, []);

  const rebuildAll = useCallback(async (force: boolean) => {
    for (const index of ["locagent", "repograph", "semantic"] as const) {
      await executeRebuild(index, force);
    }
  }, [executeRebuild]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  if (loading) {
    return (
      <PageLayout>
        <LoadingState message="インデックス状態を取得中..." />
      </PageLayout>
    );
  }

  // Calculate stats
  const activeCount = statuses
    ? [statuses.locagent, statuses.repograph, statuses.semantic].filter(s => s.exists).length
    : 0;
  const totalSize = statuses
    ? (statuses.locagent.size || 0) + (statuses.repograph.size || 0) + (statuses.semantic.size || 0)
    : 0;

  const confirmConfig = confirmAction
    ? {
        title: confirmAction.type === "rebuild"
          ? `${INDEX_CONFIG[confirmAction.index].title}を${confirmAction.force ? "再構築" : "差分更新"}しますか？`
          : `${INDEX_CONFIG[confirmAction.index].title}を削除しますか？`,
        description: confirmAction.type === "rebuild"
          ? confirmAction.force
            ? "インデックスを完全に再構築します。時間がかかる場合があります。"
            : "変更されたファイルのみを更新します。通常は高速です。"
          : "インデックスを削除します。再度使用するには再構築が必要です。",
        actionLabel: confirmAction.type === "rebuild"
          ? confirmAction.force ? "再構築" : "更新"
          : "削除",
      }
    : null;

  return (
    <PageLayout>
      <PageHeader
        title="インデックス管理"
        description="コード検索・ローカライゼーション用のインデックスを管理"
        actions={
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rebuildAll(false)}
            >
              <RefreshCw class="h-4 w-4 mr-1" />
              全て更新
            </Button>
            <Button
              size="sm"
              onClick={() => rebuildAll(true)}
            >
              <Database class="h-4 w-4 mr-1" />
              全て再構築
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Stats Overview */}
      <StatsGrid cols={3} class={SPACING.section}>
        <StatsCard
          label="有効インデックス"
          value={activeCount}
          suffix="/ 3"
        />
        <StatsCard
          label="合計サイズ"
          value={formatSize(totalSize)}
        />
        <StatsCard
          label="状態"
          value={activeCount === 3 ? "OK" : activeCount === 0 ? "未構築" : "部分的"}
        />
      </StatsGrid>

      {/* Index Cards */}
      <div class="grid gap-4 md:grid-cols-3">
        {statuses && (
          <>
            <IndexCard
              indexKey="locagent"
              status={statuses.locagent}
              progress={progress}
              onRebuild={(force) => setConfirmAction({ type: "rebuild", index: "locagent", force })}
              onDelete={() => setConfirmAction({ type: "delete", index: "locagent", force: false })}
              onToggle={(enabled) => handleToggle("locagent", enabled)}
            />
            <IndexCard
              indexKey="repograph"
              status={statuses.repograph}
              progress={progress}
              onRebuild={(force) => setConfirmAction({ type: "rebuild", index: "repograph", force })}
              onDelete={() => setConfirmAction({ type: "delete", index: "repograph", force: false })}
              onToggle={(enabled) => handleToggle("repograph", enabled)}
            />
            <IndexCard
              indexKey="semantic"
              status={statuses.semantic}
              progress={progress}
              onRebuild={(force) => setConfirmAction({ type: "rebuild", index: "semantic", force })}
              onDelete={() => setConfirmAction({ type: "delete", index: "semantic", force: false })}
              onToggle={(enabled) => handleToggle("semantic", enabled)}
            />
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && confirmConfig && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmConfig.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmConfig.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmAction(null)}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAction}>
                {confirmConfig.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </div>
      )}
    </PageLayout>
  );
}
