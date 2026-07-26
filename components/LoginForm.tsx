"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 inline-flex w-full rounded-full border border-border-soft bg-surface p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-full px-3 py-1.5 transition-all ${
            mode === "login"
              ? "bg-gradient-to-r from-primary to-primary-light font-semibold text-white shadow-sm shadow-primary/30"
              : "text-foreground-muted hover:bg-primary-light/15"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 rounded-full px-3 py-1.5 transition-all ${
            mode === "register"
              ? "bg-gradient-to-r from-primary to-primary-light font-semibold text-white shadow-sm shadow-primary/30"
              : "text-foreground-muted hover:bg-primary-light/15"
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="input-soft w-full px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-muted">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            className="input-soft w-full px-3 py-1.5 text-sm"
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-foreground-muted">8-128 characters.</p>
          )}
        </div>

        {error && <p className="text-sm text-danger-dark">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full px-3 py-1.5 text-sm">
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
