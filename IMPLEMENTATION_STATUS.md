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

## Milestone 6 — production and handoff: done (pending: real-phone check, Docker build)

- End-to-end matrix (`tests/e2e`, Playwright, production build, one browser context per device):
  `completeGame` (3-player Standard with rematch; 5-player Quick), `lobby` (8-player game with the
  ninth join refused and 16 posts per round, duplicate names, late join, remove and leave, direct
  URL reloads, branded 404, hostless browser), `reconnect`, `hostControls` (settings reset
  readiness, pause/resume, one extension, end room reaches everyone), `edgeCases` (all-forfeit
  all-zero joint win, no votes, all Neither), `privacy` (secrecy checked on received Socket.IO
  frames and polling responses; bundle free of prompt pack and dev gallery), `a11y`, `visual`.
- Load: `tests/load/loadTest.ts`, 10 rooms × 8 players plus 10 hosts over real sockets, full
  Standard games including autosaves.
- Multi-stage `Dockerfile` (Node 24 slim, `npm ci`, build, production-only dependencies, non-root
  `node` user, healthcheck, exec-form CMD) and `.dockerignore`.
- `README.md`: setup, scripts, environment, phone/LAN/WSL2/venue networking, production and
  Docker, restart behavior, testing, gallery, demo, troubleshooting.
- Graceful shutdown: SIGTERM/SIGINT stops new rooms, sends every connected device `room:closed`
  (`SERVER_SHUTDOWN`), closes sockets and exits.

Verified:

- Load run (`npx tsx tests/load/loadTest.ts`) on an AMD Ryzen AI 9 HX 370 (24 threads, 15 GiB, WSL2,
  Node 24.21.0). Server and 90 clients shared one process and event loop, so the numbers are
  conservative. Ten Standard 8-player games finished in 120.6s at `GAME_TIME_SCALE=0.2`. Command
  acks: n=2980, p50 13.4ms, p95 37.6ms, p99 41.9ms, max 46.4ms (target p95 < 250ms). No unexpected
  command failures. Every duel re-scored from its public result matched, final totals matched
  on all 90 clients, and no client received another room's snapshot. After closing: 0 rooms and
  0 pending game timers.
- Production smoke from the Docker runtime layout (a scratch directory with only the root and
  workspace manifests, `npm ci --omit=dev` node_modules, and the three `dist` folders; no sources):
  `NODE_ENV=production node apps/server/dist/index.js` served `/api/health`, `/`, `/host/KPRT`,
  `/play/KPRT`, `/join/KPRT` and `/help`. SIGTERM with a connected host delivered `room:closed`
  (`SERVER_SHUTDOWN`) and the process exited 0. The prompt pack is bundled in
  `apps/server/dist/index.js`.
- Render deployment rehearsal (after the Vercel 404): a clean copy of the repository (tracked files
  only, no `node_modules`, `dist` or `.env`) was built with Render's commands under
  `NODE_ENV=production` (`npm ci --include=dev && npm run build`) and started with
  `node apps/server/dist/index.js`, `PORT=10000`, `TRUST_PROXY=3` and
  `RENDER_EXTERNAL_URL=http://127.0.0.1:10000` in place of Render's value. 12/12 checks passed:
  health, `/`, `/host/new` and `/join/ABCD` pages, room creation from the public origin (join link
  built from `RENDER_EXTERNAL_URL`), a foreign origin refused with 403, JSON 404 for unknown `/api`
  routes, preview, join, host socket snapshot, and SIGTERM delivering `room:closed`
  (`SERVER_SHUTDOWN`) with exit 0. Without `PUBLIC_ORIGIN` or Render's variables, production
  refuses to start with a clear message.
- Static-only hosting check: the built `apps/web/dist` served by a plain file server that answers
  404 for everything else (as Vercel did). Host setup shows the "isn't connected to the Larpbox game
  server" banner, Create room and join-by-code explain the missing server instead of a bare 404, and
  a proxy answering 502 shows the "can't reach" banner instead. 7/7 checks passed in Chromium.
- Final full runs are recorded in "Final verification" below.

Not verified here, with reasons:

- **Docker image build/run**: Docker is not installed on this machine. The Dockerfile's runtime
  stage was reproduced by hand (above), but `docker build` itself has not been run.
