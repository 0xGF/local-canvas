import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { LocalCanvasLogo } from "./LocalCanvasLogo";

type NavItem = {
  href: string;
  label: string;
  children?: { hash: string; label: string }[];
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sub = (...labels: string[]) =>
  labels.map((label) => ({ hash: slug(label), label }));

const groups: NavGroup[] = [
  {
    items: [
      {
        href: "/overview",
        label: "Overview",
        children: sub(
          "The Canvas",
          "Architecture",
          "How a click becomes a source edit",
          "Supported className patterns",
        ),
      },
      {
        href: "/install",
        label: "Install",
        children: sub(
          "Requirements",
          "1. Add source mapping (recommended)",
          "2. Start the editor",
          "3. (optional) Hook up your AI agent",
          "4. Start editing",
          ".gitignore",
          "Next steps",
        ),
      },
      { href: "/cli", label: "CLI" },
    ],
  },
  {
    title: "Editing",
    items: [
      {
        href: "/features",
        label: "Features",
        children: sub(
          "Two modes",
          "Selection",
          "Spacing handles",
          "Resize grips",
          "Drag-to-scrub numeric inputs",
          "Inline text editing",
          "Ask AI (annotations)",
          "Multi-element annotations",
          "Layers panel",
          "Breakpoint previews",
          "Animation pause",
          "Undo with HMR awareness",
          "Changes panel & diff view",
        ),
      },
      {
        href: "/properties",
        label: "Properties",
        children: sub(
          "How values are persisted",
          "Layout",
          "Flex & Grid",
          "Spacing",
          "Size",
          "Typography",
          "Fill & Border",
          "Effects",
          "Filters & transitions",
          "Interactivity",
          "Raw class editor",
          "Read-only elements",
        ),
      },
      {
        href: "/shortcuts",
        label: "Shortcuts",
        children: sub(
          "Modes",
          "Editing",
          "Panels & tools",
          "Annotations",
          "Viewport",
          "Inputs",
        ),
      },
    ],
  },
  {
    title: "Advanced",
    items: [
      {
        href: "/api",
        label: "API & Mutations",
        children: sub(
          "WebSocket (mutations)",
          "Mutation types",
          "Mutation shape",
          "Read-only cases",
          "HTTP endpoints on :6966",
          "Undo / redo",
        ),
      },
      {
        href: "/mcp",
        label: "MCP Server",
        children: sub(
          "Setup",
          "How it connects",
          "Canvas tools",
          "Annotation tools",
          "Recommended lifecycle",
          "Where annotations live",
        ),
      },
    ],
  },
];

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.72-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.77-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function SubNavItem({
  to,
  hash,
  label,
  isActive,
}: {
  to: string;
  hash: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <li>
      <Link
        to={`${to}#${hash}`}
        className={`relative block py-1 pl-4 pr-2 text-[12px] leading-tight transition-colors ${
          isActive
            ? "text-[#1c1917] font-semibold"
            : "text-[#a8a29e] hover:text-[#78716c]"
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-0 bottom-0 w-[1.5px] bg-[#1c1917]" />
        )}
        {label}
      </Link>
    </li>
  );
}

function NavSection({
  group,
  pathname,
  hash,
  activeRef,
  startIndex,
}: {
  group: NavGroup;
  pathname: string;
  hash: string;
  activeRef: React.RefObject<HTMLLIElement | null>;
  /** Running row index across the whole sidebar, used for the CSS stagger
   *  variable `--i` on each `.docs-nav-row`. Each NavSection bumps it by
   *  its item count before handing off to the next. */
  startIndex: number;
}) {
  return (
    <div className="mb-5">
      {group.title && (
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider pl-3 mb-1.5">
          {group.title}
        </p>
      )}
      <ul>
        {group.items.map((item, idx) => {
          const isActive = pathname === item.href;
          const hasChildren = !!item.children?.length;
          const activeHash = isActive ? hash.replace(/^#/, "") : "";
          const row = startIndex + idx;
          return (
            <li
              key={item.href}
              ref={isActive ? activeRef : undefined}
              // CSS stagger — sidebar sub-nav items ripple in on first
              // mount via `.docs-nav-row` keyframe, 28ms apart.
              className="docs-nav-row"
              style={{ ["--i" as string]: row }}
            >
              <Link
                to={item.href}
                className={`relative block py-1 pl-3 text-[12px] transition-colors ${
                  isActive
                    ? "text-[#1c1917] font-semibold"
                    : "text-[#a8a29e] hover:text-[#78716c]"
                }`}
              >
                {item.label}
              </Link>
              {hasChildren && (
                // Animated expand: grid-template-rows 0fr → 1fr with a
                // transition gives the children an actual height animation
                // (no JS measurement, browser does the interpolation).
                // The opacity fade runs ~70% of the expand duration so
                // children aren't fully visible until they've mostly
                // settled into place — reads as a single cohesive motion
                // rather than a fade-over-a-slide.
                <div
                  className={`grid transition-[grid-template-rows] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <ul
                      className={`relative ml-3 mt-1 mb-2 border-l border-[#e7e5e4] transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {item.children!.map((child, i) => (
                        <SubNavItem
                          key={child.hash}
                          to={item.href}
                          hash={child.hash}
                          label={child.label}
                          isActive={
                            activeHash === child.hash || (!activeHash && i === 0)
                          }
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const { pathname, hash } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const item = activeItemRef.current;
    if (!nav || !item) return;
    const itemBottom = item.offsetTop + item.offsetHeight;
    const visibleBottom = nav.scrollTop + nav.clientHeight;
    const padding = 16;
    if (itemBottom + padding > visibleBottom) {
      nav.scrollTo({
        top: itemBottom + padding - nav.clientHeight,
        behavior: "smooth",
      });
    } else if (item.offsetTop < nav.scrollTop) {
      nav.scrollTo({
        top: Math.max(0, item.offsetTop - padding),
        behavior: "smooth",
      });
    }
  }, [pathname]);

  // Running row counter so the NavSection stagger is continuous across
  // sections (Editing nav row 0 comes right after Overview/Install/CLI,
  // not restarting at 0 in its own group).
  let rowOffset = 0;

  return (
    // `.docs-sidebar` applies the one-shot landing animation defined in
    // index.css — fades + translates the whole aside in on first mount.
    <aside className="docs-sidebar hidden md:flex flex-col w-[200px] shrink-0 border-neutral-100 px-3">
      <div className="pt-12 pb-6">
        <Link to="/overview" className="block">
          <LocalCanvasLogo className="h-6 w-auto" />
        </Link>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto -mx-3 px-3">
        {groups.map((group, i) => {
          const startIndex = rowOffset;
          rowOffset += group.items.length;
          return (
            <NavSection
              key={group.title ?? i}
              group={group}
              pathname={pathname}
              hash={hash}
              activeRef={activeItemRef}
              startIndex={startIndex}
            />
          );
        })}
      </nav>

      <div className="flex items-center gap-2 py-4 text-[11px] text-[#a8a29e]">
        <span>v0.1.0</span>
        <span aria-hidden>·</span>
        <a
          href="https://github.com/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="hover:text-[#78716c] transition-colors"
        >
          <GithubIcon className="h-[13px] w-[13px]" />
        </a>
      </div>
    </aside>
  );
}
