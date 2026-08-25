import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import type { PmNode, TextDoc } from "@/lib/docs/schema";
import { markdownToDoc } from "@/lib/text/markdown";
import { docToMarkdown } from "@/lib/text/markdown";
import { createTextDoc } from "@/lib/docs/factories";
import { registerFormat } from "./harness";
import { warning, type InterchangeResult } from "./warnings";
import { isZip, officeXmlFromBytes, zipEntryText } from "./zip";
import { buildOdtPackage, odtXmlToMarkdown } from "./odf";

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

function bytesAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function mammothMarkdown(bytes: Uint8Array): Promise<string | null> {
  const convert = (mammoth as unknown as {
    convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  }).convertToMarkdown;
  const result = await convert({ arrayBuffer: bytesAsArrayBuffer(bytes) });
  return result.value.trim() || null;
}

function inlineRuns(nodes: PmNode[] | undefined): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    const marks = node.marks ?? [];
    runs.push(
      new TextRun({
        text: node.text,
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
      }),
    );
  }
  return runs.length ? runs : [new TextRun("")];
}

const HEADINGS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function blocksToParagraphs(nodes: PmNode[] | undefined): Paragraph[] {
  const out: Paragraph[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
        out.push(
          new Paragraph({
            heading: HEADINGS[level],
            children: inlineRuns(node.content),
          }),
        );
        break;
      }
      case "paragraph":
        out.push(new Paragraph({ children: inlineRuns(node.content) }));
        break;
      case "bulletList":
      case "orderedList": {
        const ordered = node.type === "orderedList";
        for (const item of node.content ?? []) {
          const first = item.content?.[0];
          const runs =
            first?.type === "paragraph" || first?.type === "heading"
              ? inlineRuns(first.content)
              : inlineRuns(item.content);
          out.push(
            new Paragraph({
              numbering: ordered ? { reference: "garden-num", level: 0 } : undefined,
              bullet: ordered ? undefined : { level: 0 },
              children: runs,
            }),
          );
        }
        break;
      }
      case "blockquote":
        out.push(...blocksToParagraphs(node.content));
        break;
      case "codeBlock":
        out.push(
          new Paragraph({
            children: [new TextRun({ text: (node.content ?? []).map((c) => c.text ?? "").join(""), font: "Courier New" })],
          }),
        );
        break;
      default:
        if (node.content) out.push(...blocksToParagraphs(node.content));
        break;
    }
  }
  return out.length ? out : [new Paragraph("")];
}

async function exportDocx(doc: TextDoc): Promise<{ bytes: Uint8Array; warnings: InterchangeResult["warnings"] }> {
  const file = new Document({
    numbering: {
      config: [
        {
          reference: "garden-num",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: "left",
            },
          ],
        },
      ],
    },
    sections: [{ children: blocksToParagraphs(doc.body.content) }],
  });
  const packed =
    typeof Packer.toBuffer === "function"
      ? new Uint8Array(await Packer.toBuffer(file))
      : new Uint8Array(await (await Packer.toBlob(file)).arrayBuffer());
  return {
    bytes: packed,
    warnings: [
      warning("docx-export-subset", "styles", "partial", "DOCX export keeps headings, paragraphs, and lists."),
      warning(
        "docx-export-gap",
        "tables",
        "unsupported",
        "Tables, comments, and tracked changes are not in the Garden text model.",
      ),
    ],
  };
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
    const documentXml = zipEntryText(bytes, "word/document.xml") ?? officeXmlFromBytes(bytes);
    if (!text) {
      const extracted = extractDocxText(documentXml);
      text = extracted.text;
      warnings.push(...extracted.warnings.filter((item) => item.code !== "docx-styles"));
    }
    if (/<w:tbl[\s>]/.test(documentXml)) {
      warnings.push(warning("docx-tables", "tables", "partial", "Tables flatten to paragraphs."));
    }
    if (/<w:commentRangeStart[\s>]|<w:commentReference[\s>]|<w:ins[\s>]|<w:del[\s>]/.test(documentXml)) {
      warnings.push(
        warning("docx-tracked", "tracked-changes", "unsupported", "Comments and tracked changes are dropped."),
      );
    }
    const doc = createTextDoc(name.replace(/\.docx$/i, "") || "Imported document");
    return { docs: [{ ...doc, body: markdownToDoc(text || "(empty document)") }], warnings };
  },
  async exportDoc(doc) {
    if (doc.kind !== "text") throw new Error("DOCX export expects a text document");
    return exportDocx(doc);
  },
});

registerFormat({
  format: "odt",
  kind: "text",
  extensions: [".odt"],
  async importBytes(bytes, name) {
    const xml = zipEntryText(bytes, "content.xml") ?? officeXmlFromBytes(bytes);
    const markdown = odtXmlToMarkdown(xml);
    const doc = createTextDoc(name.replace(/\.odt$/i, "") || "Imported document");
    const warnings = [
      warning("odt-subset", "odt-styles", "partial", "ODT import keeps headings, paragraphs, and lists."),
    ];
    if (/draw:frame|office:annotation|text:tracked-changes/.test(xml)) {
      warnings.push(
        warning("odt-unsupported", "frames", "unsupported", "Frames, comments, and tracked changes are dropped."),
      );
    }
    return {
      docs: [{ ...doc, body: markdownToDoc(markdown || "(empty document)") }],
      warnings,
    };
  },
  async exportDoc(doc) {
    if (doc.kind !== "text") throw new Error("ODT export expects a text document");
    return {
      bytes: buildOdtPackage(docToMarkdown(doc.body)),
      warnings: [
        warning("odt-export-subset", "styles", "partial", "ODT export is a heading/paragraph/list subset."),
      ],
    };
  },
});
