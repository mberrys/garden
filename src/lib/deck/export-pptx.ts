import type { DeckDoc } from "@/lib/docs/schema";
import { SLIDE_H, SLIDE_W } from "@/lib/docs/schema";
import { xmlEscape } from "@/lib/interchange/xml";

function slideXml(index: number, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xmlEscape(title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xmlEscape(body)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function slideText(doc: DeckDoc, index: number): { title: string; body: string } {
  const slide = doc.body.slides[index];
  if (!slide) return { title: `Slide ${index + 1}`, body: "" };
  const texts = slide.elements
    .map((el) => {
      if (el.type === "text") return el.text;
      if (el.type === "bullets") return el.items.join("\n");
      return "";
    })
    .filter(Boolean);
  return { title: texts[0] ?? `Slide ${index + 1}`, body: texts.slice(1).join("\n") };
}

export function exportDeckPptxXml(doc: DeckDoc): string[] {
  return doc.body.slides.map((_, i) => {
    const { title, body } = slideText(doc, i);
    return slideXml(i, title, body);
  });
}

export function exportDeckManifest(doc: DeckDoc): Record<string, unknown> {
  return {
    format: "garden-pptx-subset",
    stage: { w: SLIDE_W, h: SLIDE_H },
    slides: doc.body.slides.map((slide, i) => ({
      id: slide.id,
      layout: slide.layout,
      ...slideText(doc, i),
      notes: slide.notes,
    })),
  };
}

export function downloadablePptxName(title: string): string {
  const safe = title.replace(/[^\w\-. ]+/g, "").trim() || "deck";
  return `${safe}.pptx`;
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >>> 8) & 255);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Store-method ZIP so PPTX export does not depend on PptxGenJS or Univer Pro. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([
    Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, end]);
}

function asPptxBytes(out: string | ArrayBuffer | Blob | Uint8Array): Uint8Array {
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (typeof Blob !== "undefined" && out instanceof Blob) {
    throw new Error("pptxgenjs returned a Blob; request uint8array output");
  }
  return new TextEncoder().encode(String(out));
}

/** PPTX bytes from Garden deck state via PptxGenJS (MIT). Never persists engine objects. */
export async function exportDeckPptxBytes(doc: DeckDoc): Promise<Uint8Array> {
  const mod = (await import("pptxgenjs")) as unknown as {
    default?: new () => PptxGenInstance;
  } & (new () => PptxGenInstance);
  const PptxGenJS = (mod.default ?? mod) as new () => PptxGenInstance;
  const pptx = new PptxGenJS();
  const width = SLIDE_W / 96;
  const height = SLIDE_H / 96;
  pptx.defineLayout({ name: "GARDEN", width, height });
  pptx.layout = "GARDEN";
  pptx.title = doc.title;
  pptx.author = "garden";
  for (let i = 0; i < doc.body.slides.length; i++) {
    const { title, body } = slideText(doc, i);
    const slide = pptx.addSlide();
    slide.addText(title, { x: 0.5, y: 0.4, w: width - 1, h: 1, fontSize: 28, bold: true });
    if (body) {
      slide.addText(body, { x: 0.5, y: 1.6, w: width - 1, h: 5, fontSize: 16 });
    }
    const notes = doc.body.slides[i]?.notes;
    if (notes) slide.addNotes(notes);
  }
  const out = await pptx.write({ outputType: "uint8array" });
  return asPptxBytes(out);
}

interface PptxGenInstance {
  defineLayout: (layout: { name: string; width: number; height: number }) => void;
  layout: string;
  title: string;
  author: string;
  addSlide: () => {
    addText: (text: string, opts: Record<string, unknown>) => void;
    addNotes: (notes: string) => void;
  };
  write: (props: { outputType: "uint8array" }) => Promise<string | ArrayBuffer | Blob | Uint8Array>;
}

