/**
 * Per-project sqlite-backed store for "Ask AI" annotations.
 *
 * Replaces the former agentation-mcp HTTP/sqlite bridge. The database lives
 * under `{projectRoot}/.canvas-data/annotations.db` so it travels with the
 * project (delete the project → annotations go with it), and the editor
 * server is the only writer, so WAL-mode concurrent reads from a sibling
 * MCP stdio process are safe if we ever re-add that path.
 *
 * Sessions (as a first-class table) are deliberately gone. Each annotation
 * carries its own `url` column; the history popover filters client-side if
 * it wants only the current page. This kills the "one session per URL"
 * proliferation that agentation-mcp had.
 */

import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync } from "fs";

export interface AnnotationThreadEntry {
  role: string;
  content: string;
  at?: number;
}

export interface AnnotationRecord {
  id: string;
  url: string;
  comment: string;
  element: string;
  elementPath: string;
  elementPaths?: string[];
  cssClasses?: string;
  intent: string;
  severity: string;
  status: "pending" | "in_progress" | "needs_input" | "resolved" | "dismissed";
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  thread: AnnotationThreadEntry[];
  resolvedSummary?: string;
  timestamp: number;
  updatedAt: number;
}

export interface CreateAnnotationInput {
  url: string;
  comment: string;
  element?: string;
  elementPath: string;
  elementPaths?: string[];
  cssClasses?: string;
  intent?: string;
  severity?: string;
  x?: number;
  y?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  timestamp?: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  comment TEXT NOT NULL,
  element TEXT NOT NULL DEFAULT '',
  element_path TEXT NOT NULL,
  element_paths TEXT,
  css_classes TEXT,
  intent TEXT NOT NULL DEFAULT 'change',
  severity TEXT NOT NULL DEFAULT 'important',
  status TEXT NOT NULL DEFAULT 'pending',
  x REAL,
  y REAL,
  bounding_box TEXT,
  thread TEXT NOT NULL DEFAULT '[]',
  resolved_summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_url ON annotations(url);
CREATE INDEX IF NOT EXISTS idx_annotations_status ON annotations(status);
CREATE INDEX IF NOT EXISTS idx_annotations_created ON annotations(created_at DESC);
`;

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

function open(projectRoot: string): Database.Database {
  const path = resolve(projectRoot, ".canvas-data", "annotations.db");
  if (_db && _dbPath === path) return _db;
  if (_db) { try { _db.close(); } catch {} }
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);
  _db = db;
  _dbPath = path;
  return db;
}

/** Close and forget the db handle — used by tests to reset between runs. */
export function __resetStoreForTests() {
  if (_db) { try { _db.close(); } catch {} }
  _db = null;
  _dbPath = null;
}

function rowToRecord(row: Record<string, unknown>): AnnotationRecord {
  return {
    id: row.id as string,
    url: row.url as string,
    comment: row.comment as string,
    element: (row.element as string) || "",
    elementPath: row.element_path as string,
    elementPaths: row.element_paths ? JSON.parse(row.element_paths as string) : undefined,
    cssClasses: (row.css_classes as string) || undefined,
    intent: row.intent as string,
    severity: row.severity as string,
    status: row.status as AnnotationRecord["status"],
    x: row.x as number | null ?? undefined,
    y: row.y as number | null ?? undefined,
    boundingBox: row.bounding_box ? JSON.parse(row.bounding_box as string) : undefined,
    thread: row.thread ? JSON.parse(row.thread as string) : [],
    resolvedSummary: (row.resolved_summary as string) || undefined,
    timestamp: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function genId(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createAnnotation(projectRoot: string, input: CreateAnnotationInput): AnnotationRecord {
  const db = open(projectRoot);
  const id = genId();
  const now = input.timestamp ?? Date.now();
  const stmt = db.prepare(`
    INSERT INTO annotations (
      id, url, comment, element, element_path, element_paths, css_classes,
      intent, severity, status, x, y, bounding_box, thread, resolved_summary,
      created_at, updated_at
    ) VALUES (
      @id, @url, @comment, @element, @element_path, @element_paths, @css_classes,
      @intent, @severity, 'pending', @x, @y, @bounding_box, '[]', NULL,
      @created_at, @updated_at
    )
  `);
  stmt.run({
    id,
    url: input.url,
    comment: input.comment,
    element: input.element ?? "",
    element_path: input.elementPath,
    element_paths: input.elementPaths && input.elementPaths.length > 1
      ? JSON.stringify(input.elementPaths)
      : null,
    css_classes: input.cssClasses ?? null,
    intent: input.intent ?? "change",
    severity: input.severity ?? "important",
    x: input.x ?? null,
    y: input.y ?? null,
    bounding_box: input.boundingBox ? JSON.stringify(input.boundingBox) : null,
    created_at: now,
    updated_at: now,
  });
  return getAnnotation(projectRoot, id)!;
}

export function listAnnotations(
  projectRoot: string,
  opts: { url?: string; status?: AnnotationRecord["status"] } = {},
): AnnotationRecord[] {
  const db = open(projectRoot);
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.url) { clauses.push("url = @url"); params.url = opts.url; }
  if (opts.status) { clauses.push("status = @status"); params.status = opts.status; }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM annotations ${where} ORDER BY created_at DESC`).all(params) as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getAnnotation(projectRoot: string, id: string): AnnotationRecord | null {
  const db = open(projectRoot);
  const row = db.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

export interface UpdateAnnotationInput {
  status?: AnnotationRecord["status"];
  resolvedSummary?: string;
  comment?: string;
}

export function updateAnnotation(projectRoot: string, id: string, patch: UpdateAnnotationInput): AnnotationRecord | null {
  const db = open(projectRoot);
  const existing = getAnnotation(projectRoot, id);
  if (!existing) return null;
  const sets: string[] = ["updated_at = @updated_at"];
  const params: Record<string, unknown> = { id, updated_at: Date.now() };
  if (patch.status !== undefined) { sets.push("status = @status"); params.status = patch.status; }
  if (patch.resolvedSummary !== undefined) { sets.push("resolved_summary = @resolved_summary"); params.resolved_summary = patch.resolvedSummary; }
  if (patch.comment !== undefined) { sets.push("comment = @comment"); params.comment = patch.comment; }
  db.prepare(`UPDATE annotations SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getAnnotation(projectRoot, id);
}

export function appendThread(projectRoot: string, id: string, entry: AnnotationThreadEntry): AnnotationRecord | null {
  const db = open(projectRoot);
  const existing = getAnnotation(projectRoot, id);
  if (!existing) return null;
  const next = [...existing.thread, { ...entry, at: entry.at ?? Date.now() }];
  db.prepare("UPDATE annotations SET thread = @thread, updated_at = @updated_at WHERE id = @id").run({
    id,
    thread: JSON.stringify(next),
    updated_at: Date.now(),
  });
  return getAnnotation(projectRoot, id);
}

export function deleteAnnotation(projectRoot: string, id: string): boolean {
  const db = open(projectRoot);
  const result = db.prepare("DELETE FROM annotations WHERE id = ?").run(id);
  return result.changes > 0;
}

export function deleteAllAnnotations(projectRoot: string): number {
  const db = open(projectRoot);
  const result = db.prepare("DELETE FROM annotations").run();
  return result.changes;
}
