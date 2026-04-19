import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, relative, sep, isAbsolute } from "path";

/**
 * Per-project on-disk snapshot store for agent-driven edits.
 *
 * Agents (Claude Code and similar, via the MCP bridge) are expected to record
 * the pre-edit contents of any file they're about to touch in response to an
 * annotation before they write the change. This gives the user a one-click
 * "undo the last agent change" affordance without relying on git or the
 * agent's own tool-call log.
 *
 * Layout: `${projectRoot}/.canvas-undo/snapshots.json` with a FIFO ring of
 * the MAX_ENTRIES most recent snapshots. Project-relative paths only — we
 * refuse anything that escapes the root.
 */

const MAX_ENTRIES = 10;
const STORE_DIR = ".canvas-undo";
const STORE_FILE = "snapshots.json";

export interface SnapshotFile {
  /** Path relative to the project root, forward-slash separated. */
  path: string;
  /** Verbatim pre-edit content of the file. */
  contentBefore: string;
}

export interface Snapshot {
  annotationId: string;
  files: SnapshotFile[];
  /** ISO timestamp at record time — used to order entries and to show in the UI. */
  createdAt: string;
  /** Optional human-readable summary the agent can fill in (e.g. "Added text-blue-600 to h2 in Overview.tsx"). */
  summary?: string;
}

function storePath(projectRoot: string): string {
  return resolve(projectRoot, STORE_DIR, STORE_FILE);
}

function readStore(projectRoot: string): Snapshot[] {
  const p = storePath(projectRoot);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted file — start fresh rather than failing subsequent edits.
    return [];
  }
}

function writeStore(projectRoot: string, entries: Snapshot[]) {
  const p = storePath(projectRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(entries, null, 2));
}

/** Reject paths that try to escape the project root via `..` or an absolute path. */
function isSafeRelativePath(projectRoot: string, relPath: string): boolean {
  if (!relPath) return false;
  // Absolute inputs (Unix `/…`, Windows `C:\…` or `\\server\share`) are rejected
  // outright — snapshots are keyed by project-relative paths only.
  if (isAbsolute(relPath)) return false;
  const resolved = resolve(projectRoot, relPath);
  const r = relative(projectRoot, resolved);
  // `r` is empty when the caller passed the project root itself; `..` or
  // `../…` means the resolved path escaped the root.
  return !!r && !r.startsWith("..") && !r.startsWith(sep + "..");
}

/**
 * Record a new snapshot. FIFO-trimmed to MAX_ENTRIES — the oldest entry is
 * dropped when a new one pushes over the limit.
 */
export function recordSnapshot(
  projectRoot: string,
  input: { annotationId: string; files: SnapshotFile[]; summary?: string },
): Snapshot {
  if (!input.annotationId) throw new Error("annotationId is required");
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error("at least one file is required");
  }
  for (const f of input.files) {
    if (!isSafeRelativePath(projectRoot, f.path)) {
      throw new Error(`unsafe file path: ${f.path}`);
    }
    if (typeof f.contentBefore !== "string") {
      throw new Error(`contentBefore must be a string for ${f.path}`);
    }
  }

  const entries = readStore(projectRoot)
    // Replace any existing entry for this annotation so re-edits don't
    // clutter the ring — the newest snapshot is the one we'd restore.
    .filter(s => s.annotationId !== input.annotationId);
  const snapshot: Snapshot = {
    annotationId: input.annotationId,
    files: input.files,
    createdAt: new Date().toISOString(),
    summary: input.summary,
  };
  entries.push(snapshot);
  while (entries.length > MAX_ENTRIES) entries.shift();
  writeStore(projectRoot, entries);
  return snapshot;
}

/** List current snapshots, newest first, without the verbatim file bodies. */
export function listSnapshots(projectRoot: string): Array<Omit<Snapshot, "files"> & { files: string[] }> {
  return readStore(projectRoot)
    .slice()
    .reverse()
    .map(s => ({
      annotationId: s.annotationId,
      createdAt: s.createdAt,
      summary: s.summary,
      files: s.files.map(f => f.path),
    }));
}

/**
 * Dev-only helper: pretend an agent just edited a file. Snapshots the current
 * content, then prepends a visible marker line so the user can see that
 * something changed — and that clicking Undo actually restores it. Returns
 * the absolute path that was modified, or null if the file doesn't exist.
 */
export function simulateAgentEdit(
  projectRoot: string,
  annotationId: string,
  relPath: string,
): { filePath: string; summary: string } | null {
  if (!isSafeRelativePath(projectRoot, relPath)) return null;
  const abs = resolve(projectRoot, relPath);
  if (!existsSync(abs)) return null;
  const before = readFileSync(abs, "utf-8");
  recordSnapshot(projectRoot, {
    annotationId,
    files: [{ path: relPath, contentBefore: before }],
    summary: `simulated edit to ${relPath.split("/").pop()}`,
  });
  const marker = `// [canvas simulate] agent edit @ ${new Date().toISOString()}\n`;
  writeFileSync(abs, marker + before);
  return { filePath: relPath, summary: `simulated edit to ${relPath.split("/").pop()}` };
}

/**
 * Restore the files from the snapshot with the given annotationId, then
 * drop the entry. Returns the restored file paths (or null if no snapshot
 * exists for that id).
 */
export function applyUndo(projectRoot: string, annotationId: string): { restored: string[]; summary?: string } | null {
  const entries = readStore(projectRoot);
  const idx = entries.findIndex(s => s.annotationId === annotationId);
  if (idx < 0) return null;
  const snap = entries[idx];
  for (const f of snap.files) {
    if (!isSafeRelativePath(projectRoot, f.path)) continue;
    const abs = resolve(projectRoot, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.contentBefore);
  }
  entries.splice(idx, 1);
  writeStore(projectRoot, entries);
  return { restored: snap.files.map(f => f.path), summary: snap.summary };
}
