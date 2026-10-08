"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/SideNav";
import { ThemeToggle } from "@/components/AppearanceControls";

export function WorkspaceHeader() {
  const pathname = usePathname();
  const navPage = NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  const label = navPage?.label ?? (
    pathname.startsWith("/applications/") ? "Application" :
    pathname === "/raekwon" ? "AI Scout" :
    pathname === "/" ? "Dashboard" :
    pathname.split("/").filter(Boolean)[0]?.replaceAll("-", " ") ?? "Workspace"
  );

  return (
    <header className="serpo-topbar">
      <div className="serpo-breadcrumb">
        <span>Workspace</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 5 7 7-7 7" />
        </svg>
        <strong>{label}</strong>
      </div>
      <div className="serpo-topbar-actions">
        <span className="serpo-local-identity">Local workspace</span>
        <ThemeToggle />
        <Link href="/work" className="serpo-topbar-link" aria-label="Open Work queue">Work</Link>
      </div>
    </header>
  );
}
