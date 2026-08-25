import { describe, expect, it } from "vitest";
import { createDeckDoc } from "@/lib/docs/factories";
import { zipEntryText } from "@/lib/interchange/zip";
import { downloadablePptxName, exportDeckManifest, exportDeckPptxBytes, exportDeckPptxXml } from "./export-pptx";

describe("PPTX export", () => {
  it("emits one XML slide per Garden slide without engine objects", () => {
    const doc = createDeckDoc("Quarterly");
    const xml = exportDeckPptxXml(doc);
    expect(xml).toHaveLength(1);
    expect(xml[0]).toContain("p:sld");
    expect(xml[0]).toContain("Quarterly");
    expect(xml[0]).not.toContain("univer");
  });

  it("keeps speaker notes in the Garden-owned manifest", () => {
    const doc = createDeckDoc("Talk");
    doc.body.slides[0].notes = "Say this next.";
    const manifest = exportDeckManifest(doc);
    expect(JSON.stringify(manifest)).toContain("Say this next.");
    expect(downloadablePptxName("Talk")).toBe("Talk.pptx");
  });

  it("packages a PptxGenJS PPTX with the PK signature from Garden state", async () => {
    const doc = createDeckDoc("Zip");
    doc.body.slides[0].notes = "Speaker note";
    const bytes = await exportDeckPptxBytes(doc);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(bytes.length).toBeGreaterThan(100);
    const presentation = zipEntryText(bytes, "ppt/presentation.xml");
    expect(presentation).toBeTruthy();
    expect(JSON.stringify(doc.body)).not.toContain("pptxgenjs");
  });
});
