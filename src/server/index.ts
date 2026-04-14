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

  let overlayBundle = "";
  if (existsSync(overlayPath)) {
    overlayBundle = readFileSync(overlayPath, "utf-8");
  }

  const proxy = createProxy({ targetHost, targetPort });

  const server = createHttpServer((req, res) => {
    // Serve the overlay script
    if (req.url === "/__canvas/overlay.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(overlayBundle);
      return;
    }

    // Serve canvas editor config/status
    if (req.url === "/__canvas/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "0.1.0", projectRoot }));
      return;
    }

    // Component preview — rewrite to proxy through Vite so React imports resolve
    if (req.url === "/__canvas/component-preview") {
      req.url = "/?__canvas_component_preview";
      proxy.web(req, res);
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

function getComponentPreviewHTML(): string {
  // Uses the dev server's module resolver (proxied through our server)
  // to dynamically import React and the target component.
  // Works with Vite, Next, Webpack dev server, or any bundler that serves
  // node_modules via HTTP during development.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Component Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body { font-family: system-ui, sans-serif; background: #fff; }
    #preview-root { padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .empty { color: #888; font-size: 13px; text-align: center; }
    .error { color: #f24822; font-size: 12px; font-family: monospace; white-space: pre-wrap; padding: 16px; }
  </style>
</head>
<body>
  <div id="preview-root"><p class="empty">Select a component</p></div>
  <script type="module">
    let React, ReactDOM, root;
    const el = document.getElementById("preview-root");

    async function init() {
      // Try multiple import paths — works across Vite, Webpack, and other bundlers
      try { React = await import("/node_modules/.vite/deps/react.js"); } catch {}
      if (!React) try { React = await import("react"); } catch {}
      if (!React) try { React = await import("/node_modules/react/index.js"); } catch {}
      if (!React) { el.innerHTML = '<p class="error">Could not load React</p>'; return; }

      try { ReactDOM = await import("/node_modules/.vite/deps/react-dom_client.js"); } catch {}
      if (!ReactDOM) try { ReactDOM = await import("react-dom/client"); } catch {}
      if (!ReactDOM) try { ReactDOM = await import("/node_modules/react-dom/client.js"); } catch {}
      if (!ReactDOM) { el.innerHTML = '<p class="error">Could not load ReactDOM</p>'; return; }

      window.parent.postMessage({ type: "preview-ready" }, "*");
    }

    window.addEventListener("message", async (e) => {
      if (e.data?.type !== "render") return;
      if (!React) await init();
      const { componentPath, componentName, props } = e.data;

      try {
        el.innerHTML = '<p class="empty">Loading...</p>';
        const mod = await import("/" + componentPath);
        const Component = mod[componentName] || mod.default;
        if (!Component) {
          el.innerHTML = '<p class="empty">Export "' + componentName + '" not found</p>';
          return;
        }
        if (!root) { el.innerHTML = ""; root = ReactDOM.createRoot(el); }
        root.render(React.createElement(Component, props || {}));
        requestAnimationFrame(() => {
          window.parent.postMessage({ type: "rendered", width: el.offsetWidth, height: el.offsetHeight }, "*");
        });
      } catch (err) {
        el.innerHTML = '<p class="error">' + err.message + '</p>';
        console.error("[component-preview]", err);
      }
    });

    init();
  <\/script>
</body>
</html>`;
}
