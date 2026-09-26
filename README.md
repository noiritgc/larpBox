# Larpbox TV

A shared-screen party game about professional exaggeration. One laptop or TV shows the game; 3–8
players join on their phones. Two players privately get the same mundane event ("You replaced an
empty toilet-paper roll") and write it up as a career milestone. Everyone else guesses what really
happened, sees the truth, then endorses the funniest post that stayed technically true.

- No accounts, no app installs, no AI, no database. Rooms live in the server's memory.
- One Node process serves the web app, the HTTP API and the Socket.IO connection on one origin.
- Design and rules: [`Larpbox-TV-Design-Handoff/LARPBOX_TV_BUILD_SPEC.md`](Larpbox-TV-Design-Handoff/LARPBOX_TV_BUILD_SPEC.md).
  Build progress and verification: [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Requirements

- Node.js 24 (see `.nvmrc`) and npm 10+.
- For browser tests: Playwright's Chromium (`npx playwright install chromium`).

## Quick start (development)

```bash
nvm use                  # Node 24
npm install
cp .env.example .env     # the dev server reads the root .env
npm run dev
```

`npm run dev` builds the shared package, then runs three watchers: the shared package (tsup), the
server on port 3001 (tsx) and the web app on port 5173 (Vite, proxying `/api` and `/socket.io` to
the server).

Open <http://localhost:5173>, choose **Host a game**, and create a room. Join from other browser
windows at <http://localhost:5173/join>. Use private or incognito windows, or different browser
profiles, for extra players: each window keeps its own seat in local storage.

## Playing on real phones

Phones must reach the computer running the game, and the QR code must contain an address they can
open.

1. Put the computer and the phones on the same Wi-Fi.
2. Find the computer's network address. In development the server prints it at startup as
   `phoneUrls`, for example `http://192.168.1.20:5173`.
3. In `.env`, set that address as the public origin and allow it:

   ```dotenv
   PUBLIC_ORIGIN=http://192.168.1.20:5173
   ALLOWED_ORIGINS=http://192.168.1.20:5173,http://localhost:5173
   ```

4. Restart `npm run dev`, open the host screen from `PUBLIC_ORIGIN`, and scan the QR code.

In development, local-network origins (10.x, 172.16–31.x, 192.168.x, `*.local`, localhost) are
accepted even before you edit `.env`. The QR code, however, always uses `PUBLIC_ORIGIN`; the host
lobby warns when it points at `localhost`. Production accepts only the configured origins.

Things that commonly get in the way:

- **Firewall**: allow inbound TCP 5173 (dev) or your production port on the host computer.
- **WSL2 on Windows**: in the default NAT mode, phones cannot reach WSL. Either set
  `networkingMode=mirrored` under `[wsl2]` in `C:\Users\<you>\.wslconfig` and run `wsl --shutdown`,
  or forward the port from an administrator PowerShell:
  `netsh interface portproxy add v4tov4 listenport=5173 connectport=5173 connectaddress=<WSL IP>`.
  Then use the Windows machine's Wi-Fi address as `PUBLIC_ORIGIN`.
- **Venue or guest Wi-Fi** often isolates devices from each other. Test beforehand. If phones cannot
  reach the laptop, use a phone hotspot or deploy to a public HTTPS host.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development: shared watcher + server (3001) + Vite (5173). |
| `npm run build` | Builds shared → web → server. Output: `apps/web/dist`, `apps/server/dist/index.js`. |
| `npm start` | Runs the production server (`node apps/server/dist/index.js`). |
| `npm run typecheck` | Strict TypeScript across every workspace and the tests. |
| `npm run lint` | ESLint (flat config). |
| `npm test` | Vitest: unit, integration (real Socket.IO clients) and web component tests. |
| `npm run test:e2e` | Playwright: builds, starts the production server with `GAME_TIME_SCALE=0.2`, and plays real games in separate browser contexts. `E2E_SKIP_BUILD=1` reuses an existing build. |
| `npx tsx tests/load/loadTest.ts` | 10 rooms × 8 players over real sockets; reports ack latency and verifies every score. |
| `node scripts/capture-gallery.mjs` | Screenshots every dev-gallery scenario at TV and phone sizes (see below). |

## Configuration

All settings are environment variables, validated at startup. Invalid values stop the server with
a clear message. Production reads the real process environment and never needs a `.env` file.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. |
| `HOST` | `0.0.0.0` | Interface to listen on. |
| `PORT` | `3001` | Port to listen on. |
| `PUBLIC_ORIGIN` | `http://localhost:5173` | Origin players use; QR codes and join links are built from it. Required in production, except on Render, where it defaults to the service's `onrender.com` address (`RENDER_EXTERNAL_URL`). |
| `ALLOWED_ORIGINS` | *(empty)* | Extra comma-separated browser origins for the API and sockets. `PUBLIC_ORIGIN` is always allowed. |
| `MAX_ROOMS` | `100` | Live rooms at once. |
| `MAX_SOCKETS` | `900` | Authenticated sockets at once. |
| `ROOM_MAX_AGE_MS` | `21600000` | Absolute room lifetime (6 hours). |
| `ROOM_IDLE_MS` | `1800000` | Lobby/final/manual-pause inactivity before a room ends (30 minutes). |
| `ROOM_ABANDONED_MS` | `600000` | Time allowed with every device offline, or the host gone mid-game (10 minutes). |
| `LOG_LEVEL` | `info` | Pino level. Logs never contain tokens, posts, guesses or ballots. |
| `ENABLE_DEVTOOLS` | `false` | Enables the `/dev` scenario gallery in the Vite dev server only. Refused in production. |
| `TRUST_PROXY` | `false` | Proxy trust for client IPs (rate limiting): a hop count or exact proxy addresses. `true` is refused. |
| `RATE_LIMIT_MULTIPLIER` | `1` | Scales per-IP rate limits, for local load tests. |
| `GAME_TIME_SCALE` | `1` | Test only: scales every timer. Allowed only with `NODE_ENV=test` on a loopback `HOST`. |

## Production

Larpbox TV is one Node process that serves the built web app, the `/api` routes and the Socket.IO
connections from the same origin. Deploy the whole repository to a Node host; the web app alone
can't run games.

### Deploying to Render

The repository includes a [Render Blueprint](render.yaml) for a single Node web service.
Blueprints need Render connected to the GitHub account that owns the repository.

1. In the Render dashboard, choose **New > Blueprint**, select this repository and click
   **Connect**.
2. Name the Blueprint, keep the `main` branch and click **Deploy Blueprint**. Render runs
   `npm ci --include=dev && npm run build`, starts `node apps/server/dist/index.js` and checks
   `/api/health`. If the name `larpbox-tv` is taken, Render adds a suffix.
3. Open `https://<service-name>.onrender.com` and choose **Host a game**. QR codes and join links
   use that address automatically.

Without access to the owner's GitHub account, deploy the public repository by URL instead. Choose
**New > Web Service > Public Git Repository**, paste the repository URL, then set:

| Setting | Value |
| --- | --- |
| Language | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `node apps/server/dist/index.js` |
| Health Check Path (Advanced) | `/api/health` |
| Environment variables | `NODE_VERSION=24`, `NODE_ENV=production`, `TRUST_PROXY=3` |

Render doesn't auto-deploy services created this way: use **Manual Deploy > Deploy latest commit**
after pushing.

Notes:

- The Blueprint uses the **free** instance type. Free services sleep after 15 minutes without
  traffic (the next visit takes about a minute to wake them) and can restart at any time. Either
  ends every room. Use a paid instance type for events.
- Every deploy restarts the server and ends live rooms. Don't push to `main` during a game, or turn
  off auto-deploy for the service.
- For a custom domain, add it in Render, then set `PUBLIC_ORIGIN=https://your.domain`. The
  `onrender.com` address keeps working.
- Keep one instance. Rooms live in memory, so more instances would split players between rooms.
- `TRUST_PROXY=3` follows Render's proxy chain as measured publicly (Cloudflare, Render's load
  balancer and a local proxy), so rate limits see each player's address. If unrelated groups start
  hitting "Too many rooms from this network", Render has added a proxy: raise it by one.

Static hosts such as Vercel or Netlify can't run Larpbox TV: they serve the built pages, but there
is no game server behind `/api` or `/socket.io`, so creating a room fails. The host setup page says
so when it detects this.

### Any Node host

```bash
npm ci
npm run build
NODE_ENV=production PORT=3001 \
  PUBLIC_ORIGIN=https://larpbox.example ALLOWED_ORIGINS=https://larpbox.example \
  npm start
```

Or with Docker (multi-stage, Node 24 slim, non-root, production dependencies only):

```bash
docker build -t larpbox-tv .
docker run --rm -p 3001:3001 \
  -e PUBLIC_ORIGIN=https://larpbox.example -e ALLOWED_ORIGINS=https://larpbox.example \
  larpbox-tv
```

Deployment requirements:

- A long-running Node host that supports WebSockets. Run **exactly one instance**: rooms live in
  memory, so autoscaling or several replicas would split rooms between processes. Serverless
  request handlers will not work.
- Terminate TLS at your proxy and forward both `/socket.io` WebSocket upgrades and long-polling
  requests. Proxy idle timeouts must exceed 45 seconds (Socket.IO pings every 25 seconds and waits 20).
- Set `TRUST_PROXY` to your proxy's hop count or address so rate limits see real client IPs.
- Keep the instance awake during events. Free tiers that sleep will end games.
- `NODE_ENV=production` refuses to start without `PUBLIC_ORIGIN` (or Render's
  `RENDER_EXTERNAL_URL`), so QR codes never point at `localhost`.
- `GET /api/health` returns `{ ok, protocolVersion, bootId, version }` once config and content are
  validated.

### Restarts end rooms

State is kept only in memory. If the process restarts or is redeployed, every room ends. Phones
and the host see "This room has ended. Ask the host for a new code." Nothing is recovered or
pretended. A graceful stop (SIGTERM/SIGINT) tells every connected device before exiting.

Reconnecting works while the process is alive: a refreshed phone rejoins its seat, drafts are
saved on the phone and on the server as players type, and the host dropping out pauses the game
until the host presses Resume.

## How it works

- `packages/shared`: Zod schemas for every request, command and view; grapheme-based text rules
  shared by phone and server; constants.
- `apps/server`: Express bootstrap API (`/api/rooms`, `/api/rooms/:code`,
  `/api/rooms/:code/players`, `/api/health`), the Socket.IO gateway, and the authoritative engine
  in `src/game`. The engine covers fair ring scheduling, the phase machine with monotonic timers,
  exact scoring, and per-recipient projections.
- `apps/web`: React 19 + Vite 7 + Tailwind 4. Host display at `/host/:code`, phone controller at
  `/play/:code`.

The server owns every deadline, assignment, secret and score. Each device receives only the
snapshot it may see: drafts stay on their writer's phone, the truth is withheld until endorsing,
and authors are revealed only with the results.

## Testing

```bash
npm test                              # unit + integration + component
npm run test:e2e                      # Playwright end-to-end (builds first)
E2E_SKIP_BUILD=1 npx playwright test tests/e2e/reconnect.spec.ts
npx tsx tests/load/loadTest.ts        # 80 players + 10 hosts
```

End-to-end tests use one browser context per device. They cover full 3-, 5- and 8-player games,
reloads and network drops, host disconnects, tab takeovers, forfeits, ties, host controls,
accessibility (axe), layouts at TV and phone sizes, and network-level secrecy.

### Design review gallery

```bash
cd apps/web && ENABLE_DEVTOOLS=true npx vite --port 5199
# open http://127.0.0.1:5199/dev, or capture every scenario:
GALLERY_URL=http://127.0.0.1:5199 node scripts/capture-gallery.mjs
```

The gallery renders every screen from fixture data (long posts, forfeits, ties, pauses) and is
marked "LOCAL PREVIEW — NOT A LIVE GAME". It exists only in the dev server and is compiled out of
production builds.

## Running a demo

1. Put the host lobby on the projector; three or more people scan the QR code.
2. Use Quick mode (one round) for a short pitch.
3. Everyone writes two posts on their phone while the big screen shows who has locked in.
4. Present a post-off: read, guess the real event, see the truth, endorse, reveal the authors.
5. The remaining post-offs run on their own; the host can pause from **Host controls**.

## Troubleshooting

- **"This site isn't connected to the Larpbox game server"**: the pages were deployed without the
  server, for example to Vercel. Deploy the whole app to a Node host instead; see
  [Deploying to Render](#deploying-to-render).
- **"This page's address isn't allowed…"**: the browser's origin isn't in `ALLOWED_ORIGINS`.
  Add it and restart. The server log names the rejected origin.
- **Phones can't open the QR link**: `PUBLIC_ORIGIN` is `localhost` or an address the phones
  can't reach. See [Playing on real phones](#playing-on-real-phones).
- **"This player is active in another tab"**: the same seat is open elsewhere. Press **Use this
  tab** to move it.
- **Stuck on "Reconnecting…"**: check the network; drafts stay on the phone. Ask the host to pause.
