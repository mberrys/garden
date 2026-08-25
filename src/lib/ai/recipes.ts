import type { DocKind } from "@/lib/docs/schema";
import { getPacket } from "@/lib/packets/registry";

/**
 * Cross-surface actions.
 *
 * These are what make the suite a combination rather than four editors sharing
 * a sidebar: the source of the content and the surface it lands on are
 * different documents, and the model bridges them. A recipe whose `target`
 * differs from the surface it starts on creates that document if one is not
 * already open, and puts it in the second pane so the user can watch the
 * source and the result side by side.
 */
export interface Recipe {
  id: string;
  label: string;
  hint: string;
  /** Surfaces this appears on. */
  from: DocKind[];
  /** Surface the operations apply to. */
  target: DocKind;
  /** Default title when the target document has to be created. */
  newTitle?: (sourceTitle: string) => string;
  prompt: string;
}

export const RECIPES: Recipe[] = [
  {
    id: "pdf-to-deck",
    label: "Build a deck",
    hint: "Turn this PDF into a presentation",
    from: ["pdf"],
    target: "deck",
    newTitle: (title) => `${title} — deck`,
    prompt:
      "Build a presentation from the source PDF. Open with a title slide, then one slide per " +
      "major theme using the bullets layout, then a closing slide with the conclusions. Six to " +
      "eight slides. Draw every point from the source text — do not invent facts. Add speaker " +
      "notes to each slide.",
  },
  {
    id: "pdf-to-summary",
    label: "Summarise into a doc",
    hint: "Write a structured summary of this PDF",
    from: ["pdf"],
    target: "text",
    newTitle: (title) => `${title} — summary`,
    prompt:
      "Write a structured summary of the source PDF into this document. Start with a two-sentence " +
      "abstract, then '## Key points' as a bulleted list, then '## Open questions'. Ground every " +
      "claim in the source text and quote sparingly.",
  },
  {
    id: "pdf-highlight",
    label: "Highlight key passages",
    hint: "Annotate the important parts",
    from: ["pdf"],
    target: "pdf",
    prompt:
      "Read the extracted page text and highlight the passages that carry the document's main " +
      "claims — no more than two per page, on the pages that have been read. Add a short note to " +
      "each explaining why it matters.",
  },
  {
    id: "doc-to-canvas",
    label: "Diagram this",
    hint: "Sketch the structure on a canvas",
    from: ["text"],
    target: "canvas",
    newTitle: (title) => `${title} — diagram`,
    prompt:
      "Draw a diagram of the structure described in the source document. Use one labelled shape " +
      "per concept, laid out left to right or top to bottom, and connectors between them showing " +
      "how they relate. Label the connectors where the relationship is not obvious. Keep it under " +
      "ten shapes.",
  },
  {
    id: "doc-to-deck",
    label: "Turn into slides",
    hint: "Draft a deck from this document",
    from: ["text"],
    target: "deck",
    newTitle: (title) => `${title} — deck`,
    prompt:
      "Draft a presentation from the source document. One slide per section, bullets rather than " +
      "paragraphs, and a title slide at the front. Keep bullets short enough to read from the back " +
      "of a room.",
  },
  {
    id: "canvas-to-doc",
    label: "Write it up",
    hint: "Turn this canvas into prose",
    from: ["canvas"],
    target: "text",
    newTitle: (title) => `${title} — write-up`,
    prompt:
      "Write up the diagram on the source canvas as a document. Use the shape labels as section " +
      "headings in the order the connectors imply, and describe each relationship the connectors " +
      "show. Prose, not bullets.",
  },
  {
    id: "canvas-tidy",
    label: "Tidy the layout",
    hint: "Align and space the shapes",
    from: ["canvas"],
    target: "canvas",
    prompt:
      "Tidy this canvas: align shapes that are nearly aligned, make spacing between them even, " +
      "and give shapes in the same row a consistent size. Move things as little as possible — the " +
      "arrangement the user made should still be recognisable. Do not add or delete anything.",
  },
  {
    id: "deck-notes",
    label: "Write speaker notes",
    hint: "Add notes to every slide",
    from: ["deck"],
    target: "deck",
    prompt:
      "Write speaker notes for every slide in this deck. Two or three sentences each: what to say, " +
      "not what is already on the slide. Include the transition into the next slide.",
  },
  {
    id: "deck-tighten",
    label: "Tighten the copy",
    hint: "Cut the slide text down",
    from: ["deck"],
    target: "deck",
    prompt:
      "Tighten the text on every slide. Cut bullets to at most twelve words, remove filler, and " +
      "make titles specific rather than generic. Keep the meaning and the slide order unchanged.",
  },
  {
    id: "text-tighten",
    label: "Tighten this",
    hint: "Edit the selection, or the whole document",
    from: ["text"],
    target: "text",
    prompt:
      "Tighten the prose. Lead with the claim, cut hedging and repetition, and keep the author's " +
      "voice. If the user has selected specific blocks, edit only those; otherwise edit the whole " +
      "document. Do not add new claims.",
  },
  {
    id: "text-outline",
    label: "Add an outline",
    hint: "Insert a summary at the top",
    from: ["text"],
    target: "text",
    prompt:
      "Insert a short outline at the very top of this document: a '## Outline' heading followed by " +
      "one bullet per section already present. Do not change anything else.",
  },
  {
    id: "doc-to-sheet",
    label: "Extract a table",
    hint: "Pull the figures into a sheet",
    from: ["text", "pdf"],
    target: "sheet",
    newTitle: (title) => `${title} — table`,
    prompt:
      "Extract the structured data from the source into this sheet. Put a header row in row 1, " +
      "then one row per record beneath it, one field per column. Use setCells with A1-style refs. " +
      "Only include figures and labels that appear in the source — do not invent data.",
  },
  {
    id: "sheet-to-doc",
    label: "Summarise the data",
    hint: "Write up what the numbers show",
    from: ["sheet"],
    target: "text",
    newTitle: (title) => `${title} — summary`,
    prompt:
      "Write a short summary of the data in the source sheet. Open with a one-sentence takeaway, " +
      "then '## Highlights' as a bulleted list of the notable figures and any totals. Ground every " +
      "claim in the cells you were given.",
  },
  {
    id: "sheet-totals",
    label: "Add totals",
    hint: "Sum the numeric columns",
    from: ["sheet"],
    target: "sheet",
    prompt:
      "Add a totals row beneath the data. For each column that holds numbers, put a SUM formula " +
      "over that column's data range in the first empty row under it, and label the row 'Total' in " +
      "the first column. Grow the grid with resize first if there is no empty row to write into.",
  },
  {
    id: "db-add-rows",
    label: "Add rows from notes",
    hint: "Turn bullet points into new rows",
    from: ["database"],
    target: "database",
    prompt:
      "Read the user's request and add rows to this database. Use addRow with cells filled " +
      "from the request. Do not invent data that is not implied by the user or visible rows.",
  },
  {
    id: "pdf-to-rows",
    label: "Extract source rows",
    hint: "Turn cited PDF passages into database rows",
    from: ["pdf"],
    target: "database",
    newTitle: (title) => `${title} — sources`,
    prompt:
      "Create source rows from the PDF's extracted text and citations. Each row is one " +
      "passage. Put the quote in a text field and do not invent page numbers. Prefer " +
      "addRow. If evidence refs exist, keep their relation (supports/contradicts/qualifies).",
  },
  {
    id: "media-caption",
    label: "Caption the board",
    hint: "Write captions from filenames and tags",
    from: ["media"],
    target: "media",
    prompt:
      "Write a short caption for each uncaptioned asset. Use the filename and tags. Do not " +
      "invent events that are not implied by the names. Use setCaption per asset id.",
  },
  {
    id: "media-to-doc",
    label: "Write a figure list",
    hint: "Turn the media board into a document",
    from: ["media"],
    target: "text",
    newTitle: (title) => `${title} — figures`,
    prompt:
      "Write a figure list from the source media board. One heading per asset, then the " +
      "caption. Do not invent files that are not on the board.",
  },
  {
    id: "mini-add-records",
    label: "Fill the mini-tool",
    hint: "Add records from the request",
    from: ["mini"],
    target: "mini",
    prompt:
      "Add records to this mini-tool using addRecord. Only use field ids from the descriptor. " +
      "Never emit React, HTML, or editor-engine code. Do not call setDescriptor unless the " +
      "user asked to change the template.",
  },
  {
    id: "prompt-to-surface",
    label: "Propose a mini-tool",
    hint: "Constrained template, reviewed as a workspace transaction",
    from: ["text", "database"],
    target: "mini",
    newTitle: (title) => `${title} — tool`,
    prompt:
      "Propose a mini-tool descriptor for this request. Use setDescriptor with template " +
      "card-grid, table, or timeline and a short field list. Then addRecord for starter " +
      "rows. Never emit React source or a new editor engine.",
  },
];

export function recipesFor(kind: DocKind, seedPacketId?: string | null): Recipe[] {
  const fromGlobal = RECIPES.filter((recipe) => recipe.from.includes(kind));
  const packet = seedPacketId ? getPacket(seedPacketId) : undefined;
  const fromPacket = (packet?.recipes ?? []).filter((recipe) => recipe.from.includes(kind));
  const combined = [...fromGlobal, ...fromPacket];
  const featured = packet?.featuredRecipeIds ?? [];
  if (featured.length === 0) return combined;

  const byId = new Map(combined.map((recipe) => [recipe.id, recipe]));
  const seen = new Set<string>();
  const head: Recipe[] = [];
  for (const id of featured) {
    const recipe = byId.get(id);
    if (!recipe || seen.has(recipe.id) || !recipe.from.includes(kind)) continue;
    head.push(recipe);
    seen.add(recipe.id);
  }
  const tail = combined.filter((recipe) => !seen.has(recipe.id));
  return [...head, ...tail];
}
