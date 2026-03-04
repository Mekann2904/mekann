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
import { Progress } from "./ui/progress";
import {
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  HardDrive,
  GitBranch,
  Search,
  Loader2,
} from "lucide-preact";
import type { LucideIcon } from "lucide-preact";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  LoadingState,
  ErrorBanner,
  TYPOGRAPHY,
  CARD_STYLES,
  SPACING,
} from "./layout";

/**
 * インデックス状態
 */
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

/**
 * API応答型
 */
interface IndexesResponse {
  locagent: IndexStatus;
  repograph: IndexStatus;
  semantic: IndexStatus;
}

/**
 * ビルド進捗
 */
interface BuildProgress {
  index: "locagent" | "repograph" | "semantic";
  status: "idle" | "building" | "success" | "error";
  message?: string;
  progress?: number;
}

/**
 * 時刻をフォーマット
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "未構築";
  const date = new Date(timestamp);
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * サイズをフォーマット
 */
function formatSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * インデックスカード
 */
interface IndexCardProps {
  title: string;
  description: string;
  icon: preact.VNode;
  status: IndexStatus;
  progress: BuildProgress;
  onRebuild: (force: boolean) => void;
  color: string;
}

function IndexCard({ title, description, icon, status, progress, onRebuild, color }: IndexCardProps) {
  const isBuilding = progress.status === "building";
  const isThis = progress.index === title.toLowerCase().replace(" ", "-") ||
                 (title === "LocAgent" && progress.index === "locagent") ||
                 (title === "RepoGraph" && progress.index === "repograph") ||
                 (title === "Semantic" && progress.index === "semantic");

  return (
    <Card class={cn(CARD_STYLES.base, "relative overflow-hidden")}>
      {/* Color accent bar */}
      <div class={cn("absolute top-0 left-0 right-0 h-1", color)} />

      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class={cn("p-2 rounded-lg", color.replace("bg-", "bg-opacity-20 bg-"))}>
              {icon}
            </div>
            <div>
              <CardTitle class={TYPOGRAPHY.cardTitle}>{title}</CardTitle>
              <CardDescription class="text-xs">{description}</CardDescription>
            </div>
          </div>
          {status.exists ? (
            <CheckCircle class="h-5 w-5 text-green-500" />
          ) : (
            <XCircle class="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      <CardContent class="space-y-4">
        {/* Stats */}
        <div class="grid grid-cols-2 gap-2 text-sm">
          {status.nodeCount !== undefined && (
            <div class="flex justify-between">
              <span class="text-muted-foreground">ノード</span>
              <span class="font-mono">{status.nodeCount.toLocaleString()}</span>
            </div>
          )}
          {status.edgeCount !== undefined && (
            <div class="flex justify-between">
              <span class="text-muted-foreground">エッジ</span>
              <span class="font-mono">{status.edgeCount.toLocaleString()}</span>
            </div>
          )}
          {status.fileCount !== undefined && (
            <div class="flex justify-between">
              <span class="text-muted-foreground">ファイル</span>
              <span class="font-mono">{status.fileCount.toLocaleString()}</span>
            </div>
          )}
          {status.entityCount !== undefined && (
            <div class="flex justify-between">
              <span class="text-muted-foreground">エンティティ</span>
              <span class="font-mono">{status.entityCount.toLocaleString()}</span>
            </div>
          )}
          <div class="flex justify-between">
            <span class="text-muted-foreground">サイズ</span>
            <span class="font-mono">{formatSize(status.size)}</span>
          </div>
          <div class="flex justify-between col-span-2">
            <span class="text-muted-foreground">最終更新</span>
            <span class="font-mono text-xs">{formatTimestamp(status.indexedAt)}</span>
          </div>
        </div>

        {/* Progress bar */}
        {isThis && isBuilding && progress.progress !== undefined && (
          <div class="space-y-1">
            <Progress value={progress.progress} class="h-2" />
            <p class="text-xs text-muted-foreground text-center">{progress.message}</p>
          </div>
        )}

        {/* Error */}
        {status.error && (
          <div class="p-2 bg-destructive/10 text-destructive text-xs rounded">
            {status.error}
          </div>
        )}

        {/* Actions */}
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRebuild(false)}
            disabled={isThis && isBuilding}
            class="flex-1"
          >
            {isThis && isBuilding ? (
              <Loader2 class="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw class="h-4 w-4 mr-1" />
            )}
            差分更新
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onRebuild(true)}
            disabled={isThis && isBuilding}
            class="flex-1"
          >
            {isThis && isBuilding ? (
              <Loader2 class="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Database class="h-4 w-4 mr-1" />
            )}
            再構築
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * インデックス管理ページ
 */
export function IndexesPage() {
  const [statuses, setStatuses] = useState<IndexesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BuildProgress>({
    index: "locagent",
    status: "idle",
  });

  /**
   * インデックス状態を取得
   */
  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/indexes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatuses(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch indexes");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * インデックスを再構築
   */
  const rebuildIndex = useCallback(async (
    index: "locagent" | "repograph" | "semantic",
    force: boolean
  ) => {
    setProgress({ index, status: "building", message: "準備中...", progress: 0 });

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

      const data = await res.json();
      setProgress({ index, status: "success", message: "完了", progress: 100 });

      // 状態を更新
      await fetchStatuses();

      // 3秒後にリセット
      setTimeout(() => {
        setProgress({ index: "locagent", status: "idle" });
      }, 3000);
    } catch (e) {
      setProgress({
        index,
        status: "error",
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }, [fetchStatuses]);

  /**
   * 全インデックスを再構築
   */
  const rebuildAll = useCallback(async (force: boolean) => {
    for (const index of ["locagent", "repograph", "semantic"] as const) {
      await rebuildIndex(index, force);
    }
  }, [rebuildIndex]);

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

  return (
    <PageLayout>
      <PageHeader
        title="インデックス管理"
        description="LocAgent, RepoGraph, Semanticの3つのインデックスを管理"
        icon={<Database class="h-6 w-6" />}
        actions={
          <div class="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => rebuildAll(false)}>
              <RefreshCw class="h-4 w-4 mr-1" />
              全て差分更新
            </Button>
            <Button size="sm" onClick={() => rebuildAll(true)}>
              <Database class="h-4 w-4 mr-1" />
              全て再構築
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div class={cn(SPACING.section, "grid gap-4 md:grid-cols-3")}>
        {statuses && (
          <>
            <IndexCard
              title="LocAgent"
              description="要素レベル異種グラフ"
              icon={<GitBranch class="h-5 w-5 text-blue-500" />}
              status={statuses.locagent}
              progress={progress}
              onRebuild={(force) => rebuildIndex("locagent", force)}
              color="bg-blue-500"
            />
            <IndexCard
              title="RepoGraph"
              description="行レベル依存グラフ"
              icon={<HardDrive class="h-5 w-5 text-green-500" />}
              status={statuses.repograph}
              progress={progress}
              onRebuild={(force) => rebuildIndex("repograph", force)}
              color="bg-green-500"
            />
            <IndexCard
              title="Semantic"
              description="セマンティック検索インデックス"
              icon={<Search class="h-5 w-5 text-purple-500" />}
              status={statuses.semantic}
              progress={progress}
              onRebuild={(force) => rebuildIndex("semantic", force)}
              color="bg-purple-500"
            />
          </>
        )}
      </div>

      {/* Help section */}
      <Card class={cn(SPACING.section, "mt-6")}>
        <CardHeader>
          <CardTitle class={TYPOGRAPHY.sectionTitle}>インデックスの使い方</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3 text-sm text-muted-foreground">
          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <h4 class="font-medium text-foreground mb-1">LocAgent</h4>
              <p>Issueやタスクから関連コードを特定。クラス・関数単位で検索。</p>
            </div>
            <div>
              <h4 class="font-medium text-foreground mb-1">RepoGraph</h4>
              <p>行レベルの依存関係を追跡。関数の呼び出し元を詳細に調査。</p>
            </div>
            <div>
              <h4 class="font-medium text-foreground mb-1">Semantic</h4>
              <p>自然言語でコードを検索。「エラーハンドリング」などで検索可能。</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
