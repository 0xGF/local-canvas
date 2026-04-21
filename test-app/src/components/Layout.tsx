import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="mx-auto max-w-[960px] flex h-screen px-4 bg-white text-[#1c1917] font-sans antialiased">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto xl:border-dashed">
        <Outlet />
      </main>
    </div>
  );
}
