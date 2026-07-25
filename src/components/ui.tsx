"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "default" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors " +
  "disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  default: "bg-raised border border-line text-ink hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-ink",
  danger: "bg-danger-soft text-danger hover:brightness-95 border border-transparent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-3 text-sm",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function IconButton({
  label,
  active,
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center justify-center rounded-md transition-colors shrink-0",
        "disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Segmented control used for tool pickers on the canvas and deck surfaces. */
export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-0.5 rounded-lg bg-sunken p-0.5", className)}>
      {children}
    </div>
  );
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical ? (
    <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
  ) : (
    <div className="my-1 h-px w-full bg-[var(--border)]" />
  );
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-8 w-full rounded-md border border-line bg-bg px-2 text-sm text-ink",
        "placeholder:text-faint focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink",
        "placeholder:text-faint focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <label className="flex items-center justify-between gap-3 text-xs" htmlFor={id}>
      <span className="shrink-0 text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

/** Colour swatch row used by every surface's style controls. */
export function ColorPicker({
  value,
  onChange,
  colors,
  allowNone,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  colors: readonly string[];
  allowNone?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {allowNone && (
        <button
          type="button"
          title="None"
          aria-label="No colour"
          onClick={() => onChange(null)}
          className={cx(
            "relative h-5 w-5 overflow-hidden rounded border",
            value === null ? "border-accent ring-1 ring-accent" : "border-line",
          )}
        >
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-danger" />
        </button>
      )}
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={`Colour ${color}`}
          onClick={() => onChange(color)}
          style={{ background: color }}
          className={cx(
            "h-5 w-5 rounded border",
            value === color ? "border-accent ring-1 ring-accent" : "border-line",
          )}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Menu
 * ------------------------------------------------------------------ */

interface MenuContext {
  close: () => void;
}
const MenuCtx = createContext<MenuContext>({ close: () => {} });

export function Menu({
  trigger,
  children,
  align = "start",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <MenuCtx.Provider value={{ close }}>
          <div
            role="menu"
            className={cx(
              "absolute z-50 mt-1 min-w-44 rounded-lg border border-line bg-raised p-1",
              "shadow-[var(--shadow-lg)]",
              align === "end" ? "right-0" : "left-0",
              className,
            )}
          >
            {children}
          </div>
        </MenuCtx.Provider>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  shortcut,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
}) {
  const { close } = useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick?.();
        close();
      }}
      className={cx(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
        "disabled:opacity-40 disabled:pointer-events-none",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-hover",
      )}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-xs text-faint">{shortcut}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-faint">{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-h-[85vh] overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--shadow-lg)]"
      >
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "accent" | "ok" | "warn";
  children: ReactNode;
  title?: string;
}) {
  const tones = {
    neutral: "bg-sunken text-muted border-line",
    accent: "bg-accent-soft text-accent border-transparent",
    ok: "bg-ok-soft text-ok border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {hint && <div className="max-w-sm text-xs leading-relaxed text-muted">{hint}</div>}
      {action}
    </div>
  );
}

/**
 * Inline rename field. Used by the sidebar and tab bar; commits on blur or
 * Enter, reverts on Escape.
 */
export function InlineEdit({
  value,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) onCommit(trimmed);
        else onCancel();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const trimmed = draft.trim();
          if (trimmed) onCommit(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      className={cx(
        "w-full rounded border border-accent bg-bg px-1 py-0.5 text-sm text-ink outline-none",
        className,
      )}
    />
  );
}
