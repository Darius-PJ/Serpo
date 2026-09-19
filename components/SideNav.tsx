"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "serpo-nav-collapsed";

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

type IconName = "dashboard" | "sourcing" | "pipeline" | "work" | "contacts" | "resume" | "settings" | "quit";

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

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    quit: <><path d="M12 3v9" /><path d="M7 5.5a8 8 0 1 0 10 0" /></>,
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
      className={`${className} shrink-0`}
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
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState<string | null>(null);

  async function quit() {
    if (quitting) return;
    setQuitting(true);
    setQuitError(null);
    try {
      const response = await fetch("/api/app/quit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Serpo could not quit.");
      // The launcher closes its owned browser, including pages reached through
      // navigation. An ordinary manually opened tab may refuse window.close().
      window.close();
    } catch (error) {
      setQuitError(error instanceof Error ? error.message : "Serpo could not quit.");
      setQuitting(false);
    }
  }

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
      className={`sticky top-0 flex h-screen w-[4.25rem] shrink-0 flex-col overflow-y-auto border-r border-border-soft bg-surface-sunken transition-[width] motion-reduce:transition-none ${
 collapsed ? "md:w-[102px]" : "md:w-56"
      }`}
    >
      <Link
        href="/dashboard"
        className="mx-2 mt-3 flex flex-col items-center gap-1.5 rounded-xl px-3 py-2"
        aria-label="Serpo home"
      >
        <Image
          src="/Rokuro-logo.jpg"
          alt=""
          width={600}
          height={669}
          className={`shrink-0 rounded-full object-cover ring-1 ring-border-soft ${
 collapsed ? "h-[45px] w-[45px]" : "h-[45px] w-[45px] md:h-[90px] md:w-[90px]"
          }`}
        />
        <span
          className={`truncate text-lg font-extrabold text-foreground ${
 collapsed ? "hidden" : "hidden md:inline"
          }`}
        >
          Serpo
        </span>
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
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-base transition-colors ${
 collapsed ? "justify-center" : "justify-center md:justify-start"
              } ${
                active
                  ? "bg-primary font-bold text-primary-ink"
                  : "font-medium text-foreground-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} className={collapsed ? "h-8 w-8" : "h-5 w-5"} />
              <span className={`truncate ${collapsed ? "hidden" : "hidden md:inline"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {quitError && <p role="alert" className="mx-2 rounded-xl bg-surface p-2 text-xs text-danger-dark">{quitError}</p>}
      <button type="button" onClick={quit} disabled={quitting} aria-label="Quit Serpo" title="Quit Serpo"
        className={`mx-2 mb-1 flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-base font-medium text-foreground-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-60 ${collapsed ? "justify-center" : "justify-center md:justify-start"}`}>
        <Icon name="quit" className={collapsed ? "h-8 w-8" : "h-5 w-5"} />
        <span className={collapsed ? "hidden" : "hidden md:inline"}>{quitting ? "Quitting…" : "Quit"}</span>
      </button>
      {quitting && <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-surface p-8 text-center"><div><h1 className="text-xl font-bold">Closing Serpo…</h1><p className="mt-2">The app window and local server are shutting down.</p><p className="mt-2 text-sm text-foreground-muted">If you opened this in a normal browser tab, you can close this tab.</p></div></div>}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="m-2 hidden min-h-10 items-center justify-center rounded-xl border border-border-soft px-3 py-2 text-foreground-muted transition-colors hover:bg-surface hover:text-foreground md:flex"
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
