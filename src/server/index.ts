import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createProxy } from "../proxy/index.js";
import { createWSHandler } from "./ws-handler.js";
import { recordSnapshot, listSnapshots, applyUndo } from "./agent-undo.js";
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
    if (req.url === "/__canvas/agent-snapshot" && req.method === "POST") {
      readJsonBody(req).then((raw) => {
        try {
          const body = (raw ?? {}) as Record<string, unknown>;
          const snap = recordSnapshot(projectRoot, {
            annotationId: String(body.annotationId ?? ""),
            files: Array.isArray(body.files) ? body.files as never : [],
            summary: typeof body.summary === "string" ? body.summary : undefined,
          });
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: true, annotationId: snap.annotationId, createdAt: snap.createdAt }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      }).catch(() => {
        res.writeHead(400).end();
      });
      return;
    }
    if (req.url === "/__canvas/agent-undo" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(listSnapshots(projectRoot)));
      return;
    }
    if (req.url === "/__canvas/agent-undo" && req.method === "POST") {
      readJsonBody(req).then((raw) => {
        const body = (raw ?? {}) as Record<string, unknown>;
        const id = String(body.annotationId ?? "");
        if (!id) {
          res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: false, error: "annotationId required" }));
          return;
        }
        const result = applyUndo(projectRoot, id);
        if (!result) {
          res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: false, error: "no snapshot for this annotation" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
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

