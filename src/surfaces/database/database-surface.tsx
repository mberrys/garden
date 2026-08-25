"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  CellValue,
  DatabaseDoc,
  DatabaseField,
  DatabaseRow,
  DatabaseView,
  Doc,
  ExternalRef,
  GardenRef,
} from "@/lib/docs/schema";
import { newRowId } from "@/lib/docs/ids";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { queryRows, rowDate, monthCells } from "@/lib/database/query";
import { resolveGardenRef } from "@/lib/refs";
import { Button, cx } from "@/components/ui";

function cellDisplay(
  field: DatabaseField,
  value: CellValue | undefined,
  docs: Record<string, Doc>,
): string {
  if (value === undefined || value === null) return "";
  switch (field.type) {
    case "checkbox":
      return value ? "Yes" : "No";
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : "";
    case "relation":
      return Array.isArray(value) ? `${value.length} linked` : "";
    case "garden_ref": {
      return resolveGardenRef(value as GardenRef, docs).label;
    }
    case "external_ref": {
      const ref = value as ExternalRef;
      return ref.provider + (ref.externalId ? ` · ${ref.externalId}` : "");
    }
    case "text":
    case "number":
    case "date":
    case "select":
    case "url":
    case "file":
      return String(value);
    default: {
      const _exhaustive: never = field;
      return String(_exhaustive);
    }
  }
}

