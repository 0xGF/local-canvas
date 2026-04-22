import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createProxy } from "../proxy/index.js";
import { createWSHandler } from "./ws-handler.js";
import { recordSnapshot, listSnapshots, applyUndo } from "./agent-undo.js";
import {
  createAnnotation,
  listAnnotations,
  getAnnotation,
  updateAnnotation,
  appendThread,
  deleteAnnotation,
  deleteAllAnnotations,
} from "./annotations-store.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, statSync } from "fs";
import { brotliCompressSync, gzipSync } from "zlib";

interface ServerOptions {
  targetHost: string;
  targetPort: number;
  serverPort: number;
  projectRoot?: string;
}

export async function createServer(options: ServerOptions) {
  const { targetHost, targetPort, serverPort } = options;
  const projectRoot = options.projectRoot || process.cwd();

  // Resolve overlay bundle dir — serves the entry and any split chunks.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const overlayDir = resolve(__dirname, "../overlay");

  // Per-asset cache keyed by mtime so we don't re-compress on every request.
  const assetCache = new Map<string, { mtime: number; raw: Buffer; gzip?: Buffer; br?: Buffer }>();
  function loadAsset(name: string) {
    // Plain filenames only — reject anything that looks like traversal.
    if (!/^[\w.-]+\.js$/.test(name)) return null;
    const p = resolve(overlayDir, name);
    if (!existsSync(p)) return null;
    const mtime = statSync(p).mtimeMs;
    let entry = assetCache.get(name);
    if (!entry || entry.mtime !== mtime) {
      entry = { mtime, raw: readFileSync(p) };
      assetCache.set(name, entry);
    }
    return entry;
  }

  const proxy = createProxy({ targetHost, targetPort });

  const server = createHttpServer((req, res) => {
    // Serve overlay entry + dynamic chunks from /__canvas/*.js.
    const url = req.url || "";
    if (url.startsWith("/__canvas/") && url.endsWith(".js")) {
      const name = url.slice("/__canvas/".length);
      const entry = loadAsset(name);
      if (!entry) {
        // Keep legacy behaviour: empty 200 when the main bundle hasn't been built yet.
        if (name === "overlay.js") {
          res.writeHead(200, {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
          });
          res.end("");
          return;
        }
        res.writeHead(404).end();
        return;
      }
      const accept = String(req.headers["accept-encoding"] || "");
      let body: Buffer = entry.raw;
      let encoding: string | null = null;
      if (/\bbr\b/.test(accept)) {
        entry.br ??= brotliCompressSync(entry.raw);
        body = entry.br; encoding = "br";
      } else if (/\bgzip\b/.test(accept)) {
        entry.gzip ??= gzipSync(entry.raw);
        body = entry.gzip; encoding = "gzip";
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "Vary": "Accept-Encoding",
      };
      if (encoding) headers["Content-Encoding"] = encoding;
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    // Serve canvas editor config/status
    if (req.url === "/__canvas/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "0.1.0", projectRoot }));
      return;
    }

    // Agent-undo endpoints — see src/server/agent-undo.ts for layout.
    //
    // These are same-origin only: the overlay is served by this same editor
    // proxy, so its `fetch("/__canvas/…")` calls land here without CORS. We
    // deliberately do NOT set Access-Control-Allow-Origin — with these
    // endpoints writing/restoring project files, wildcard CORS would let any
    // site the user visits drive them via a cross-origin POST. `isLocalSameOrigin`
    // is belt-and-braces: it rejects cross-origin POSTs that carry an Origin or
    // Referer pointing anywhere other than this server, catching preflight-less
    // requests (simple content types) that otherwise slip past the browser.
    if (req.url === "/__canvas/agent-snapshot" && req.method === "POST") {
      if (!isLocalSameOrigin(req, serverPort)) { res.writeHead(403).end(); return; }
      readJsonBody(req).then((raw) => {
        try {
          const body = (raw ?? {}) as Record<string, unknown>;
          const snap = recordSnapshot(projectRoot, {
            annotationId: String(body.annotationId ?? ""),
            files: Array.isArray(body.files) ? body.files as never : [],
            summary: typeof body.summary === "string" ? body.summary : undefined,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, annotationId: snap.annotationId, createdAt: snap.createdAt }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      }).catch(() => {
        res.writeHead(400).end();
      });
      return;
    }
    if (req.url === "/__canvas/agent-undo" && req.method === "GET") {
      if (!isLocalSameOrigin(req, serverPort)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(listSnapshots(projectRoot)));
      return;
    }
    // ── Annotations API ──
    //
    // Storage lives at `{projectRoot}/.canvas-data/annotations.db`. The
    // overlay is the primary writer via these same-origin endpoints; the MCP
    // server (src/mcp/server.ts) talks to the same endpoints over HTTP so
    // both readers/writers go through a single in-process store.
    // Match on pathname only — the list endpoint uses `?url=...` and the
    // whole-URL match fails when a query string is present.
    const pathname = (req.url || "").split("?", 1)[0];
    const annotationsMatch = pathname.match(/^\/__canvas\/annotations(?:\/(.*))?$/);
    if (annotationsMatch) {
      if (!isLocalSameOrigin(req, serverPort)) { res.writeHead(403).end(); return; }
      const tail = annotationsMatch[1] ?? "";
      handleAnnotationsRoute(tail, req, res, projectRoot).catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      });
      return;
    }
    if (req.url === "/__canvas/agent-undo" && req.method === "POST") {
      if (!isLocalSameOrigin(req, serverPort)) { res.writeHead(403).end(); return; }
      readJsonBody(req).then((raw) => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const id = String(body.annotationId ?? "");
        if (!id) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "annotationId required" }));
          return;
        }
        const result = applyUndo(projectRoot, id);
        if (!result) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "no snapshot for this annotation" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, restored: result.restored, summary: result.summary }));
      }).catch(() => {
        res.writeHead(400).end();
      });
      return;
    }

    // Proxy everything else
    proxy.web(req, res);
  });

  // WebSocket upgrade
  const wss = new WebSocketServer({
    noServer: true,
    // permessage-deflate: ws handles negotiation; browser client opts in automatically.
    // Threshold avoids compressing trivially small frames where overhead wins.
    perMessageDeflate: { threshold: 256 },
  });
  const wsHandler = createWSHandler(projectRoot);

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/__canvas/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
        wsHandler(ws);
      });
    } else {
      // Proxy WebSocket connections (e.g., dev server HMR)
      proxy.ws(req, socket, head);
    }
  });

  return new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    // Bind to loopback only — the editor exposes endpoints that read/write
    // project files, so we never want it reachable from the LAN or through
    // accidental port-forwards. Override with CANVAS_BIND if you deliberately
    // need LAN access (e.g. testing on a phone); the same-origin gate in
    // isLocalSameOrigin will still apply.
    const host = process.env.CANVAS_BIND || "127.0.0.1";
    server.listen(serverPort, host, () => resolve());
  });
}

