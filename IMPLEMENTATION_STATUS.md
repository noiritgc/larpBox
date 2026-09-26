# Implementation status

Tracks progress against `Larpbox-TV-Design-Handoff/LARPBOX_TV_BUILD_SPEC.md` (the implementation
contract). Each milestone lists the commands actually run and their results. Anything not listed as
verified has not been verified.

Environment used for verification: WSL2 Ubuntu 24.04 on Windows (NAT networking), Node 24.21.0
(nvm), npm 11.19.0, 24 CPU cores, 15 GiB RAM. Docker is not installed on this machine.

## Milestone 1 — scaffold and contracts: done (phone LAN check pending)

- npm workspaces: `@larpbox/shared`, `@larpbox/server`, `@larpbox/web`; strict TypeScript
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Bundler resolution), ESLint
  10 flat config, Prettier, Vitest projects (shared/server/integration/web), `.env.example`,
  `.nvmrc`.
- Shared contracts: constants, grapheme-based text normalization and validation, strict Zod schemas
  for every HTTP body, socket handshake and command envelope, strict Zod schemas for every host and
  player view, socket event types, duration estimate.
- Server: Zod-validated environment (fails boot on invalid URLs/values, production devtools, or a
  non-1 `GAME_TIME_SCALE` outside test+loopback), prompt pack wrapper and entry validation before
  listening, `/api/health`, JSON 404 for unknown API routes, structured API errors, Helmet + CSP,
  static SPA serving with immutable hashed assets, `no-cache` index, known-route fallback, branded
  404 via the SPA, and plain 404 for unknown files.
- Prompt pack copied to `apps/server/src/content/larpbox-prompts.json` and bundled into
  `apps/server/dist/index.js` (the web bundle never imports it).
- Web: Vite 7 + React 19 + Tailwind 4 shell, self-hosted Latin-subset fonts, token CSS, proxy for
  `/api` and `/socket.io` (`ws: true`), Intl.Segmenter polyfill loaded only when missing.

Verified:

- `npm install` (lockfile committed), `npm run build`, `npm run typecheck`, `npx eslint .`: pass.
- Production server started from `apps/server/dist/index.js` with `apps/server/src` and
  `packages/shared/dist` moved away: `/api/health` 200; `/`, `/play/KPRT`, `/host/new` serve HTML;
  unknown deep route returns HTML with 404; `/assets/missing.js` and `/missing.js` return plain 404;
  hashed assets `immutable`; index `no-cache`; CSP header present; malformed JSON gives `BAD_INPUT`.
- Headless Chromium loaded the production build under the CSP with no CSP violations; the shared
  Zod schema parsed the health response in the browser.
- `npm run dev`: Vite proxy returned `/api/health` on `localhost:5173` and on the WSL network
  address `172.30.24.209:5173`.

Not yet verified: loading the app from a real phone. This machine runs WSL2 in NAT mode, so phones
on the Wi-Fi cannot reach the WSL address. See the README for mirrored networking or port-proxy
setup.

## Milestone 2 — pure domain engine: done

- `apps/server/src/game`: injectable `Clock`/`Scheduler` (`FakeClock` for tests), sfc32 seeded
  PRNG seeded from 128 bits of `crypto` randomness, ring scheduling with 200-candidate round-two
  overlap minimization, prompt drawing with per-room used-set reset between games, exact scoring,
  competition ranking, the phase machine (early completion with minimum display time, pause that
  freezes remaining and minimum-display time, one 30s writing extension, deadline finalization with
  auto-submit/forfeit, double-forfeit fast path), host-disconnect pause, idempotent commands with
  a per-session ack cache, HTTP create/join idempotency, 60s join reservations, rematch, room
  expiry rules and tombstones.
- `projections.ts`: explicit host/player DTO construction; every view parses with the strict
  shared schemas.
- `apps/server/src/testing/harness.ts`: engine harness with scripted players and an independent
  score recomputation.

Verified (`npx vitest run`: 146 tests passed):

- Complete games for N = 3–8 in both Standard and Quick: exact phase sequence, two writes per player
  per round, N duels per round, multipliers, and final scores equal to an independent
  recomputation of the formula.
