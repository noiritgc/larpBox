# Larpbox TV

Multiplayer browser party game (**Humblebrag**): one shared host display (TV/laptop) plus 3–8 phone
controllers. Two players privately receive the same mundane event and write inflated professional
announcements; the other players guess the real event from four options, see the truth, then endorse
the funniest post that stayed technically true. Scores are "Clout".

## Source of truth

- `Larpbox-TV-Design-Handoff/LARPBOX_TV_BUILD_SPEC.md` is the implementation contract: rules, exact
  scoring, screens and copy, design tokens, HTTP/socket contract, secrecy, timers, and required tests.
  Read the relevant section before changing behavior. Don't re-decide anything it already specifies.
- `IMPLEMENTATION_STATUS.md` tracks milestone progress, the commands actually run, and deviations
  from the spec. Keep it current as work lands.
- The prompt pack is server-only: `apps/server/src/content/larpbox-prompts.json` (copied from the
  handoff folder). It is bundled into the server build, never into the web client.

## Toolchain

Node 24 is required, but it is not the nvm default on this machine. Prefix shell commands with
`export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` (or run `nvm use`, which reads `.nvmrc`).

```bash
npm install                 # npm workspaces; commit package-lock.json
cp .env.example .env        # first run only; the dev server reads the root .env
npm run dev                 # shared (tsup watch) + server :3001 (tsx watch) + web :5173 (Vite)
npm run build               # shared -> web -> server
npm start                   # production: one process serves API, Socket.IO, and the built SPA
npm run typecheck
npm run lint
npm test                    # Vitest: unit, integration (real socket.io clients), component
npm run test:e2e            # Playwright, separate browser contexts, production build, GAME_TIME_SCALE=0.2
```

Run a single Vitest file with `npx vitest run path/to/file.test.ts`. Run one Playwright spec
against an existing build with `E2E_SKIP_BUILD=1 npx playwright test tests/e2e/lobby.spec.ts`.
The load test is `npx tsx tests/load/loadTest.ts`. The design gallery runs with
`cd apps/web && ENABLE_DEVTOOLS=true npx vite --port 5199` (open `/dev`), and
`node scripts/capture-gallery.mjs` screenshots every scenario at TV and phone sizes.

## Layout

- `packages/shared` (`@larpbox/shared`): constants, text normalization, Zod schemas for every
  HTTP/socket input and every view DTO, event types. No prompt content, no server code.
- `apps/server` (`@larpbox/server`): Express 5 bootstrap API, Socket.IO gateway, authoritative game
  engine (`src/game`), projections, in-memory room store.
- `apps/web` (`@larpbox/web`): React 19 + Vite 7 + Tailwind 4 SPA, covering both the host display
  and the phone controller.
- `tests/integration`: in-process service driven by real socket.io clients.
- `tests/e2e`: Playwright multi-context games.

## Invariants

- The server owns state, deadlines, assignments, eligibility, secrets, and scoring. Clients never
  advance phases or compute scores; they render the latest role-filtered snapshot.
- `projectHost` and `projectPlayer` construct DTOs explicitly. Never spread raw room/duel objects and
  delete fields. Every projection must parse with the strict view schemas in `@larpbox/shared`.
- Secrecy timeline: drafts never leave their owner. Post text first appears at DUEL_READ, guess
  options at DUEL_GUESS, the truth and correct option at DUEL_ENDORSE, and authors and vote totals at
  DUEL_RESULT. Individual ballots are never public. The host view never contains unrevealed truths.
- Web and shared must never import the prompt pack or server modules (ESLint enforces this).
- Room mutations are synchronous: no `await` between validation and commit. Timer callbacks go
  through the same dispatch and capture `(roomId, gameId, phaseId)`, so stale callbacks are no-ops.
- Deadline and elapsed-time math uses the monotonic clock. Epoch time is for display only. Engine
  tests inject `FakeClock`.
- Never log tokens, idempotency request IDs, post text, guesses, ballots, or snapshots.
- User strings render as React text only. No `dangerouslySetInnerHTML`.

## Testing layout

- Engine and projection tests live next to the code (`apps/server/src/**/*.test.ts`) and use
  `apps/server/src/testing/harness.ts` (FakeClock, scripted players, independent score check).
- `tests/integration`: the in-process service driven by real socket.io clients (`helpers.ts`).
- `tests/e2e` + `tests/helpers/players.ts`: Playwright against the production build with
  `GAME_TIME_SCALE=0.2`. `playerBot` plays a phone through the UI only.
- Web component tests live under `apps/web/src/**/*.test.tsx` (jsdom). Dev fixtures in
  `apps/web/src/dev/fixtures.ts` must keep passing the strict view schemas.

## Gotchas

- Writing `\uXXXX` escapes through editing tools can produce literal invisible characters
  (U+2028 inside a regex literal breaks the build). After editing regex-heavy files such as
  `packages/shared/src/text.ts`, check them with `grep -nP '[^\x00-\x7F]'`.
- Socket.IO sends the first `room:state` in the same tick as the connection: attach listeners
  before calling `connect()` (the web client and test helpers already do this).
- The production CSP blocks inline `<style>`; in Playwright, change styles through CSSOM
  (`element.style.setProperty`) instead of `page.addStyleTag`.

## Git

- Never add `Co-Authored-By: Claude` trailers or "Generated with Claude Code" lines to commits or PRs.
