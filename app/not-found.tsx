import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card-soft max-w-lg p-6">
      <h1 className="text-2xl font-extrabold text-heading">That page is unavailable</h1>
      <p className="mt-2 text-base text-foreground-muted">
        It may have been deleted, or you may not have permission to view it.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/dashboard" className="btn-primary">Back to the dashboard</Link>
        <Link href="/pipeline" className="btn-secondary">Open the pipeline</Link>
      </div>
    </section>
  );
}