- Scheduling: degree two, N distinct pairs, no self-duels, N−2 readers, seed determinism, truth
  exactly once among four opaque options, no prompt reuse within a game, lowest-overlap round two
  (N=3 repeats expected), pack exhaustion resets only between games.
- Scoring: 666/333 and 1333/666, 333/333 with Neither, all-Neither, no ballots, co-endorsed ties,
  forfeits, idempotent settlement, competition ranks and joint winners.
- Timing: deadline−1ms accepted and deadline equality rejected (`DEADLINE_PASSED`), 5s/8s minimum
  display, pause freezing deadline and minimum time, one extension, stale callbacks ignored (run
  with timer cancellation disabled), wall-clock jumps ignored, host disconnect pause without
  auto-resume and without double subtraction, expiry cleanup with zero timers left.
- Secrecy: full 3/5/8-player walks assert per-phase JSON contents (no truths or drafts on the host
  during writing, only own truths on phones, no options before GUESS, no truth before ENDORSE, no
  author IDs before RESULT, no wrong guessers or ballots ever, no tokens, hashes, seed, prompt IDs
  or unused pack content). A deliberately planted leak made these tests fail.

## Milestone 3 — actual multiplayer: done

- HTTP: `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/players`, `/api/health`.
  Strict Zod bodies, 8 KiB JSON limit, two-minute idempotent responses, per-IP token buckets,
  browser-origin enforcement for mutations, and `trust proxy` driven client IPs.
- Socket.IO: handshake authentication (protocol, room, token hash, role, revocation) with
  structured `connect_error` data, `allowRequest` origin check, one active socket per session with
  explicit takeover (`SESSION_IN_USE`, `session:replaced`), connection generations, the command
  pipeline in spec order, per-session and per-assignment rate limits, `state:request`,
  `clock:ping`, and individually projected `room:state` snapshots (no shared broadcasts).
  `maxHttpBufferSize` 16 KiB, ping 25s/20s, `serveClient` false, recovery disabled.
- Web client: all routes (`/`, `/host/new`, `/host/:code`, `/join`, `/join/:code`,
  `/play/:code`, `/help`, 404, dev-only `/dev`), the full phone controller and host display for
  every phase, pause overlay, host menu, session-conflict/ended/unauthorized screens, credential
  and draft storage with memory fallback, autosave with revision rebasing, lock-after-save,
  ack-timeout retries only while connected, and clock-offset countdowns.

Verified:

- `npx vitest run`: 172 tests passed (engine, projections, config, content, text, 10 HTTP
  integration tests, 16 Socket.IO integration tests with real clients, including full 3- and
  5-player games, lost-ack retry, takeover, role lanes, room isolation, malformed/oversized/
  flooded commands).
- `npx playwright test tests/e2e/completeGame.spec.ts` (production build, `GAME_TIME_SCALE=0.2`,
  separate browser contexts per device): a 3-player Standard game through final results and a
  rematch, and a 5-player Quick game where the host showed post-offs 1–5 of 5. No uncaught page
  errors.
- Screenshots of every phase at 1920×1080 and 390×844 reviewed; fixed a rotated truth banner that
  overlapped content, host overlay sizing, and toolbar button wrapping.

## Milestone 4 — phone writing and recovery: done

