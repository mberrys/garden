import { z } from "zod";
import {
  type DeckBody,
  type SlideElement,
  SlideElementSchema,
  SlideLayoutSchema,
  SlideSchema,
} from "@/lib/docs/schema";
import { makeSlide, makeSlideElement } from "@/lib/docs/factories";
import { OpError } from "./errors";

const ElementTypeSchema = z.enum(["text", "bullets", "shape", "image"]);

/**
 * Deck operations.
 *
 * `addSlide` takes *content*, not geometry: a layout name plus title/bullets/
 * notes. Slide coordinates are then derived by `makeSlide`. This matters for
 * the AI path — asking a 7B model to place text boxes in a 1280x720 space
 * produces overlapping garbage, while asking it for "a bullets slide titled X"
 * produces something that looks designed.
 */
export const DeckOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("addSlide"),
      layout: SlideLayoutSchema.default("title-body"),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      body: z.string().optional(),
      bullets: z.array(z.string()).optional(),
      left: z.array(z.string()).optional(),
      right: z.array(z.string()).optional(),
      notes: z.string().optional(),
      index: z.number().int().min(0).optional(),
    })
    .describe("Append a slide built from a layout plus its text content"),
  z
    .object({
      op: z.literal("insertSlide"),
      slide: SlideSchema,
      index: z.number().int().min(0).optional(),
    })
    .describe("Insert a fully-specified slide verbatim (used by undo, duplicate and paste)"),
  z.object({ op: z.literal("deleteSlide"), id: z.string() }).describe("Remove a slide"),
  z
    .object({ op: z.literal("moveSlide"), id: z.string(), toIndex: z.number().int().min(0) })
    .describe("Reorder a slide within the deck"),
  z
    .object({
      op: z.literal("setSlide"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Change slide-level properties such as notes, layout or background"),
  z
    .object({
      op: z.literal("addElement"),
      slideId: z.string(),
      element: z.object({ type: ElementTypeSchema }).catchall(z.unknown()),
      index: z.number().int().min(0).optional(),
    })
    .describe("Add a text, bullets, shape or image element to a slide"),
  z
    .object({
      op: z.literal("updateElement"),
      slideId: z.string(),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Change properties of an element on a slide"),
  z
    .object({ op: z.literal("deleteElement"), slideId: z.string(), id: z.string() })
    .describe("Remove an element from a slide"),
  z
    .object({
      op: z.literal("reorderElement"),
      slideId: z.string(),
      id: z.string(),
      toIndex: z.number().int().min(0),
    })
    .describe("Change an element's stacking order on its slide"),
  z
    .object({ op: z.literal("setTheme"), patch: z.record(z.string(), z.unknown()) })
    .describe("Change the deck's colour theme"),
]);

export type DeckOp = z.infer<typeof DeckOpSchema>;

export function applyDeckOps(
  body: DeckBody,
  ops: DeckOp[],
): { body: DeckBody; inverse: DeckOp[] } {
  let slides = body.slides.slice();
  let theme = body.theme;
  const inverse: DeckOp[] = [];

  const slideIndex = (id: string, opName: string): number => {
    const i = slides.findIndex((s) => s.id === id);
    if (i === -1) throw new OpError(`${opName}: no slide with id "${id}"`);
    return i;
  };

  for (const op of ops) {
    switch (op.op) {
      case "addSlide": {
        const slide = makeSlide(op.layout, {
          title: op.title,
          subtitle: op.subtitle,
          body: op.body,
          bullets: op.bullets,
          left: op.left,
          right: op.right,
          notes: op.notes,
        });
        const at = op.index === undefined ? slides.length : Math.min(op.index, slides.length);
        slides.splice(at, 0, slide);
        inverse.push({ op: "deleteSlide", id: slide.id });
        break;
      }

      case "insertSlide": {
        const at = op.index === undefined ? slides.length : Math.min(op.index, slides.length);
        if (slides.some((s) => s.id === op.slide.id)) {
          throw new OpError(`insertSlide: slide "${op.slide.id}" already exists`);
        }
        slides.splice(at, 0, op.slide);
        inverse.push({ op: "deleteSlide", id: op.slide.id });
        break;
      }

      case "deleteSlide": {
        const i = slideIndex(op.id, "deleteSlide");
        const [removed] = slides.splice(i, 1);
        // Restore verbatim: a slide's elements carry generated ids that the
        // content-shaped `addSlide` cannot round-trip.
        inverse.push({ op: "insertSlide", slide: removed, index: i });
        break;
      }

      case "moveSlide": {
        const from = slideIndex(op.id, "moveSlide");
        const to = Math.max(0, Math.min(op.toIndex, slides.length - 1));
        if (from === to) break;
        const [moved] = slides.splice(from, 1);
        slides.splice(to, 0, moved);
        inverse.push({ op: "moveSlide", id: op.id, toIndex: from });
        break;
      }

      case "setSlide": {
        const i = slideIndex(op.id, "setSlide");
        const before = slides[i];
        const parsed = SlideSchema.safeParse({ ...before, ...op.patch, id: before.id });
        if (!parsed.success) {
          throw new OpError(`setSlide "${op.id}": ${formatIssues(parsed.error)}`);
        }
        const priorValues: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          priorValues[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "setSlide", id: op.id, patch: priorValues });
        slides = slides.slice();
        slides[i] = parsed.data;
        break;
      }

      case "addElement": {
        const i = slideIndex(op.slideId, "addElement");
        let element: SlideElement;
        try {
          element = makeSlideElement(op.element as { type: SlideElement["type"] });
        } catch (err) {
          throw new OpError(`addElement: ${describeZod(err)}`);
        }
        const elements = slides[i].elements.slice();
        const at = op.index === undefined ? elements.length : Math.min(op.index, elements.length);
        elements.splice(at, 0, element);
        slides = slides.slice();
        slides[i] = { ...slides[i], elements };
        inverse.push({ op: "deleteElement", slideId: op.slideId, id: element.id });
        break;
      }

      case "updateElement": {
        const i = slideIndex(op.slideId, "updateElement");
        const elements = slides[i].elements.slice();
        const j = elements.findIndex((e) => e.id === op.id);
        if (j === -1) throw new OpError(`updateElement: no element "${op.id}" on slide "${op.slideId}"`);
        const before = elements[j];
        if ("type" in op.patch && op.patch.type !== before.type) {
          throw new OpError(`updateElement: cannot change type of "${op.id}"`);
        }
        const parsed = SlideElementSchema.safeParse({
          ...before,
          ...op.patch,
          type: before.type,
          id: before.id,
        });
        if (!parsed.success) {
          throw new OpError(`updateElement "${op.id}": ${formatIssues(parsed.error)}`);
        }
        const priorValues: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          priorValues[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateElement", slideId: op.slideId, id: op.id, patch: priorValues });
        elements[j] = parsed.data;
        slides = slides.slice();
        slides[i] = { ...slides[i], elements };
        break;
      }

      case "deleteElement": {
        const i = slideIndex(op.slideId, "deleteElement");
        const elements = slides[i].elements.slice();
        const j = elements.findIndex((e) => e.id === op.id);
        if (j === -1) throw new OpError(`deleteElement: no element "${op.id}" on slide "${op.slideId}"`);
        const [removed] = elements.splice(j, 1);
        inverse.push({
          op: "addElement",
          slideId: op.slideId,
          element: removed as unknown as { type: SlideElement["type"] } & Record<string, unknown>,
          index: j,
        });
        slides = slides.slice();
        slides[i] = { ...slides[i], elements };
        break;
      }

      case "reorderElement": {
        const i = slideIndex(op.slideId, "reorderElement");
        const elements = slides[i].elements.slice();
        const from = elements.findIndex((e) => e.id === op.id);
        if (from === -1) throw new OpError(`reorderElement: no element "${op.id}"`);
        const to = Math.max(0, Math.min(op.toIndex, elements.length - 1));
        if (from === to) break;
        const [moved] = elements.splice(from, 1);
        elements.splice(to, 0, moved);
        inverse.push({ op: "reorderElement", slideId: op.slideId, id: op.id, toIndex: from });
        slides = slides.slice();
        slides[i] = { ...slides[i], elements };
        break;
      }

      case "setTheme": {
        const merged = { ...theme, ...op.patch };
        const priorValues: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          priorValues[key] = (theme as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "setTheme", patch: priorValues });
        theme = merged as DeckBody["theme"];
        break;
      }
    }
  }

  return { body: { slides, theme }, inverse: inverse.reverse() };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ");
}

function describeZod(err: unknown): string {
  if (err instanceof z.ZodError) return formatIssues(err);
  return err instanceof Error ? err.message : String(err);
}
