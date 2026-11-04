import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getWritableDataDir } from '../config/secrets.js';
import type {
  ProjectRecord,
  ProjectBrief,
  JevEvaluationRecord,
  CatalogEntry,
  EvidenceItem,
} from '../../shared/types.js';

interface SqliteStatementLike {
  run: (...args: unknown[]) => { changes?: number | bigint };
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
}

export interface SqliteDatabaseLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatementLike;
  close: () => void;
}

interface FallbackJsonStore {
  projects: Record<string, ProjectRecord>;
  briefRevisions: Record<string, ProjectBrief[]>;
  researchCache: Record<string, { items: EvidenceItem[]; expiresAt: string }>;
  jevEvaluations: JevEvaluationRecord[];
  catalogEntries: Array<{ entry: CatalogEntry; isBuiltin: boolean }>;
  executionLogs: Array<Record<string, unknown>>;
}

let dbInstance: SqliteDatabaseLike | null = null;
let currentDbPath: string | null = null;
let usingFallbackStore = false;
let fallbackStoreCache: FallbackJsonStore | null = null;

function getFallbackJsonPath(): string {
  const baseDir = currentDbPath && currentDbPath !== ':memory:' ? path.dirname(currentDbPath) : getWritableDataDir();
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return path.join(baseDir, 'forja-fallback-store.json');
}

function readFallbackStore(): FallbackJsonStore {
  if (fallbackStoreCache) return fallbackStoreCache;
  try {
    const p = getFallbackJsonPath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as FallbackJsonStore;
      fallbackStoreCache = parsed;
      return parsed;
    }
  } catch {
    // ignore read error
  }
  fallbackStoreCache = {
    projects: {},
    briefRevisions: {},
    researchCache: {},
    jevEvaluations: [],
    catalogEntries: [],
    executionLogs: [],
  };
  return fallbackStoreCache;
}

function flushFallbackStore(): void {
  if (!fallbackStoreCache) return;
  try {
    const p = getFallbackJsonPath();
    fs.writeFileSync(p, JSON.stringify(fallbackStoreCache), 'utf-8');
  } catch {
    // ignore write error in ephemeral environments
  }
}

export function getDbPath(): string {
  if (currentDbPath) return currentDbPath;
  return path.join(getWritableDataDir(), 'forja.sqlite');
}

export function initDatabase(customPath?: string): SqliteDatabaseLike | null {
  if (dbInstance && (!customPath || customPath === currentDbPath)) {
    return dbInstance;
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
  }
  fallbackStoreCache = null;
  currentDbPath = customPath ?? getDbPath();
  if (currentDbPath !== ':memory:') {
    const dir = path.dirname(currentDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  try {
    const req = createRequire(import.meta.url || __filename);
    const sqliteMod = req('node:sqlite') as { DatabaseSync: new (p: string) => SqliteDatabaseLike };
    const db = new sqliteMod.DatabaseSync(currentDbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        brief_revision INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS brief_revisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        brief_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS research_cache (
        cache_key TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        source_type TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jev_evaluations (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        use_case TEXT NOT NULL,
        model_used TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog_entries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 1,
        entry_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    usingFallbackStore = false;
    dbInstance = db;
    return db;
  } catch {
    usingFallbackStore = true;
    readFallbackStore();
    return null;
  }
}

export function getDb(): SqliteDatabaseLike | null {
  if (!dbInstance && !usingFallbackStore) {
    initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
    currentDbPath = null;
  }
  fallbackStoreCache = null;
}

// ============================================================================
// Repositorio de Proyectos y Revisiones
// ============================================================================

export function saveProject(project: ProjectRecord): ProjectRecord {
  const db = getDb();
  project.updatedAt = new Date().toISOString();

  if (!db) {
    const store = readFallbackStore();
    store.projects[project.id] = project;
    flushFallbackStore();
    saveBriefRevision(project.id, project.brief);
    return project;
  }

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, mode, brief_revision, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      mode = excluded.mode,
      brief_revision = excluded.brief_revision,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    project.id,
    project.name,
    project.mode,
    project.brief.revision,
    JSON.stringify(project),
    project.createdAt,
    project.updatedAt
  );

  saveBriefRevision(project.id, project.brief);
  return project;
}

export function saveBriefRevision(projectId: string, brief: ProjectBrief): void {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    const list = store.briefRevisions[projectId] || [];
    const existingIdx = list.findIndex((b) => b.revision === brief.revision);
    if (existingIdx >= 0) {
      list[existingIdx] = brief;
    } else {
      list.push(brief);
    }
    store.briefRevisions[projectId] = list.sort((a, b) => a.revision - b.revision);
    flushFallbackStore();
    return;
  }

  const id = `${projectId}:rev:${brief.revision}`;
  const stmt = db.prepare(`
    INSERT INTO brief_revisions (id, project_id, revision, brief_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      brief_json = excluded.brief_json
  `);
  stmt.run(id, projectId, brief.revision, JSON.stringify(brief), new Date().toISOString());
}

export function getBriefRevisions(projectId: string): ProjectBrief[] {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    return store.briefRevisions[projectId] || [];
  }
  const rows = db
    .prepare('SELECT brief_json FROM brief_revisions WHERE project_id = ? ORDER BY revision ASC')
    .all(projectId) as Array<{ brief_json: string }>;
  return rows.map((r) => JSON.parse(r.brief_json) as ProjectBrief);
}

export function getProjectById(id: string): ProjectRecord | null {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    return store.projects[id] ?? null;
  }
  const row = db
    .prepare('SELECT data_json FROM projects WHERE id = ?')
    .get(id) as { data_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.data_json) as ProjectRecord;
}

export function listProjects(): ProjectRecord[] {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    return Object.values(store.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const rows = db
    .prepare('SELECT data_json FROM projects ORDER BY updated_at DESC')
    .all() as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as ProjectRecord);
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    const existed = Boolean(store.projects[id]);
    delete store.projects[id];
    delete store.briefRevisions[id];
    flushFallbackStore();
    return existed;
  }
  db.prepare('DELETE FROM brief_revisions WHERE project_id = ?').run(id);
  const res = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// ============================================================================
// Caché de Investigación Vigente
// ============================================================================

export function getCachedEvidence(cacheKey: string): EvidenceItem[] | null {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    const entry = store.researchCache[cacheKey];
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() < Date.now()) return null;
    return entry.items;
  }
  const row = db
    .prepare('SELECT evidence_json, expires_at FROM research_cache WHERE cache_key = ?')
    .get(cacheKey) as { evidence_json: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }
  return JSON.parse(row.evidence_json) as EvidenceItem[];
}

