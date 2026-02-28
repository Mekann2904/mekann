/**
 * @abdd.meta
 * path: .pi/lib/memory/entity-centric-memory.ts
 * role: エンティティ単位（ユーザー、タスク、プロジェクトなど）でメモリを管理するモジュール
 * why: パーソナライズドな記憶管理とエンティティ間のメモリ分離を実現するため
 * related: .pi/lib/semantic-memory.ts, .pi/lib/memory/context-saturation-gap.ts, .pi/lib/memory/semantic-evaluator.ts
 * public_api: Entity, EntityMemoryEntry, EntityMemoryStore, createEntity, addMemoryToEntity, searchMemories
 * invariants: entityIndexとtypeIndexはentries配列の内容と整合している
 * side_effects: .pi/memory/entity-memory.jsonへの読み書き
 * failure_modes: エンティティIDの重複、ストレージの破損、埋め込み生成の失敗
 * @abdd.explain
 * overview: ユーザー、タスク、プロジェクトなどのエンティティ単位でメモリを管理し、パーソナライズド検索を可能にする
 * what_it_does:
 *   - エンティティの作成、更新、削除を行う
 *   - エンティティごとにメモリエントリを管理する
 *   - 重要度に基づくメモリの優先順位付けを行う
 *   - エンティティタイプでフィルタリングした検索を提供する
 * why_it_exists:
 *   - Lightweight Semantic Memoryだけでは不十分な、エンティティ単位の構造化記憶を提供するため
 *   - パーソナライゼーションとエンティティ間のメモリ分離を実現するため
 * scope:
 *   in: エンティティ情報、メモリコンテンツ、検索クエリ
 *   out: エンティティ、メモリエントリ、検索結果
 */

/**
 * Entity-Centric Memory Module
 *
 * Implements entity-centric memory as described in "Anatomy of Agentic Memory" Section 3.2.
 * Organizes information around explicit entities (users, tasks, projects) with structured records.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir } from "../fs-utils.js";
import { atomicWriteTextFile } from "../storage/storage-lock.js";
import {
  generateEmbedding,
  cosineSimilarity,
} from "../embeddings/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * エンティティの種類
 * @summary エンティティ種別定義
 */
export type EntityType = "user" | "task" | "project" | "session" | "custom";

/**
 * エンティティ情報
 * @summary エンティティ定義
 */
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * エンティティに関連するメモリエントリ
 * @summary メモリエントリ定義
 */
export interface EntityMemoryEntry {
  id: string;
  entityId: string;
  entityType: EntityType;
  content: string;
  embedding?: number[];
  timestamp: string;
  source: "user_input" | "agent_observation" | "system_inference";
  importance: number;
  accessCount: number;
  lastAccessedAt: string;
}

/**
 * エンティティメモリのストレージ構造
 * @summary ストレージ構造定義
 */
export interface EntityMemoryStore {
  version: number;
  lastUpdated: string;
  entities: Record<string, Entity>;
  entries: EntityMemoryEntry[];
  entityIndex: Record<string, string[]>;
  typeIndex: Record<EntityType, string[]>;
}

/**
 * パーソナライズド検索の結果
 * @summary 検索結果定義
 */
export interface PersonalizedSearchResult {
  entry: EntityMemoryEntry;
  entity: Entity;
  relevanceScore: number;
  personalizationBoost: number;
}

/**
 * エンティティメモリの設定
 * @summary 設定定義
 */
export interface EntityMemoryConfig {
  maxEntriesPerEntity: number;
  embeddingEnabled: boolean;
  importanceDecayFactor: number;
}

// ============================================================================
// Constants
// ============================================================================

