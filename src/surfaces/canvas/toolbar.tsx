"use client";

import { Grid3x3, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { PALETTE, type CanvasBody } from "@/lib/docs/schema";
import { ColorPicker, Divider, IconButton, Menu, MenuItem, MenuLabel, ToolbarGroup } from "@/components/ui";
import { TOOL_SPECS, type Tool } from "./tools";

export interface CanvasStyle {
  stroke: string;
  fill: string | null;
  strokeWidth: number;
  fontSize: number;
}

export function CanvasToolbar({
  tool,
  onToolChange,
  style,
  onStyleChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  background,
  onBackgroundChange,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  style: CanvasStyle;
  onStyleChange: (style: CanvasStyle) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  background: CanvasBody["background"];
  onBackgroundChange: (background: CanvasBody["background"]) => void;
}) {
  const groups: Tool[][] = [
    TOOL_SPECS.filter((s) => s.group === "pointer").map((s) => s.id),
    TOOL_SPECS.filter((s) => s.group === "shape").map((s) => s.id),
    TOOL_SPECS.filter((s) => s.group === "ink").map((s) => s.id),
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-raised px-3 py-1.5">
      {groups.map((group, i) => (
        <ToolbarGroup key={i}>
          {group.map((id) => {
            const spec = TOOL_SPECS.find((s) => s.id === id)!;
            const Icon = spec.icon;
            return (
              <IconButton
                key={id}
                label={`${spec.label} (${spec.key.toUpperCase()})`}
                size="sm"
                active={tool === id}
                onClick={() => onToolChange(id)}
              >
                <Icon size={14} />
              </IconButton>
            );
          })}
        </ToolbarGroup>
      ))}

      <Divider vertical />

      <Menu
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title="Stroke and fill"
            className="flex h-7 items-center gap-1 rounded-md px-1.5 hover:bg-hover"
          >
            <span
              className="h-4 w-4 rounded-full border border-line"
              style={{ background: style.fill ?? "transparent", borderColor: style.stroke, borderWidth: 2 }}
            />
          </button>
        )}
      >
        <MenuLabel>Stroke</MenuLabel>
        <div className="px-2 pb-2">
          <ColorPicker
            value={style.stroke}
            colors={PALETTE}
            onChange={(stroke) => onStyleChange({ ...style, stroke: stroke ?? style.stroke })}
          />
        </div>
        <MenuLabel>Fill</MenuLabel>
        <div className="px-2 pb-2">
          <ColorPicker
            allowNone
            value={style.fill}
            colors={["#eceafe", "#e0f2fe", "#dcfce7", "#fef3c7", "#fee2e2", "#f3e8ff", "#f1f5f9"]}
            onChange={(fill) => onStyleChange({ ...style, fill })}
          />
        </div>
        <MenuLabel>Weight</MenuLabel>
        <div className="flex gap-1 px-2 pb-2">
          {[1, 2, 4, 8].map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => onStyleChange({ ...style, strokeWidth: width })}
              className={`flex h-6 w-8 items-center justify-center rounded border ${
                style.strokeWidth === width ? "border-accent bg-accent-soft" : "border-line"
              }`}
              aria-label={`${width} pixel stroke`}
            >
              <span className="w-4 rounded-full bg-ink" style={{ height: Math.min(width, 6) }} />
            </button>
          ))}
        </div>
      </Menu>

      <div className="ml-auto flex items-center gap-1">
        <Menu
          align="end"
          trigger={({ toggle }) => (
            <IconButton label="Background" size="sm" onClick={toggle}>
              <Grid3x3 size={14} />
            </IconButton>
          )}
        >
          <MenuLabel>Background</MenuLabel>
          {(["grid", "dots", "plain"] as const).map((option) => (
            <MenuItem
              key={option}
              onClick={() => onBackgroundChange(option)}
              icon={background === option ? <span className="text-accent">•</span> : <span> </span>}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </MenuItem>
          ))}
        </Menu>

        <IconButton label="Zoom out" size="sm" onClick={onZoomOut}>
          <ZoomOut size={14} />
        </IconButton>
        <button
          type="button"
          onClick={onZoomReset}
          title="Reset zoom to 100%"
          className="min-w-11 rounded px-1 text-xs tabular-nums text-muted hover:bg-hover hover:text-ink"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" size="sm" onClick={onZoomIn}>
          <ZoomIn size={14} />
        </IconButton>
        <IconButton label="Fit to content" size="sm" onClick={onFit}>
          <Maximize2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}
