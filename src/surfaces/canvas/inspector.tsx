"use client";

import { Layers, Trash2 } from "lucide-react";
import { PALETTE, type CanvasNode } from "@/lib/docs/schema";
import { Button, ColorPicker, Divider, Field, Menu, MenuItem, cx } from "@/components/ui";

/**
 * Floating panel for the current selection. Edits are applied to every selected
 * node at once, which is why it shows the first node's value as representative
 * rather than trying to merge conflicting ones.
 */
export function CanvasInspector({
  nodes,
  onPatch,
  onDelete,
  onReorder,
}: {
  nodes: CanvasNode[];
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onReorder: (direction: "front" | "back" | "up" | "down") => void;
}) {
  if (nodes.length === 0) return null;

  const first = nodes[0];
  const anyStroked = nodes.some((n) => "stroke" in n);
  const anyFilled = nodes.some((n) => "fill" in n);
  const anyText = nodes.some((n) => "text" in n || n.kind === "connector");
  const anyConnector = nodes.some((n) => n.kind === "connector");

  return (
    <div
      className={cx(
        "absolute right-3 top-3 w-52 rounded-lg border border-line bg-raised p-2.5",
        "shadow-[var(--shadow-md)]",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink">
          {nodes.length === 1 ? first.kind : `${nodes.length} selected`}
        </span>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete selection">
          <Trash2 size={13} />
        </Button>
      </div>

      <div className="space-y-2">
        {anyStroked && (
          <div>
            <div className="mb-1 text-[11px] text-muted">Stroke</div>
            <ColorPicker
              value={"stroke" in first ? first.stroke : null}
              colors={PALETTE}
              onChange={(stroke) => stroke && onPatch({ stroke })}
            />
          </div>
        )}

        {anyFilled && (
          <div>
            <div className="mb-1 text-[11px] text-muted">Fill</div>
            <ColorPicker
              allowNone
              value={"fill" in first ? first.fill : null}
              colors={["#eceafe", "#e0f2fe", "#dcfce7", "#fef3c7", "#fee2e2", "#f3e8ff", "#f1f5f9"]}
              onChange={(fill) => onPatch({ fill })}
            />
          </div>
        )}

        {anyText && (
          <Field label="Size">
            <input
              type="range"
              min={8}
              max={72}
              defaultValue={"fontSize" in first ? first.fontSize : 16}
              onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
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

        {anyConnector && (
          <Field label="Routing">
            <select
              defaultValue={first.kind === "connector" ? first.routing : "elbow"}
              onChange={(e) => onPatch({ routing: e.target.value })}
              className="h-6 w-full rounded border border-line bg-bg px-1 text-xs text-ink"
            >
              <option value="elbow">Elbow</option>
              <option value="straight">Straight</option>
            </select>
          </Field>
        )}

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
          <MenuItem onClick={() => onReorder("up")}>Bring forward</MenuItem>
          <MenuItem onClick={() => onReorder("down")}>Send backward</MenuItem>
          <MenuItem onClick={() => onReorder("back")}>Send to back</MenuItem>
        </Menu>
      </div>
    </div>
  );
}
