export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "garden.theme";

export function readThemePreference(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private browsing with storage disabled.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readAppliedTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Apply theme to the document root and persist the choice. */
export function applyTheme(mode: ThemeMode): void {
  const dark = mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Session-only when storage is unavailable.
  }
}

export function toggleTheme(): ThemeMode {
  const next = readAppliedTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

type ThemeListener = () => void;

export function subscribeTheme(listener: ThemeListener): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => observer.disconnect();
}

/** Inline bootstrap for layout.tsx — keep in sync with applyTheme(). */
export const THEME_BOOTSTRAP = `
try {
  var stored = localStorage.getItem('${STORAGE_KEY}');
  var dark = stored ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch (e) {}
`;
