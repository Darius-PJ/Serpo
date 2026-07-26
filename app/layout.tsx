import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Tracker",
  description: "Local-first job & contract application tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <span className="font-semibold">Job Tracker</span>
            <Link href="/dashboard" className="text-sm text-neutral-600 hover:text-neutral-900">
              Dashboard
            </Link>
            <Link href="/sourcing" className="text-sm text-neutral-600 hover:text-neutral-900">
              Source Jobs
            </Link>
            <Link href="/settings" className="text-sm text-neutral-600 hover:text-neutral-900">
              Settings
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
