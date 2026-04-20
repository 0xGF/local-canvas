import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreateSession, currentSessionId } from "../agentation.js";

/**
 * Regression tests for the session-identity + coalescing fix.
 * Context:
 *   Pre-fix, getOrCreateSession keyed on window.location.href. Any subtle URL
 *   change (hash fragment, query param, SPA route) triggered a fresh session
 *   POST, and concurrent callers (AnnotationPins + AskAIHistory mounting in
 *   the same tick, or StrictMode's double-mount) each opened their own.
 *   The symptom in the agentation HTTP log was two distinct session IDs
 *   being polled simultaneously, and posted annotations never showing up.
 */

declare const global: typeof globalThis;

function stubFetch(postResponses: string[] = ["session-1", "session-2"]) {
  let postIdx = 0;
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === "POST" && url.endsWith("/sessions")) {
      const id = postResponses[Math.min(postIdx, postResponses.length - 1)];
      postIdx++;
      return {
        ok: true,
        json: async () => ({ id, url, annotations: [] }),
      };
    }
    return { ok: true, json: async () => ({ annotations: [] }) };
  });
  // @ts-expect-error test stub
  global.fetch = fetchMock;
  return fetchMock;
}

function setHref(href: string) {
  // jsdom lets us reassign location via Object.defineProperty on window
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
  });
}

// Reset the module between tests so the internal _sessionId/_sessionUrl/_sessionPromise
// globals in agentation.ts start clean.
async function freshAgentation() {
  vi.resetModules();
  return import("../agentation.js");
}

describe("getOrCreateSession — session identity", () => {
  beforeEach(() => {
    setHref("http://localhost:6966/overview");
  });

  it("reuses the same session when the URL only differs by hash", async () => {
    const { getOrCreateSession } = await freshAgentation();
    stubFetch(["session-A", "session-B"]);

    const first = await getOrCreateSession();
    setHref("http://localhost:6966/overview#section-2");
    const second = await getOrCreateSession();

    expect(first).toBe("session-A");
    expect(second).toBe("session-A");
  });

  it("reuses the same session when the URL only differs by query string", async () => {
    const { getOrCreateSession } = await freshAgentation();
    stubFetch(["session-A", "session-B"]);

    const first = await getOrCreateSession();
    setHref("http://localhost:6966/overview?tab=install");
    const second = await getOrCreateSession();

    expect(first).toBe("session-A");
    expect(second).toBe("session-A");
  });

  it("creates a new session when the pathname actually changes", async () => {
    const { getOrCreateSession } = await freshAgentation();
    stubFetch(["session-A", "session-B"]);

    const first = await getOrCreateSession();
    setHref("http://localhost:6966/install");
    const second = await getOrCreateSession();

    expect(first).toBe("session-A");
    expect(second).toBe("session-B");
  });
});

describe("getOrCreateSession — concurrent call coalescing", () => {
  beforeEach(() => {
    setHref("http://localhost:6966/overview");
  });

  it("returns the same session id for concurrent callers (no double POST)", async () => {
    const { getOrCreateSession } = await freshAgentation();
    const fetchMock = stubFetch(["session-A", "session-B"]);

    const [a, b, c] = await Promise.all([
      getOrCreateSession(),
      getOrCreateSession(),
      getOrCreateSession(),
    ]);

    expect(a).toBe("session-A");
    expect(b).toBe("session-A");
    expect(c).toBe("session-A");
    // Exactly one POST /sessions, no matter how many concurrent callers.
    const posts = fetchMock.mock.calls.filter(
      ([, init]: [string, { method?: string }?]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(1);
  });
});

describe("currentSessionId", () => {
  beforeEach(() => {
    setHref("http://localhost:6966/overview");
  });

  it("is null before getOrCreateSession has resolved", async () => {
    const { currentSessionId } = await freshAgentation();
    expect(currentSessionId()).toBeNull();
  });

  it("returns the cached id after getOrCreateSession resolves", async () => {
    const agentation = await freshAgentation();
    stubFetch(["session-A"]);
    await agentation.getOrCreateSession();
    expect(agentation.currentSessionId()).toBe("session-A");
  });
});
