"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Plus } from "lucide-react";
import type { CellAlign, CellFormat, SheetDoc } from "@/lib/docs/schema";
import type { SheetOp } from "@/lib/ops";
import { evaluateSheet, type CellResult } from "@/lib/sheet/formula";
import { indexToCol, parseRef, toRef } from "@/lib/sheet/refs";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { Divider, IconButton, Input, ToolbarGroup, cx } from "@/components/ui";

const ROW_HEADER_W = 44;
const COL_W = 108;
const ROW_H = 28;
const DEFAULT_CELL: CellResult = { display: "", error: null, value: null, kind: "empty" };

export default function SheetSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: SheetDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const toast = useWorkspace((s) => s.toast);

  const { rows, cols, cells } = doc.body;
  const results = useMemo(() => evaluateSheet(doc.body), [doc.body]);

  const [selected, setSelected] = useState<string | null>(rows > 0 && cols > 0 ? "A1" : null);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const apply = useCallback(
    (ops: SheetOp[], label?: string) => {
      if (ops.length === 0) return true;
      const result = commit<"sheet">(doc.id, ops, { label });
      if (!result.ok) toast("error", result.error ?? "That change could not be applied.");
      return result.ok;
    },
    [commit, doc.id, toast],
  );

  /* ---------------- selection ---------------- */

  useEffect(() => {
    setSelection(doc.id, { kind: "sheet", cell: selected, range: null });
  }, [doc.id, selected, setSelection]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  // Clicking a different cell always commits whatever was being edited first —
  // an in-progress edit must never be silently dropped by a selection change.
  const commitEdit = useCallback(() => {
    if (!editingRef) return;
    apply([{ op: "setCell", ref: editingRef, value: editValue }], "Edit cell");
    setEditingRef(null);
  }, [editingRef, editValue, apply]);

  const selectCell = useCallback(
    (ref: string) => {
      if (editingRef && editingRef !== ref) commitEdit();
      setSelected(ref);
      // Clicking a cell must move keyboard focus to the grid — otherwise the
      // next keystroke (arrow keys, typing to start an edit) goes nowhere.
      gridRef.current?.focus();
    },
    [editingRef, commitEdit],
  );

  const beginEdit = useCallback((ref: string, initial: string) => {
    setEditingRef(ref);
    setEditValue(initial);
  }, []);

  useEffect(() => {
    if (editingRef) inputRef.current?.focus();
  }, [editingRef]);

  /* ---------------- keyboard ---------------- */

  const move = useCallback(
    (dr: number, dc: number) => {
      if (!selected) return;
      const coord = parseRef(selected);
      if (!coord) return;
      const row = Math.min(rows - 1, Math.max(0, coord.row + dr));
      const col = Math.min(cols - 1, Math.max(0, coord.col + dc));
      selectCell(toRef({ row, col }));
    },
    [selected, rows, cols, selectCell],
  );

  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (editingRef || !selected) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          move(-1, 0);
          return;
        case "ArrowDown":
          event.preventDefault();
          move(1, 0);
          return;
        case "ArrowLeft":
          event.preventDefault();
          move(0, -1);
          return;
        case "ArrowRight":
        case "Tab":
          event.preventDefault();
          move(0, 1);
          return;
        case "Enter":
        case "F2":
          event.preventDefault();
          beginEdit(selected, cells[selected]?.value ?? "");
          return;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          if (cells[selected]?.value) apply([{ op: "setCell", ref: selected, value: "" }], "Clear cell");
          return;
      }

      // A printable character starts a fresh edit, spreadsheet-style — the
      // character replaces whatever was there rather than appending to it.
      if (event.key.length === 1) {
        event.preventDefault();
        beginEdit(selected, event.key);
      }
    },
    [editingRef, selected, move, beginEdit, cells, apply],
  );

  const onCellInputKeyDown = useCallback(
    (event: React.KeyboardEvent, ref: string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        apply([{ op: "setCell", ref, value: editValue }], "Edit cell");
        setEditingRef(null);
        move(1, 0);
      } else if (event.key === "Tab") {
        event.preventDefault();
        apply([{ op: "setCell", ref, value: editValue }], "Edit cell");
        setEditingRef(null);
        move(0, event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setEditingRef(null);
      }
    },
    [editValue, apply, move],
  );

  /* ---------------- toolbar ---------------- */

  const selectedCell = selected ? (cells[selected] ?? null) : null;

  const styleSelected = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selected) return;
      apply([{ op: "setStyle", refs: [selected], patch }], "Style cell");
    },
    [selected, apply],
  );

  const addRow = useCallback(() => apply([{ op: "resize", rows: rows + 1 }], "Add row"), [apply, rows]);
  const addCol = useCallback(() => apply([{ op: "resize", cols: cols + 1 }], "Add column"), [apply, cols]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-raised px-3 py-1.5">
        <ToolbarGroup>
          <IconButton
            label="Bold"
            size="sm"
            active={selectedCell?.bold}
            disabled={!selected}
            onClick={() => styleSelected({ bold: !selectedCell?.bold })}
          >
            <Bold size={13} />
          </IconButton>
          <IconButton
            label="Italic"
            size="sm"
            active={selectedCell?.italic}
            disabled={!selected}
            onClick={() => styleSelected({ italic: !selectedCell?.italic })}
          >
            <Italic size={13} />
          </IconButton>
        </ToolbarGroup>

        <ToolbarGroup>
          {(["left", "center", "right"] as CellAlign[]).map((align) => {
            const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
            return (
              <IconButton
                key={align}
                label={`Align ${align}`}
                size="sm"
                active={(selectedCell?.align ?? "left") === align}
                disabled={!selected}
                onClick={() => styleSelected({ align })}
              >
                <Icon size={13} />
              </IconButton>
            );
          })}
        </ToolbarGroup>

        <select
          aria-label="Number format"
          disabled={!selected}
          value={selectedCell?.format ?? "auto"}
          onChange={(e) => styleSelected({ format: e.target.value as CellFormat })}
          className="h-6 rounded-md border border-line bg-bg px-1.5 text-xs text-ink disabled:opacity-40"
        >
          <option value="auto">Auto</option>
          <option value="number">Number</option>
          <option value="currency">Currency</option>
          <option value="percent">Percent</option>
          <option value="text">Text</option>
        </select>

        <Divider vertical />

        <span className="w-10 shrink-0 text-xs text-faint">{selected ?? ""}</span>
        <Input
          aria-label="Formula bar"
          value={editingRef === selected ? editValue : (selectedCell?.value ?? "")}
          placeholder={selected ? "" : "Select a cell"}
          disabled={!selected}
          onChange={(e) => {
            if (!selected) return;
            if (editingRef !== selected) setEditingRef(selected);
            setEditValue(e.target.value);
          }}
          onKeyDown={(e) => selected && onCellInputKeyDown(e, selected)}
          onBlur={commitEdit}
          className="h-6 max-w-xs text-xs"
        />

        <span className="ml-auto flex items-center gap-1">
          <IconButton label="Add row" size="sm" onClick={addRow}>
            <Plus size={13} />
          </IconButton>
          <span className="text-[10px] text-faint">row</span>
          <IconButton label="Add column" size="sm" onClick={addCol}>
            <Plus size={13} />
          </IconButton>
          <span className="text-[10px] text-faint">col</span>
        </span>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={`${doc.title} grid`}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        className="min-h-0 flex-1 overflow-auto bg-sunken outline-none"
      >
        <div
          style={{ display: "grid", gridTemplateColumns: `${ROW_HEADER_W}px repeat(${cols}, ${COL_W}px)` }}
        >
          <div
            className="sticky left-0 top-0 z-20 border-b border-r border-line bg-raised"
            style={{ height: ROW_H }}
          />
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={`h${c}`}
              className="sticky top-0 z-10 flex items-center justify-center border-b border-r border-line bg-raised text-[11px] font-medium text-muted"
              style={{ height: ROW_H }}
            >
              {indexToCol(c)}
            </div>
          ))}

          {Array.from({ length: rows }, (_, r) => (
            <RowCells
              key={r}
              row={r}
              cols={cols}
              cells={cells}
              results={results}
              selected={selected}
              editingRef={editingRef}
              editValue={editValue}
              inputRef={inputRef}
              onSelect={selectCell}
              onEdit={beginEdit}
              onChangeEditValue={setEditValue}
              onEditKeyDown={onCellInputKeyDown}
              onBlurInput={commitEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Row / cell rendering — split out so a keystroke in one cell only
 * re-renders that row, not the whole grid.
 * ------------------------------------------------------------------ */

function RowCells({
  row,
  cols,
  cells,
  results,
  selected,
  editingRef,
  editValue,
  inputRef,
  onSelect,
  onEdit,
  onChangeEditValue,
  onEditKeyDown,
  onBlurInput,
}: {
  row: number;
  cols: number;
  cells: SheetDoc["body"]["cells"];
  results: Map<string, CellResult>;
  selected: string | null;
  editingRef: string | null;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (ref: string) => void;
  onEdit: (ref: string, initial: string) => void;
  onChangeEditValue: (value: string) => void;
  onEditKeyDown: (event: React.KeyboardEvent, ref: string) => void;
  onBlurInput: () => void;
}) {
  return (
    <>
      <div
        className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-line bg-raised text-[11px] text-faint"
        style={{ height: ROW_H }}
      >
        {row + 1}
      </div>
      {Array.from({ length: cols }, (_, c) => {
        const ref = toRef({ row, col: c });
        const cell = cells[ref];
        const result = results.get(ref) ?? DEFAULT_CELL;
        const isSelected = selected === ref;
        const isEditing = editingRef === ref;

        return (
          <div
            key={ref}
            role="gridcell"
            aria-label={ref}
            data-cell={ref}
            onClick={() => onSelect(ref)}
            onDoubleClick={() => onEdit(ref, cell?.value ?? "")}
            className={cx(
              "relative flex items-center overflow-hidden border-b border-r border-line bg-bg px-1.5 text-xs",
              isSelected && "outline outline-2 -outline-offset-2 outline-accent",
              cell?.bold && "font-semibold",
              cell?.italic && "italic",
              result.kind === "error" && "text-red-500",
              (cell?.align ?? "left") === "center" && "justify-center text-center",
              (cell?.align ?? "left") === "right" && "justify-end text-right",
            )}
            style={{ height: ROW_H }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                aria-label={`Edit ${ref}`}
                value={editValue}
                onChange={(e) => onChangeEditValue(e.target.value)}
                onKeyDown={(e) => onEditKeyDown(e, ref)}
                onBlur={onBlurInput}
                className="h-full w-full border-none bg-bg text-xs text-ink outline-none"
              />
            ) : (
              <span className="truncate text-ink">{result.display}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
