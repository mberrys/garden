import { markdownToDoc } from "@/lib/text/markdown";
import { createTextDoc } from "@/lib/docs/factories";
import { registerFormat } from "./harness";
import { warning, type InterchangeResult } from "./warnings";

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Minimal OOXML document.xml extractor — headings and paragraphs only. */
function extractDocxText(bytes: Uint8Array): { text: string; warnings: InterchangeResult["warnings"] } {
  const xml = decodeUtf8(bytes);
  const warnings = [
    warning("docx-styles", "complex-styles", "partial", "Styles, macros, and SmartArt are not imported."),
  ];
  if (xml.includes("w:tbl")) {
    warnings.push(warning("docx-tables", "tables", "partial", "Tables flatten to paragraphs."));
  }
  const paras = [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)].map((match) => {
    const heading = /w:val="Heading(\d)"/.exec(match[0]);
    const texts = [...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join("");
    if (!texts.trim()) return "";
    if (heading) return `${"#".repeat(Number(heading[1]))} ${texts}`;
    return texts;
  });
  return { text: paras.filter(Boolean).join("\n\n"), warnings };
}

function extractPlainish(bytes: Uint8Array): string {
  const xml = decodeUtf8(bytes);
  return [...xml.matchAll(/>([^<]{2,})</g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !t.startsWith("<?") && !t.includes("xmlns"))
    .join("\n");
}

registerFormat({
  format: "docx",
  kind: "text",
  extensions: [".docx"],
  async importBytes(bytes, name) {
    const { text, warnings } = extractDocxText(bytes);
    const doc = createTextDoc(name.replace(/\.docx$/i, "") || "Imported document");
    return { docs: [{ ...doc, body: markdownToDoc(text || "(empty document)") }], warnings };
  },
});

registerFormat({
  format: "odt",
  kind: "text",
  extensions: [".odt"],
  async importBytes(bytes, name) {
    const text = extractPlainish(bytes);
    const doc = createTextDoc(name.replace(/\.odt$/i, "") || "Imported document");
    return {
      docs: [{ ...doc, body: markdownToDoc(text || "(empty document)") }],
      warnings: [warning("odt-subset", "odt-styles", "partial", "ODT import keeps paragraph text only.")],
    };
  },
});
