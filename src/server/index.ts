import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createProxy } from "../proxy/index.js";
import { createWSHandler } from "./ws-handler.js";
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

