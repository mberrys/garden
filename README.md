# garden

A **generative document workplace** — OpenOffice meets an IDE.

Plant a **seed packet** for a craft; it sprouts a worktree of text, PDFs,
presentations, drawings, spreadsheets, and databases. One shell, one undo
stack, and a local AI that edits through reviewable operations — not six apps
side by side.

Everything runs on your machine. Documents live in your browser; the model runs
wherever you point it.

---

## What makes it different from six editors in a row

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
| `GARDEN_FORCE_MOCK_AI` | unset | Set to `1` to force the scripted provider |

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
`.gardenspace` exports) so sprouted topology can evolve without breaking old
workspaces.

| Packet | Id | Sprouts |
| --- | --- | --- |
| Welcome | `garden/welcome` | intro document, edit-flow canvas, starter deck |
| History seminar | `garden/history-seminar` | syllabus, source notes, timeline, lecture deck |
| Grant shop | `garden/grant-shop` | opportunity brief, proposal, workplan, pitch deck |
| Field notes | `garden/field-notes` | visit log, site sketch, field media, debrief |
| Experiment report | `data/experiment-report` | study notes, experiments, run refs, findings, metrics sheet, analysis |
| Matter | `legal/matter` | matter notes, authorities (external reporters), issues, draft |
| Campaign | `comms/campaign` | brief, message house, contacts, story pipeline, pitch calendar, coverage, results deck |

You can also start blank and plant a packet later from the sidebar. Which packet
sprouted the workspace (and its version) is stored in local metadata and
included when you export a `.gardenspace` file.

Complex packets (multiple bases, links, or many artifacts) show a preview
listing exact artifacts, bases, views, and links before planting.

## The surfaces

**Document** — ProseMirror rich-text editor behind Garden's existing PM JSON
body. Typing, IME, and clipboard go through ProseMirror transactions mapped to
Garden ops; workspace undo is the only history. Markdown remains the import,
export, and AI interchange path. Writer also imports and exports a heading /
paragraph / list subset of DOCX and ODT. Writer is semantic editing. A PDF is
not a Writer document; it stays a separate evidence surface.

**Canvas** — a custom engine, not an embedded one, so the scene is plain JSON the
model can read and write directly. Infinite pan/zoom with a snapping grid,
rectangles/ellipses/diamonds/text/frames, freehand ink and a highlighter, and
connectors that bind to shape anchors and re-route as shapes move. Marquee select,
multi-select, nudge, align and restack. Excalidraw is a useful reference for
whiteboard interaction. It is not a Garden dependency and must not be embedded
as the canvas.

**Deck** — slide rail, a 1280×720 stage with drag/resize elements, seven layouts,
speaker notes, presenter mode, PPTX export via PptxGenJS, and PPTX/ODP import
of text, basic shapes, images, notes, and positions (not Univer Slides).

**PDF** — evidence and fixed layout, not semantic editing. pdf.js rendering with
a real selectable text layer and page virtualisation, an annotation overlay
(highlight, underline, strikeout, box, note) stored in normalised page
coordinates so it survives zooming, per-page text extraction that feeds the
assistant, page citations and evidence refs, an OCR provider hook (no bundled
engine), and export that flattens annotations into a copy of the original file.
Writer is where you rewrite prose. PDF is where you cite a page.

**Sheet** — a grid of cells addressed by A1 references, with a formula bar and a
small formula engine (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `IF`, `ROUND`,
`ABS`, `CONCAT`, arithmetic and ranges). Formulas are computed at render time,
never stored, so every cell edit stays exactly invertible. Bold/italic/align/
number-format styling, and grid resizing. XLSX import/export uses ExcelJS; ODS
uses a first-party ODF subset (not SheetJS commercial, not Univer Pro). The 1.0
engine spike keeps this Garden-native grid rather than Univer/IronCalc. Sheets
calculate. They are not the database.

**Database** — records, views, and relations: a light local tracker, not Airtable
or Notion, and not a spreadsheet. Typed fields, rows, grid, kanban, and calendar
views, filters, relation links, and shared `GardenRef` / `ExternalRef` cells.
The campaign packet seeds a pitch Schedule calendar. TanStack Table and
Virtual draw the grid for 1–5k local rows. They are UI infrastructure. Garden
JSON is the document. Bases are not Sheets.

**Media** — a board of image/file assets with captions, tags, groups, and
document links. Distinct from Drawing.

**Mini-tool** — constrained prompt-to-surface templates (card-grid, table,
timeline). Proposed as a reviewable workspace transaction; never generated React.

### Office interchange (documented subsets)

