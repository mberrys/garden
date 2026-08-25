import { createDeckDoc, makeSlide } from "@/lib/docs/factories";
import { createSheetDoc } from "@/lib/docs/factories";
import { registerFormat } from "./harness";
import { warning } from "./warnings";
import { officeXmlFromBytes } from "./zip";

registerFormat({
  format: "pptx",
  kind: "deck",
  extensions: [".pptx"],
  async importBytes(bytes, name) {
    const xml = officeXmlFromBytes(bytes);
    const titles = [...xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map((m) => m[1]);
    const doc = createDeckDoc(name.replace(/\.pptx$/i, "") || "Imported deck");
    const slides = titles.length
      ? titles.slice(0, 8).map((title) => makeSlide("title-body", { title, body: "" }))
      : doc.body.slides;
    return {
      docs: [{ ...doc, body: { ...doc.body, slides } }],
      warnings: [warning("pptx-subset", "layouts", "partial", "Only title text is imported from PPTX.")],
    };
  },
});

registerFormat({
  format: "odp",
  kind: "deck",
  extensions: [".odp"],
  async importBytes(bytes, name) {
    const xml = officeXmlFromBytes(bytes);
    const titles = [...xml.matchAll(/<text:p[^>]*>([^<]+)<\/text:p>/g)].map((m) => m[1]);
    const doc = createDeckDoc(name.replace(/\.odp$/i, "") || "Imported deck");
    const slides = titles.slice(0, 8).map((title) => makeSlide("title-body", { title, body: "" }));
    return {
      docs: [{ ...doc, body: { ...doc.body, slides: slides.length ? slides : doc.body.slides } }],
      warnings: [warning("odp-subset", "layouts", "partial", "ODP import keeps visible text only.")],
    };
  },
});

registerFormat({
  format: "xlsx",
  kind: "sheet",
  extensions: [".xlsx"],
  async importBytes(bytes, name) {
    const xml = officeXmlFromBytes(bytes);
    const values = [...xml.matchAll(/<v>([^<]*)<\/v>/g)].map((m) => m[1]);
    const doc = createSheetDoc(name.replace(/\.xlsx$/i, "") || "Imported sheet");
    const cells: Record<string, { value: string }> = {};
    values.slice(0, 64).forEach((value, i) => {
      cells[`A${i + 1}`] = { value };
    });
    return {
      docs: [{ ...doc, body: { ...doc.body, cells } }],
      warnings: [warning("xlsx-subset", "formulas", "partial", "Formulas import as cached values when present.")],
    };
  },
});

registerFormat({
  format: "ods",
  kind: "sheet",
  extensions: [".ods"],
  async importBytes(bytes, name) {
    const xml = officeXmlFromBytes(bytes);
    const values = [...xml.matchAll(/<text:p[^>]*>([^<]*)<\/text:p>/g)].map((m) => m[1]);
    const doc = createSheetDoc(name.replace(/\.ods$/i, "") || "Imported sheet");
    const cells: Record<string, { value: string }> = {};
    values.slice(0, 64).forEach((value, i) => {
      cells[`A${i + 1}`] = { value };
    });
    return {
      docs: [{ ...doc, body: { ...doc.body, cells } }],
      warnings: [warning("ods-subset", "styles", "partial", "ODS import keeps cell text only.")],
    };
  },
});
