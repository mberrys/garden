export type FidelitySeverity = "supported" | "partial" | "unsupported";

export interface FidelityWarning {
  code: string;
  construct: string;
  severity: FidelitySeverity;
  message: string;
}

export interface InterchangeBlob {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface InterchangeResult {
  docs: unknown[];
  warnings: FidelityWarning[];
  blobs?: InterchangeBlob[];
}

export function warning(
  code: string,
  construct: string,
  severity: FidelitySeverity,
  message: string,
): FidelityWarning {
  return { code, construct, severity, message };
}

export function isGardenDocShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.kind === "string" && typeof obj.body === "object";
}

export function assertGardenCanonical(result: InterchangeResult): void {
  for (const doc of result.docs) {
    if (!isGardenDocShape(doc)) {
      throw new Error("importer returned non-Garden state");
    }
    const body = (doc as { body: unknown }).body;
    if (body && typeof body === "object" && ("engineState" in body || "prosemirror" in body || "univer" in body)) {
      throw new Error("importer leaked engine-library state");
    }
  }
}

export function formatFidelityToast(warnings: FidelityWarning[]): string[] {
  const partial = warnings.filter((item) => item.severity !== "supported");
  if (partial.length === 0) return [];
  const shown = partial.slice(0, 3).map((item) => `${item.code}: ${item.message}`);
  if (partial.length > 3) {
    shown.push(`${partial.length - 3} more fidelity warning${partial.length - 3 === 1 ? "" : "s"}`);
  }
  return shown;
}