export function setCachedEvidence(
  cacheKey: string,
  query: string,
  sourceType: string,
  items: EvidenceItem[],
  ttlHours = 24
): void {
  const db = getDb();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000);
  if (!db) {
    const store = readFallbackStore();
    store.researchCache[cacheKey] = { items, expiresAt: expires.toISOString() };
    flushFallbackStore();
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO research_cache (cache_key, query, source_type, evidence_json, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      evidence_json = excluded.evidence_json,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `);
  stmt.run(cacheKey, query, sourceType, JSON.stringify(items), now.toISOString(), expires.toISOString());
}

// ============================================================================
// Registro de Evaluaciones Jev (Sin credenciales)
// ============================================================================

export function saveJevEvaluation(record: JevEvaluationRecord): void {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    const idx = store.jevEvaluations.findIndex((r) => r.id === record.id);
    if (idx >= 0) store.jevEvaluations[idx] = record;
    else store.jevEvaluations.unshift(record);
    flushFallbackStore();
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO jev_evaluations (id, project_id, use_case, model_used, status, record_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      record_json = excluded.record_json
  `);
  stmt.run(
    record.id,
    record.projectId ?? null,
    record.useCase,
    record.modelUsed,
    record.status,
    JSON.stringify(record),
    record.createdAt
  );
}

export function listJevEvaluations(projectId?: string): JevEvaluationRecord[] {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    return projectId
      ? store.jevEvaluations.filter((e) => e.projectId === projectId)
      : store.jevEvaluations.slice(0, 100);
  }
  const rows = projectId
    ? (db
        .prepare('SELECT record_json FROM jev_evaluations WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId) as Array<{ record_json: string }>)
    : (db
        .prepare('SELECT record_json FROM jev_evaluations ORDER BY created_at DESC LIMIT 100')
        .all() as Array<{ record_json: string }>);
  return rows.map((r) => JSON.parse(r.record_json) as JevEvaluationRecord);
}

// ============================================================================
// Catálogo Persistido
// ============================================================================

export function saveCatalogEntry(entry: CatalogEntry, isBuiltin = false): void {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    const idx = store.catalogEntries.findIndex((c) => c.entry.id === entry.id);
    if (idx >= 0) store.catalogEntries[idx] = { entry, isBuiltin };
    else store.catalogEntries.push({ entry, isBuiltin });
    flushFallbackStore();
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO catalog_entries (id, name, kind, is_builtin, entry_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      entry_json = excluded.entry_json
  `);
  stmt.run(
    entry.id,
    entry.name,
    entry.kind,
    isBuiltin ? 1 : 0,
    JSON.stringify(entry),
    new Date().toISOString()
  );
}

export function listCatalogEntriesFromDb(): CatalogEntry[] {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    return store.catalogEntries.map((c) => c.entry);
  }
  const rows = db
    .prepare('SELECT entry_json FROM catalog_entries ORDER BY is_builtin DESC, name ASC')
    .all() as Array<{ entry_json: string }>;
  return rows.map((r) => JSON.parse(r.entry_json) as CatalogEntry);
}

export function logExecutionEvent(
  actionType: string,
  status: string,
  detail: Record<string, unknown>,
  projectId?: string
): void {
  const db = getDb();
  if (!db) {
    const store = readFallbackStore();
    store.executionLogs.push({
      id: `log_${Date.now()}`,
      projectId: projectId ?? null,
      actionType,
      status,
      detail,
      createdAt: new Date().toISOString(),
    });
    flushFallbackStore();
    return;
  }
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO execution_logs (id, project_id, action_type, status, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId ?? null, actionType, status, JSON.stringify(detail), new Date().toISOString());
}
