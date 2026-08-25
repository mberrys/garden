# Office interchange

Garden documents stay canonical. Importers and exporters map a **documented
subset** of Office files onto that model and emit `FidelityWarning`s
(`supported` / `partial` / `unsupported`). They never persist Univer,
ProseMirror, ExcelJS, or PptxGenJS objects (`assertGardenCanonical`).

The dispatcher is one `importFile` in `src/lib/store/bundle.ts`. It routes by
`formatForFilename` to a per-format adapter in `src/lib/interchange/`.

## Libraries

| Format | Import | Export | Why |
| --- | --- | --- | --- |
| DOCX | Mammoth (ZIP) with XML fallback | `docx` (MIT) | Named in `docs/licensing.md` |
| ODT | fflate + `content.xml` (`text:h` / `text:p`) | fflate ODF zip | No extra dependency |
| XLSX | ExcelJS (MIT) | ExcelJS | Browser-safe, no SheetJS commercial cliff |
| ODS | fflate + ODF table XML | fflate ODF zip | ExcelJS does not do ODS |
| PPTX | fflate + per-slide OOXML | PptxGenJS (already shipped) | Import is text, shapes, images, notes, positions |
| ODP | fflate + `draw:page` | not required | Documented subset |

**ExcelJS vs SheetJS CE.** SheetJS Community Edition can read ODS, but
commercial SheetJS tiers (and Univer Pro interchange) are red-by-default in
`docs/licensing.md`. Garden therefore uses ExcelJS for XLSX and a first-party
ODF subset for ODS.

## Fidelity

`scoreWarnings(warnings)` counts `{ supported, partial, unsupported }`. Tests
and the fixture runner use that shape. The import toast shows the first two or
three warning `message`s (plus a count if there are more) so the stable codes
are visible.

Unsupported constructs still import whatever subset mapped; they do not abort.

## Fixture corpus

Committed packages live under `fixtures/interchange/<format>/<id>/`:

```
manifest.json
input.<format>     # or whatever `input` names in the manifest
```

`src/lib/interchange/corpus.ts` auto-discovers those directories. Adding a
fixture does not require editing importer tests; `interchange.test.ts` glob-runs
the corpus.

### `manifest.json`

```json
{
  "id": "hello",
  "format": "docx",
  "status": "run",
  "expectedKind": "text",
  "expectedContains": ["Hello Garden"],
  "roundTrip": true
}
```

| Field | Meaning |
| --- | --- |
| `status` | `run` or `skip` |
| `skipReason` | Required in spirit when `status` is `skip` |
| `expectedKind` | Garden doc kind after import |
| `expectedContains` | Substrings that must appear in `JSON.stringify(docs)` |
| `roundTrip` | Export then re-import; `expectedContains` must still hold |
| `input` | Filename override (default `input.<format>`) |

A missing importer is a `skip` with a reason, never a silent pass. A format
whose adapter exists must have at least one `run` fixture (skip-only is a fail).

### Adding a fixture

1. Create `fixtures/interchange/<format>/<id>/`.
2. Drop a tiny real package as `input.<format>` (ZIP, not concatenated XML).
3. Write `manifest.json` as above.
4. Run `npm run test` — the corpus runner picks it up.

To regenerate the committed hello/grid/simple packages:

```bash
npx vite-node --config vitest.config.ts scripts/write-interchange-fixtures.ts
```
