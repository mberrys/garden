"use client";

import { FileText, FileType2, Presentation, Shapes, Table2 } from "lucide-react";
import type { DocKind } from "@/lib/docs/schema";

const ICONS = {
  text: FileText,
  pdf: FileType2,
  deck: Presentation,
  canvas: Shapes,
  database: Table2,
} as const;

/** Per-kind accent, so a document's kind is readable at a glance in the tree. */
export const KIND_COLOR: Record<DocKind, string> = {
  text: "#0ea5e9",
  pdf: "#ef4444",
  deck: "#f59e0b",
  canvas: "#8b5cf6",
  database: "#10b981",
};

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
  const Icon = ICONS[kind];
  return (
    <Icon
      size={size}
      className={className}
      style={colored ? { color: KIND_COLOR[kind] } : undefined}
      aria-hidden
    />
  );
}
