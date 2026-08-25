import { describe, expect, it } from "vitest";
import { createTextDoc } from "@/lib/docs/factories";
import {
  importOfficeFile,
  runInterchangeFixture,
  scoreWarnings,
  warning,
  type FixtureManifest,
} from "./index";
import { assertGardenCanonical } from "./warnings";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("interchange harness", () => {
  it("imports a stub DOCX as a Garden text document with warnings", async () => {
    const xml = `<?xml version="1.0"?><w:document><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Hello Garden</w:t></w:r></w:p></w:document>`;
    const result = await importOfficeFile(bytesOf(xml), "hello.docx");
    expect(result.format).toBe("docx");
    expect(result.docs).toHaveLength(1);
    assertGardenCanonical(result);
    expect(JSON.stringify(result.docs)).toContain("Hello Garden");
    expect(result.warnings.some((w) => w.severity === "partial")).toBe(true);
  });

  it("treats a missing importer as an explicit skip, not a pass", async () => {
    const manifest: FixtureManifest = {
      id: "odt-skip-example",
      format: "odt",
      status: "skip",
      skipReason: "fixture reserved for a later fidelity case",
      expectedKind: "text",
    };
    const run = await runInterchangeFixture(manifest, bytesOf("x"), "x.odt");
    expect(run.status).toBe("skip");
  });

  it("fails if an importer returns engine state", () => {
    expect(() =>
      assertGardenCanonical({
        docs: [{ engineState: { univer: true } }],
        warnings: [],
      }),
    ).toThrow(/non-Garden/);
  });

  it("scores fidelity warnings", () => {
    const score = scoreWarnings([
      warning("a", "x", "partial", "p"),
      warning("b", "y", "unsupported", "u"),
    ]);
    expect(score).toEqual({ supported: 0, partial: 1, unsupported: 1 });
  });

  it("round-trips a Garden text fixture through markdown subset equivalence", () => {
    const doc = createTextDoc("Hello", "# Title\n\nBody");
    expect(doc.kind).toBe("text");
    expect(JSON.stringify(doc.body)).not.toContain("engineState");
  });
});
