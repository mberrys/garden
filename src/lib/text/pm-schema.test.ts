import { describe, expect, it } from "vitest";
import { markdownToDoc } from "./markdown";
import { gardenBodyToPm, pmToGardenBody } from "./pm-bridge";
import { gardenSchema } from "./pm-schema";

describe("Garden ProseMirror schema", () => {
  it("round-trips markdown-derived Garden JSON without engine objects", () => {
    const body = markdownToDoc("# Title\n\nHello **world** and `code`.\n\n- one\n- two");
    const round = pmToGardenBody(gardenBodyToPm(body));
    expect(round).toEqual(body);
    expect(JSON.stringify(round)).not.toContain("engineState");
  });

  it("uses Garden mark names, not strong/em", () => {
    const body = markdownToDoc("**bold** and *italic*");
    const json = JSON.stringify(pmToGardenBody(gardenBodyToPm(body)));
    expect(json).toContain('"bold"');
    expect(json).toContain('"italic"');
    expect(json).not.toContain('"strong"');
    expect(json).not.toContain('"em"');
    expect(gardenSchema.marks.bold).toBeTruthy();
  });
});
