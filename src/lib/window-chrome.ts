type DesktopHost = "tauri" | "electron" | "none";

function detectDesktopHost(): DesktopHost {
  if (typeof window === "undefined") return "none";

  const w = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<unknown> };
    electronAPI?: { toggleMaximize?: () => void; windowToggleMaximize?: () => void };
  };

  if (w.__TAURI__ || w.__TAURI_INTERNALS__?.invoke) return "tauri";
  if (w.electronAPI?.toggleMaximize || w.electronAPI?.windowToggleMaximize) return "electron";
  return "none";
}

/** True when the page is hosted in a frameless desktop shell that honors drag regions. */
export function supportsWindowChrome(): boolean {
  if (typeof window === "undefined") return false;
  if (detectDesktopHost() !== "none") return true;
  // Electron BrowserWindow forwards drag/maximize for -webkit-app-region even
  // without an explicit preload bridge.
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}

export async function toggleWindowMaximize(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const w = window as Window & {
    __TAURI__?: { window?: { getCurrentWindow: () => { toggleMaximize: () => Promise<void> } } };
    __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    electronAPI?: { toggleMaximize?: () => void; windowToggleMaximize?: () => void };
  };

  if (w.__TAURI__?.window) {
    await w.__TAURI__.window.getCurrentWindow().toggleMaximize();
    return true;
  }

  if (w.__TAURI_INTERNALS__?.invoke) {
    try {
      await w.__TAURI_INTERNALS__.invoke("plugin:window|toggle_maximize");
      return true;
    } catch {
      // Fall through to other hosts.
    }
  }

  const electron = w.electronAPI;
  if (electron?.toggleMaximize) {
    electron.toggleMaximize();
    return true;
  }
  if (electron?.windowToggleMaximize) {
    electron.windowToggleMaximize();
    return true;
  }

  return false;
}

export function isInteractiveWindowChromeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, option, label, summary, [role='button'], [contenteditable='true'], .window-no-drag",
    ),
  );
}
