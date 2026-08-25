import { describe, expect, it } from "vitest";
import { createDatabaseDoc } from "@/lib/docs/factories";
import { applyOps } from "@/lib/ops";
import { calendarMonthFromRows, queryRows } from "./query";

describe("database query", () => {
  it("filters and sorts without copying the document model", () => {
    let doc = createDatabaseDoc("People");
    const name = doc.body.fields[0].id;
    doc = applyOps<"database">(doc, [
      { op: "addRow", row: { id: "row_a", cells: { [name]: "Ada" } } },
      { op: "addRow", row: { id: "row_b", cells: { [name]: "Zoe" } } },
      { op: "addRow", row: { id: "row_c", cells: { [name]: "Bea" } } },
      {
        op: "updateView",
        id: doc.body.views[0].id,
        patch: {
          sortFieldId: name,
          sortDirection: "asc",
          filters: [{ fieldId: name, op: "contains", value: "e" }],
        },
      },
    ]).doc;
    const rows = queryRows(doc.body.rows, doc.body.fields, doc.body.views[0]);
    expect(rows.map((r) => r.cells[name])).toEqual(["Bea", "Zoe"]);
  });

  it("stays interactive at 5k rows (filter+sort under 250ms)", () => {
    const doc = createDatabaseDoc("Load");
    const name = doc.body.fields[0].id;
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `row_${i}`,
      cells: { [name]: i % 17 === 0 ? `hit ${i}` : `row ${i}` },
    }));
    const view = {
      ...doc.body.views[0],
      filters: [{ fieldId: name, op: "contains" as const, value: "hit" }],
      sortFieldId: name,
      sortDirection: "asc" as const,
    };
    const start = performance.now();
    const result = queryRows(rows, doc.body.fields, view);
    const elapsed = performance.now() - start;
    expect(result.length).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(250);
  });

  it("opens a calendar on the first dated row, not today's empty month", () => {
    const month = calendarMonthFromRows(
      [
        { id: "row_a", cells: { fld_date: "2026-09-02" } },
        { id: "row_b", cells: { fld_date: "2026-09-14" } },
      ],
      "fld_date",
      new Date("2026-08-25T12:00:00"),
    );
    expect(month).toEqual({ year: 2026, month: 8 });
  });
});
