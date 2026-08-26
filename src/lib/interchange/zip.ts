import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function unzipEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  if (!isZip(bytes)) return {};
  try {
    return unzipSync(bytes);
  } catch {
    return {};
  }
}

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
  const data = unzipEntries(bytes)[path];
  return data ? strFromU8(data) : null;
}

export function zipEntryBytes(bytes: Uint8Array, path: string): Uint8Array | null {
  return unzipEntries(bytes)[path] ?? null;
}

export function zipOdf(mime: string, files: Record<string, string | Uint8Array>): Uint8Array {
  const stored = { level: 0 as const };
  const body: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8(mime), stored],
  };
  for (const [name, data] of Object.entries(files)) {
    body[name] = typeof data === "string" ? strToU8(data) : data;
  }
  return zipSync(body, { level: 6 });
}

export function decodeText(data: Uint8Array): string {
  return strFromU8(data);
}
