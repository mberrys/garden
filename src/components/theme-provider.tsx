"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { readAppliedTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";

/**
 * Subscribes to theme changes on <html> so client trees repaint when the class
 * flips. CSS variables update without React, but some embedded hosts only
 * repaint subtrees that re-render.
 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, readAppliedTheme, () => "light");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeMode();
  return (
    <div data-theme={mode} className="contents">
      {children}
    </div>
  );
}
