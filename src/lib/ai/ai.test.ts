import { describe, expect, it } from "vitest";
import { extractOpsBlocks, parseOpsFromReply, stripOpsBlocks, OPS_FENCE } from "./ops-block";
import { mockReply } from "./mock";
import { opReference } from "./op-reference";
import { systemPrompt } from "./prompt";
import { RECIPES, recipesFor } from "./recipes";
import { DOC_KINDS, type Doc, type DocKind } from "@/lib/docs/schema";
import {
  createCanvasDoc,
  createDeckDoc,
  createPdfDoc,
  createTextDoc,
} from "@/lib/docs/factories";
import { applyOps, OP_SCHEMAS } from "@/lib/ops";

const fence = (json: string) => `Some prose.\n\n\`\`\`${OPS_FENCE}\n${json}\n\`\`\``;

describe("ops block extraction", () => {
  it("finds a complete block and reports a partial one", () => {
    const complete = extractOpsBlocks(fence("[]"));
    expect(complete).toHaveLength(1);
    expect(complete[0].partial).toBe(false);

    const streaming = extractOpsBlocks(`prose\n\`\`\`${OPS_FENCE}\n[{"op":`);
    expect(streaming).toHaveLength(1);
    expect(streaming[0].partial).toBe(true);
  });

  it("strips blocks from the prose shown to the user", () => {
    expect(stripOpsBlocks(fence('[{"op":"deleteBlocks","index":0,"count":1}]'))).toBe("Some prose.");
  });

  it("ignores a reply with no block", () => {
    expect(parseOpsFromReply("text", "Just an answer, no edit needed.")).toEqual({ status: "none" });
  });

  it("accepts a bare object instead of an array", () => {
    const outcome = parseOpsFromReply("canvas", fence('{"op":"addNode","node":{"kind":"rect"}}'));
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") expect(outcome.ops).toHaveLength(1);
  });

  it("tolerates a trailing comma, which small models emit constantly", () => {
    const outcome = parseOpsFromReply("canvas", fence('[{"op":"addNode","node":{"kind":"rect"}},]'));
    expect(outcome.status).toBe("ok");
  });

  it("reports malformed JSON rather than throwing", () => {
    const outcome = parseOpsFromReply("canvas", fence("[{oh no}"));
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") expect(outcome.errors[0]).toMatch(/not valid JSON/);
  });

  it("rejects an operation the surface does not have", () => {
    const outcome = parseOpsFromReply("text", fence('[{"op":"addNode","node":{"kind":"rect"}}]'));
    expect(outcome.status).toBe("invalid");
  });

  it("rejects a batch where only one operation is bad", () => {
    const outcome = parseOpsFromReply(
      "canvas",
      fence('[{"op":"addNode","node":{"kind":"rect"}},{"op":"deleteNode"}]'),
    );
    expect(outcome.status).toBe("invalid");
  });
});

describe("mock provider", () => {
  const docs: Record<DocKind, () => Doc> = {
    text: () => createTextDoc("Notes", "An original sentence about the migration."),
    canvas: () => createCanvasDoc("Sketch"),
    deck: () => createDeckDoc("Deck"),
    pdf: () => {
      const doc = createPdfDoc("Paper");
      return applyOps<"pdf">(doc, [
        { op: "setSource", blobId: "blob_1", fileName: "paper.pdf", pageCount: 3 },
        { op: "setPageText", page: 1, text: "The migration completed ahead of schedule." },
        { op: "setPageText", page: 2, text: "Compute spend fell 34% year on year." },
      ]).doc;
    },
  };

  /**
   * The mock is what the e2e suite and every no-model demo run against. If it
   * ever emits something the schema rejects, those runs fail for a reason that
   * has nothing to do with the code under test — so it is held to the same
   * validator as a real model.
   */
  for (const kind of DOC_KINDS) {
    it(`emits schema-valid operations that apply cleanly for ${kind}`, () => {
      const doc = docs[kind]();
      const requests = [
        "summarise this",
        "make a diagram of it",
        "build slides",
        "write speaker notes",
        "highlight the key passages",
        "tidy the layout",
        "something completely unrelated",
      ];

      for (const request of requests) {
        const reply = mockReply({ doc, request });
        const outcome = parseOpsFromReply(kind, reply);
        expect(outcome.status, `${kind} / "${request}" -> ${reply}`).not.toBe("invalid");
        if (outcome.status === "ok") {
          // Not merely valid in isolation: it has to apply to the document it
          // was generated from, and be reversible.
          const forward = applyOps(doc as never, outcome.ops as never);
          const back = applyOps(forward.doc, forward.inverse);
          expect(back.doc.body).toEqual(doc.body);
        }
      }
    });
  }

  it("uses a companion document as source material", () => {
    const source = createTextDoc("Source", "Findings worth presenting to the board.");
    const reply = mockReply({
      doc: createDeckDoc("Deck"),
      request: "build slides from the source",
      companions: [{ doc: source }],
    });
    expect(reply).toContain("Source");
    expect(parseOpsFromReply("deck", reply).status).toBe("ok");
  });

  it("honours the target document selection when tightening text", () => {
    const reply = mockReply({
      doc: createTextDoc("Target", "One\n\nTwo\n\nThree"),
      request: "tighten this",
      selection: { kind: "text", blockIndex: 2, blockCount: 1, text: "Three" },
    });
    const outcome = parseOpsFromReply("text", reply);
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.ops[0]).toMatchObject({ op: "replaceMarkdown", index: 2, count: 1 });
    }
  });

  it("declines rather than inventing ops when a PDF has no pages", () => {
    const outcome = parseOpsFromReply("pdf", mockReply({ doc: createPdfDoc("Empty"), request: "highlight" }));
    expect(outcome.status).toBe("none");
  });
});

describe("prompt", () => {
  it("documents every operation the validator accepts", () => {
    for (const kind of DOC_KINDS) {
      const reference = opReference(kind);
      const schema = OP_SCHEMAS[kind] as unknown as {
        def: { options: { def: { shape: Record<string, { def: { values?: unknown[] } }> } }[] };
      };

      for (const option of schema.def.options) {
        const name = option.def.shape.op?.def.values?.[0];
        expect(reference, `${kind} reference should mention ${String(name)}`).toContain(
          JSON.stringify(name),
        );
      }
    }
  });

  it("tells the model the exact fence the parser looks for", () => {
    for (const kind of DOC_KINDS) {
      expect(systemPrompt(kind)).toContain(OPS_FENCE);
    }
  });
});

describe("recipes", () => {
  it("only targets surfaces that exist", () => {
    for (const recipe of RECIPES) {
      expect(DOC_KINDS).toContain(recipe.target);
      for (const from of recipe.from) expect(DOC_KINDS).toContain(from);
    }
  });

  it("gives every surface something to start from", () => {
    for (const kind of DOC_KINDS) {
      expect(recipesFor(kind).length, `${kind} should offer at least one recipe`).toBeGreaterThan(0);
    }
  });

  it("supplies a title for recipes that create their target document", () => {
    for (const recipe of RECIPES) {
      if (recipe.from.includes(recipe.target)) continue;
      expect(recipe.newTitle, `${recipe.id} creates a document and needs a title`).toBeDefined();
      expect(recipe.newTitle!("Source")).toContain("Source");
    }
  });

  it("has unique ids", () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
