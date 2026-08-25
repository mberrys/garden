import type { Slide, SlideElement } from "@/lib/docs/schema";
import { SLIDE_W } from "@/lib/docs/schema";
import { createDeckDoc, makeSlide, makeSlideElement } from "@/lib/docs/factories";
import { newBlobId, newSlideId } from "@/lib/docs/ids";
import { exportDeckPptxBytes } from "@/lib/deck/export-pptx";
import { registerFormat } from "./harness";
import { warning, type InterchangeBlob, type InterchangeResult } from "./warnings";
import { attr, attrNumber, innerText, xmlUnescape } from "./xml";
import { decodeText, unzipEntries, zipEntryText } from "./zip";

const EMU_PER_PX = 914400 / 96;

function emuToPx(value: number): number {
  return Math.round(value / EMU_PER_PX);
}

function parseRels(xml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const match of xml.matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = attr(match[1], "Id");
    const target = attr(match[1], "Target");
    if (id && target) map.set(id, target.replace(/^\.\.\//, "ppt/").replace(/^\//, ""));
  }
  return map;
}

function resolveTarget(basePath: string, target: string): string {
  if (target.startsWith("ppt/")) return target;
  if (target.startsWith("/")) return target.slice(1);
  const base = basePath.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") base.pop();
    else if (part !== ".") base.push(part);
  }
  return base.join("/");
}

function xfrmBox(xml: string): { x: number; y: number; w: number; h: number } | null {
  const off = /<a:off\b([^>]*)\/?>/.exec(xml);
  const ext = /<a:ext\b([^>]*)\/?>/.exec(xml);
  if (!off || !ext) return null;
  const x = attrNumber(off[1], "x");
  const y = attrNumber(off[1], "y");
  const w = attrNumber(ext[1], "cx");
  const h = attrNumber(ext[1], "cy");
  if (x == null || y == null || w == null || h == null) return null;
  return {
    x: emuToPx(x),
    y: emuToPx(y),
    w: Math.max(8, emuToPx(w)),
    h: Math.max(8, emuToPx(h)),
  };
}

function shapeKind(xml: string): "rect" | "ellipse" | "line" | null {
  const prst = /prst="([^"]+)"/.exec(xml)?.[1];
  if (!prst) return null;
  if (prst === "ellipse" || prst === "circle") return "ellipse";
  if (prst === "line") return "line";
  if (prst === "rect" || prst === "roundRect") return "rect";
  return "rect";
}

