import type { CellValue, DatabaseField, DatabaseRow, DatabaseView, ViewFilter } from "@/lib/docs/schema";

export function cellSortKey(field: DatabaseField, value: CellValue | undefined): string | number {
  if (value === undefined || value === null) return "";
  if (field.type === "number" && typeof value === "number") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function rowMatchesFilter(
  row: DatabaseRow,
  field: DatabaseField | undefined,
  filter: ViewFilter,
): boolean {
  const value = field ? row.cells[field.id] : undefined;
  switch (filter.op) {
    case "empty":
      return value === undefined || value === null || value === "";
    case "not_empty":
      return !(value === undefined || value === null || value === "");
    case "eq":
      return value === filter.value;
    case "neq":
      return value !== filter.value;
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "gt":
      return typeof value === "number" && typeof filter.value === "number" && value > filter.value;
    case "lt":
      return typeof value === "number" && typeof filter.value === "number" && value < filter.value;
    default: {
      const _exhaustive: never = filter.op;
      return _exhaustive;
    }
  }
}

export function queryRows(
  rows: DatabaseRow[],
  fields: DatabaseField[],
  view: DatabaseView | undefined,
): DatabaseRow[] {
  if (!view) return rows;
  const filters = view.filters ?? [];
  let next = rows;
  if (filters.length) {
    next = rows.filter((row) =>
      filters.every((filter) => {
        const field = fields.find((f) => f.id === filter.fieldId);
        return rowMatchesFilter(row, field, filter);
      }),
    );
  }
  if (view.type === "grid" && view.sortFieldId) {
    const field = fields.find((f) => f.id === view.sortFieldId);
    if (field) {
      const dir = view.sortDirection === "desc" ? -1 : 1;
      next = [...next].sort((a, b) => {
        const as = cellSortKey(field, a.cells[field.id]);
        const bs = cellSortKey(field, b.cells[field.id]);
        if (as < bs) return -1 * dir;
        if (as > bs) return 1 * dir;
        return 0;
      });
    }
  }
  return next;
}

export function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function rowDate(row: DatabaseRow, fieldId: string): string | null {
  const value = row.cells[fieldId];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}