Drop or pick `.docx`, `.odt`, `.xlsx`, `.ods`, `.pptx`, or `.odp` to import into
the matching Garden surface. Canonical state stays Garden JSON; fidelity
warnings toast the first few `message`s. Details: [docs/interchange.md](docs/interchange.md).

| Surface | Import | Export | Subset / known lossiness |
| --- | --- | --- | --- |
| Document | DOCX (Mammoth), ODT | DOCX, ODT | Headings, paragraphs, lists. No styles, tables, comments, tracked changes |
| Sheet | XLSX (ExcelJS), ODS | XLSX, ODS | First sheet; values, formulas, bold/italic/align. No macros, pivots, charts, VBA |
| Deck | PPTX, ODP | PPTX (PptxGenJS) | Text, basic shapes, images, notes, positions. No SmartArt, animations, video, charts, groups, macros |

This is not Word / Excel / PowerPoint parity. Unsupported constructs emit
warnings and are dropped.

### Cross-surface recipes

Offered in the assistant panel, per surface:

| From | Recipe | Produces |
| --- | --- | --- |
| PDF | Build a deck | a new deck drafted from the document |
| PDF | Summarise into a doc | a structured summary |
| PDF | Highlight key passages | annotations on the pages you have read |
| Document | Diagram this | a canvas of the structure it describes |
| Document | Turn into slides | a deck |
| Document | Extract a table | a sheet built from the document |
| Document | Tighten this / Add an outline | edits in place |
| Canvas | Write it up | a document from the diagram |
| Canvas | Tidy the layout | alignment and spacing fixes |
| Deck | Write speaker notes / Tighten the copy | edits in place |
| Sheet | Summarise the data | a document written up from the sheet |
| Sheet | Add totals | totals row, in place |
| Database | Add rows from notes | new rows, in place |

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
`.gardenspace` file (documents plus embedded PDFs and images, and which seed packet
sprouted it) that **Import** restores.
Individual documents can be exported the same way from the sidebar menu. Drop a
`.pdf`, `.md`, `.txt`, `.docx`, `.odt`, `.xlsx`, `.ods`, `.pptx`, `.odp`, or
`.gardenspace` anywhere in the window to import it.

---

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest — document model, op reducers, adapter harness, markdown, AI parsing
npm run test:e2e   # playwright — all six surfaces, against the mock provider
```

Run `npm run build` before `npm run test:e2e`; the suite starts the production
server. It forces the scripted provider, so it never depends on a model being
installed.

GitHub Actions runs that same gate on pulls and on pushes to `main`
(`.github/workflows/ci.yml`): typecheck, lint, vitest, production build, then
Playwright against the mock provider.

### How it fits together

```
src/
  lib/docs/     Zod schemas for every document kind — the single source of
                truth for types, persistence validation, and the AI's vocabulary
  lib/ops/      one pure reducer per surface, each returning the new body and an
                exact inverse; this is what makes undo and AI-reject the same thing
  lib/ai/       provider adapters, prompt construction, op-block parsing, recipes
  lib/packets/  Seed Packet v0.1 — profession kits that sprout documents and layout
  lib/store/    zustand workspace state, Dexie persistence, import/export
  lib/packets/  seed packet registry and sprout — profession kits that plant a
                worktree of documents and bases
  lib/surfaces/ SurfaceDefinition (registration contract) and EditorAdapter
                (engine boundary), plus a conformance harness a new adapter can fail
  surfaces/     text, canvas, deck, pdf, sheet, database
  components/   shell: sidebar, panes, assistant panel, review cards
```

Three conventions are worth knowing before changing anything:

1. **Schemas are the source of truth.** TypeScript types come from `z.infer`, and
   the operation reference in the AI prompt is *generated* from the same schemas —
   so the instructions a model follows cannot drift from the validator that judges
   it. Adding an operation means adding it in one place.

2. **User actions and AI actions share one path.** Both call `commit()`, which
   calls `applyOps()`. There is no second code path for AI edits, which is why
   they are undoable, previewable and rejectable without any special handling.

3. **Engines are replaceable; Garden state is canonical.** `SurfaceDefinition` is
   the registration contract a surface registers through. `EditorAdapter` is the
   engine boundary: user input becomes Garden ops, Garden ops update the engine
   without feedback loops, undo lives on Garden's stack, and `.gardenspace` never
   persists engine internals. Built-in surfaces are described against this
   contract before they all implement it.

---

## Licence

Apache-2.0 — see [LICENSE](./LICENSE), [NOTICE](./NOTICE), and the borrowed-engine
policy in [docs/licensing.md](./docs/licensing.md).