function slideNotes(entries: Record<string, Uint8Array>, slidePath: string): string {
  const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const rels = parseRels(entries[relsPath] ? decodeText(entries[relsPath]) : null);
  for (const target of rels.values()) {
    const path = resolveTarget(slidePath, target);
    if (!path.includes("notesSlide")) continue;
    const xml = entries[path] ? decodeText(entries[path]) : "";
    return [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map((m) => xmlUnescape(m[1]))
      .filter((t) => t && t !== "Click to add notes")
      .join("\n")
      .trim();
  }
  return "";
}

function parsePptxSlide(
  xml: string,
  slidePath: string,
  entries: Record<string, Uint8Array>,
  blobs: InterchangeBlob[],
  warnings: InterchangeResult["warnings"],
): Slide {
  const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const rels = parseRels(entries[relsPath] ? decodeText(entries[relsPath]) : null);
  const elements: SlideElement[] = [];

  if (/p:grpSp[\s>]/.test(xml)) {
    warnings.push(warning("pptx-groups", "groups", "unsupported", "Grouped shapes are flattened or dropped."));
  }
  if (/dgm:|dgm14:/.test(xml)) {
    warnings.push(warning("pptx-smartart", "smartart", "unsupported", "SmartArt is not imported."));
  }
  if (/p:video|a:videoFile/.test(xml)) {
    warnings.push(warning("pptx-video", "video", "unsupported", "Embedded video is not imported."));
  }
  if (/c:chart/.test(xml)) {
    warnings.push(warning("pptx-charts", "charts", "unsupported", "Charts are not imported."));
  }
  if (/p:timing|p:transition/.test(xml)) {
    warnings.push(warning("pptx-anim", "animations", "unsupported", "Animations and transitions are ignored."));
  }

  for (const pic of xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
    const box = xfrmBox(pic[0]) ?? { x: 80, y: 80, w: 400, h: 280 };
    const embed = /r:embed="([^"]+)"/.exec(pic[0])?.[1];
    const target = embed ? rels.get(embed) : undefined;
    const mediaPath = target ? resolveTarget(slidePath, target) : null;
    const data = mediaPath ? entries[mediaPath] : undefined;
    const blobId = newBlobId();
    if (data) {
      blobs.push({
        id: blobId,
        name: mediaPath?.split("/").pop() ?? "image.png",
        mime: mediaPath?.endsWith(".jpg") || mediaPath?.endsWith(".jpeg") ? "image/jpeg" : "image/png",
        bytes: data,
      });
    }
    elements.push(
      makeSlideElement({
        type: "image",
        ...box,
        blobId: data ? blobId : null,
        alt: innerText(pic[0]) || "Imported image",
      }),
    );
  }

  for (const sp of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const box = xfrmBox(sp[0]) ?? { x: 72, y: 48 + elements.length * 80, w: SLIDE_W - 144, h: 72 };
    const texts = [...sp[0].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => xmlUnescape(m[1])).filter(Boolean);
    const geom = shapeKind(sp[0]);
    const isTxBox = /txBox="1"/.test(sp[0]) || texts.length > 0;
    if (isTxBox && texts.length) {
      elements.push(
        makeSlideElement({
          type: "text",
          ...box,
          text: texts.join("\n"),
        }),
      );
    } else if (geom) {
      elements.push(
        makeSlideElement({
          type: "shape",
          ...box,
          shape: geom,
        }),
      );
    }
  }

  const notes = slideNotes(entries, slidePath);
  return {
    id: newSlideId(),
    layout: elements.some((el) => el.type === "image") ? "image" : "title-body",
    background: null,
    elements,
    notes,
  };
}

function pptxSlideOrder(entries: Record<string, Uint8Array>): string[] {
  const rels = parseRels(entries["ppt/_rels/presentation.xml.rels"] ? decodeText(entries["ppt/_rels/presentation.xml.rels"]) : null);
  const presentation = entries["ppt/presentation.xml"] ? decodeText(entries["ppt/presentation.xml"]) : "";
  const ordered: string[] = [];
  for (const match of presentation.matchAll(/<p:sldId\b([^>]*)\/?>/g)) {
    const rid = attr(match[1], "r:id") ?? attr(match[1], "r:embed");
    if (!rid) continue;
    const target = rels.get(rid);
    if (target) ordered.push(resolveTarget("ppt/presentation.xml", target));
  }
  if (ordered.length) return ordered;
  return Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function parseOdpLength(raw: string | null): number | null {
  if (!raw) return null;
  const match = /^([\d.]+)(cm|mm|in|pt)?$/.exec(raw.trim());
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2] ?? "cm";
  const inches = unit === "mm" ? n / 25.4 : unit === "cm" ? n / 2.54 : unit === "pt" ? n / 72 : n;
  return Math.round(inches * 96);
}

