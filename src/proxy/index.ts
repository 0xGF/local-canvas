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

    if (!isHtml || isNoOverlay) {
      proxyRes.pipe(res);
      return;
    }

    const chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf-8");
      body = injectOverlayScript(body);
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

function injectOverlayScript(html: string): string {
  // type="module" because the overlay ships as ES with dynamic chunks.
  const script = `<script type="module" src="/__canvas/overlay.js"></script>`;

  // Inject before </body> or at the end
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}\n</body>`);
  }
  if (html.includes("</html>")) {
    return html.replace("</html>", `${script}\n</html>`);
  }
  return html + `\n${script}`;
}
