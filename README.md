# rr

A single workspace combining a **text editor**, a **PDF reader**, a **presentation
editor**, and an **infinite drawing canvas** — with a local AI model that can read
and edit all four, and build documents on one surface from material on another.

Everything runs on your machine. Documents live in your browser; the model runs
wherever you point it.

---

## What makes it different from four editors in a row

The assistant does not type into your document.

Every surface has a typed document model and a typed **operation vocabulary**. The
model reads the document and proposes a batch of operations — it never touches the
DOM, never free-writes into a text box. Those operations are validated against the
same schema the editors use, shown to you as a plain-English list, and applied only
when you accept them.

Three things fall out of that:

- **You see the change before it happens.** A suggestion is a reviewable list, not
  a fait accompli. Discarding costs nothing because the document was never touched.
- **AI edits are ordinary edits.** They run through the same reducer as your own
  actions, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> reverses them exactly like anything else.
- **The model can work across surfaces.** A PDF's extracted text can become a deck;
  a document's structure can become a diagram; a canvas can become prose. The
  generated document opens in the second pane, beside the one it came from.

If a model emits something malformed — which small local models do often — it is
rejected by the schema, given one chance to repair itself, and otherwise surfaced
as a failed suggestion. A malformed edit can never reach a document.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The app works immediately. With no local model reachable it falls back to a
**scripted mock provider** — clearly labelled in the header — which produces real,
schema-valid edits so you can try the whole flow without installing anything.

### Connecting a local model

Anything that speaks the OpenAI chat-completions API works: Ollama, LM Studio,
llama.cpp's server, vLLM.

```bash
ollama serve
ollama pull qwen2.5:7b-instruct
```

Reload, and the header badge flips from `mock provider` to the model's name. Click
the badge at any time to re-check.

Configure a different runtime with environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible base URL |
| `AI_MODEL` | `qwen2.5:7b-instruct` | Model to request |
| `AI_API_KEY` | `local` | Sent as a bearer token; most local servers ignore it |
| `AI_PROBE_TIMEOUT_MS` | `1500` | How long to wait when checking for a server |
| `RR_FORCE_MOCK_AI` | unset | Set to `1` to force the scripted provider |

For example, LM Studio:

```bash
AI_BASE_URL=http://localhost:1234/v1 AI_MODEL=your-model npm run dev
```

The browser never sees the base URL or key — requests go through a server route
that also makes localhost-bound servers reachable without CORS configuration.

---

## Seed packets

An empty workspace is a picker, not a blank suite. A **seed packet** is a
profession-shaped starting kit: starter documents, database bases, which panes
to open, cross-links, layout presets, extra assistant recipes, and prompt
addenda for that craft. Choosing one **sprouts** the worktree.

Packets are data (TypeScript modules), not one-off React trees. The welcome
experience is packet `garden/welcome` — the same path as the others.

Each packet carries a `version` persisted in workspace metadata (and in
`.rrspace` exports) so sprouted topology can evolve without breaking old
workspaces.

| Packet | Id | Sprouts |
| --- | --- | --- |
| Welcome | `garden/welcome` | intro document, edit-flow canvas, starter deck |
| History seminar | `garden/history-seminar` | syllabus, source notes, timeline, lecture deck |
| Grant shop | `garden/grant-shop` | opportunity brief, proposal, workplan, pitch deck |
| Field notes | `garden/field-notes` | visit log, site sketch, debrief |
| Campaign | `comms/campaign` | brief, message house, contacts, story pipeline, pitches, coverage, results deck |

You can also start blank and plant a packet later from the sidebar. Which packet
sprouted the workspace (and its version) is stored in local metadata and
included when you export a `.rrspace` file.

Complex packets (multiple bases, links, or many artifacts) show a preview
listing exact artifacts, bases, views, and links before planting.

## The surfaces

**Document** — a markdown source editor. Type headings, lists, quotes, code
fences and links as plain markdown; the stored body is still structured JSON so
the assistant can address blocks. Typing and AI edits share the workspace undo
stack, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> reverses either.

**Database** — typed fields, rows, grid and kanban views, relation links to
other bases in the workspace, and `garden_ref` / `external_ref` cells for
cross-surface provenance. AI row and schema batches go through the same
review gate as other surfaces. This is the structured-work layer — lighter
than Airtable or Notion, local-first, and composed by seed packets rather than
blank grids.

