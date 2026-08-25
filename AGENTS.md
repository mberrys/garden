<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

`garden` is a single, self-contained Next.js 16 (Turbopack, React 19) client-side app. Documents live in the browser (IndexedDB); the only outbound request is to an optional local AI model. No database, secrets, or external services are required to run, build, or test — with no local model reachable the app falls back to a scripted mock AI provider (header badge reads `mock provider`) that still produces real, schema-valid edits.

Standard commands are documented in `README.md` and `package.json` scripts: `npm run dev` (dev server, port 3000), `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (vitest unit), `npm run test:e2e` (Playwright).

Non-obvious caveats:
- `next dev` regenerates the `nextjs-agent-rules` block in this file and `CLAUDE.md` on startup. This is expected; both files are committed so the tree stays clean.
- Playwright e2e requires a Chromium browser and builds first: run `npm run build` before `npm run test:e2e`. The suite starts its own production server on port 3100 and forces the mock provider (`GARDEN_FORCE_MOCK_AI=1`), so it never depends on a model. The Chromium binary is installed by the update script (`npx playwright install --with-deps chromium`); `playwright.config.ts` also honors a pre-installed browser at `/opt/pw-browsers/chromium` if present. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, build, and this e2e suite.
- Optional AI/Sentry config is via env vars only (`AI_BASE_URL`, `AI_MODEL`, `GARDEN_FORCE_MOCK_AI`, `SENTRY_DSN`, etc.); none are needed for local development.
