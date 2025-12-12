"use client";

import * as React from "react";
import {
  Home, Search, Inbox, Cog, BookText, HelpCircle, User as UserIcon,
  Folder, Users, BarChart3, ListChecks, LayoutList,
  ChevronDown, MoreHorizontal, ClipboardList, FilePieChart
} from "lucide-react";
import { UserMini } from "components/UserMini";

type Variant = "rail" | "panel";
type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
};
type PanelSection = {
  id: string;
  title: string;
  items: NavItem[];
  hasMoreMenu?: boolean;
};

const ROUTES = {
  dashboard: "/dashboard",
  search: "/search",
  inbox: "/inbox",
  settings: "/settings",
  docs: "/docs",
  help: "/help",
  account: "/account",
  // panel
  home: "/home",
  updates: "/updates",
  mytasks: "/my-tasks",
  projects: "/projects",
  tasks: "/tasks",
  views: "/views",
  teams: "/teams",
  reports: "/reports",
};

const railTop: NavItem[] = [
  { id: "home", label: "Home", icon: Home, href: ROUTES.dashboard },
  { id: "search", label: "Search", icon: Search, href: ROUTES.search },
  { id: "inbox", label: "Inbox", icon: Inbox, href: ROUTES.inbox },
];

const railBottom: NavItem[] = [
  { id: "settings", label: "Settings", icon: Cog, href: ROUTES.settings },
  { id: "docs", label: "Docs", icon: BookText, href: ROUTES.docs },
  { id: "help", label: "Help", icon: HelpCircle, href: ROUTES.help },
  { id: "account", label: "Account", icon: UserIcon, href: ROUTES.account },
];

// Perfil base (sin avatar en disco; usamos fallback SVG inline)
const profile = {
  full_name: "Christopher Carranza",
  username: "youruser_name", // sin @ (lo agregamos al render)
  avatar_url: "",            // ← vacío para evitar 404; usamos fallback SVG
};

type Profile = {
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

const safeName = (profile?.full_name ?? "").trim() || "Tu Nombre";
const safeHandle = profile?.username ? `@${profile.username.replace(/^@/, "").trim()}` : "@usuario";

/* --- Fallback SVG inline con iniciales (evita 404) --- */
const initials =
  safeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "U";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#374151"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#g)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
        font-size="28" fill="#ffffff" font-weight="600">${initials}</text>
</svg>
`;
const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/* Foto segura: si no hay URL válida, usa el SVG inline */
const safePhoto = (profile?.avatar_url ?? "").trim() || svgDataUrl;

/* ===== Secondary bar (panel) — contenido ===== */
const panelSections: PanelSection[] = [
  {
    id: "home",
    title: "HOME",
    items: [
      { id: "home", label: "Home", icon: Home, href: ROUTES.home },
      { id: "updates", label: "Updates", icon: FilePieChart, href: ROUTES.updates },
      { id: "inbox2", label: "Inbox", icon: Inbox, href: ROUTES.inbox },
      { id: "mytasks", label: "My tasks", icon: ClipboardList, href: ROUTES.mytasks },
    ],
  },
  {
    id: "workspace",
    title: "WORKSPACE",
    hasMoreMenu: true,
    items: [
      { id: "projects", label: "Projects", icon: Folder, href: ROUTES.projects },
      { id: "tasks", label: "Tasks", icon: ListChecks, href: ROUTES.tasks },
      { id: "views", label: "Views", icon: LayoutList, href: ROUTES.views },
      { id: "teams", label: "Teams", icon: Users, href: ROUTES.teams },
      { id: "reports", label: "Reports", icon: BarChart3, href: ROUTES.reports },
    ],
  },
  {
    id: "projectsList",
    title: "PROJECTS",
    hasMoreMenu: true,
    items: [
      { id: "p_tuesday", label: "Tuesday™", icon: Folder, href: `${ROUTES.projects}/tuesday` },
      { id: "p_march", label: "March", icon: Folder, href: `${ROUTES.projects}/march` },
      { id: "p_april", label: "April", icon: Folder, href: `${ROUTES.projects}/april` },
      { id: "p_jammio", label: "Jammio™", icon: Folder, href: `${ROUTES.projects}/jammio` },
      { id: "p_createai", label: "Create™ AI", icon: Folder, href: `${ROUTES.projects}/create-ai` },
    ],
  },
];

export default function Sidebar({
  variant = "rail",
}: {
  variant?: Variant;
  onPin?: () => void;
  onUnpin?: () => void;
}) {
  React.useEffect(() => {
    const saved =
      typeof window !== "undefined" &&
      localStorage.getItem("secondarybar:pinned") === "true";
    document.documentElement.dataset.secondaryPinned = String(!!saved);
  }, []);

  if (variant === "panel") {
    return (
      <aside className="SidebarSecondaryPanel" aria-label="Secondary sidebar" role="navigation">
        <div className="px-3 py-2">
          <UserMini
            name={safeName}
            handle={safeHandle}
            photoUrl={safePhoto}
            onClick={() => {
              /* abrir menú */
            }}
          />
        </div>

        {/* Navegación */}
        <nav className="ss-nav" aria-label="Sidebar sections">
          {panelSections.map((section) => (
            <div className="ss-section" key={section.id}>
              {section.id === "projectsList" && <div className="ss-divider" />}
              <div className="ss-section-head">
                <span className="ss-section-title">{section.title}</span>
                {section.hasMoreMenu && (
                  <button className="ss-more" aria-label={`${section.title} more`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              </div>
              <ul className="ss-list">
                {section.items.map((it) => (
                  <li key={it.id}>
                    <a className="ss-item" href={it.href}>
                      <it.icon className="ss-item-icon" />
                      <span className="item-label">{it.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    );
  }

  // Rail (icon-only)
  return (
    <aside className="pb-rail" aria-label="Primary sidebar">
      <div className="pb-rail-inner">
        <div className="pb-brand" aria-label="Brand">
          <div className="pb-brand-badge">RM</div>
        </div>

        <nav className="pb-rail-group" aria-label="Primary top">
          {railTop.map((it) => (
            <a
              key={it.id}
              href={it.href}
              className="pb-rail-item"
              title={it.label}
              aria-label={it.label}
            >
              <it.icon className="pb-rail-icon" />
            </a>
          ))}
        </nav>

        <div className="pb-rail-spacer" />

        <nav className="pb-rail-group" aria-label="Primary bottom">
          {railBottom.map((it) => (
            <a
              key={it.id}
              href={it.href}
              className="pb-rail-item"
              title={it.label}
              aria-label={it.label}
            >
              <it.icon className="pb-rail-icon" />
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