- **Real phones on a LAN / QR scan by a separate phone**: requires physical devices. This machine
  runs WSL2 in NAT mode, which blocks phones from reaching the dev server (see README). The user
  reached the dev server from a LAN address (http://10.104.218.84:5173), which surfaced the origin
  allowlist issue fixed in commit 1aed54d. A full game from real phones still needs to be played.
- **Public HTTPS deployment**: none performed from here. `render.yaml` is ready and its build and
  start commands were rehearsed locally, but the service is created from the user's Render
  account. `TRUST_PROXY=3` follows a published measurement of Render's proxy chain (Cloudflare,
  Render's load balancer, a local proxy); it has not been measured on this service.
- **Audio**: cue scheduling is unit-tested with a fake AudioContext; the sounds themselves were
  not listened to in this environment.

## Playtest changes (2026-09-26, after the first Render deploy)

Requested by the team after playing the deployed build:

- **One post each by default.** New setting *Posts per player* (One each / Two each, default one).
  With one each, players pair up (floor(N/2) post-offs per round). With an odd roster, one player
  sits out, writes nothing, and reads (guesses and endorses) every post-off. In a two-round game a
  different player sits out in round 2. Two each keeps the spec's ring (N post-offs, degree two).
- **Time per post.** *Writing time per round* (90/120/180) became *Writing time per post*
  (45/60/90 seconds, default 60). Writing lasts posts per player x seconds per post: 60 seconds by
  default, 120 with two posts at 60.
- **Picks count when time runs out.** Phones send unlocked picks to the server
  (`duel.pickGuess`, `duel.pickEndorsement`; visible only in the picker's own view). At the GUESS
  deadline an unlocked pick becomes the guess. At the ENDORSE deadline an unlocked pick becomes the
  endorsement, and a reader who is still connected but picked nothing counts as **Neither** (which
  lowers the writers' share, as any Neither ballot does). Disconnected readers cast no ballot, so a
  dead phone doesn't dilute everyone's points.
- **Louder timers.** Under 10 seconds (15 while writing) the timer turns red. On a phone whose
  player still has to act, it also pulses, the screen gets a red edge, and the phone vibrates at
  the start of the window, at 5 seconds, and at 3, 2 and 1 (Vibration API; iOS Safari has none).
  Reduced motion removes the pulse and flashing.
- **Front page.** Below the spec's hero: how a round works, an example post-off with the guess
  options, what you need, an FAQ and a closing call to action.
- **Logo.** The team's `LARPbox TV` artwork replaces the text wordmark everywhere (cut out of its
  white background, WebP at 480 and 1040 px; source kept in `apps/web/brand/`). Favicons and the
  home-screen icon use its TV box. `scripts/brand-logo.py` and `scripts/brand-favicon.py`
  regenerate them (Python with Pillow and NumPy).
- **Fewer em dashes.** None remain in UI copy.
- **More profiles.** 16 avatars (eight new: rocket, megaphone, laptop, light bulb, bar chart,
  sunglasses, crown, name badge) and 32 fictional headlines, drawn at random per player (no two
  alike in a room) and drawn again when the host starts a new game.
- **Later, not during the hackathon:** an iMessage or Discord version of the game.

## Final verification (2026-09-26, Node 24.21.0)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 (shared, server, web, web config, tests) after the playtest changes, and at each of the seven playtest commits on its own |
| `npm run lint` | exit 0, likewise at each playtest commit |
| `npx vitest run` | 17 files, 243 tests passed (192 at milestone 6, 197 after the Render changes); every playtest commit passes on its own |
| `npm run test:e2e` (fresh build, `GAME_TIME_SCALE=0.2`) | 23 passed, 1 skipped (opt-in `CAPTURE=1` screenshot helper), 5.4 min, after the playtest changes |
| `npx tsx tests/load/loadTest.ts` | passed after the playtest changes: 10 × 8-player Standard games with one post each (4 post-offs per round) in 63.9 s, ack p50 3.5 ms, p95 20.4 ms, max 42.4 ms, 0 failures, 0 rooms or timers left (milestone 6, two posts each: p95 37.6 ms) |
| `node scripts/capture-gallery.mjs` | 43 scenarios × 2 sizes each (7 new: sit-out intros, one-post writing, judging, urgent guess and endorse), no page errors, no overflow, TV post text ≥ 24px |
| Public pages (landing, host setup, join, help) at 1440×900 and 390×844 | no horizontal overflow; screenshots reviewed |
| Production runtime smoke + SIGTERM | passed (see Milestone 6) |
| Render rehearsal (clean copy, Render's build and start commands) | 12/12 checks passed before the playtest changes (see Milestone 6) |
| Static-only host check (Chromium) | 7/7 checks passed before the playtest changes (see Milestone 6) |

## Definition of done (spec section 19)

- [x] A host creates a room and 3–8 independent browsers join with the code or QR link (e2e,
      separate contexts; the QR encodes `PUBLIC_ORIGIN/join/CODE`).
- [x] One or two configured rounds run from lobby through final results.
- [x] Every player writes twice per round, including odd counts (engine N=3–8, e2e 5 and 8).
- [x] Both competitors get exactly the same private facts.
- [x] Readers guess before the truth, endorse after it, and authors are revealed after endorsing.
- [x] Correctness and point allocation match the specification (independent recomputation in unit,
      integration and load tests).
- [x] No secrets are shipped early to the host, other phones or the bundle (projection walks,
      network-frame checks, bundle scan).
- [x] Missing posts, missing votes, ties and reconnects resolve without deadlock.
- [x] Host disconnect/pause protects remaining time.
- [x] Draft autosave/lock survives refresh and ack loss.
- [x] Duplicate commands cannot duplicate points or overwrite locked work.
- [x] All specified screens and error states are responsive and accessible (axe, layout checks,
      screenshot review).
- [ ] Real phone LAN/public-origin test with a QR scan by a separate phone: **not performed here**
      (needs physical phones; see "Not verified here"). The dev server now accepts LAN origins, and
      the README explains `PUBLIC_ORIGIN` for QR codes.
- [x] Unit/integration/E2E tests passed; screenshots were inspected.
- [x] The production build serves frontend, API and socket on one origin; refresh routes work.
- [x] README covers setup, scripts, env, phone joining, deployment and restart loss.
- [x] IMPLEMENTATION_STATUS lists actual verification and deviations.
- [x] No API key, external AI judge, user account, LinkedIn integration or paid asset is required.

## Deviations from the spec

- ESLint 10 instead of 9: ESLint 9 is marked unsupported by its maintainers; the spec does not pin a
  major.
- `@vitejs/plugin-react` 5.x: version 6 requires Vite 8, and the spec selects Vite 7.
- Error code `NOT_FOUND` added for unmatched `/api` routes (not in the spec's catalogue).
- `room:closed` reasons add `REMOVED`, `LEFT` and `SERVER_SHUTDOWN` for kicked players, players who
  leave, and graceful shutdown, alongside the spec's `HOST_ENDED` and `EXPIRED`.
- `PublicPlayer` adds `joining` (reserved but never connected) so the lobby can show "Joining…".
- Start-blocked, wrong-phase and "skip too early" commands return `FORBIDDEN` (the catalogue has no
  more specific code). A command whose phase ended by deadline gets `DEADLINE_PASSED`; any other
  stale phase gets `PHASE_CHANGED`.
- Development mode also accepts local-network browser origins (localhost, 10/8, 172.16/12,
  192.168/16, 169.254/16, 100.64/10, `*.local`) so LAN testing works before `.env` is edited.
  Production accepts only `PUBLIC_ORIGIN` and `ALLOWED_ORIGINS`. Added after the user hit the
  origin check from a LAN address.
- Production refuses to start without a public origin rather than building `localhost` QR codes.
  On Render, `PUBLIC_ORIGIN` falls back to `RENDER_EXTERNAL_URL` (the service's `onrender.com`
  address), which is always allowed. `render.yaml` deploys one native Node service. Added after
  a static-only Vercel deploy of `apps/web` returned 404 for room creation; the host setup page now
  detects a missing game server and says so instead of showing the bare status.
- Screenshot "assertions" are layout assertions (overflow, clipping, 24px post text, no axe
  violations) plus saved screenshots reviewed by an image-capable agent. Pixel baselines were not
  used because room codes, timers and font rasterization vary between runs and machines.
- The phone header scrolls with the page; only the round/timer row is sticky (spec 4.9 asks for
  that row to be sticky). This keeps the timer from overlapping a wrapped header at large text
  sizes.
- On very short or narrow layouts, decorative elements are removed first: post card footers and
  lobby headlines on 720p TVs, and small avatars on phones below 300 CSS px.
- Settings (spec 1.7): *Writing time per round* is replaced by *Posts per player* (1 or 2, default
  1) and *Writing time per post* (45/60/90, default 60). With one post each the schedule is a
  pairing with a rotating sit-out instead of the degree-two ring; the ring remains for two each.
  Round intro and writing copy follow the setting ("One post. One timer.", "x/1 locked", "Judging
  this round") instead of the spec's fixed two-post wording.
- Unlocked guess and endorsement selections are sent to the server as picks and locked at the
  deadline; a connected reader with no endorsement pick counts as Neither. The spec keeps
  selected-but-unlocked choices in component state only and counts no ballot for them.
- The timer's urgent state is red (with a pulse, a red screen edge and vibration on phones that
  still need to act) instead of yellow.
- The landing page adds sections below the spec's hero, and the wordmark is the team's logo image.
- 16 avatars (4 x 4 grid) instead of eight, and headlines are drawn at random from 32 per player
  instead of being fixed by seat.

## Known limitations

- Rooms live in one process's memory: a restart or redeploy ends every room (clients are told
  honestly). Run a single instance; there is no horizontal scaling.
- The server cannot judge whether a post invented facts. That is the readers' call, as designed.
- Host audio is Web Audio synthesis only, unlocked by a host click. Phones are silent.
- Rate limits are in-memory token buckets per process. Behind a proxy, `TRUST_PROXY` must be
  configured for per-IP limits to be meaningful.
