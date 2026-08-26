# SH01 — Sheets engine spike (#35)

**Decision for 1.0:** keep the Garden-native `sheet` document already on `main`.
Do not adopt Univer or IronCalc as the persisted product model.

## Question

Issue #35 asks whether Univer or IronCalc should sit behind a Garden adapter for
a spreadsheet surface that already has A1 addressing, a formula engine,
exact-inverse ops, AI review, and e2e coverage.

## What already ships

`src/lib/docs/schema.ts` (`sheet`), `src/lib/ops/sheet.ts`, `src/lib/sheet/formula.ts`,
`src/surfaces/sheet/sheet-surface.tsx`. Canonical state is Garden JSON. Undo and
AI go through `commit`. `.gardenspace` never stores Univer/IronCalc objects.

## Univer

- Rich grid, but OSS core does not include native Office import/export (Pro).
- Risk of engine-native state leaking into persistence (R6 / R7).
- Licence path for Pro is a documented non-goal (`docs/licensing.md`).
- A throwaway adapter would still have to translate every cell edit into
  `setCell` / `setCells` without a feedback loop. The existing Garden grid
  already does that job.

## IronCalc

- Formula engine, not a product grid.
- Could replace `src/lib/sheet/formula.ts` later if a measured 100k-cell case
  fails. Current `SHEET_MAX_ROWS` is 500 by design for a browser document.
- Not required to ship #36.

## 100k+ cell deciding case

1.0 does not target 100k cells. The in-repo ceiling is 500×52. Responsiveness
evidence for that bound is the existing sheet e2e plus formula unit tests.
If a later version needs 100k cells, re-run this spike with a throwaway
Univer/IronCalc adapter and measure:

- edit → Garden op latency
- update() echo suppression
- formula recalc vs scroll

Until that measurement exists, committing to an engine would be pre-deciding
the spike.

## 1.0 path

1. Garden `SpreadsheetDoc` (`sheet`) remains canonical.
2. Interchange uses the shared harness (`src/lib/interchange/`), not Univer Pro.
3. Optional later: IronCalc behind `EditorAdapter` for formula only, if the
   100k case is accepted as a post-1.0 requirement.
