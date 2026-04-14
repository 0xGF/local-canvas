import httpProxy from "http-proxy";

interface ProxyOptions {
  targetHost: string;
  targetPort: number;
}

export function createProxy(options: ProxyOptions) {
  const { targetHost, targetPort } = options;
  const target = `http://${targetHost}:${targetPort}`;

  const proxy = httpProxy.createProxyServer({
    target,
    ws: true,
    selfHandleResponse: true,
  });

  proxy.on("proxyRes", (proxyRes, req, res) => {
    const contentType = proxyRes.headers["content-type"] || "";
    const isHtml = contentType.includes("text/html");

    // Copy headers
    const headers = { ...proxyRes.headers };
    delete headers["content-length"]; // We might modify the body
    delete headers["content-encoding"]; // We need to read the body
    res.writeHead(proxyRes.statusCode || 200, headers);

    const url = req.url || "";
    const isNoOverlay = url.includes("__canvas_no_overlay");
    const isComponentPreview = url.includes("__canvas_component_preview");

    if (!isHtml || isNoOverlay) {
      proxyRes.pipe(res);
      return;
    }

    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf-8");
      if (isComponentPreview) {
        body = injectComponentPreview(body);
      } else {
        body = injectOverlayScript(body);
      }
      res.end(body);
    });
  });

  proxy.on("error", (err, _req, res) => {
    console.error("[local-canvas] Proxy error:", err.message);
    if ("writeHead" in res) {
      (res as import("http").ServerResponse).writeHead(502, {
        "Content-Type": "text/plain",
      });
      (res as import("http").ServerResponse).end(
        "Canvas Editor: Unable to reach dev server. Is it running?"
      );
    }
  });

  return proxy;
}

/**
 * For component preview: replace the app's entry script with a component renderer.
 * Since this goes through Vite's pipeline, bare imports (react, react-dom/client) resolve.
 */
function injectComponentPreview(html: string): string {
  // Use dynamic import() so Vite's module resolver handles bare specifiers.
  // Static imports fail because the browser tries to resolve them before
  // Vite's client-side import map is ready.
  const script = `<script type="module">
const React = await import("/node_modules/.vite/deps/react.js?v=preview").then(m => m.default || m).catch(() => import("react").then(m => m.default || m));
const { createRoot } = await import("/node_modules/.vite/deps/react-dom_client.js?v=preview").then(m => m).catch(() => import("react-dom/client"));

const el = document.getElementById("root") || document.body;
el.innerHTML = '<p style="color:#888;font-size:13px;text-align:center;padding:24px">Ready</p>';

let reactRoot;
window.parent.postMessage({ type: "preview-ready" }, "*");

window.addEventListener("message", async (e) => {
  if (e.data?.type !== "render") return;
  const { componentPath, componentName, props } = e.data;
  try {
    el.innerHTML = '<p style="color:#888;font-size:13px;text-align:center;padding:24px">Loading...</p>';
    const mod = await import("/" + componentPath);
    const Component = mod[componentName] || mod.default;
    if (!Component) { el.innerHTML = '<p style="color:#888">Export not found: ' + componentName + '</p>'; return; }
    if (!reactRoot) { el.innerHTML = ""; reactRoot = createRoot(el); }
    reactRoot.render(React.createElement(Component, props || {}));
    requestAnimationFrame(() => {
      window.parent.postMessage({ type: "rendered", width: el.offsetWidth, height: el.offsetHeight }, "*");
    });
  } catch (err) {
    el.innerHTML = '<p style="color:#f24822;font-size:12px;font-family:monospace;padding:16px">' + err.message + '</p>';
  }
});
<\/script>`;

  // Replace the app's main entry script
  const mainScript = /<script\s+type="module"\s+src="\/src\/main\.[jt]sx?"[^>]*><\/script>/;
  if (mainScript.test(html)) return html.replace(mainScript, script);
  if (html.includes("</body>")) return html.replace("</body>", `${script}\n</body>`);
  return html + `\n${script}`;
}

function injectOverlayScript(html: string): string {
  const script = `<script src="/__canvas/overlay.js" defer></script>`;

  // Inject before </body> or at the end
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}\n</body>`);
  }
  if (html.includes("</html>")) {
    return html.replace("</html>", `${script}\n</html>`);
  }
  return html + `\n${script}`;
}