- Two-tab composer with live grapheme count (red over 280), "20 characters minimum" after
  interaction, line/bidi errors, save status (Saving… / Saved / Saved on this phone; reconnecting…
  / Couldn't save—retry), 15-second warning, auto-growing textarea, and Lock post.
- Every keystroke is stored on the phone; server autosave is debounced (400ms) with one save in
  flight, flushed on blur and tab switch, rebased after a revision conflict, and never able to
  overwrite a locked post. Lock waits for the in-flight save and sends the complete text.
- A refresh restores unsent text with a visible "restored" notice that stays until the next edit;
  server locks and forfeits always win.

Verified (`npx playwright test tests/e2e/reconnect.spec.ts`, 5 tests passed):

- Reload mid-draft restores the text from the phone and saves it; a locked post survives reload
  and the host counts it once.
- An unlocked valid draft is auto-submitted at the deadline and labelled "Your saved draft was
  submitted." for its owner; the empty post forfeits with the absence card.
- A reader who goes offline (network emulation, not reload) and returns before the deadline can
  still lock a guess; after missing the endorse deadline they cannot act.
- Closing the host tab pauses every timer (phones show "The big screen disconnected"); the host
  returns paused, and Resume continues.
- A second tab for the same seat must press "Use this tab"; the replaced tab stays stopped.

## Milestone 5 — full visual design: done

- Original visual system: paper/ink/cobalt/acid-yellow tokens only (Tailwind's palette is
  replaced), self-hosted Latin fonts, hard-shadow cards and buttons, rubber stamps, eight original
  two-color avatar silhouettes plus an identical anonymous avatar, name-badge roster rows.
- Every route and screen in spec section 4, with its copy. TV type interpolates between the spec's
  1280×720 and 1920×1080 sizes; short displays drop decoration and tighten spacing before any text
  shrinks, post text never goes below 24px, and overflowing TV content scrolls with an explicit
  cue. Phones fit 360px, survive 200% zoom without sideways scrolling, and keep the round/timer
  row pinned.
- Motion: 180ms enter transitions, a truth-banner slide, stamp drops, 500ms Clout count-up, a
  one-time 400ms scoreboard reorder, a two-second 80-particle confetti, and a marquee. All are
  removed by `prefers-reduced-motion` or the local "Reduced motion: On" preference.
- Host-only Web Audio cues (join, phase, truth, results, final) at gain 0.12, unlocked by a host
  click, deduplicated per phase via sessionStorage, always-visible mute.
- Accessibility: semantic landmarks, labelled radio groups with keyboard arrows, native modal
  dialogs, a polite live region, focus moved to each new screen's heading, a single ten-seconds
  announcement, and visible and aria-hidden "Selected" labels (state comes from aria-checked).
- Dev-only `/dev` scenario gallery (ENABLE_DEVTOOLS=true in the Vite dev server, compiled out of
  builds) with 36 fixture scenarios, and `scripts/capture-gallery.mjs` for screenshot review.

Verified:

- `node scripts/capture-gallery.mjs`: all 36 scenarios at TV 1920×1080 and 1280×720 and phone 390×844
  and 360×640. No page errors, no horizontal overflow, TV post text ≥ 24px. Screenshots reviewed.
  Two 280-grapheme, four-line posts fit side by side at 1280×720 on READ. Key phone screens have no
  horizontal overflow at 200% zoom (195px CSS layout).
- `npx playwright test tests/e2e/a11y.spec.ts`: zero axe-core WCAG 2.1 A/AA violations on `/`,
  `/join`, `/help`, `/host/new`, the 404, and live host and phone lobby, writing, guess, endorse
  and result screens.
- `npx playwright test tests/e2e/visual.spec.ts`: real games at TV 1920×1080 with phone 390×844,
  and TV 1280×720 with phone 360×640 (one phone at 150% zoom, reduced motion). No horizontal
  overflow, no clipped post text, TV post text ≥ 24px on every screen.
- Contrast computed from the tokens: muted on paper 6.1:1, white on cobalt 6.7:1, ink on yellow
  16:1, red on red-tint 5.5:1, amber on paper 5.4:1, placeholder on white 5.2:1.
- Web component tests (Vitest + Testing Library, jsdom): 17 passing, covering autosave debounce,
  single in-flight save, lock after save, restore after refresh, HTML rendered as text, identical
  anonymous cards, keyboard radio groups, snapshot revision ordering, and audio cue dedupe.

## Deviations from the spec

- ESLint 10 instead of 9: ESLint 9 is marked unsupported by its maintainers; the spec does not pin a
  major.
- `@vitejs/plugin-react` 5.x: version 6 requires Vite 8, and the spec selects Vite 7.
- Error code `NOT_FOUND` added for unmatched `/api` routes (not in the spec's catalogue).
- `room:closed` reasons add `REMOVED`, `LEFT`, `SERVER_SHUTDOWN` for kicked players, players who
  leave, and graceful shutdown, alongside the spec's `HOST_ENDED` and `EXPIRED`.
- `PublicPlayer` adds `joining` (reserved but never connected) so the lobby can show "Joining…".

- Start-blocked, wrong-phase and "skip too early" commands return `FORBIDDEN` (the catalogue has no
  more specific code). A command whose phase ended by deadline gets `DEADLINE_PASSED`; any other
  stale phase gets `PHASE_CHANGED`.

## Remaining work

Milestone 6.
