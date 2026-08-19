# I02 — Packets, database, licensing

Closes [#8](https://github.com/mberrys/garden/issues/8) and
[#32](https://github.com/mberrys/garden/issues/32). Semantic-port of Seed
Packet v0.1, the database surface, `comms/campaign`, and Apache-2.0 onto the
I01 `SurfaceDefinition` registry. Does **not** merge `cr/seed-packets-8214`.
Sheets stay; `database` registers beside them.

Does **not** close [#18](https://github.com/mberrys/garden/issues/18) or
[#43](https://github.com/mberrys/garden/issues/43): only `comms/campaign`
plants bases. No TanStack wrap, no 5k-row virtualization, no calendar/filters.

Stacks on I01 PR [#55](https://github.com/mberrys/garden/pull/55). This session
is PR [#56](https://github.com/mberrys/garden/pull/56).

## Decisions

- One `DocKind` list: `text | pdf | deck | canvas | sheet | database`. Database
  does not replace sheet.
- Database registers through `database.register.ts` like sheet:
  `ownsHistory: false`, `adapter.engine: "garden"`, `status: "not-required"`,
  no `createAdapter`.
- `garden_ref` / `external_ref` stay Bases-local (F01 is later).
- Packets are data modules + `sproutPacket` (pure). `plantPacket` is the only
  writer. First-run auto-seed is gone; an empty workspace shows the picker
  unless `blankWorkspace` or `__GARDEN_NO_SEED__`.
- Welcome copy stays garden-branded (e2e still asserts “Welcome to garden”
  and `.garden-markdown`). The seed-branch `rr` / `.rr-markdown` path was not
  taken.
- `.gardenspace` may carry optional `seedPacketId` / `seedPacketVersion`
  without bumping `BUNDLE_VERSION`.
- Sheet `describeOp` for `setCell` requires `ref`; database `setCell` requires
  `rowId`, so the two ops do not steal each other's review-card labels.

## Files changed

- `LICENSE`, `NOTICE`, `docs/licensing.md`, `package.json` — Apache-2.0 (#32)
- `src/lib/docs/schema.ts` — `database` kind + field/row/view types
- `src/lib/ops/database.ts` — field/row/view/cell/relation ops
- `src/lib/surfaces/database.register.ts` — registry entry
- `src/surfaces/database/database-surface.tsx` — grid / kanban / inspector
- `src/lib/packets/` — contract, registry, sprout, five packets
- `src/components/seed-packet-picker.tsx` — first-run / preview
- `src/lib/store/workspace.ts` — `plantPacket`, picker gate
- `src/lib/store/seed.ts` — removed (welcome lives in the packet)
- e2e: picker, welcome plant, campaign plant, database add-row/undo

## Tests run

PR [#56](https://github.com/mberrys/garden/pull/56).

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test` — 141/141 unit tests (was 121 on I01)
- `npm run build` — production build succeeds
- `npm run test:e2e` — 15/15 Playwright tests (picker, welcome, campaign,
  database row/undo, existing text/canvas/deck/pdf/sheet + AI accept/undo)

## Known risks

- `setCell` exists on both sheet and database. Review-card copy is disambiguated
  in `describeOp`; a future shared op name should keep that guard.
- Packet recipes are data-only addenda. Featured ordering depends on
  `seedPacketId` in Dexie meta; importing a bundle without those fields does
  not attach craft recipes.
- Database UI is a plain React grid. #18's TanStack/virtualization work is
  still ahead.

## Unlocks next

I03 — whatever the overlay schedules after packets/database/licensing. F01
generalized refs and F02 workspace transactions remain out of scope.
