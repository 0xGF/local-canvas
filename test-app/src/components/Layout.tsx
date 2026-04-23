import { useEffect, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    root.querySelectorAll("h2").forEach((h2) => {
      if (!h2.id && h2.textContent) h2.id = slug(h2.textContent);
    });
  }, [pathname]);

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    mainRef.current?.scrollTo(0, 0);
  }, [pathname, hash]);

  // Entrance animation for page content. Observe each direct child of the
  // current page's wrapper div; when it scrolls into the viewport, flip
  // `data-visible` and the `[data-reveal]` rule in index.css transitions it
  // in. Re-runs on every route change so each new page staggers its own
  // sections. No-op for users with `prefers-reduced-motion: reduce`.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    // Pages wrap their content in a single div with `max-w-[680px] ...`;
    // that's the one whose children we want to reveal.
    const pageWrapper = root.firstElementChild as HTMLElement | null;
    if (!pageWrapper) return;
    const sections = Array.from(pageWrapper.children) as HTMLElement[];
    sections.forEach((s) => {
      s.setAttribute("data-reveal", "");
      s.removeAttribute("data-visible");
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute("data-visible", "true");
            // Only reveal each section once — disconnecting on trigger keeps
            // things from re-animating as the user scrolls back up.
            io.unobserve(e.target);
          }
        }
      },
      { root, rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  return (
    <div className="mx-auto max-w-[960px] flex h-screen px-4 bg-white text-[#1c1917] font-sans antialiased pr-[5px] pl-[5px]">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto xl:border-dashed scroll-pt-8">
        <Outlet />
      </main>
    </div>
  );
}
