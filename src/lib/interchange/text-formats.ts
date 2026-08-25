import { markdownToDoc } from "@/lib/text/markdown";
import { createTextDoc } from "@/lib/docs/factories";
import { registerFormat } from "./harness";
import { warning, type InterchangeResult } from "./warnings";
import { isZip, officeXmlFromBytes } from "./zip";

function extractDocxText(xml: string): { text: string; warnings: InterchangeResult["warnings"] } {
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

function extractPlainish(xml: string): string {
  return [...xml.matchAll(/>([^<]{2,})</g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !t.startsWith("<?") && !t.includes("xmlns"))
    .join("\n");
}

function bytesAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function mammothMarkdown(bytes: Uint8Array): Promise<string | null> {
  const mammoth = (await import("mammoth")) as unknown as {
    default?: { convertToMarkdown?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
    convertToMarkdown?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const convert = mammoth.convertToMarkdown ?? mammoth.default?.convertToMarkdown;
  if (!convert) return null;
  const result = await convert({ arrayBuffer: bytesAsArrayBuffer(bytes) });
  return result.value.trim() || null;
}

registerFormat({
  format: "docx",
  kind: "text",
  extensions: [".docx"],
  async importBytes(bytes, name) {
    const warnings: InterchangeResult["warnings"] = [
      warning("docx-styles", "complex-styles", "partial", "Styles, macros, and SmartArt are not imported."),
    ];
    let text = "";
    if (isZip(bytes)) {
      try {
        text = (await mammothMarkdown(bytes)) ?? "";
      } catch {
        text = "";
      }
    }
    if (!text) {
      const extracted = extractDocxText(officeXmlFromBytes(bytes));
      text = extracted.text;
      warnings.push(...extracted.warnings.filter((item) => item.code !== "docx-styles"));
    }
    const doc = createTextDoc(name.replace(/\.docx$/i, "") || "Imported document");
    return { docs: [{ ...doc, body: markdownToDoc(text || "(empty document)") }], warnings };
  },
});

registerFormat({
  format: "odt",
  kind: "text",
  extensions: [".odt"],
  async importBytes(bytes, name) {
    const text = extractPlainish(officeXmlFromBytes(bytes));
    const doc = createTextDoc(name.replace(/\.odt$/i, "") || "Imported document");
    return {
      docs: [{ ...doc, body: markdownToDoc(text || "(empty document)") }],
      warnings: [warning("odt-subset", "odt-styles", "partial", "ODT import keeps paragraph text only.")],
    };
  },
});
