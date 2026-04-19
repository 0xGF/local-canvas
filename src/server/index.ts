import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createProxy } from "../proxy/index.js";
import { createWSHandler } from "./ws-handler.js";
import { recordSnapshot, listSnapshots, applyUndo, simulateAgentEdit } from "./agent-undo.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";

interface ServerOptions {
  targetHost: string;
  targetPort: number;
  serverPort: number;
  projectRoot?: string;
}

export async function createServer(options: ServerOptions) {
  const { targetHost, targetPort, serverPort } = options;
  const projectRoot = options.projectRoot || process.cwd();

  // Resolve overlay bundle path
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const overlayPath = resolve(__dirname, "../overlay/overlay.iife.js");

  const proxy = createProxy({ targetHost, targetPort });

  const server = createHttpServer((req, res) => {
    // Serve the overlay script (read fresh each time for dev reload)
    if (req.url === "/__canvas/overlay.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(existsSync(overlayPath) ? readFileSync(overlayPath, "utf-8") : "");
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
    if (req.url === "/__canvas/agent-simulate" && req.method === "POST") {
      if (!isLocalSameOrigin(req, serverPort)) { res.writeHead(403).end(); return; }
      readJsonBody(req).then((raw) => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const id = String(body.annotationId ?? "");
        const rel = String(body.filePath ?? "");
        if (!id || !rel) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "annotationId and filePath required" }));
          return;
        }
        try {
          const result = simulateAgentEdit(projectRoot, id, rel);
          if (!result) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "file not found or unsafe path" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      }).catch(() => {
        res.writeHead(400).end();
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
  const wss = new WebSocketServer({ noServer: true });
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
    server.listen(serverPort, () => resolve());
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

