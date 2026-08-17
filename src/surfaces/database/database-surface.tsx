"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CellValue,
  DatabaseDoc,
  DatabaseField,
  DatabaseRow,
  DatabaseView,
  ExternalRef,
  GardenRef,
} from "@/lib/docs/schema";
import { newRowId } from "@/lib/docs/ids";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { Button, cx } from "@/components/ui";

function cellDisplay(
  field: DatabaseField,
  value: CellValue | undefined,
  docs: Record<string, import("@/lib/docs/schema").Doc>,
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
      const ref = value as GardenRef;
      const doc = docs[ref.documentId];
      return doc?.title ?? ref.documentId;
    }
    case "external_ref": {
      const ref = value as ExternalRef;
      return ref.provider + (ref.externalId ? ` · ${ref.externalId}` : "");
    }
    default:
      return String(value);
  }
}

function sortRows(
  rows: DatabaseRow[],
  fields: DatabaseField[],
  view: DatabaseView | undefined,
): DatabaseRow[] {
  if (!view || view.type !== "grid" || !view.sortFieldId) return rows;
  const field = fields.find((f) => f.id === view.sortFieldId);
  if (!field) return rows;
  const dir = view.sortDirection === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a.cells[field.id];
    const bv = b.cells[field.id];
    const as = cellSortKey(field, av);
    const bs = cellSortKey(field, bv);
    if (as < bs) return -1 * dir;
    if (as > bs) return 1 * dir;
    return 0;
  });
}

function cellSortKey(field: DatabaseField, value: CellValue | undefined): string | number {
  if (value === undefined || value === null) return "";
  if (field.type === "number" && typeof value === "number") return value;
  return cellDisplay(field, value, {});
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

  const setCell = (rowId: string, fieldId: string, value: CellValue) => {
    commit(doc.id, [{ op: "setCell", rowId, fieldId, value }], {
      coalesceKey: `db-cell:${doc.id}:${rowId}:${fieldId}`,
      label: "Edit cell",
    });
  };

  const rows = sortRows(doc.body.rows, doc.body.fields, activeView);

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
          <span className="text-[10px] text-faint">{doc.body.rows.length} rows</span>
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
  docs: Record<string, import("@/lib/docs/schema").Doc>;
  selectedRowId: string | null;
  onSelectRow: (rowId: string) => void;
  onSetCell: (rowId: string, fieldId: string, value: CellValue) => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        No fields yet.
      </div>
    );
  }

  return (
    <table className="w-full min-w-max border-collapse text-xs">
      <thead className="sticky top-0 z-10 bg-raised">
        <tr>
          {fields.map((field) => (
            <th
              key={field.id}
              className="border-b border-line px-2 py-1.5 text-left font-medium text-muted"
            >
              {field.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={cx(
              "cursor-pointer hover:bg-hover",
              selectedRowId === row.id && "bg-accent/10",
            )}
            onClick={() => onSelectRow(row.id)}
          >
            {fields.map((field) => (
              <td key={field.id} className="border-b border-line px-2 py-1 align-top">
                <CellEditor
                  field={field}
                  value={row.cells[field.id]}
                  docs={docs}
                  onChange={(value) => onSetCell(row.id, field.id, value)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
  view: import("@/lib/docs/schema").DatabaseView & { type: "kanban" };
  rows: DatabaseRow[];
  fields: DatabaseField[];
  docs: Record<string, import("@/lib/docs/schema").Doc>;
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

function CellEditor({
  field,
  value,
  docs,
  onChange,
}: {
  field: DatabaseField;
  value: CellValue | undefined;
  docs: Record<string, import("@/lib/docs/schema").Doc>;
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
  docs: Record<string, import("@/lib/docs/schema").Doc>;
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
