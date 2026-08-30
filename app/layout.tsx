import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { getCurrentUserId } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

// Self-hosted so neither the build nor runtime ever contacts Google Fonts
// (privacy-preserving + reliable offline/CI builds). This variable woff2 covers
// the whole weight axis, replacing the previous 400/600/700/800 static request.
// Source: @fontsource-variable/nunito (OFL — see app/fonts/Nunito-LICENSE.txt).
const nunito = localFont({
  src: "./fonts/nunito-latin-variable.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Local-first job & contract application tracker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getCurrentUserId();

  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only absolute left-4 top-4 z-50 rounded bg-primary px-3 py-2 text-sm font-semibold text-white focus:not-sr-only"
        >
          Skip to main content
        </a>
        <header className="border-b border-border-soft">
          <nav aria-label="Primary navigation" className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link
              href={userId ? "/dashboard" : "/"}
              className="bg-gradient-to-r from-primary to-primary-light bg-clip-text text-lg font-extrabold text-transparent"
            >
              Job Tracker
            </Link>
            {userId && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Dashboard
                </Link>
                <Link href="/pipeline" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Pipeline
                </Link>
                <Link href="/contacts" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Contacts
                </Link>
                <Link href="/sourcing" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Source Jobs
                </Link>
                <Link href="/raekwon" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Raekwon
                </Link>
                <Link href="/resume" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Resume
                </Link>
                <Link href="/settings" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Settings
                </Link>
                <span className="ml-auto">
                  <LogoutButton />
                </span>
              </>
            )}
          </nav>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
