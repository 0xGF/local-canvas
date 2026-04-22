import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, sep } from "path";
import { recordSnapshot, listSnapshots, applyUndo } from "../agent-undo.js";

/**
 * Regression tests for the path-safety check + snapshot round-trip. The
 * previous `isSafeRelativePath` implementation always returned false on Unix
 * (it ended with `!resolve(relPath).startsWith(sep)`, which `resolve` makes
 * always-true), so nothing ever got snapshotted. These assertions would all
 * fail against that version.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "canvas-undo-test-"));
  mkdirSync(join(root, "src", "components"), { recursive: true });
  writeFileSync(join(root, "src", "components", "Header.tsx"), "export const Header = () => <h1>orig</h1>;\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("recordSnapshot + applyUndo", () => {
  it("round-trips a single-file snapshot", () => {
    const rel = "src/components/Header.tsx";
    const before = readFileSync(join(root, rel), "utf-8");

    recordSnapshot(root, {
      annotationId: "ann-1",
      files: [{ path: rel, contentBefore: before }],
      summary: "test",
    });

    // Simulate an agent edit after the snapshot.
    writeFileSync(join(root, rel), "after\n");
    expect(readFileSync(join(root, rel), "utf-8")).toBe("after\n");

    const res = applyUndo(root, "ann-1");
    expect(res).not.toBeNull();
    expect(res!.restored).toEqual([rel]);
    expect(readFileSync(join(root, rel), "utf-8")).toBe(before);
  });

  it("listSnapshots returns metadata with the file paths", () => {
    recordSnapshot(root, {
      annotationId: "ann-2",
      files: [{ path: "src/components/Header.tsx", contentBefore: "x" }],
      summary: "header tweak",
    });
    const list = listSnapshots(root);
    expect(list).toHaveLength(1);
    expect(list[0].annotationId).toBe("ann-2");
    expect(list[0].summary).toBe("header tweak");
    expect(list[0].files).toEqual(["src/components/Header.tsx"]);
  });

  it("replaces an existing entry for the same annotation instead of piling up", () => {
    recordSnapshot(root, { annotationId: "ann-3", files: [{ path: "src/components/Header.tsx", contentBefore: "v1" }] });
    recordSnapshot(root, { annotationId: "ann-3", files: [{ path: "src/components/Header.tsx", contentBefore: "v2" }] });
    const list = listSnapshots(root);
    expect(list).toHaveLength(1);
    // Restoring should reproduce the newest-recorded content.
    applyUndo(root, "ann-3");
    expect(readFileSync(join(root, "src/components/Header.tsx"), "utf-8")).toBe("v2");
  });
});

describe("path safety", () => {
  it("rejects absolute paths", () => {
    expect(() =>
      recordSnapshot(root, {
        annotationId: "x",
        files: [{ path: "/etc/passwd", contentBefore: "" }],
      }),
    ).toThrow(/unsafe file path/);
  });

  it("rejects parent-directory escape attempts", () => {
    expect(() =>
      recordSnapshot(root, {
        annotationId: "x",
        files: [{ path: "../outside.txt", contentBefore: "" }],
      }),
    ).toThrow(/unsafe file path/);
    expect(() =>
      recordSnapshot(root, {
        annotationId: "x",
        files: [{ path: `..${sep}outside.txt`, contentBefore: "" }],
      }),
    ).toThrow(/unsafe file path/);
  });

  it("accepts nested relative paths", () => {
    expect(() =>
      recordSnapshot(root, {
        annotationId: "x",
        files: [{ path: "src/components/Header.tsx", contentBefore: "" }],
      }),
    ).not.toThrow();
  });

});

describe("store integrity", () => {
  it("does not create the store dir if no snapshots were ever recorded", () => {
    expect(existsSync(join(root, ".canvas-undo"))).toBe(false);
    expect(listSnapshots(root)).toEqual([]);
  });

  it("FIFO-trims to the ring size", () => {
    for (let i = 0; i < 15; i++) {
      recordSnapshot(root, {
        annotationId: `ann-${i}`,
        files: [{ path: "src/components/Header.tsx", contentBefore: `v${i}` }],
      });
    }
    const list = listSnapshots(root);
    expect(list).toHaveLength(10);
    // Newest first: ann-14 at index 0, ann-5 at index 9.
    expect(list[0].annotationId).toBe("ann-14");
    expect(list[9].annotationId).toBe("ann-5");
  });
});
