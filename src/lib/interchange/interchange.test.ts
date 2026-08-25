import { describe, expect, it } from "vitest";
import { createDeckDoc, createSheetDoc, createTextDoc } from "@/lib/docs/factories";
import {
  allFormats,
  exportOffice,
  formatFidelityToast,
  importOfficeFile,
  runInterchangeFixture,
  scoreWarnings,
  warning,
  type FixtureManifest,
  type OfficeFormat,
} from "./index";
import { assertGardenCanonical } from "./warnings";
import { loadInterchangeCorpus, runInterchangeCorpus } from "./corpus";
import { zipStore } from "@/lib/deck/export-pptx";

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

  it("imports a ZIP-wrapped document.xml DOCX", async () => {
    const xml = `<?xml version="1.0"?><w:document><w:p><w:r><w:t>Zipped Garden</w:t></w:r></w:p></w:document>`;
    const bytes = zipStore([{ name: "word/document.xml", data: bytesOf(xml) }]);
    const result = await importOfficeFile(bytes, "hello.docx");
    expect(JSON.stringify(result.docs)).toContain("Zipped Garden");
    assertGardenCanonical(result);
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
    expect(() =>
      assertGardenCanonical({
        docs: [{ id: "x", kind: "text", body: { univer: true } }],
        warnings: [],
      }),
    ).toThrow(/engine-library/);
  });

  it("scores fidelity warnings", () => {
    const score = scoreWarnings([
      warning("a", "x", "partial", "p"),
      warning("b", "y", "unsupported", "u"),
    ]);
    expect(score).toEqual({ supported: 0, partial: 1, unsupported: 1 });
  });

  it("formats toast copy from the first warnings plus a remainder count", () => {
    const lines = formatFidelityToast([
      warning("a", "x", "partial", "first"),
      warning("b", "y", "partial", "second"),
      warning("c", "z", "unsupported", "third"),
      warning("d", "w", "partial", "fourth"),
    ]);
    expect(lines[0]).toContain("first");
    expect(lines[1]).toContain("second");
    expect(lines[2]).toContain("third");
    expect(lines[3]).toMatch(/1 more/);
  });

  it("round-trips a Garden heading and paragraph through DOCX", async () => {
    const doc = createTextDoc("Hello", "# Hello Garden\n\nA short paragraph.");
    const exported = await exportOffice(doc, "docx");
    const again = await importOfficeFile(exported.bytes, "hello.docx");
    assertGardenCanonical(again);
    const blob = JSON.stringify(again.docs);
    expect(blob).toContain("Hello Garden");
    expect(blob).toContain("A short paragraph");
  });

  it("round-trips a SUM formula through XLSX", async () => {
    const doc = createSheetDoc("Grid");
    const withCells = {
      ...doc,
      body: {
        ...doc.body,
        rows: 2,
        cols: 2,
        cells: {
          A1: { value: "=SUM(B1:B2)", bold: false, italic: false, align: "left" as const, format: "auto" as const },
          B1: { value: "1", bold: false, italic: false, align: "left" as const, format: "auto" as const },
          B2: { value: "2", bold: false, italic: false, align: "left" as const, format: "auto" as const },
        },
      },
    };
    const exported = await exportOffice(withCells, "xlsx");
    const again = await importOfficeFile(exported.bytes, "grid.xlsx");
    assertGardenCanonical(again);
    expect(JSON.stringify(again.docs)).toContain("=SUM(B1:B2)");
  });

  it("imports PPTX title, body, and notes from a generated package", async () => {
    const bytes = zipStore([
      {
        name: "ppt/presentation.xml",
        data: bytesOf(
          `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
        ),
      },
      {
        name: "ppt/_rels/presentation.xml.rels",
        data: bytesOf(
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`,
        ),
      },
      {
        name: "ppt/slides/slide1.xml",
        data: bytesOf(
          `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Garden Title</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>Garden body copy</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
        ),
      },
      {
        name: "ppt/slides/_rels/slide1.xml.rels",
        data: bytesOf(
          `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
        ),
      },
      {
        name: "ppt/notesSlides/notesSlide1.xml",
        data: bytesOf(
          `<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker notes here</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
        ),
      },
    ]);
    const result = await importOfficeFile(bytes, "simple.pptx");
    assertGardenCanonical(result);
    const blob = JSON.stringify(result.docs);
    expect(blob).toContain("Garden Title");
    expect(blob).toContain("Garden body copy");
    expect(blob).toContain("Speaker notes here");
  });

  it("refuses ODP export because the adapter has no exporter", async () => {
    await expect(exportOffice(createDeckDoc("Talk"), "odp")).rejects.toThrow(/No exporter/);
  });
});

describe("committed interchange corpus", () => {
  it("has a run fixture for every registered adapter family", async () => {
    const fixtures = loadInterchangeCorpus();
    const registered = new Set(allFormats());
    const families: OfficeFormat[] = ["docx", "odt", "pptx", "odp", "xlsx", "ods"];
    for (const format of families) {
      const items = fixtures.filter((item) => item.manifest.format === format);
      expect(items.length, `${format} is missing from fixtures/interchange`).toBeGreaterThan(0);
      if (registered.has(format)) {
        expect(
          items.some((item) => item.manifest.status === "run"),
          `${format} is skip-only even though an adapter exists`,
        ).toBe(true);
      }
    }
    const runs = await runInterchangeCorpus();
    for (const run of runs) {
      expect(run.status, `${run.id}: ${run.reason ?? "failed"}`).not.toBe("fail");
    }
    expect(runs.some((run) => run.status === "pass")).toBe(true);
  });
});
