import type { Metadata } from "next";
import localFont from "next/font/local";
import { SideNav } from "@/components/SideNav";
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
  return (
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only absolute left-4 top-4 z-50 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-ink focus:not-sr-only"
        >
          Skip to main content
        </a>
        <div className="flex min-h-screen">
          <SideNav />
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
