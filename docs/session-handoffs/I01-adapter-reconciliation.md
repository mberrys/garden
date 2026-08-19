# I01 — Adapter / conformance reconciliation

Closes [#31](https://github.com/mberrys/garden/issues/31). Reconciles the engine
boundary onto the I00 `SurfaceDefinition` registry. After this branch opened,
`main` merged PR #52 (adapter harness + catalog) and PR #54 (sheet surface).
This branch keeps one `src/lib/surfaces` API: `EditorAdapter` in `adapter.ts`,
adapter posture on each registration, no parallel `catalog.ts`. Sheet's catalog
entry was folded onto `sheet.register.ts`.

## Decisions

- Live `#51/#53` `SurfaceDefinition` stays the only registration contract.
  PR #52's parallel `contract.ts` `SurfaceDefinition` (`bodySchema`, `Host?`,
  generic `Kind extends string`) was not ported.
- `EditorAdapter` lives in `src/lib/surfaces/adapter.ts`. Optional
  `createAdapter` hangs off the live definition for later Writer/Sheets work;
  no built-in registers one in this session.
- Built-ins are described against the adapter contract via required
  `adapter: AdapterPosture` on each `*.register.ts`. `ownsHistory === false`
  remains the undo invariant; there is no second catalog enum.
- The stub notes adapter is **not** a `DocKind` and is **not** registered. It
  exists only to pass (and to fail, when broken) the conformance harness.
- A test-only headless text adapter uses `getSurface("text").applyOps` so a
  built-in is discoverable and harness-compatible from the same
  `@/lib/surfaces` package. Existing React surfaces are not wrapped.

## Files changed

- `src/lib/surfaces/adapter.ts` — `EditorAdapter`
- `src/lib/surfaces/definition.ts` — `AdapterPosture` + optional `createAdapter`
- `src/lib/surfaces/host.ts` — headless host with feedback-loop guard
- `src/lib/surfaces/conformance.ts` — six-case harness
- `src/lib/surfaces/stub-adapter.ts` — non-kind notes adapter
- `src/lib/surfaces/*.register.ts` — adapter posture
- `src/lib/surfaces/index.ts` — one public package
- tests under `src/lib/surfaces/`
- `README.md` — engines-are-replaceable convention

## Tests run

PR [#55](https://github.com/mberrys/garden/pull/55).

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test` — 103/103 unit tests, including 10 stub/harness cases, 7 registry+text harness cases, and 8 registry/posture cases
- `npm run build` — production build succeeds
- `npm run test:e2e` — 10/10 Playwright tests (four-surface smoke, AI preview/discard/accept/undo, PDF→deck recipe)

No 1.0 coverage ledger existed; evidence stays in this handoff and the PR description.

## Known risks

- `createAdapter` is unused by production surfaces; Writer (#33) is the first
  expected consumer.
- The headless text adapter is test-only. It does not prove IME/caret/clipboard
  behavior of the markdown textarea.
- Open PR #52 remains conflicting with `main` and should be closed as
  superseded once this lands.

## Unlocks next

I02 — semantic port of Seed Packet v0.1 + database + licensing onto this
unified `src/lib/surfaces` API. Database must `registerSurface`.
