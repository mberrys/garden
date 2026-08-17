# Licensing

Garden’s own licence is **MIT**. See [LICENSE](../LICENSE).

This file is the in-repo policy for **borrowed editor engines, interchange
libraries, and canvas/PDF primitives** ([#32](https://github.com/mberrys/garden/issues/32)).
It exists so adapters can land dependencies without accidentally pulling Garden
into AGPL, GPL, or commercial-only terms.

## Garden’s own licence

MIT is the right default for this project. The questions below are the ones
that would change that. If you answer them the way Garden’s architecture
already answers them, you stay on MIT.

| Question | If you answer… | Then use |
| --- | --- | --- |
| Should a person or company be able to use, modify, and ship Garden (or a fork) **without** publishing their source? | **Yes** — Garden is local-first; the point is that documents and the app live on the user’s machine | **MIT** or **Apache-2.0** |
| Same question | **No** — modifications to Garden itself must stay open | GPL-3.0 |
| Must anyone who **hosts** Garden as a network service publish their changes? | **Yes** | AGPL-3.0 |
| Same question | **No** — Garden is not a SaaS moat; it runs locally | stay permissive (MIT / Apache-2.0) |
| Do you want an **express patent grant** from contributors, plus NOTICE-file conventions? | **Yes** | **Apache-2.0** |
| Same question | **No** / prefer the shortest widely understood licence | **MIT** |
| Might you later sell a source-available commercial edition while keeping a “community” core? | **Yes** | dual-licence or BSL — only by explicit later decision |
| Same question | **No** for now | stay MIT |

**Why not AGPL/GPL for Garden.** Issue #32 forbids AGPL/GPL as *embedded editor*
code. Putting AGPL on Garden itself would be a different choice, but it fights
the product: you are about to *borrow* MIT/Apache engines (ProseMirror, Univer,
PDF.js, PptxGenJS) and keep Garden’s document model portable. A copyleft
Garden licence does not unlock those engines, and it would make embedding
Garden harder for the same people the seed-packet story is aimed at.

**Why not ONLYOFFICE / GPL editor suites as the product licence either.** Those
projects are AGPL. Using them as Garden’s foundation would impose
source-availability obligations on network use of *Garden*. Studying their
behaviour is fine. Copying their implementation in is not, without a separate
licence analysis and an explicit decision to leave MIT.

**Apache-2.0 is the only plausible alternative to MIT.** It is still
permissive, it is compatible with every green dependency in the table below,
and it adds a patent grant. Relicense from MIT to Apache-2.0 only if you want
that grant; it is not required to adopt Univer or PDF.js (both Apache-2.0)
under an MIT Garden.

Until that explicit decision, Garden stays MIT.

## Dependency policy

Borrowed code must not change Garden’s licence. Garden owns the document
model, operations, AI review gate, undo, workspace, and cross-surface
behaviour. Open-source projects supply editor primitives. Those primitives
stay behind an adapter; they do not become the product model, and they do not
get to pick Garden’s licence.

| Licence | Policy |
| --- | --- |
| MIT | **Green** — default-ok |
| BSD-2-Clause / BSD-3-Clause | **Green** — default-ok |
| ISC | **Green** — default-ok (BSD-family) |
| Apache-2.0 | **Green** — default-ok |
| MPL-2.0 | **Yellow** — acceptable dependency; modifications to MPL-covered files remain MPL. Do not copy MPL files into Garden’s own sources as if they were MIT |
| LGPL | **Yellow/red** — architecture and legal review required before any LGPL library is linked or bundled |
| GPL (any version) | **Red** for copied or embedded core. Not a default Garden dependency |
| AGPL (any version) | **Red** for embedded Garden editor code. Not a default Garden dependency |
| Non-commercial / source-available (BSL, SSPL, “commons clause”, etc.) | **Red by default** |
| Commercial dual-licence / paid add-on | **Only by explicit decision**, recorded in this file and in the issue that wants it |

“Green” means: you may add it as a dependency of an adapter without relicensing
Garden. Attribution notices required by that licence still apply (keep them in
the dependency’s own files; do not strip licence headers).

## Explicit non-goals

- **Do not** use ONLYOFFICE DocumentServer, its JavaScript SDK, or other AGPL
  office engines as Garden’s editor foundation.
- **Do not** take **Univer Pro**, **SheetJS commercial** (the proprietary
  extensions beyond SheetJS Community Edition), or similar paid interchange
  add-ons as the default OSS path. Univer’s native Office import/export is a
  Pro/server capability, not OSS core — XLSX/ODS/DOCX/PPTX must go through
  Garden canonical state and green libraries ([#37](https://github.com/mberrys/garden/issues/37),
  [#34](https://github.com/mberrys/garden/issues/34),
  [#39](https://github.com/mberrys/garden/issues/39)).
- **Do not** persist Univer / ProseMirror / SheetJS / PptxGenJS objects as
  workspace state. Canonical state is Garden’s schemas. That is what keeps
  an engine replaceable when a licence or project goes the wrong way.

Studying AGPL or commercial products’ *behaviour* is allowed. Copying their
implementation into Garden is not, without a written exception here.

## Evaluated libraries

These are the libraries named by the editor-platform issues. Status is
**policy colour**, not a commitment to adopt.

| Library | Licence | Policy | Notes |
| --- | --- | --- | --- |
| ProseMirror / TipTap | MIT | Green | Writer engine ([#33](https://github.com/mberrys/garden/issues/33)). TipTap packages are already in `package.json`; they are not yet the editing surface |
| Univer Sheets (OSS) | Apache-2.0 | Green | Sheets spike candidate ([#35](https://github.com/mberrys/garden/issues/35)). Engine only; not the document model |
| Univer Pro / Univer import-export | commercial | **Red by default** | Native Office interchange is Pro/server, not OSS |
| IronCalc | MIT / Apache-2.0 | Green | Sheets spike candidate ([#35](https://github.com/mberrys/garden/issues/35)) |
| PDF.js | Apache-2.0 | Green | Already used for PDF rendering |
| pdf-lib | MIT | Green | Already used for annotation export |
| PptxGenJS | MIT | Green | PPTX **export** from Garden deck state ([#38](https://github.com/mberrys/garden/issues/38)) |
| Mammoth | BSD-2-Clause | Green | DOCX import → Garden text model ([#34](https://github.com/mberrys/garden/issues/34)) |
| `docx` | MIT | Green | DOCX export from Garden text model ([#34](https://github.com/mberrys/garden/issues/34)) |
| SheetJS Community Edition | Apache-2.0 | Green | Evaluate against fixtures ([#37](https://github.com/mberrys/garden/issues/37)). Commercial SheetJS features stay red |
| ExcelJS | MIT | Green | Evaluate against the same fixtures ([#37](https://github.com/mberrys/garden/issues/37)) |
| Konva | MIT | Green | Optional render/interact layer under Garden scene/deck JSON ([#41](https://github.com/mberrys/garden/issues/41), [#38](https://github.com/mberrys/garden/issues/38)) |
| Fabric.js | MIT | Green | Reference; same rule as Konva |
| Excalidraw | MIT | Green as **reference only** | Do not embed the Excalidraw app as Garden’s canvas ([#41](https://github.com/mberrys/garden/issues/41)) |
| TanStack Table / Virtual | MIT | Green | Bases grid infrastructure ([#43](https://github.com/mberrys/garden/issues/43)). Garden owns schema/records/views |
| AG Grid Community | MIT | Yellow as a default | Community is MIT; advanced capabilities sit in commercial Enterprise. Prefer TanStack so the boundary stays clean |
| AG Grid Enterprise | commercial | **Red by default** | |
| ONLYOFFICE (DocumentServer / JS SDK) | AGPL-3.0 | **Red** | Not Garden’s editor foundation |

Current direct runtime dependencies that already match this policy include
Zod, Zustand, Dexie (Apache-2.0), Lucide (ISC), Next.js, React, TipTap,
pdf-lib, and PDF.js. Adding a new editor or interchange library is a policy
review, not just a `package.json` edit.

## Review checklist

Before merging a dependency for an editor adapter or interchange path:

1. Record the SPDX licence in the PR (and in the table above if it is a
   platform-level engine).
2. Confirm it is **green**, or that a yellow/red exception is written in this
   file with a reason.
3. Confirm Garden state remains the source of truth — no engine-native objects
   persisted in `.rrspace` / IndexedDB / a worktree.
4. Confirm interchange does not depend on a Pro/commercial add-on.
5. Keep the dependency’s licence notices intact.

Editor-suite and interchange issues should link here:
[#31](https://github.com/mberrys/garden/issues/31),
[#33](https://github.com/mberrys/garden/issues/33)–[#45](https://github.com/mberrys/garden/issues/45).

## Related

- Parent epic: [shared editor platform (#46)](https://github.com/mberrys/garden/issues/46)
- This policy: [#32](https://github.com/mberrys/garden/issues/32)
- Adapter contract: [#31](https://github.com/mberrys/garden/issues/31)
