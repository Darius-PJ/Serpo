import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/session";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const userId = await getCurrentUserId();
  if (userId) redirect("/dashboard");

  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">Job Tracker</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Local accounts only — nothing here leaves this machine. Use separate accounts to keep
        different job searches (e.g. different industries) fully separate.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
