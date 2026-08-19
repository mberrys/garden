import { describe, expect, it } from "vitest";
import { SheetBodySchema, type SheetBody } from "@/lib/docs/schema";
import { colToIndex, expandRange, indexToCol, isRef, parseRef, toRef } from "./refs";
import { evaluateSheet } from "./formula";

describe("A1 refs", () => {
  it("round-trips column letters and indices", () => {
    for (const [i, letters] of [
      [0, "A"],
      [25, "Z"],
      [26, "AA"],
      [27, "AB"],
      [51, "AZ"],
    ] as const) {
      expect(indexToCol(i)).toBe(letters);
      expect(colToIndex(letters)).toBe(i);
    }
  });

  it("parses and formats cell refs", () => {
    expect(parseRef("A1")).toEqual({ row: 0, col: 0 });
    expect(parseRef("B3")).toEqual({ row: 2, col: 1 });
    expect(toRef({ row: 2, col: 1 })).toBe("B3");
    expect(isRef("AA10")).toBe(true);
    expect(isRef("A0")).toBe(false);
    expect(isRef("SUM")).toBe(false);
    expect(parseRef("nope")).toBeNull();
  });

  it("expands ranges row-major, order-independent", () => {
    expect(expandRange("A1:B2")).toEqual(["A1", "B1", "A2", "B2"]);
    expect(expandRange("B2:A1")).toEqual(["A1", "B1", "A2", "B2"]);
    expect(expandRange("A1")).toEqual(["A1"]);
    expect(expandRange("garbage")).toBeNull();
  });
});

/** Build a sheet from a ref→raw-value map (parsing to fill cell defaults). */
function sheet(cells: Record<string, string>): SheetBody {
  const mapped = Object.fromEntries(Object.entries(cells).map(([ref, value]) => [ref, { value }]));
  return SheetBodySchema.parse({ rows: 10, cols: 6, cells: mapped });
}

function display(cells: Record<string, string>): Record<string, string> {
  const results = evaluateSheet(sheet(cells));
  const out: Record<string, string> = {};
  for (const [ref, res] of results) out[ref] = res.display;
  return out;
}

describe("formula evaluation", () => {
  it("renders literal numbers and text", () => {
    const out = display({ A1: "42", A2: "hello", A3: "3.50" });
    expect(out.A1).toBe("42");
    expect(out.A2).toBe("hello");
    expect(out.A3).toBe("3.5");
  });

  it("evaluates arithmetic with precedence and parentheses", () => {
    const out = display({ A1: "=1+2*3", A2: "=(1+2)*3", A3: "=2^3", A4: "=10/4" });
    expect(out.A1).toBe("7");
    expect(out.A2).toBe("9");
    expect(out.A3).toBe("8");
    expect(out.A4).toBe("2.5");
  });

  it("resolves cell references and chains", () => {
    const out = display({ A1: "5", A2: "=A1*2", A3: "=A2+A1" });
    expect(out.A2).toBe("10");
    expect(out.A3).toBe("15");
  });

  it("supports SUM, AVERAGE, MIN, MAX, COUNT over ranges", () => {
    const cells = { A1: "1", A2: "2", A3: "3", A4: "text" };
    expect(display({ ...cells, B1: "=SUM(A1:A4)" }).B1).toBe("6");
    expect(display({ ...cells, B1: "=AVERAGE(A1:A3)" }).B1).toBe("2");
    expect(display({ ...cells, B1: "=MIN(A1:A3)" }).B1).toBe("1");
    expect(display({ ...cells, B1: "=MAX(A1:A3)" }).B1).toBe("3");
    expect(display({ ...cells, B1: "=COUNT(A1:A4)" }).B1).toBe("3");
  });

  it("supports IF, ROUND, ABS and CONCAT", () => {
    expect(display({ A1: "=IF(1>0,\"yes\",\"no\")" }).A1).toBe("yes");
    expect(display({ A1: "=IF(1<0,\"yes\",\"no\")" }).A1).toBe("no");
    expect(display({ A1: "=ROUND(3.14159,2)" }).A1).toBe("3.14");
    expect(display({ A1: "=ABS(0-7)" }).A1).toBe("7");
    expect(display({ A1: "=CONCAT(\"a\",\"b\",\"c\")" }).A1).toBe("abc");
  });

  it("applies currency and percent formats", () => {
    const body = SheetBodySchema.parse({
      rows: 5,
      cols: 3,
      cells: {
        A1: { value: "1234.5", format: "currency" },
        A2: { value: "0.25", format: "percent" },
      },
    });
    const out = evaluateSheet(body);
    expect(out.get("A1")?.display).toBe("$1,234.50");
    expect(out.get("A2")?.display).toBe("25%");
  });

  it("reports division by zero and unknown functions", () => {
    expect(display({ A1: "=1/0" }).A1).toBe("#DIV/0!");
    expect(display({ A1: "=NOPE(1)" }).A1).toBe("#NAME?");
    expect(display({ A1: "=1+" }).A1).toBe("#ERR");
  });

  it("detects reference cycles rather than looping forever", () => {
    const out = display({ A1: "=B1", B1: "=A1" });
    expect(out.A1).toBe("#CYCLE");
    expect(out.B1).toBe("#CYCLE");
    expect(display({ A1: "=A1" }).A1).toBe("#CYCLE");
  });

  it("treats an empty referenced cell as zero", () => {
    expect(display({ A1: "=B1+5" }).A1).toBe("5");
  });
});
