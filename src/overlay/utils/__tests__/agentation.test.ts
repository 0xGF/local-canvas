import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  findElementForAnnotation,
  scrollToAndOpenAnnotation,
  dispatchOpenAnnotationPin,
  dispatchNavigatePin,
  dispatchToggleAIHistory,
} from "../agentation.js";

describe("findElementForAnnotation", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("button");
    el.setAttribute("data-source-file", "src/components/Foo.tsx");
    el.setAttribute("data-source-line", "42");
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  it("resolves an elementPath to the matching DOM element", () => {
    const found = findElementForAnnotation({
      elementPath: "src/components/Foo.tsx:42",
    });
    expect(found).toBe(el);
  });

  it("returns null when elementPath is missing", () => {
    expect(findElementForAnnotation({ elementPath: "" })).toBeNull();
  });

  it("returns null when elementPath has no line suffix", () => {
    expect(findElementForAnnotation({ elementPath: "src/Foo.tsx" })).toBeNull();
  });

  it("returns null when no matching element exists", () => {
    const found = findElementForAnnotation({
      elementPath: "src/components/Foo.tsx:999",
    });
    expect(found).toBeNull();
  });

  it("handles paths with colons (e.g. Windows-like drive letters) by using last colon", () => {
    const weird = document.createElement("div");
    weird.setAttribute("data-source-file", "src/a:b.tsx");
    weird.setAttribute("data-source-line", "7");
    document.body.appendChild(weird);
    try {
      const found = findElementForAnnotation({ elementPath: "src/a:b.tsx:7" });
      expect(found).toBe(weird);
    } finally {
      weird.remove();
    }
  });
});

describe("dispatchOpenAnnotationPin", () => {
  it("dispatches a CustomEvent with the annotation id", () => {
    const listener = vi.fn();
    window.addEventListener("canvas:open-annotation-pin", listener as EventListener);
    try {
      dispatchOpenAnnotationPin("abc-123");
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<{ annotationId: string }>;
      expect(event.detail?.annotationId).toBe("abc-123");
    } finally {
      window.removeEventListener("canvas:open-annotation-pin", listener as EventListener);
    }
  });
});

describe("scrollToAndOpenAnnotation", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("section");
    el.setAttribute("data-source-file", "src/Bar.tsx");
    el.setAttribute("data-source-line", "10");
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  it("scrolls the target element into view and dispatches the open event", () => {
    const scrollSpy = vi.fn();
    el.scrollIntoView = scrollSpy;
    const listener = vi.fn();
    window.addEventListener("canvas:open-annotation-pin", listener as EventListener);

    try {
      scrollToAndOpenAnnotation({ id: "xyz", elementPath: "src/Bar.tsx:10" });
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<{ annotationId: string }>;
      expect(event.detail?.annotationId).toBe("xyz");
    } finally {
      window.removeEventListener("canvas:open-annotation-pin", listener as EventListener);
    }
  });

  it("still dispatches the open event when the element can't be found", () => {
    const listener = vi.fn();
    window.addEventListener("canvas:open-annotation-pin", listener as EventListener);

    try {
      scrollToAndOpenAnnotation({ id: "no-match", elementPath: "src/Missing.tsx:1" });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("canvas:open-annotation-pin", listener as EventListener);
    }
  });

  it("falls back to scrollIntoView() without options when smooth-scroll throws", () => {
    const scrollSpy = vi.fn().mockImplementationOnce(() => { throw new Error("unsupported options"); });
    el.scrollIntoView = scrollSpy;

    scrollToAndOpenAnnotation({ id: "a", elementPath: "src/Bar.tsx:10" });
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    expect(scrollSpy.mock.calls[1]).toEqual([]);
  });
});

describe("dispatchNavigatePin", () => {
  it.each(["prev", "next", "first", "last"] as const)(
    "dispatches canvas:navigate-pin with direction=%s",
    (direction) => {
      const listener = vi.fn();
      window.addEventListener("canvas:navigate-pin", listener as EventListener);
      try {
        dispatchNavigatePin(direction);
        expect(listener).toHaveBeenCalledTimes(1);
        const ev = listener.mock.calls[0][0] as CustomEvent<{ direction: string }>;
        expect(ev.detail?.direction).toBe(direction);
      } finally {
        window.removeEventListener("canvas:navigate-pin", listener as EventListener);
      }
    },
  );
});

describe("dispatchToggleAIHistory", () => {
  it("dispatches a canvas:toggle-ai-history event", () => {
    const listener = vi.fn();
    window.addEventListener("canvas:toggle-ai-history", listener as EventListener);
    try {
      dispatchToggleAIHistory();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("canvas:toggle-ai-history", listener as EventListener);
    }
  });
});

describe("postAnnotation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs to /__canvas/annotations and dispatches the posted event", async () => {
    const { postAnnotation } = await import("../agentation.js");

    const fakeAnnotation = { id: "ann-1", comment: "hi", elementPath: "f:1" };
    const postCalls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "/__canvas/annotations" && init?.method === "POST") {
        postCalls.push({ url: u, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(fakeAnnotation), { status: 200 });
      }
      throw new Error("unexpected fetch: " + u);
    }) as typeof fetch;

    const listener = vi.fn();
    window.addEventListener("canvas:annotation-posted", listener as EventListener);
    try {
      const result = await postAnnotation({
        comment: "hi",
        element: "<div>",
        elementPath: "f:1",
      });
      expect(result).toMatchObject(fakeAnnotation);
      expect(postCalls).toHaveLength(1);
      expect(postCalls[0].body).toMatchObject({
        comment: "hi",
        elementPath: "f:1",
        url: expect.stringContaining("http"),
      });
      expect(listener).toHaveBeenCalledTimes(1);
      const ev = listener.mock.calls[0][0] as CustomEvent<{ annotation: { id: string } }>;
      expect(ev.detail?.annotation?.id).toBe("ann-1");
    } finally {
      window.removeEventListener("canvas:annotation-posted", listener as EventListener);
    }
  });
});
