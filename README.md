# garden

A **generative document workplace** — OpenOffice meets an IDE.

Plant a **seed packet** for a craft; it sprouts a worktree of text, PDFs,
presentations, drawings (and soon sheets, databases, media). One shell, one undo
stack, and a local AI that edits through reviewable operations — not four apps
side by side.

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
| `GARDEN_FORCE_MOCK_AI` | unset | Set to `1` to force the scripted provider |

For example, LM Studio:

```bash
AI_BASE_URL=http://localhost:1234/v1 AI_MODEL=your-model npm run dev
```

The browser never sees the base URL or key — requests go through a server route
that also makes localhost-bound servers reachable without CORS configuration.

---

## The surfaces

**Document** — markdown source editor. The stored body remains ProseMirror JSON so
AI ops and cross-surface recipes stay typed; typing commits coalesced edits onto
the shared workspace undo stack (including accepted AI suggestions).

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
`.gardenspace` file (documents plus embedded PDFs and images) that **Import** restores.
Individual documents can be exported the same way from the sidebar menu. Drop a
`.pdf`, `.md`, `.txt` or `.gardenspace` anywhere in the window to import it.

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
  lib/surfaces/ SurfaceDefinition registry — built-ins and extensions register the
                same contract (schemas, ops, AI helpers, React host loader)
  lib/ai/       provider adapters, prompt construction, op-block parsing, recipes
  lib/store/    zustand workspace state, Dexie persistence, import/export
  surfaces/     text, canvas, deck, pdf React hosts
  components/   shell: sidebar, panes, assistant panel, review cards
```

Built-in surfaces register through `registerSurface()` in `lib/surfaces/*.register.ts`.
Adding a surface means one registration module (schema, ops reducer, AI serialize/mock,
icon/label, host `loadComponent`) plus typed catalog entries in `DOC_KINDS` and
`DocSchema`. The shell, ops dispatch, assistant prompts, and blob cleanup read the
registry — not per-kind switches scattered across the app.

`AdapterSurfaceDefinition` and `runAdapterConformance` in `lib/surfaces/conformance.ts`
exercise the engine boundary (`EditorAdapter`) for test doubles and future engine
swaps. Product built-ins still commit through `workspace.commit()` → `applyOps()`.

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
