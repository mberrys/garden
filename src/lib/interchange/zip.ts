import { unzipSync, strFromU8 } from "fflate";

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Concatenate XML parts from an OOXML/ODF package, or decode raw XML fixtures. */
export function officeXmlFromBytes(bytes: Uint8Array): string {
  if (!isZip(bytes)) return new TextDecoder().decode(bytes);
  try {
    const files = unzipSync(bytes);
    return Object.entries(files)
      .filter(([name]) => name.endsWith(".xml"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => strFromU8(data))
      .join("\n");
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export function zipEntryText(bytes: Uint8Array, path: string): string | null {
  if (!isZip(bytes)) return null;
  try {
    const files = unzipSync(bytes);
    const data = files[path];
    return data ? strFromU8(data) : null;
  } catch {
    return null;
  }
}
