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

  // Run synchronously before paint so:
  //   (1) h2 ids exist before the hash-scroll effect below fires,
  //   (2) `.docs-content-row` + `--i` are applied before the first frame,
  //       otherwise we'd see a flash of final-state content then a re-
  //       animation on next tick.
  useLayoutEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    root.querySelectorAll("h2").forEach((h2) => {
      if (!h2.id && h2.textContent) h2.id = slug(h2.textContent);
    });
    // Each direct child of the page wrapper gets `.docs-content-row` and
    // an inline `--i` index for the keyframe stagger defined in index.css.
    // The animation fires on initial DOM insert, and since React replaces
    // the page subtree on route change, it re-fires each time the path
    // changes — so every page plays its own waterfall in.
    const pageWrapper = root.firstElementChild as HTMLElement | null;
    if (!pageWrapper) return;
    const children = Array.from(pageWrapper.children) as HTMLElement[];
    children.forEach((c, i) => {
      c.classList.add("docs-content-row");
      // Cap the index so a long page's tail doesn't have a visible
      // seconds-long delay — everything past row 9 lands together.
      c.style.setProperty("--i", String(Math.min(i, 9)));
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

  return (
    <div className="mx-auto max-w-[960px] flex h-screen px-4 bg-white text-[#1c1917] font-sans antialiased pr-[5px] pl-[5px]">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto xl:border-dashed scroll-pt-8">
        <Outlet />
      </main>
    </div>
  );
}
