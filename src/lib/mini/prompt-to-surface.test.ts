import { describe, expect, it } from "vitest";
import { MiniDescriptorSchema } from "@/lib/docs/schema";
import {
  descriptorFromPrompt,
  isPromptToSurfaceRequest,
  miniDocFromPrompt,
  promptToSurfacePlan,
} from "./prompt-to-surface";

describe("prompt-to-surface", () => {
  it("detects constrained generation requests", () => {
    expect(isPromptToSurfaceRequest("Propose a mini-tool for outreach")).toBe(true);
    expect(isPromptToSurfaceRequest("tighten this paragraph")).toBe(false);
  });

  it("emits a schema-valid descriptor, never React", () => {
    const descriptor = descriptorFromPrompt("Make a card-grid mini-tool for people");
    expect(MiniDescriptorSchema.safeParse(descriptor).success).toBe(true);
    expect(descriptor.template).toBe("card-grid");
    expect(JSON.stringify(descriptor)).not.toMatch(/react|jsx|createElement/i);
  });

  it("builds a reviewable workspace plan that creates nothing until applied", () => {
    const doc = miniDocFromPrompt("new surface: timeline of visits");
    expect(doc.kind).toBe("mini");
    expect(doc.body.descriptor.template).toBe("timeline");

    const { plan } = promptToSurfacePlan({
      request: "prompt-to-surface a table of tasks",
      panes: [
        { docIds: ["doc_src"], activeDocId: "doc_src" },
        { docIds: [], activeDocId: null },
      ],
      splitView: false,
    });
    expect(plan.changes.some((change) => change.type === "createDoc")).toBe(true);
    expect(plan.label).toMatch(/Propose mini-tool/);
  });
});
