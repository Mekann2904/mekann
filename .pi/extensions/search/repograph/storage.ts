/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/storage.ts
 * role: RepoGraph index persistence layer for saving and loading graph data
 * why: Enable caching of graph indices to avoid rebuilding on each query
 * related: .pi/extensions/search/repograph/builder.ts, .pi/extensions/search/repograph/types.ts
 * public_api: saveRepoGraph, loadRepoGraph, deleteRepoGraph, isRepoGraphStale
 * invariants:
 * - Index is stored in SQLite json_state
 * - Map serialization preserves all entries
 * - Metadata includes timestamp for staleness detection
 * side_effects:
 * - Writes to SQLite
 * - Reads from SQLite
 * failure_modes:
 * - SQLite unavailable
 * - Corrupted JSON payload
 * @abdd.explain
 * overview: Persist RepoGraph indices to SQLite
 * what_it_does:
 * - Serializes RepoGraphIndex to JSON-compatible format
 * - Loads and deserializes indices back to Map structure
 * - Detects stale indices based on metadata timestamp
 * why_it_exists:
 * - Avoid rebuilding graph on every search
 * - Enable persistent caching across sessions
 * scope:
 * in: RepoGraphIndex object, working directory path
 * out: SQLite json_state entries, loaded RepoGraphIndex or null
 */

import { stat } from "fs/promises";
import { join } from "path";
import type {
  RepoGraphIndex,
  RepoGraphNode,
  RepoGraphEdge,
  RepoGraphMetadata,
} from "./types.js";
import {
  readStrictJsonState,
  writeStrictJsonState,
  deleteStrictJsonState,
} from "../../../lib/storage/sqlite-state-store-strict.js";

const CURRENT_REPOGRAPH_INDEX_VERSION = 2;

interface SerializableRepoGraph {
  nodes: [string, RepoGraphNode][];
  edges: RepoGraphEdge[];
  metadata: RepoGraphMetadata;
}

function getRepoGraphStateKey(cwd: string): string {
  return `repograph:index:${cwd}`;
}

function serializeGraph(graph: RepoGraphIndex): SerializableRepoGraph {
  return {
    nodes: Array.from(graph.nodes.entries()),
    edges: graph.edges,
    metadata: graph.metadata,
  };
}

function deserializeGraph(data: SerializableRepoGraph): RepoGraphIndex {
  return {
    nodes: new Map(data.nodes),
    edges: data.edges,
    metadata: data.metadata,
  };
}

export async function saveRepoGraph(graph: RepoGraphIndex, cwd: string): Promise<string> {
  const stateKey = getRepoGraphStateKey(cwd);
  writeStrictJsonState(stateKey, serializeGraph(graph));
  return `sqlite://json_state/${stateKey}`;
}

export async function loadRepoGraph(cwd: string): Promise<RepoGraphIndex | null> {
  const stateKey = getRepoGraphStateKey(cwd);
  const data = readStrictJsonState<SerializableRepoGraph>(stateKey);
  if (!data) return null;
  return deserializeGraph(data);
}

export async function deleteRepoGraph(cwd: string): Promise<void> {
  const stateKey = getRepoGraphStateKey(cwd);
  deleteStrictJsonState(stateKey);
}

export async function isRepoGraphStale(cwd: string, sourcePath?: string): Promise<boolean> {
  const graph = await loadRepoGraph(cwd);
  if (!graph) return true;

  const indexedAt = Number(graph.metadata.indexedAt || 0);
  if (!Number.isFinite(indexedAt) || indexedAt <= 0) {
    return true;
  }

  if (graph.metadata.version !== CURRENT_REPOGRAPH_INDEX_VERSION) {
    return true;
  }

  const maxAge = 24 * 60 * 60 * 1000;
  if (Date.now() - indexedAt > maxAge) {
    return true;
  }

  if (sourcePath) {
    const sourceDir = join(cwd, sourcePath);
    try {
      const sourceStat = await stat(sourceDir);
      if (sourceStat.mtimeMs > indexedAt) {
        return true;
      }
    } catch {
      // sourceディレクトリが無い場合は stale 判定を変えない
    }
  }

  return false;
}

export function getRepoGraphPath(cwd: string): string {
  const stateKey = getRepoGraphStateKey(cwd);
  return `sqlite://json_state/${stateKey}`;
}

export async function getRepoGraphMetadata(cwd: string): Promise<RepoGraphMetadata | null> {
  const graph = await loadRepoGraph(cwd);
  return graph?.metadata ?? null;
}
