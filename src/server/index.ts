import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createProxy } from "../proxy/index.js";
import { createWSHandler } from "./ws-handler.js";
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

  // Resolve overlay bundle path
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const overlayPath = resolve(__dirname, "../overlay/overlay.iife.js");

  // Per-encoding cache keyed by mtime so we don't re-compress on every request.
  let overlayCache: { mtime: number; raw: Buffer; gzip?: Buffer; br?: Buffer } | null = null;
  function loadOverlay() {
    if (!existsSync(overlayPath)) return null;
    const mtime = statSync(overlayPath).mtimeMs;
    if (!overlayCache || overlayCache.mtime !== mtime) {
      overlayCache = { mtime, raw: readFileSync(overlayPath) };
    }
    return overlayCache;
  }

  const proxy = createProxy({ targetHost, targetPort });

  const server = createHttpServer((req, res) => {
    // Serve the overlay script (read fresh each time for dev reload)
    if (req.url === "/__canvas/overlay.js") {
      const entry = loadOverlay();
      if (!entry) {
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        res.end("");
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
    server.listen(serverPort, () => resolve());
  });
}

