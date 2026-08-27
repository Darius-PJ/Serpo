"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route rendering failed", error);
  }, [error]);

  return (
    <section className="card-soft max-w-lg p-6">
      <h1 className="text-xl font-extrabold text-foreground">We could not load this page</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        Your saved applications have not been changed. You can retry or return to your dashboard.
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={reset} className="btn-primary px-3 py-1.5 text-sm">Try again</button>
        <Link href="/dashboard" className="btn-secondary px-3 py-1.5 text-sm">Back to applications</Link>
      </div>
    </section>
  );
}
