/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/plan-viewer.tsx
 * @role UL Workflowのplan.mdを表示
 * @why 各インスタンスの計画を可視化するため
 * @related dashboard-page.tsx
 * @public_api PlanViewer
 * @invariants なし
 * @side_effects APIからplan.mdを取得
 * @failure_modes API unavailable
 *
 * @abdd.explain
 * @overview UL Workflowタスクのplan.mdをMarkdownで表示
 * @what_it_does APIからplan.mdを取得してレンダリング
 * @why_it_exists ユーザーが各インスタンスの計画を確認できるようにするため
 * @scope(in) taskId
 * @scope(out) Markdownレンダリング
 */

import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";
import { FileText, Loader2 } from "lucide-preact";

interface PlanViewerProps {
  taskId: string | null;
  className?: string;
}

/**
 * @summary 簡易Markdownレンダラー
 */
function MarkdownRenderer({ content }: { content: string }) {
  // 簡易的なMarkdown→HTML変換
  const lines = content.split("\n");
  const elements: h.JSX.Element[] = [];

  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLang = "";
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul class="list-disc list-inside space-y-1 my-2 text-zinc-300">
          {listItems.map((item, i) => (
            <li key={i} class="text-sm">{item}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, idx) => {
    // コードブロック
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${idx}`} class="bg-zinc-900 p-3 rounded-md overflow-x-auto my-2 text-xs font-mono text-zinc-300">
            <code>{codeContent.join("\n")}</code>
          </pre>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        flushList();
        codeLang = line.slice(3);
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      return;
    }

    // 見出し
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={idx} class="text-xl font-bold text-zinc-100 mt-4 mb-2">
          {line.slice(2)}
        </h1>
      );
      return;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={idx} class="text-lg font-semibold text-zinc-100 mt-4 mb-2 border-b border-zinc-700 pb-1">
          {line.slice(3)}
        </h2>
      );
      return;
    }
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={idx} class="text-base font-medium text-zinc-200 mt-3 mb-1">
          {line.slice(4)}
        </h3>
      );
      return;
    }

    // リスト
    if (line.startsWith("- ") || line.startsWith("* ")) {
      inList = true;
      listItems.push(line.slice(2));
      return;
    }
    if (line.match(/^\d+\.\s/)) {
      inList = true;
      listItems.push(line.replace(/^\d+\.\s/, ""));
      return;
    }

    // 空行
    if (line.trim() === "") {
      flushList();
      elements.push(<div key={idx} class="h-2" />);
      return;
    }

    // 通常のテキスト
    flushList();
    
    // インラインコード
    let processedLine = line;
    const codeMatches = processedLine.match(/`([^`]+)`/g);
    if (codeMatches) {
      const parts: (string | h.JSX.Element)[] = [];
      let lastIdx = 0;
      codeMatches.forEach((match, i) => {
        const idx = processedLine.indexOf(match, lastIdx);
        if (idx > lastIdx) {
          parts.push(processedLine.slice(lastIdx, idx));
        }
        parts.push(
          <code key={`inline-${idx}-${i}`} class="bg-zinc-800 px-1 py-0.5 rounded text-xs text-zinc-300">
            {match.slice(1, -1)}
          </code>
        );
        lastIdx = idx + match.length;
      });
      if (lastIdx < processedLine.length) {
        parts.push(processedLine.slice(lastIdx));
      }
      elements.push(
        <p key={idx} class="text-sm text-zinc-300 my-1">
          {parts}
        </p>
      );
      return;
    }

    elements.push(
      <p key={idx} class="text-sm text-zinc-300 my-1">
        {line}
      </p>
    );
  });

  flushList();

  return <div class="plan-content">{elements}</div>;
}

/**
 * @summary Plan Viewer component
 */
export function PlanViewer({ taskId, className }: PlanViewerProps) {
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setPlan(null);
      return;
    }

    const fetchPlan = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/ul-workflow/tasks/${taskId}/plan`);
        if (!response.ok) {
          if (response.status === 404) {
            setPlan(null);
            setError("Plan not found");
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } else {
          const text = await response.text();
          setPlan(text);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load plan");
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [taskId]);

  if (!taskId) {
    return (
      <Card class={cn("h-full flex items-center justify-center bg-zinc-900", className)}>
        <CardContent class="text-center py-8">
          <FileText class="h-12 w-12 text-zinc-600 mx-auto mb-3" />
          <p class="text-zinc-500 text-sm">No active task selected</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card class={cn("h-full flex items-center justify-center bg-zinc-900", className)}>
        <CardContent class="text-center py-8">
          <Loader2 class="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
          <p class="text-zinc-500 text-sm">Loading plan...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card class={cn("h-full flex items-center justify-center bg-zinc-900", className)}>
        <CardContent class="text-center py-8">
          <FileText class="h-12 w-12 text-zinc-600 mx-auto mb-3" />
          <p class="text-zinc-500 text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card class={cn("h-full flex items-center justify-center bg-zinc-900", className)}>
        <CardContent class="text-center py-8">
          <FileText class="h-12 w-12 text-zinc-600 mx-auto mb-3" />
          <p class="text-zinc-500 text-sm">No plan available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card class={cn("h-full flex flex-col bg-zinc-900", className)}>
      <CardHeader class="py-2 px-3 border-b border-zinc-800 shrink-0">
        <div class="flex items-center gap-2">
          <FileText class="h-4 w-4 text-zinc-400" />
          <CardTitle class="text-sm font-mono text-zinc-300">
            Plan: {taskId}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent class="flex-1 overflow-y-auto p-4">
        <MarkdownRenderer content={plan} />
      </CardContent>
    </Card>
  );
}
