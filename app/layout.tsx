import type { Metadata } from "next";
import Link from "next/link";
import { Nunito } from "next/font/google";
import { getCurrentUserId } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
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
        <header className="border-b border-border-soft">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <span className="bg-gradient-to-r from-primary to-primary-light bg-clip-text text-lg font-extrabold text-transparent">
              Job Tracker
            </span>
            {userId && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-foreground-muted transition-colors hover:text-primary-dark">
                  Dashboard
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
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
