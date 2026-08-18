"use client";

import type { DocKind } from "@/lib/docs/schema";
import { getSurface } from "@/lib/surfaces";

export function DocIcon({
  kind,
  size = 15,
  className,
  colored = true,
}: {
  kind: DocKind;
  size?: number;
  className?: string;
  colored?: boolean;
}) {
  const surface = getSurface(kind);
  const Icon = surface.icon;
  return (
    <Icon
      size={size}
      className={className}
      style={colored ? { color: surface.iconColor } : undefined}
      aria-hidden
    />
  );
}

/** Per-kind accent for callers that need the color without the icon component. */
export function kindColor(kind: DocKind): string {
  return getSurface(kind).iconColor;
}
