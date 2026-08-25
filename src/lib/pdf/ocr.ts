/**
 * OCR is an interface in 1.0, not a bundled engine. Callers extract page images
 * and hand them to a registered provider; Garden stores the resulting text
 * through the existing `setPageText` operation.
 */
export interface OcrPageResult {
  page: number;
  text: string;
  confidence: number;
}

export interface OcrProvider {
  id: string;
  recognize(input: { page: number; image: Blob }): Promise<OcrPageResult>;
}

let current: OcrProvider | null = null;

export function setOcrProvider(provider: OcrProvider | null): void {
  current = provider;
}

export function getOcrProvider(): OcrProvider | null {
  return current;
}

export async function recognizePage(input: {
  page: number;
  image: Blob;
}): Promise<OcrPageResult | null> {
  if (!current) return null;
  return current.recognize(input);
}
