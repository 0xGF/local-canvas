export function createOverlayContainer(): {
  shadowRoot: ShadowRoot;
  mountPoint: HTMLElement;
} {
  const host = document.createElement("div");
  host.id = "local-canvas-host";
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const mountPoint = document.createElement("div");
  mountPoint.id = "local-canvas-mount";
  mountPoint.style.cssText =
    "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;";
  shadowRoot.appendChild(mountPoint);

  return { shadowRoot, mountPoint };
}

export function injectStyles(shadowRoot: ShadowRoot, css: string) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  shadowRoot.adoptedStyleSheets = [
    ...shadowRoot.adoptedStyleSheets,
    sheet,
  ];
}