export default function DatabaseSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: DatabaseDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const docs = useWorkspace((s) => s.docs);

  const activeView =
    doc.body.views.find((v) => v.id === doc.body.activeViewId) ?? doc.body.views[0];
  const visibleFields = useMemo(() => {
    if (!activeView || activeView.type !== "grid") return doc.body.fields;
    return doc.body.fields.filter((f) => !activeView.hiddenFieldIds.includes(f.id));
  }, [doc.body.fields, activeView]);

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const selectedRow = doc.body.rows.find((r) => r.id === selectedRowId) ?? null;

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  const selectRow = useCallback(
    (rowId: string | null, fieldId: string | null = null) => {
      setSelectedRowId(rowId);
      setSelection(
        doc.id,
        rowId ? { kind: "database", rowId, fieldId } : null,
      );
    },
    [doc.id, setSelection],
  );

  const setActiveView = (viewId: string) => {
    commit(doc.id, [{ op: "setActiveView", id: viewId }], { label: "Switch view" });
  };

  const addRow = () => {
    const id = newRowId();
    commit(doc.id, [{ op: "addRow", row: { id, cells: {} } }], { label: "Add row" });
    selectRow(id);
  };

  const filterText =
    activeView?.filters?.find((filter) => filter.op === "contains")?.value ?? "";

  const setFilter = (value: string) => {
    if (!activeView) return;
    const textField = doc.body.fields.find((f) => f.type === "text");
    commit(
      doc.id,
      [
        {
          op: "updateView",
          id: activeView.id,
          patch: {
            filters: value.trim() && textField
              ? [{ fieldId: textField.id, op: "contains", value: value.trim() }]
              : [],
          },
        },
      ],
      { coalesceKey: `db-filter:${doc.id}`, label: "Filter rows" },
    );
  };

  const setCell = (rowId: string, fieldId: string, value: CellValue) => {
    commit(doc.id, [{ op: "setCell", rowId, fieldId, value }], {
      coalesceKey: `db-cell:${doc.id}:${rowId}:${fieldId}`,
      label: "Edit cell",
    });
  };

  const rows = queryRows(doc.body.rows, doc.body.fields, activeView);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {doc.body.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
              className={cx(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                view.id === activeView?.id
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              {view.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            aria-label="Filter rows"
            placeholder="Filter"
            value={typeof filterText === "string" ? filterText : ""}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 w-36 rounded-md border border-line bg-bg px-2 text-xs"
          />
          <span className="text-[10px] text-faint">
            {rows.length === doc.body.rows.length
              ? `${doc.body.rows.length} rows`
              : `${rows.length}/${doc.body.rows.length} rows`}
          </span>
          <Button size="sm" variant="default" onClick={addRow}>Add row</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {activeView?.type === "kanban" ? (
            <KanbanView
              view={activeView}
              rows={rows}
              fields={doc.body.fields}
              docs={docs}
              selectedRowId={selectedRowId}
              onSelectRow={selectRow}
            />
          ) : activeView?.type === "calendar" ? (
            <CalendarView
              view={activeView}
              rows={rows}
              fields={doc.body.fields}
              docs={docs}
              selectedRowId={selectedRowId}
              onSelectRow={selectRow}
            />
          ) : (
            <GridView
              fields={visibleFields}
              rows={rows}
              docs={docs}
              selectedRowId={selectedRowId}
              onSelectRow={selectRow}
              onSetCell={setCell}
            />
          )}
        </div>

        {selectedRow && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-line bg-raised p-3">
            <RowInspector
              row={selectedRow}
              fields={doc.body.fields}
              docs={docs}
              onSetCell={setCell}
              onClose={() => selectRow(null)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<DatabaseRow>();
const ROW_HEIGHT = 36;

function GridView({
  fields,
  rows,
  docs,
  selectedRowId,
  onSelectRow,
  onSetCell,
}: {
  fields: DatabaseField[];
  rows: DatabaseRow[];
  docs: Record<string, Doc>;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onSetCell: (rowId: string, fieldId: string, value: CellValue) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(
    () =>
      fields.map((field) =>
        columnHelper.accessor((row) => row.cells[field.id], {
          id: field.id,
          header: field.name,
          cell: (info) => (
            <CellEditor
              field={field}
              value={info.getValue()}
              docs={docs}
              onChange={(value) => onSetCell(info.row.original.id, field.id, value)}
            />
          ),
        }),
      ),
    [fields, docs, onSetCell],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  if (fields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        No fields yet.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto" data-virtualized-grid="true">
      <div className="sticky top-0 z-10 flex min-w-max border-b border-line bg-raised text-xs">
        {table.getHeaderGroups().map((group) =>
          group.headers.map((header) => (
            <div
              key={header.id}
              className="w-44 shrink-0 px-2 py-1.5 font-medium text-muted"
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          )),
        )}
      </div>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = tableRows[item.index];
          return (
            <div
              key={row.id}
              data-index={item.index}
              className={cx(
                "absolute left-0 flex min-w-max cursor-pointer border-b border-line hover:bg-hover",
                selectedRowId === row.original.id && "bg-accent/10",
              )}
              style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }}
              onClick={() => onSelectRow(row.original.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className="w-44 shrink-0 px-2 py-1">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanView({
  view,
  rows,
  fields,
  docs,
  selectedRowId,
  onSelectRow,
}: {
  view: Extract<DatabaseView, { type: "kanban" }>;
  rows: DatabaseRow[];
  fields: DatabaseField[];
  docs: Record<string, Doc>;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
}) {
  const groupField = fields.find((f) => f.id === view.groupFieldId);
  const options =
    groupField?.type === "select" ? groupField.options : groupField?.type === "multi_select" ? groupField.options : [];

  const columns = options.length > 0 ? options : ["Unassigned"];

  return (
    <div className="flex h-full gap-3 p-3 overflow-x-auto">
      {columns.map((option) => {
        const columnRows = rows.filter((row) => {
          const val = row.cells[view.groupFieldId];
          return val === option || (option === "Unassigned" && !val);
        });
        return (
          <div key={option} className="flex w-52 shrink-0 flex-col rounded-lg border border-line bg-raised">
            <div className="border-b border-line px-2 py-1.5 text-[11px] font-medium text-muted">
              {option}
              <span className="ml-1 text-faint">({columnRows.length})</span>
            </div>
            <div className="flex flex-col gap-1 p-2 min-h-[120px]">
              {columnRows.map((row) => {
                const titleField = fields.find((f) => f.type === "text");
                const title = titleField
                  ? cellDisplay(titleField, row.cells[titleField.id], docs)
                  : row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelectRow(row.id)}
                    className={cx(
                      "rounded-md border border-line bg-bg px-2 py-1.5 text-left text-[11px] text-ink hover:border-accent",
                      selectedRowId === row.id && "border-accent bg-accent/5",
                    )}
                  >
                    {title || "Untitled row"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({
  view,
  rows,
  fields,
  docs,
  selectedRowId,
  onSelectRow,
}: {
  view: Extract<DatabaseView, { type: "calendar" }>;
  rows: DatabaseRow[];
  fields: DatabaseField[];
  docs: Record<string, Doc>;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
}) {
  const now = new Date();
  const days = monthCells(now.getFullYear(), now.getMonth());
  const titleField = fields.find((f) => f.type === "text");
  return (
    <div className="grid h-full grid-cols-7 gap-px bg-line p-px">
      {days.map((day) => {
        const key = day.toISOString().slice(0, 10);
        const dayRows = rows.filter((row) => rowDate(row, view.dateFieldId) === key);
        return (
          <div key={key} className="min-h-[88px] bg-bg p-1">
            <div className="text-[10px] text-faint">{day.getDate()}</div>
            {dayRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelectRow(row.id)}
                className={cx(
                  "mt-0.5 w-full truncate rounded px-1 text-left text-[10px]",
                  selectedRowId === row.id ? "bg-accent text-accent-fg" : "bg-raised",
                )}
              >
                {titleField ? cellDisplay(titleField, row.cells[titleField.id], docs) : row.id}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CellEditor({
  field,
  value,
  docs,
  onChange,
}: {
  field: DatabaseField;
  value: CellValue | undefined;
  docs: Record<string, Doc>;
  onChange: (value: CellValue) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-[100px] rounded border border-line bg-bg px-1 py-0.5 text-xs"
      >
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full min-w-[80px] rounded border border-line bg-bg px-1 py-0.5 text-xs"
      />
    );
  }

  if (field.type === "relation") {
    const targetDoc = docs[field.targetDocId];
    const linked = Array.isArray(value) ? value : [];
    const targetRows =
      targetDoc?.kind === "database" ? targetDoc.body.rows : [];
    return (
      <select
        value={linked[0] ?? ""}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        className="w-full min-w-[120px] rounded border border-line bg-bg px-1 py-0.5 text-xs"
      >
        <option value="">—</option>
        {targetRows.map((row) => {
          const nameField =
            targetDoc?.kind === "database"
              ? targetDoc.body.fields.find((f) => f.type === "text")
              : undefined;
          const label = nameField
            ? cellDisplay(nameField, row.cells[nameField.id], docs)
            : row.id;
          return (
            <option key={row.id} value={row.id}>{label || row.id}</option>
          );
        })}
      </select>
    );
  }

  if (field.type === "garden_ref" || field.type === "external_ref") {
    return (
      <span className="text-[11px] text-muted">{cellDisplay(field, value, docs) || "—"}</span>
    );
  }

  return (
    <input
      type={field.type === "url" ? "url" : field.type === "date" ? "date" : "text"}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[100px] rounded border border-line bg-bg px-1 py-0.5 text-xs"
    />
  );
}

function RowInspector({
  row,
  fields,
  docs,
  onSetCell,
  onClose,
}: {
  row: DatabaseRow;
  fields: DatabaseField[];
  docs: Record<string, Doc>;
  onSetCell: (rowId: string, fieldId: string, value: CellValue) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-ink">Row</div>
        <button type="button" onClick={onClose} className="text-[10px] text-muted hover:text-ink">
          Close
        </button>
      </div>
      {fields.map((field) => (
        <label key={field.id} className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted">{field.name}</span>
          <CellEditor
            field={field}
            value={row.cells[field.id]}
            docs={docs}
            onChange={(value) => onSetCell(row.id, field.id, value)}
          />
        </label>
      ))}
    </div>
  );
}
