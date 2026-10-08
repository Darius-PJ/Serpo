"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { requestJson } from "@/lib/http/requestJson";

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

const NEW_LISTINGS_EVENT = "serpo:new-listings-changed";
const NEW_LISTINGS_POLL_MS = 60_000;

/**
 * Tells the Sourcing badge that saved-search new-listing counts may have
 * changed (a run, an inbox viewed), so it refetches now instead of at its
 * next poll.
 */
export function announceNewListingsChanged() {
  window.dispatchEvent(new Event(NEW_LISTINGS_EVENT));
}

// New saved-search listings for the Sourcing badge: fetched on mount, on every
// navigation, once a minute, and whenever a change is announced.
function useNewListingCount(pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await requestJson<{ count?: unknown }>("/api/saved-searches/new-count", { cache: "no-store" });
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {
        // Keep the last count; the next poll tries again.
      }
    }
    void load();
    const timer = window.setInterval(load, NEW_LISTINGS_POLL_MS);
    window.addEventListener(NEW_LISTINGS_EVENT, load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(NEW_LISTINGS_EVENT, load);
    };
  }, [pathname]);
  return count;
}

type IconName = "dashboard" | "sourcing" | "pipeline" | "work" | "contacts" | "resume" | "settings" | "privacy" | "quit";

// Sourcing sits directly after Dashboard: feeding the pipeline is the daily
// action this workspace exists to prompt, so it gets the second slot.
export const NAV_ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/sourcing", label: "Sourcing", icon: "sourcing" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/work", label: "Work", icon: "work" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/resume", label: "Resume", icon: "resume" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/privacy", label: "Privacy", icon: "privacy" },
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
    privacy: (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.4 7.6 8 9 4.6-1.4 8-4.5 8-9V6z" />
        <path d="m9 12 2 2 4-4" />
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
  const newListings = useNewListingCount(pathname);
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState<string | null>(null);

  async function quit() {
    if (quitting) return;
    document.documentElement.dataset.quitting = "true";
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
      delete document.documentElement.dataset.quitting;
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
      aria-label="Workspace navigation"
      data-collapsed={collapsed}
      className="serpo-sidebar"
    >
      <Link
        href="/dashboard"
        className="serpo-brand mx-2 mt-3 flex flex-col items-center gap-1.5 rounded-xl px-3 py-2"
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
          const badge = item.href === "/sourcing" ? newListings : 0;
          // With nothing new the name stays exactly the item's label.
          const label = badge > 0 ? `${item.label} (${badge} new)` : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={`rail-link relative flex items-center gap-3 rounded-xl px-3 py-2 text-base ${
                collapsed ? "justify-center" : "justify-center md:justify-start"
              }`}
            >
              <Icon name={item.icon} className={collapsed ? "h-8 w-8" : "h-5 w-5"} />
              <span className={`truncate ${collapsed ? "hidden" : "hidden md:inline"}`}>{item.label}</span>
              {badge > 0 && (
                // Over the icon when the label is hidden; after the label when it shows.
                <span
                  aria-hidden="true"
                  className={`rail-badge absolute right-1 top-0.5 min-w-6 rounded-lg px-1.5 text-center text-sm font-bold leading-6 ${collapsed ? "" : "md:static md:ml-auto"}`}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {quitError && <p role="alert" className="mx-2 rounded-xl bg-surface p-2 text-xs text-danger-dark">{quitError}</p>}
      <button type="button" onClick={quit} disabled={quitting} aria-label="Quit Serpo" title="Quit Serpo"
        className={`rail-quiet mx-2 mb-1 flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-base font-medium disabled:opacity-60 ${collapsed ? "justify-center" : "justify-center md:justify-start"}`}>
        <Icon name="quit" className={collapsed ? "h-8 w-8" : "h-5 w-5"} />
        <span className={collapsed ? "hidden" : "hidden md:inline"}>Quit</span>
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="rail-control m-2 hidden min-h-10 items-center justify-center rounded-xl px-3 py-2 md:flex"
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