registerFormat({
  format: "pptx",
  kind: "deck",
  extensions: [".pptx"],
  async importBytes(bytes, name) {
    const entries = unzipEntries(bytes);
    const warnings: InterchangeResult["warnings"] = [
      warning("pptx-subset", "layouts", "partial", "PPTX import maps text, basic shapes, images, and notes."),
    ];
    const blobs: InterchangeBlob[] = [];
    const paths = pptxSlideOrder(entries);
    const slides =
      paths.length > 0
        ? paths.map((path) => parsePptxSlide(decodeText(entries[path] ?? new Uint8Array()), path, entries, blobs, warnings))
        : fallbackTitleSlides(entries["ppt/slides/slide1.xml"] ? decodeText(entries["ppt/slides/slide1.xml"]) : officeXmlFallback(bytes));
    const doc = createDeckDoc(name.replace(/\.pptx$/i, "") || "Imported deck");
    const unique = dedupeWarnings(warnings);
    return {
      docs: [{ ...doc, body: { ...doc.body, slides: slides.length ? slides : doc.body.slides } }],
      warnings: unique,
      blobs,
    };
  },
  async exportDoc(doc) {
    if (doc.kind !== "deck") throw new Error("PPTX export expects a deck");
    return {
      bytes: await exportDeckPptxBytes(doc),
      warnings: [
        warning("pptx-export-subset", "layouts", "partial", "PPTX export writes title, body, and notes per slide."),
      ],
    };
  },
});

function officeXmlFallback(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function fallbackTitleSlides(xml: string): Slide[] {
  const titles = [...xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map((m) => xmlUnescape(m[1]));
  return titles.slice(0, 8).map((title) => makeSlide("title-body", { title, body: "" }));
}

function dedupeWarnings(warnings: InterchangeResult["warnings"]): InterchangeResult["warnings"] {
  const seen = new Set<string>();
  return warnings.filter((item) => {
    const key = `${item.code}:${item.construct}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

registerFormat({
  format: "odp",
  kind: "deck",
  extensions: [".odp"],
  async importBytes(bytes, name) {
    const xml = zipEntryText(bytes, "content.xml") ?? officeXmlFallback(bytes);
    const warnings: InterchangeResult["warnings"] = [
      warning("odp-subset", "layouts", "partial", "ODP import maps text frames, images, and notes."),
    ];
    const blobs: InterchangeBlob[] = [];
    const entries = unzipEntries(bytes);
    const slides: Slide[] = [];
    for (const page of xml.matchAll(/<draw:page\b([^>]*)>([\s\S]*?)<\/draw:page>/g)) {
      const elements: SlideElement[] = [];
      for (const frame of page[2].matchAll(/<draw:frame\b([^>]*)>([\s\S]*?)<\/draw:frame>/g)) {
        const box = {
          x: parseOdpLength(attr(frame[1], "svg:x")) ?? 72,
          y: parseOdpLength(attr(frame[1], "svg:y")) ?? 48,
          w: parseOdpLength(attr(frame[1], "svg:width")) ?? 400,
          h: parseOdpLength(attr(frame[1], "svg:height")) ?? 72,
        };
        const href = /xlink:href="([^"]+)"/.exec(frame[2])?.[1];
        if (href) {
          const path = href.replace(/^\.\//, "");
          const data = entries[path];
          const blobId = newBlobId();
          if (data) {
            blobs.push({
              id: blobId,
              name: path.split("/").pop() ?? "image.png",
              mime: "image/png",
              bytes: data,
            });
          }
          elements.push(makeSlideElement({ type: "image", ...box, blobId: data ? blobId : null, alt: "Imported image" }));
          continue;
        }
        const text = innerText(frame[2]);
        if (text) {
          elements.push(makeSlideElement({ type: "text", ...box, text }));
        }
      }
      slides.push({
        id: newSlideId(),
        layout: "title-body",
        background: null,
        elements,
        notes: "",
      });
    }
    if (slides.length === 0) {
      const titles = [...xml.matchAll(/<text:p[^>]*>([^<]+)<\/text:p>/g)].map((m) => xmlUnescape(m[1]));
      slides.push(...titles.slice(0, 8).map((title) => makeSlide("title-body", { title, body: "" })));
    }
    const doc = createDeckDoc(name.replace(/\.odp$/i, "") || "Imported deck");
    return {
      docs: [{ ...doc, body: { ...doc.body, slides: slides.length ? slides : doc.body.slides } }],
      warnings,
      blobs,
    };
  },
});
