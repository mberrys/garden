"use client";

import { useCallback, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { isInteractiveWindowChromeTarget, toggleWindowMaximize } from "@/lib/window-chrome";

/**
 * A strip that behaves like a native title bar in frameless desktop hosts:
 * drag to move, double-click empty space to toggle maximize.
 */
export function WindowChromeStrip({
  as: Tag = "div",
  children,
  className,
  onDoubleClick,
  ...props
}: {
  as?: "div" | "header";
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">) {
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      onDoubleClick?.(event);
      if (event.defaultPrevented) return;
      if (isInteractiveWindowChromeTarget(event.target)) return;
      void toggleWindowMaximize();
    },
    [onDoubleClick],
  );

  return (
    <Tag className={cx("window-chrome", className)} onDoubleClick={handleDoubleClick} {...props}>
      {children}
    </Tag>
  );
}
