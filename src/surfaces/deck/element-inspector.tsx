"use client";

import { Layers, Trash2 } from "lucide-react";
import { PALETTE, type SlideElement } from "@/lib/docs/schema";
import { Button, ColorPicker, Divider, Field, Menu, MenuItem } from "@/components/ui";

/** Style controls for the selected slide element(s). */
export function ElementInspector({
  elements,
  onPatch,
  onDelete,
  onReorder,
}: {
  elements: SlideElement[];
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onReorder: (direction: "front" | "back") => void;
}) {
  if (elements.length === 0) return null;

  const first = elements[0];
  const hasType = (type: SlideElement["type"]) => elements.some((e) => e.type === type);
  const textual = hasType("text") || hasType("bullets");

  return (
    <div className="w-52 shrink-0 space-y-2 overflow-y-auto border-l border-line bg-raised p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink">
          {elements.length === 1 ? first.type : `${elements.length} selected`}
        </span>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete element">
          <Trash2 size={13} />
        </Button>
      </div>

      {textual && (
        <>
          <Field label="Size">
            <input
              type="range"
              min={10}
              max={90}
              defaultValue={"fontSize" in first ? first.fontSize : 24}
              onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
          <div>
            <div className="mb-1 text-[11px] text-muted">Colour</div>
            <ColorPicker
              value={"color" in first ? first.color : null}
              colors={["#16181d", "#61666e", ...PALETTE]}
              onChange={(color) => color && onPatch({ color })}
            />
          </div>
        </>
      )}

      {hasType("text") && (
        <>
          <Field label="Align">
            <select
              defaultValue={first.type === "text" ? first.align : "left"}
              onChange={(e) => onPatch({ align: e.target.value })}
              className="h-6 w-full rounded border border-line bg-bg px-1 text-xs text-ink"
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Weight">
            <select
              defaultValue={first.type === "text" ? first.weight : "normal"}
              onChange={(e) => onPatch({ weight: e.target.value })}
              className="h-6 w-full rounded border border-line bg-bg px-1 text-xs text-ink"
            >
              <option value="normal">Normal</option>
              <option value="semibold">Semibold</option>
              <option value="bold">Bold</option>
            </select>
          </Field>
        </>
      )}

      {hasType("bullets") && (
        <Field label="Marker">
          <select
            defaultValue={first.type === "bullets" ? first.marker : "disc"}
            onChange={(e) => onPatch({ marker: e.target.value })}
            className="h-6 w-full rounded border border-line bg-bg px-1 text-xs text-ink"
          >
            <option value="disc">Dot</option>
            <option value="dash">Dash</option>
            <option value="number">Number</option>
            <option value="none">None</option>
          </select>
        </Field>
      )}

      {hasType("shape") && (
        <div>
          <div className="mb-1 text-[11px] text-muted">Fill</div>
          <ColorPicker
            allowNone
            value={first.type === "shape" ? first.fill : null}
            colors={PALETTE}
            onChange={(fill) => onPatch({ fill })}
          />
        </div>
      )}

      <Field label="Opacity">
        <input
          type="range"
          min={10}
          max={100}
          defaultValue={Math.round(first.opacity * 100)}
          onChange={(e) => onPatch({ opacity: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--accent)]"
        />
      </Field>

      <Divider />

      <Menu
        trigger={({ toggle }) => (
          <Button size="sm" variant="ghost" onClick={toggle} className="w-full justify-start">
            <Layers size={13} />
            Arrange
          </Button>
        )}
      >
        <MenuItem onClick={() => onReorder("front")}>Bring to front</MenuItem>
        <MenuItem onClick={() => onReorder("back")}>Send to back</MenuItem>
      </Menu>
    </div>
  );
}
