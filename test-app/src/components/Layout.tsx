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

  return (
    <div className="mx-auto max-w-[960px] flex h-screen px-4 bg-white text-[#1c1917] font-sans antialiased pr-[5px] pl-[5px]">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto xl:border-dashed scroll-pt-8">
        <Outlet />
      </main>
    </div>
  );
}