export const ENTITY_MEMORY_VERSION = 1;
export const DEFAULT_CONFIG: EntityMemoryConfig = {
  maxEntriesPerEntity: 100,
  embeddingEnabled: true,
  importanceDecayFactor: 0.95,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 一意のIDを生成
 * @summary ID生成
 * @param prefix IDのプレフィックス
 * @returns 生成されたID
 */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * エンティティの重要度を計算
 * @summary 重要度計算
 * @param entry メモリエントリ
 * @param decayFactor 減衰係数
 * @returns 計算された重要度
 */
export function calculateImportance(
  entry: EntityMemoryEntry,
  decayFactor: number
): number {
  const ageMs = Date.now() - new Date(entry.timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decayedImportance = entry.importance * Math.pow(decayFactor, ageDays);
  const accessBoost = Math.log10(entry.accessCount + 1) * 0.1;
  return Math.min(1, decayedImportance + accessBoost);
}

/**
 * 2つのエンティティをマージ
 * @summary エンティティマージ
 * @param target マージ先のエンティティ
 * @param source マージ元のエンティティ
 * @returns マージされたエンティティ
 */
export function mergeEntities(target: Entity, source: Entity): Entity {
  return {
    ...target,
    attributes: { ...target.attributes, ...source.attributes },
    metadata: { ...target.metadata, ...source.metadata },
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * エンティティメモリのパスを取得
 * @summary パス取得
 * @param cwd カレントワーキングディレクトリ
 * @returns ストレージファイルのパス
 */
export function getEntityMemoryPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "entity-memory.json");
}

/**
 * エンティティメモリをロード
 * @summary メモリロード
 * @param cwd カレントワーキングディレクトリ
 * @returns エンティティメモリストア
 */
export function loadEntityMemoryStore(cwd: string): EntityMemoryStore {
  const path = getEntityMemoryPath(cwd);
  if (!existsSync(path)) {
    return {
      version: ENTITY_MEMORY_VERSION,
      lastUpdated: new Date().toISOString(),
      entities: {},
      entries: [],
      entityIndex: {},
      typeIndex: {
        user: [],
        task: [],
        project: [],
        session: [],
        custom: [],
      },
    };
  }

  try {
    const content = readFileSync(path, "utf-8");
    const store = JSON.parse(content);
    // Ensure typeIndex has all entity types
    store.typeIndex = {
      user: [],
      task: [],
      project: [],
      session: [],
      custom: [],
      ...store.typeIndex,
    };
    return store;
  } catch {
    return {
      version: ENTITY_MEMORY_VERSION,
      lastUpdated: new Date().toISOString(),
      entities: {},
      entries: [],
      entityIndex: {},
      typeIndex: {
        user: [],
        task: [],
        project: [],
        session: [],
        custom: [],
      },
    };
  }
}

/**
 * エンティティメモリを保存
 * @summary メモリ保存
 * @param cwd カレントワーキングディレクトリ
 * @param store 保存するストア
 */
export function saveEntityMemoryStore(
  cwd: string,
  store: EntityMemoryStore
): void {
  const path = getEntityMemoryPath(cwd);
  ensureDir(join(cwd, ".pi", "memory"));
  store.lastUpdated = new Date().toISOString();
  atomicWriteTextFile(path, JSON.stringify(store, null, 2));
}

// ============================================================================
// Entity CRUD Operations
// ============================================================================

let _store: EntityMemoryStore | null = null;

function getStore(cwd: string): EntityMemoryStore {
  if (!_store) {
    _store = loadEntityMemoryStore(cwd);
  }
  return _store;
}

function saveStore(cwd: string): void {
  if (_store) {
    saveEntityMemoryStore(cwd, _store);
  }
}

/**
 * エンティティを作成
 * @summary エンティティ作成
 * @param cwd カレントワーキングディレクトリ
 * @param type エンティティ種別
 * @param name エンティティ名
 * @param attributes エンティティ属性
 * @returns 作成されたエンティティ
 */
export function createEntity(
  cwd: string,
  type: EntityType,
  name: string,
  attributes: Record<string, unknown> = {}
): Entity {
  const store = getStore(cwd);
  const id = generateId(type);

  const entity: Entity = {
    id,
    type,
    name,
    attributes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.entities[id] = entity;
  store.entityIndex[id] = [];

  if (!store.typeIndex[type]) {
    store.typeIndex[type] = [];
  }
  store.typeIndex[type].push(id);

  saveStore(cwd);
  return entity;
}

/**
 * エンティティを取得
 * @summary エンティティ取得
 * @param cwd カレントワーキングディレクトリ
 * @param entityId エンティティID
 * @returns エンティティ、存在しない場合はnull
 */
export function getEntity(cwd: string, entityId: string): Entity | null {
  const store = getStore(cwd);
  return store.entities[entityId] || null;
}

/**
 * エンティティを更新
 * @summary エンティティ更新
 * @param cwd カレントワーキングディレクトリ
 * @param entityId エンティティID
 * @param attributes 更新する属性
 * @returns 更新されたエンティティ、存在しない場合はnull
 */
export function updateEntity(
  cwd: string,
  entityId: string,
  attributes: Record<string, unknown>
): Entity | null {
  const store = getStore(cwd);
  const entity = store.entities[entityId];

  if (!entity) {
    return null;
  }

  entity.attributes = { ...entity.attributes, ...attributes };
  entity.updatedAt = new Date().toISOString();

  saveStore(cwd);
  return entity;
}

/**
 * エンティティを削除
 * @summary エンティティ削除
 * @param cwd カレントワーキングディレクトリ
 * @param entityId エンティティID
 * @returns 削除に成功したかどうか
 */
export function deleteEntity(cwd: string, entityId: string): boolean {
  const store = getStore(cwd);
  const entity = store.entities[entityId];

  if (!entity) {
    return false;
  }

  // Remove from type index
  const typeList = store.typeIndex[entity.type];
  const typeIndex = typeList.indexOf(entityId);
  if (typeIndex > -1) {
    typeList.splice(typeIndex, 1);
  }

  // Remove entries
  const entryIds = store.entityIndex[entityId] || [];
  store.entries = store.entries.filter((e) => !entryIds.includes(e.id));

  // Remove from indexes
  delete store.entities[entityId];
  delete store.entityIndex[entityId];

  saveStore(cwd);
  return true;
}

/**
 * 種別でエンティティを取得
 * @summary 種別でエンティティ取得
 * @param cwd カレントワーキングディレクトリ
 * @param type エンティティ種別
 * @returns エンティティの配列
 */
export function getEntitiesByType(cwd: string, type: EntityType): Entity[] {
  const store = getStore(cwd);
  const ids = store.typeIndex[type] || [];
  return ids.map((id) => store.entities[id]).filter(Boolean);
}

// ============================================================================
// Memory Operations
// ============================================================================

/**
 * エンティティにメモリを追加
 * @summary メモリ追加
 * @param cwd カレントワーキングディレクトリ
 * @param entityId エンティティID
 * @param content メモリの内容
 * @param source メモリのソース
 * @param config 設定
 * @returns 作成されたメモリエントリ
 */
export async function addMemoryToEntity(
  cwd: string,
  entityId: string,
  content: string,
  source: EntityMemoryEntry["source"],
  config: EntityMemoryConfig = DEFAULT_CONFIG
): Promise<EntityMemoryEntry> {
  const store = getStore(cwd);
  const entity = store.entities[entityId];

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const id = generateId("mem");

  // Generate embedding if enabled
  let embedding: number[] | undefined;
  if (config.embeddingEnabled) {
    try {
      embedding = await generateEmbedding(content) || undefined;
    } catch {
      // Embedding generation failed, continue without it
    }
  }

  const entry: EntityMemoryEntry = {
    id,
    entityId,
    entityType: entity.type,
    content,
    embedding,
    timestamp: new Date().toISOString(),
    source,
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: new Date().toISOString(),
  };

  store.entries.push(entry);

  if (!store.entityIndex[entityId]) {
    store.entityIndex[entityId] = [];
  }
  store.entityIndex[entityId].push(id);

  // Enforce max entries per entity
  const entityEntries = store.entityIndex[entityId];
  if (entityEntries.length > config.maxEntriesPerEntity) {
    // Remove oldest entries
    const toRemove = entityEntries.slice(
      0,
      entityEntries.length - config.maxEntriesPerEntity
    );
    store.entries = store.entries.filter((e) => !toRemove.includes(e.id));
    store.entityIndex[entityId] = entityEntries.slice(
      entityEntries.length - config.maxEntriesPerEntity
    );
  }

  saveStore(cwd);
  return entry;
}

/**
 * エンティティのメモリを取得
 * @summary メモリ取得
 * @param cwd カレントワーキングディレクトリ
 * @param entityId エンティティID
 * @param limit 取得件数の上限
 * @returns メモリエントリの配列
 */
export function getMemoriesForEntity(
  cwd: string,
  entityId: string,
  limit: number = 10
): EntityMemoryEntry[] {
  const store = getStore(cwd);
  const entryIds = store.entityIndex[entityId] || [];

  return entryIds
    .map((id) => store.entries.find((e) => e.id === id))
    .filter(Boolean)
    .sort((a, b) => new Date(b!.timestamp).getTime() - new Date(a!.timestamp).getTime())
    .slice(0, limit) as EntityMemoryEntry[];
}

/**
 * メモリを検索
 * @summary メモリ検索
 * @param cwd カレントワーキングディレクトリ
 * @param query 検索クエリ
 * @param entityTypes エンティティ種別でフィルタ
 * @param config 設定
 * @returns 検索結果の配列
 */
export async function searchMemories(
  cwd: string,
  query: string,
  entityTypes?: EntityType[],
  config: EntityMemoryConfig = DEFAULT_CONFIG
): Promise<PersonalizedSearchResult[]> {
  const store = getStore(cwd);

  // Generate query embedding
  let queryEmbedding: number[] | null = null;
  if (config.embeddingEnabled) {
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch {
      // Continue with text-based search
    }
  }

  // Filter entries by entity type
  let entries = store.entries;
  if (entityTypes && entityTypes.length > 0) {
    entries = entries.filter((e) => entityTypes.includes(e.entityType));
  }

  // Calculate relevance scores
  const results: PersonalizedSearchResult[] = [];

  for (const entry of entries) {
    const entity = store.entities[entry.entityId];
    if (!entity) continue;

    let relevanceScore = 0;

    // Semantic similarity if embeddings available
    if (queryEmbedding && entry.embedding) {
      relevanceScore = cosineSimilarity(queryEmbedding, entry.embedding);
    } else {
      // Fallback to text matching
      const queryLower = query.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      if (contentLower.includes(queryLower)) {
        relevanceScore = 0.5;
      }
    }

    // Apply importance boost
    const importance = calculateImportance(entry, config.importanceDecayFactor);
    const personalizationBoost = importance * 0.2;
    relevanceScore += personalizationBoost;

    if (relevanceScore > 0) {
      results.push({
        entry,
        entity,
        relevanceScore,
        personalizationBoost,
      });
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return results;
}

/**
 * メモリの重要度を更新
 * @summary 重要度更新
 * @param cwd カレントワーキングディレクトリ
 * @param entryId エントリID
 * @param importance 新しい重要度
 */
export function updateMemoryImportance(
  cwd: string,
  entryId: string,
  importance: number
): void {
  const store = getStore(cwd);
  const entry = store.entries.find((e) => e.id === entryId);

  if (entry) {
    entry.importance = Math.max(0, Math.min(1, importance));
    saveStore(cwd);
  }
}

/**
 * メモリアクセスを記録
 * @summary アクセス記録
 * @param cwd カレントワーキングディレクトリ
 * @param entryId エントリID
 */
export function recordMemoryAccess(cwd: string, entryId: string): void {
  const store = getStore(cwd);
  const entry = store.entries.find((e) => e.id === entryId);

  if (entry) {
    entry.accessCount += 1;
    entry.lastAccessedAt = new Date().toISOString();
    saveStore(cwd);
  }
}

/**
 * ストアをリセット（テスト用）
 * @summary ストアリセット
 */
export function resetStore(): void {
  _store = null;
}
