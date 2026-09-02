"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "job-tracker-nav-collapsed";

// The collapse preference lives in localStorage (an external store), read via
// useSyncExternalStore: the server snapshot renders expanded, and React
// re-renders with the stored value after hydration — no mismatch, no
// setState-in-effect.
const storeListeners = new Set<() => void>();

function subscribeToCollapse(listener: () => void) {
  storeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type IconName = "dashboard" | "sourcing" | "pipeline" | "work" | "contacts" | "resume" | "settings";

// Sourcing sits directly after Dashboard: feeding the pipeline is the daily
// action this workspace exists to prompt, so it gets the second slot.
const NAV_ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/sourcing", label: "Sourcing", icon: "sourcing" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/work", label: "Work", icon: "work" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/resume", label: "Resume", icon: "resume" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </>
    ),
    sourcing: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    pipeline: (
      <>
        <rect x="3" y="3" width="5" height="13" rx="1.5" />
        <rect x="9.5" y="3" width="5" height="9" rx="1.5" />
        <rect x="16" y="3" width="5" height="17" rx="1.5" />
      </>
    ),
    work: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="m8 13 2.5 2.5L16 10" />
      </>
    ),
    contacts: (
      <>
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M3.5 20c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" />
        <circle cx="17" cy="9.5" r="2.5" />
        <path d="M16 15.2c2.2.2 3.9 1.7 4.5 4.3" />
      </>
    ),
    resume: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M9 11h6M9 15h6" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="9" cy="7" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="7" cy="17" r="1.8" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeToCollapse, readCollapsed, () => false);

  function toggle() {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    } catch {
      /* preference just won't persist */
    }
    storeListeners.forEach((listener) => listener());
  }

  return (
    <aside
      className={`sticky top-0 flex h-screen w-[4.25rem] shrink-0 flex-col overflow-y-auto border-r border-border-soft bg-surface-sunken/80 backdrop-blur-sm transition-[width] motion-reduce:transition-none ${
        collapsed ? "md:w-[4.25rem]" : "md:w-56"
      }`}
    >
      <Link
        href="/dashboard"
        className={`mx-2 mt-3 flex items-center rounded-xl px-3 py-2 bg-gradient-to-r from-primary to-primary-light bg-clip-text text-lg font-extrabold text-transparent ${
          collapsed ? "justify-center" : "justify-center md:justify-start"
        }`}
        aria-label="Job Tracker home"
      >
        <span className={collapsed ? "" : "md:hidden"}>JT</span>
        <span className={collapsed ? "hidden" : "hidden md:inline"}>Job Tracker</span>
      </Link>
      <nav aria-label="Primary navigation" className="mt-2 flex w-full flex-1 flex-col gap-1 px-2 py-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                collapsed ? "justify-center" : "justify-center md:justify-start"
              } ${
                active
                  ? "bg-primary font-bold text-primary-ink shadow-sm shadow-primary/30"
                  : "font-medium text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} />
              <span className={`truncate ${collapsed ? "hidden" : "hidden md:inline"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="m-2 hidden items-center justify-center rounded-xl border border-border-soft px-3 py-2 text-foreground-muted transition-colors hover:bg-primary/10 hover:text-foreground md:flex"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m13 6-6 6 6 6M19 6l-6 6 6 6" />
        </svg>
      </button>
    </aside>
  );
}
