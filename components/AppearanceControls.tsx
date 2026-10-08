"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
type Motion = "full" | "reduced";
type MotionPreference = "system" | Motion;
type Appearance = { theme: Theme; motionPreference: MotionPreference; motion: Motion };

const THEME_KEY = "serpo-theme";
const MOTION_KEY = "serpo-motion";
const SERVER_SNAPSHOT: Appearance = { theme: "light", motionPreference: "system", motion: "full" };
const listeners = new Set<() => void>();
let themePreference: Theme | null | undefined;
let motionPreference: MotionPreference | undefined;
let snapshot: Appearance | undefined;
let stopListening: (() => void) | undefined;
let fallbackTimer: number | undefined;
let pendingTheme: Theme | undefined;

function storedValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPreferences() {
  if (themePreference === undefined) {
    const stored = storedValue(THEME_KEY);
    themePreference = stored === "light" || stored === "dark" ? stored : null;
  }
  if (motionPreference === undefined) {
    const stored = storedValue(MOTION_KEY);
    motionPreference = stored === "full" || stored === "reduced" ? stored : "system";
  }
}

function effectiveAppearance(): Appearance {
  readPreferences();
  return {
    theme: themePreference ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    motionPreference: motionPreference!,
    motion: motionPreference === "system"
      ? (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full")
      : motionPreference!,
  };
}

function getSnapshot(): Appearance {
  snapshot ??= effectiveAppearance();
  return snapshot;
}

function syncAppearance() {
  const next = effectiveAppearance();
  const root = document.documentElement;
  if (root.dataset.theme !== next.theme) root.dataset.theme = next.theme;
  if (root.dataset.motion !== next.motion) root.dataset.motion = next.motion;
  if (snapshot?.theme === next.theme && snapshot.motion === next.motion &&
      snapshot.motionPreference === next.motionPreference) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    dark.addEventListener("change", syncAppearance);
    reduced.addEventListener("change", syncAppearance);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_KEY) themePreference = undefined;
      if (event.key === null || event.key === MOTION_KEY) motionPreference = undefined;
      if (event.key === null || event.key === THEME_KEY || event.key === MOTION_KEY) syncAppearance();
    };
    window.addEventListener("storage", onStorage);
    stopListening = () => {
      dark.removeEventListener("change", syncAppearance);
      reduced.removeEventListener("change", syncAppearance);
      window.removeEventListener("storage", onStorage);
    };
    syncAppearance();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopListening?.();
      stopListening = undefined;
    }
  };
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The in-memory preference still works for this tab.
  }
}

function setTheme(theme: Theme) {
  themePreference = theme;
  savePreference(THEME_KEY, theme);
  syncAppearance();
}

function setMotion(preference: MotionPreference) {
  motionPreference = preference;
  savePreference(MOTION_KEY, preference);
  syncAppearance();
}

function toggleTheme() {
  const current = getSnapshot();
  const next = (pendingTheme ?? current.theme) === "dark" ? "light" : "dark";
  if (current.motion === "reduced") {
    setTheme(next);
  } else if (typeof document.startViewTransition === "function") {
    pendingTheme = next;
    document.startViewTransition(() => {
      setTheme(next);
      if (pendingTheme === next) pendingTheme = undefined;
    });
  } else {
    const root = document.documentElement;
    root.dataset.themeSwitching = "";
    void root.offsetWidth; // Establish the old colors before changing the theme.
    setTheme(next);
    window.clearTimeout(fallbackTimer);
    fallbackTimer = window.setTimeout(() => {
      delete root.dataset.themeSwitching;
      fallbackTimer = undefined;
    }, 300);
  }
}

export function ThemeToggle() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const nextTheme = appearance.theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="serpo-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={appearance.theme === "dark"}
      title={`Switch to ${nextTheme} theme`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {nextTheme === "dark" ? (
          <path d="M20.3 15.1A8.5 8.5 0 0 1 8.9 3.7 8.5 8.5 0 1 0 20.3 15.1Z" />
        ) : (
          <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4-1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
        )}
      </svg>
    </button>
  );
}

export function MotionPreferences() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return (
    <div className="card-soft p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
          Motion
          <select
            className="input-soft max-w-full px-2 py-1 text-base"
            value={appearance.motionPreference}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "system" || value === "full" || value === "reduced") setMotion(value);
            }}
          >
            <option value="system">System</option>
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>
        <p className="text-sm text-foreground-muted" role="status" aria-live="polite">
          Effective motion: <strong className="font-semibold text-foreground">{appearance.motion === "full" ? "Full" : "Reduced"}</strong>
        </p>
      </div>
    </div>
  );
}
