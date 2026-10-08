"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Replay only for a different page, not filters, data refreshes, or rail updates. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
