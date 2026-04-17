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

