import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import { buildOdsPackage, buildOdtPackage } from "../src/lib/interchange/odf";
import { zipOdf } from "../src/lib/interchange/zip";
import { zipStore } from "../src/lib/deck/export-pptx";
import type { SheetCell } from "../src/lib/docs/schema";

const ROOT = join(process.cwd(), "fixtures/interchange");

function writeManifest(
  format: string,
  id: string,
  body: Record<string, unknown>,
  bytes: Uint8Array,
): void {
  const dir = join(ROOT, format, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(body, null, 2)}\n`);
  writeFileSync(join(dir, `input.${format}`), bytes);
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function writeDocx(): Promise<void> {
  const file = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Hello Garden")],
          }),
          new Paragraph({ children: [new TextRun("A short paragraph.")] }),
        ],
      },
    ],
  });
  const packed = await Packer.toBuffer(file);
  writeManifest(
    "docx",
    "hello",
    {
      id: "hello",
      format: "docx",
      status: "run",
      expectedKind: "text",
      expectedContains: ["Hello Garden", "A short paragraph"],
      roundTrip: true,
    },
    new Uint8Array(packed),
  );
}

function writeOdt(): void {
  writeManifest(
    "odt",
    "hello",
    {
      id: "hello",
      format: "odt",
      status: "run",
      expectedKind: "text",
      expectedContains: ["Hello Garden", "A short paragraph"],
      roundTrip: true,
    },
    buildOdtPackage("# Hello Garden\n\nA short paragraph."),
  );
}

async function writeXlsx(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.getCell("A1").value = { formula: "SUM(B1:B2)" };
  sheet.getCell("B1").value = 1;
  sheet.getCell("B2").value = 2;
  const buffer = await wb.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
  writeManifest(
    "xlsx",
    "grid",
    {
      id: "grid",
      format: "xlsx",
      status: "run",
      expectedKind: "sheet",
      expectedContains: ["=SUM(B1:B2)"],
      roundTrip: true,
    },
    bytes,
  );
}

function writeOds(): void {
  const cell = (value: string): SheetCell => ({
    value,
    bold: false,
    italic: false,
    align: "left",
    format: "auto",
  });
  writeManifest(
    "ods",
    "grid",
    {
      id: "grid",
      format: "ods",
      status: "run",
      expectedKind: "sheet",
      expectedContains: ["=SUM(B1:B2)"],
      roundTrip: true,
    },
    buildOdsPackage({ A1: cell("=SUM(B1:B2)"), B1: cell("1"), B2: cell("2") }, 2, 2),
  );
}

function writePptx(): void {
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Garden Title</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1600200"/><a:ext cx="8229600" cy="2743200"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Garden body copy</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="685800" y="4572000"/><a:ext cx="1828800" cy="914400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="5" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="5486400" y="4572000"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`;
  const notes = `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Speaker notes here</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:notes>`;
  const bytes = zipStore([
    { name: "ppt/presentation.xml", data: encode(`<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`) },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: encode(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`,
      ),
    },
    { name: "ppt/slides/slide1.xml", data: encode(slide) },
    {
      name: "ppt/slides/_rels/slide1.xml.rels",
      data: encode(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>`,
      ),
    },
    { name: "ppt/notesSlides/notesSlide1.xml", data: encode(notes) },
    { name: "ppt/media/image1.png", data: PNG_1X1 },
  ]);
  writeManifest(
    "pptx",
    "simple",
    {
      id: "simple",
      format: "pptx",
      status: "run",
      expectedKind: "deck",
      expectedContains: ["Garden Title", "Garden body copy", "Speaker notes here"],
      roundTrip: true,
    },
    bytes,
  );
}

function writeOdp(): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">
  <office:body><office:presentation>
    <draw:page draw:name="page1">
      <draw:frame svg:x="2cm" svg:y="1cm" svg:width="20cm" svg:height="2cm">
        <draw:text-box><text:p>Garden Title</text:p></draw:text-box>
      </draw:frame>
      <draw:frame svg:x="2cm" svg:y="4cm" svg:width="20cm" svg:height="4cm">
        <draw:text-box><text:p>Garden body copy</text:p></draw:text-box>
      </draw:frame>
    </draw:page>
  </office:presentation></office:body>
</office:document-content>
`;
  writeManifest(
    "odp",
    "simple",
    {
      id: "simple",
      format: "odp",
      status: "run",
      expectedKind: "deck",
      expectedContains: ["Garden Title", "Garden body copy"],
    },
    zipOdf("application/vnd.oasis.opendocument.presentation", {
      "META-INF/manifest.xml": `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>
`,
      "content.xml": xml,
    }),
  );
}

async function main(): Promise<void> {
  await writeDocx();
  writeOdt();
  await writeXlsx();
  writeOds();
  writePptx();
  writeOdp();
}

await main();