/** Reject requests that originated from a different origin. Because we set
 *  no Access-Control-Allow-Origin header, the browser already blocks the
 *  response from being read cross-origin for preflighted requests — but a
 *  simple request (POST with `text/plain` etc.) will still hit the server and
 *  execute its side effect before the browser checks CORS. This function
 *  rejects those: if the request has an Origin header, it must match our host;
 *  if it has no Origin (e.g. a same-origin fetch in some browsers, or tools
 *  like curl), we fall back to Referer — and allow the request only if the
 *  host also matches, or if there's no Referer at all (curl, MCP clients). */
function isLocalSameOrigin(req: import("http").IncomingMessage, serverPort: number): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const check = (urlStr: string | undefined): boolean | null => {
    if (!urlStr) return null;
    try {
      const u = new URL(urlStr);
      const portMatches = (u.port || (u.protocol === "https:" ? "443" : "80")) === String(serverPort);
      const hostIsLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
      return portMatches && hostIsLocal;
    } catch {
      return false;
    }
  };
  const originCheck = check(origin);
  if (originCheck !== null) return originCheck;
  const refererCheck = check(referer);
  if (refererCheck !== null) return refererCheck;
  // No Origin and no Referer — almost always a non-browser caller (curl, MCP
  // client, or a same-origin fetch without these headers). Browsers attach
  // Origin to every cross-origin request, so the absence is safe to trust.
  return true;
}

/** Read a JSON body from an incoming request, capped at 2 MB so a pathological
 *  snapshot payload can't exhaust memory. */
