import type { Metadata } from "next";
import localFont from "next/font/local";
import { SideNav } from "@/components/SideNav";
import { PageTransition } from "@/components/PageTransition";
import { SerpoWallpaper } from "@/components/SerpoWallpaper";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
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

// Parser-blocking inline script before the shell prevents a saved preference
// from flashing the OS palette while Next.js hydrates the controls.
const appearanceInitScript = `(() => {
  const root = document.documentElement;
  let theme, motion;
  try {
    theme = localStorage.getItem("serpo-theme");
    motion = localStorage.getItem("serpo-motion");
  } catch {}
  root.dataset.theme = theme === "light" || theme === "dark"
    ? theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.dataset.motion = motion === "full" || motion === "reduced"
    ? motion : matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
})();`;

export const metadata: Metadata = {
  title: "Serpo",
  description: "Serpo — a local-first job & contract application tracker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />
        <a
          href="#main-content"
          className="sr-only absolute left-4 top-4 z-50 rounded-xl bg-primary px-3 py-2 text-base font-semibold text-primary-ink focus:not-sr-only"
        >
          Skip to main content
        </a>
        <div className="serpo-shell">
          <SerpoWallpaper />
          <SideNav />
          <div className="serpo-workspace">
            <WorkspaceHeader />
            <main id="main-content" tabIndex={-1} className="serpo-main">
              <div className="serpo-main-content">
                <PageTransition>{children}</PageTransition>
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
