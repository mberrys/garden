import { describe, expect, it } from "vitest";
import { DOC_KINDS } from "@/lib/docs/schema";
import { BUILTIN_SURFACES } from "./catalog";

describe("built-in surface catalog", () => {
  it("describes every DocKind against the adapter contract", () => {
    expect(Object.keys(BUILTIN_SURFACES).sort()).toEqual([...DOC_KINDS].sort());
    for (const kind of DOC_KINDS) {
      const entry = BUILTIN_SURFACES[kind];
      expect(entry.kind).toBe(kind);
      expect(entry.label).toBeTruthy();
      expect(entry.userEdits).toBeTruthy();
      expect(entry.gardenUpdates).toBeTruthy();
      expect(entry.selection).toBeTruthy();
      expect(entry.notes).toBeTruthy();
      expect(entry.undo).toBe("garden");
    }
  });

  it("keeps undo on Garden for every built-in, including borrowed renderers", () => {
    for (const kind of DOC_KINDS) {
      expect(BUILTIN_SURFACES[kind].undo).toBe("garden");
    }
    expect(BUILTIN_SURFACES.pdf.engine).toBe("borrowed");
    expect(BUILTIN_SURFACES.pdf.adapterStatus).toBe("planned");
    expect(BUILTIN_SURFACES.text.adapterStatus).toBe("planned");
    expect(BUILTIN_SURFACES.canvas.adapterStatus).toBe("not-required");
    expect(BUILTIN_SURFACES.deck.adapterStatus).toBe("not-required");
  });
});
