import { Link, useLocation } from "react-router-dom";
import { Separator } from "./ui/separator";
import { LocalCanvasLogo } from "./LocalCanvasLogo";

const gettingStarted = [
  { href: "/overview", label: "Overview" },
  { href: "/install", label: "Install" },
  { href: "/cli", label: "CLI" },
];

const editing = [
  { href: "/features", label: "Features" },
  { href: "/properties", label: "Properties" },
  { href: "/shortcuts", label: "Shortcuts" },
];

const advanced = [
  { href: "/api", label: "API & Mutations" },
  { href: "/mcp", label: "MCP Server" },
];

function NavSection({
  title,
  items,
  pathname,
}: {
  title?: string;
  items: { href: string; label: string }[];
  pathname: string;
}) {
  return (
    <div className="mb-8">
      {title && (
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider pl-3 mb-1.5">
          {title}
        </p>
      )}
      <ul>
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                to={item.href}
                className={`relative block py-1 pl-3 text-[12px] transition-colors ${
                  isActive
                    ? "text-[#1c1917] font-semibold"
                    : "text-[#a8a29e] hover:text-[#78716c]"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[16px] bg-[#1c1917] rounded-full" />
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-[180px] shrink-0 overflow-y-auto border-r border-neutral-100 px-3">
      {/* Logo */}
      <div className="pt-12 pb-6">
        <Link to="/overview" className="block">
          <LocalCanvasLogo className="w-[120px] h-[39px]" />
        </Link>
        <span className="text-[11px] text-[#a8a29e] mt-1 block">v0.1.0</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto">
        <NavSection items={gettingStarted} pathname={pathname} />
        <NavSection title="Editing" items={editing} pathname={pathname} />
        <NavSection title="Advanced" items={advanced} pathname={pathname} />

        <Separator className="my-3" />

        <ul>
          <li>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1 pl-3 text-[12px] text-[#a8a29e] hover:text-[#78716c] transition-colors"
            >
              GitHub ↗
            </a>
          </li>
          <li>
            <a
              href="https://npmjs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block py-1 pl-3 text-[12px] text-[#a8a29e] hover:text-[#78716c] transition-colors"
            >
              npm ↗
            </a>
          </li>
        </ul>
      </nav>

      {/* Footer */}
      <div className="py-4">
        <span className="text-[11px] text-[#a8a29e]">designed by 0xGF</span>
      </div>
    </aside>
  );
}
