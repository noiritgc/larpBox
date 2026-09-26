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

## Deviations from the spec

- ESLint 10 instead of 9: ESLint 9 is marked unsupported by its maintainers; the spec does not pin a
  major.
- `@vitejs/plugin-react` 5.x: version 6 requires Vite 8, and the spec selects Vite 7.
- Error code `NOT_FOUND` added for unmatched `/api` routes (not in the spec's catalogue).
- `room:closed` reasons add `REMOVED`, `LEFT`, `SERVER_SHUTDOWN` for kicked players, players who
  leave, and graceful shutdown, alongside the spec's `HOST_ENDED` and `EXPIRED`.
- `PublicPlayer` adds `joining` (reserved but never connected) so the lobby can show "Joining…".

## Remaining work

Milestones 2–6.
