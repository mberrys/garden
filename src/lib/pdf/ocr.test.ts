import { describe, expect, it } from "vitest";
import { getOcrProvider, recognizePage, setOcrProvider } from "./ocr";

describe("OCR hook", () => {
  it("returns null when no provider is registered", async () => {
    setOcrProvider(null);
    expect(getOcrProvider()).toBeNull();
    expect(await recognizePage({ page: 1, image: new Blob(["x"]) })).toBeNull();
  });

  it("forwards a page image to the registered provider", async () => {
    setOcrProvider({
      id: "test",
      async recognize({ page }) {
        return { page, text: "extracted", confidence: 0.9 };
      },
    });
    const result = await recognizePage({ page: 2, image: new Blob(["x"]) });
    expect(result).toEqual({ page: 2, text: "extracted", confidence: 0.9 });
    setOcrProvider(null);
  });
});
