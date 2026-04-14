import { createElement } from "react";
import { createRoot } from "react-dom/client";

let root: ReturnType<typeof createRoot> | null = null;
const el = document.getElementById("preview-root")!;

window.addEventListener("message", async (e) => {
  if (e.data?.type !== "render") return;
  const { componentPath, componentName, props } = e.data;

  try {
    el.innerHTML = '<p class="empty">Loading...</p>';

    // Import through the dev server — paths like "src/App.tsx" resolve via the bundler
    const mod = await import(/* @vite-ignore */ "/" + componentPath);
    const Component = mod[componentName] || mod.default;

    if (!Component) {
      el.innerHTML = `<p class="empty">Export "${componentName}" not found in ${componentPath}</p>`;
      return;
    }

    if (!root) {
      el.innerHTML = "";
      root = createRoot(el);
    }

    root.render(createElement(Component, props || {}));

    requestAnimationFrame(() => {
      window.parent.postMessage({ type: "rendered", width: el.offsetWidth, height: el.offsetHeight }, "*");
    });
  } catch (err: any) {
    el.innerHTML = `<p class="error">${err.message}</p>`;
    console.error("[component-preview]", err);
  }
});

window.parent.postMessage({ type: "preview-ready" }, "*");