function readJsonBody(req: import("http").IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolveBody({});
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/**
 * Routes `/__canvas/annotations[/rest]` requests to the sqlite store.
 * Route table:
 *   GET    /__canvas/annotations               list (optional ?url=... filter)
 *   POST   /__canvas/annotations               create (body: comment, elementPath, url, …)
 *   DELETE /__canvas/annotations               wipe all (the "Clear all" button)
 *   GET    /__canvas/annotations/pending       list status=pending across all URLs
 *   GET    /__canvas/annotations/:id           single annotation
 *   PATCH  /__canvas/annotations/:id           update status/summary/comment
 *   DELETE /__canvas/annotations/:id           delete one
 *   POST   /__canvas/annotations/:id/thread    append an agent/user thread entry
 */
async function handleAnnotationsRoute(
  tail: string,
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  projectRoot: string,
): Promise<void> {
  const method = req.method || "GET";
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const urlObj = new URL(req.url || "/", "http://localhost");

  // Collection endpoints
  if (tail === "" || tail === "/") {
    if (method === "GET") {
      const url = urlObj.searchParams.get("url") || undefined;
      const status = (urlObj.searchParams.get("status") as "pending" | "in_progress" | "needs_input" | "resolved" | "dismissed" | null) || undefined;
      return json(200, listAnnotations(projectRoot, { url, status: status || undefined }));
    }
    if (method === "POST") {
      const body = (await readJsonBody(req) ?? {}) as Record<string, unknown>;
      if (!body.comment || !body.elementPath || !body.url) {
        return json(400, { ok: false, error: "comment, elementPath, url required" });
      }
      const annotation = createAnnotation(projectRoot, {
        url: String(body.url),
        comment: String(body.comment),
        element: typeof body.element === "string" ? body.element : "",
        elementPath: String(body.elementPath),
        elementPaths: Array.isArray(body.elementPaths) ? body.elementPaths as string[] : undefined,
        cssClasses: typeof body.cssClasses === "string" ? body.cssClasses : undefined,
        x: typeof body.x === "number" ? body.x : undefined,
        y: typeof body.y === "number" ? body.y : undefined,
        boundingBox: body.boundingBox as { x: number; y: number; width: number; height: number } | undefined,
        timestamp: typeof body.timestamp === "number" ? body.timestamp : undefined,
      });
      return json(200, annotation);
    }
    if (method === "DELETE") {
      const deleted = deleteAllAnnotations(projectRoot);
      return json(200, { ok: true, deleted });
    }
    return json(405, { ok: false, error: "method not allowed" });
  }

  if (tail === "pending") {
    if (method !== "GET") return json(405, { ok: false, error: "method not allowed" });
    return json(200, listAnnotations(projectRoot, { status: "pending" }));
  }

  // Per-annotation endpoints: /:id or /:id/thread
  const idMatch = tail.match(/^([^/]+)(?:\/(.+))?$/);
  if (!idMatch) return json(404, { ok: false, error: "not found" });
  const id = idMatch[1];
  const sub = idMatch[2];

  if (!sub) {
    if (method === "GET") {
      const a = getAnnotation(projectRoot, id);
      if (!a) return json(404, { ok: false, error: "not found" });
      return json(200, a);
    }
    if (method === "PATCH") {
      const body = (await readJsonBody(req) ?? {}) as Record<string, unknown>;
      const updated = updateAnnotation(projectRoot, id, {
        status: body.status as "pending" | "in_progress" | "needs_input" | "resolved" | "dismissed" | undefined,
        resolvedSummary: typeof body.resolvedSummary === "string" ? body.resolvedSummary : undefined,
        comment: typeof body.comment === "string" ? body.comment : undefined,
      });
      if (!updated) return json(404, { ok: false, error: "not found" });
      return json(200, updated);
    }
    if (method === "DELETE") {
      const ok = deleteAnnotation(projectRoot, id);
      return json(ok ? 200 : 404, { ok });
    }
    return json(405, { ok: false, error: "method not allowed" });
  }

  if (sub === "thread" && method === "POST") {
    const body = (await readJsonBody(req) ?? {}) as Record<string, unknown>;
    if (!body.role || !body.content) return json(400, { ok: false, error: "role, content required" });
    const updated = appendThread(projectRoot, id, {
      role: String(body.role),
      content: String(body.content),
      at: typeof body.at === "number" ? body.at : undefined,
    });
    if (!updated) return json(404, { ok: false, error: "not found" });
    return json(200, updated);
  }

  return json(404, { ok: false, error: "not found" });
}