**Canvas** — a custom engine, not an embedded one, so the scene is plain JSON the
model can read and write directly. Infinite pan/zoom with a snapping grid,
rectangles/ellipses/diamonds/text/frames, freehand ink and a highlighter, and
connectors that bind to shape anchors and re-route as shapes move. Marquee select,
multi-select, nudge, align and restack.

**Deck** — slide rail, a 1280×720 stage with drag/resize elements, seven layouts,
speaker notes, and a presenter mode that runs inside the pane, so you can present
in one half while the source stays visible in the other.

**PDF** — pdf.js rendering with a real selectable text layer and page
virtualisation, an annotation overlay (highlight, underline, strikeout, box, note)
stored in normalised page coordinates so it survives zooming, per-page text
extraction that feeds the assistant, and export that flattens annotations into a
copy of the original file.

### Cross-surface recipes

Offered in the assistant panel, per surface:

| From | Recipe | Produces |
| --- | --- | --- |
| PDF | Build a deck | a new deck drafted from the document |
| PDF | Summarise into a doc | a structured summary |
| PDF | Highlight key passages | annotations on the pages you have read |
| Document | Diagram this | a canvas of the structure it describes |
| Document | Turn into slides | a deck |
| Document | Tighten this / Add an outline | edits in place |
| Canvas | Write it up | a document from the diagram |
| Canvas | Tidy the layout | alignment and spacing fixes |
| Deck | Write speaker notes / Tighten the copy | edits in place |

---

## Keyboard

| | |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>J</kbd> | Toggle the assistant |
| <kbd>Ctrl</kbd>+<kbd>\\</kbd> | Toggle split view |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Undo / redo |
| `V` `H` `R` `O` `D` `T` `F` `L` `A` `C` `P` `M` `E` | Canvas tools |
| <kbd>Space</kbd>-drag, middle-drag | Pan the canvas |
| <kbd>Alt</kbd>-drag | Bypass grid snapping |
| <kbd>←</kbd> <kbd>→</kbd>, <kbd>N</kbd>, <kbd>Esc</kbd> | Presenter: navigate, notes, exit |

---

## Your data

Documents and files are stored in your browser with IndexedDB. Nothing is uploaded
anywhere; the only network request the app makes is to the local model server you
configure.

Because browser storage can be cleared, **Export** writes the whole workspace to a
`.rrspace` file (documents plus embedded PDFs and images, and which seed packet
sprouted it) that **Import** restores.
Individual documents can be exported the same way from the sidebar menu. Drop a
`.pdf`, `.md`, `.txt` or `.rrspace` anywhere in the window to import it.

---

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest — document model, op reducers, markdown, AI parsing
npm run test:e2e   # playwright — all four surfaces, against the mock provider
```

Run `npm run build` before `npm run test:e2e`; the suite starts the production
server. It forces the scripted provider, so it never depends on a model being
installed.

### How it fits together

```
src/
  lib/docs/     Zod schemas for all four document kinds — the single source of
                truth for types, persistence validation, and the AI's vocabulary
  lib/ops/      one pure reducer per surface, each returning the new body and an
                exact inverse; this is what makes undo and AI-reject the same thing
  lib/ai/       provider adapters, prompt construction, op-block parsing, recipes
  lib/packets/  seed packet registry and sprout — profession kits that plant a
                worktree (docs, panes, recipes, prompt addenda)
  lib/store/    zustand workspace state, Dexie persistence, import/export
  surfaces/     text, canvas, deck, pdf
  components/   shell: sidebar, panes, assistant panel, review cards
```

Two conventions are worth knowing before changing anything:

1. **Schemas are the source of truth.** TypeScript types come from `z.infer`, and
   the operation reference in the AI prompt is *generated* from the same schemas —
   so the instructions a model follows cannot drift from the validator that judges
   it. Adding an operation means adding it in one place.

2. **User actions and AI actions share one path.** Both call `commit()`, which
   calls `applyOps()`. There is no second code path for AI edits, which is why
   they are undoable, previewable and rejectable without any special handling.

---

## Licence

MIT — see [LICENSE](./LICENSE).
