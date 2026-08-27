import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card-soft max-w-lg p-6">
      <h1 className="text-xl font-extrabold text-foreground">That page is unavailable</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        It may have been deleted, or you may not have permission to view it.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/dashboard" className="btn-primary px-3 py-1.5 text-sm">Back to applications</Link>
        <Link href="/sourcing" className="btn-secondary px-3 py-1.5 text-sm">Source jobs</Link>
      </div>
    </section>
  );
}
