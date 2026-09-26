# Larpbox TV — complete product, design, and engineering specification

**Version:** 1.0, September 25, 2026  
**Intended reader:** a coding agent working in Claude Code, and the humans reviewing its implementation.  
**Deliverable:** a real, playable browser party game, with a shared TV/laptop display and phones as controllers.  
**Companion file:** `larpbox-prompts.json` contains the complete initial server-only prompt pack.  
**Build instructions:** implement the decisions in this document. Do not substitute a landing-page mockup, a chatbot, a LinkedIn post generator, or a single-browser simulation for the multiplayer game.

## 0. Read this first

### What the game is

Friends compete to turn unimpressive everyday events into inflated professional announcements. Two players privately receive the **same true event**, independently write an announcement, and compete anonymously. The remaining players first guess the mundane event from four choices. The true event is then revealed. The remaining players endorse the funniest announcement that still respects the facts. Writers earn points for endorsements; readers earn points for identifying the truth. Everyone gets equal writing opportunities.

Example true event: **You replaced an empty toilet-paper roll.**

Example announcement: **“Proud to have restored a mission-critical resource at the point of need. Sometimes leadership means being the person willing to make the change.”**

The game’s humor comes from players, the gap between mundane reality and inflated presentation, and the reveal. Interface jokes support those moments. They do not compete with the player’s writing.

### Nonnegotiable product decisions

1. Product name is **Larpbox TV**. Render the wordmark as `larpbox` with a small boxed `TV`.
2. This version contains one complete game, **Humblebrag**. Do not build an empty multi-game launcher.
3. Support **3–8 players**, plus one shared host display. The host display is not a scoring player. Its operator joins separately on a phone to play.
4. Default game: **two rounds**, two written posts per player per round. Each round contains exactly `N` duels for `N` players.
5. One browser on a laptop/TV hosts; players join with a four-letter room code or QR link. No installation or accounts.
6. The server owns state, deadlines, assignments, eligibility, secrets, and scoring.
7. Human writing and voting are the entire game. **No LLM, AI judge, generated posts, paid API, LinkedIn login, LinkedIn scraping, or real LinkedIn publishing.**
8. Initial prompt content is curated and supplied. It remains on the server until legitimately disclosed.
9. Real-time updates use Socket.IO. HTTP is for create/join/bootstrap/health. One long-running Node process serves everything in production.
10. MVP state lives in memory. Reconnecting browsers recover while the process is alive; restarting the server ends rooms. Say this honestly in the developer README.
11. Build real reconnection, validation, fair scheduling, and integration tests. These are MVP requirements.
12. Use original visual design and original assets. “Jackbox style” means shared-screen party-game interaction, not copying branding or assets.
13. Do not invent an official model identifier for the user’s “Claude Fable 5” label. This is a model-independent implementation contract usable by their selected Claude Code model.

### Priority order

- **P0:** correct game engine; actual devices joining; one complete game; secrets protected; reconnect; all mandatory screens; curated content; deterministic scoring.
- **P1:** finished visual design; sounds; responsive and accessible interactions; animations; rematch; local test tools; operational README. These are required for the finished handoff, after P0 works.
- **P2, explicitly deferred:** audience mode, public matchmaking, account profiles, durable history, custom prompt entry, AI assistance, native apps, multiple game titles, monetization, multi-instance infrastructure. Do not implement these instead of finishing P0/P1.

## 1. Product experience and game rules

### 1.1 People and devices

- **Host display:** the shared browser. Shows lobby, instructions, posts, truth reveals, results, scoreboard. Has room controls. Does not receive unrevealed facts during play.
- **Player controller:** a phone browser. Writes private assignments, guesses facts, endorses posts, sees personal score changes. Also displays posts for accessibility or remote screen-sharing play.
- **Writer:** a temporary role for the two players in the current duel. Writers cannot guess or endorse in their own duel.
- **Reader:** every other roster player in that duel. Readers guess and endorse.
- **Host operator:** a person with access to the host browser, not an extra server-side player role. They may also play through a separate phone session.
- No spectators in this release. Unknown participants trying to join after a game starts receive “This game has already started. Join the next one.”

### 1.2 Session from start to finish

1. Host opens `/`, clicks **Host a game**, chooses settings, and creates a room.
2. Host display shows a four-letter code, QR code, actual join URL, and empty player seats.
3. Players open `/join`, enter code and display name, choose one of eight preset avatars, and join.
4. Each player taps **I’m ready**. Host can start with 3–8 connected players if every current roster player is ready.
5. Host clicks **Start game**. Roster freezes. The host shows rules for 15 seconds, with **Everyone gets it** available after 5 seconds.
6. Round 1 intro lasts 4 seconds: **Round 1 — Open to work.**
7. All players simultaneously receive two writing assignments and have 90 seconds total to write both.
8. When everyone has locked both posts, or the deadline arrives, writing closes. Submitted posts cannot change again.
9. Duels are presented sequentially. Each duel follows READ → GUESS → ENDORSE → RESULT.
10. After all `N` duels, show round scoreboard for 12 seconds, then start round 2.
11. Round 2 repeats with different prompts. Its points are doubled. Intro: **Round 2 — Open to anything.**
12. After its last duel, show final results. Host can return everyone to the lobby for a rematch or close the room.

### 1.3 What players write

Each assignment provides:

- The mundane event as one concise sentence.
- Two or three fixed facts that must remain true.
- One or two boundaries preventing easy fabrication.
- A plain-language instruction: **“Make this sound like a career milestone. Exaggerate the language, not the facts.”**

Players write only the body of a professional announcement. No separate headline field. This keeps two assignments achievable in 90 seconds.

Limits: 20–280 grapheme clusters after trimming; maximum 4 nonempty text lines; at most 4 newline characters after normalizing line endings and blank lines. Enforce 280 visible graphemes with `Intl.Segmenter`, not JS UTF-16 `.length`. Also cap raw payload text at 4,096 UTF-8 bytes. Normalize to NFC, convert CRLF to LF, trim ends, collapse runs of 3+ newlines to two. Do not collapse ordinary spaces inside prose.

Allowed: inflated verbs, grandiose framing, overly earnest lessons, hashtags, self-congratulation, euphemisms, metaphor. Emoji allowed within the grapheme limit.

Not allowed by game rules: inventing an employer, salary, customer count, donation, degree, award, or other factual achievement absent from the prompt. A metaphorical “mission-critical resource” is fine; “I led 40 engineers” is a new fact. The server does not pretend it can semantically detect this. Readers see the facts before endorsing and judge compliance themselves.

### 1.4 Guessing and endorsement are separate

**Guess:** readers see both anonymous posts and four possible mundane events. Both posts came from one event. Each reader locks exactly one guess. They get points for a correct choice. They are never asked to type the original fact verbatim.

**Endorse:** reveal the actual event and its fixed facts to everyone. Readers choose **Endorse A**, **Endorse B**, or **Endorse neither**. Instruction: **“Which post made this sound most impressive—and stayed technically true?”** Supporting text: **“If a post invented facts, don’t endorse it. Neither is a valid choice.”**

Why truth precedes endorsement: someone should not win by writing a completely unrelated accomplishment. Do not award writers for making readers guess incorrectly. Obscurity is not a separate point source.

No separate AI fact-checker, objection hearing, host score override, or lie-vote mechanic. Those would complicate and slow the core loop. The endorsement is the room’s human judgment.

### 1.5 Scoring — exact formula

A duel has `V` accepted endorsement ballots, including `NEITHER`. Let `vA` and `vB` be the number choosing A and B. Let round multiplier `m` be 1 in round 1 and 2 in round 2.

- Writer A earns `V === 0 ? 0 : floor(1000 * m * vA / V)`.
- Writer B earns `V === 0 ? 0 : floor(1000 * m * vB / V)`.
- Each reader with a correct locked guess earns `250 * m`.
- Wrong/missing guess earns 0. Missing endorsement is not a ballot. `NEITHER` is a ballot and reduces the distributed writer points.
- No winner bonus, speed bonus, hidden randomness, minus points, or fastest-answer tiebreaker.
- Rounding remainder is discarded, never redistributed. At `V=3, vA=2, vB=1, m=1`, awards are 666 and 333.
- Scoring occurs exactly once on entry to DUEL_RESULT. Never score when each ballot arrives.
- Vote results are private until DUEL_RESULT. Writer identity is hidden until DUEL_RESULT.
- The entire score is called **Clout**. During results say **+666 Clout**. Do not label it dollars or followers.

Example: 5 players; two writers, three readers. A gets 2 endorsements, B gets 1; two readers guessed correctly. In round 1 A receives 666, B 333, those two readers 250 each. In round 2 the same counts give 1333, 666, and 500 each.

Maximum per normal round for an individual is 2,000 writer points plus `250 * (N - 2)` guessing points: everyone writes twice and reads `N-2` duels. Round 2 doubles it. Do not accidentally give a player two guesses per duel; both posts share one truth.

Ranking: total score descending. Equal scores receive equal ranks using competition ranking (1, 1, 3). Stable seat order only controls visual ordering within tied ranks. Joint first place produces **Co-CEOs of Doing Nothing**; single first place gets **Chief Exaggeration Officer**. No arbitrary tiebreak award.

### 1.6 Missing input and forfeits

- Finalized valid post: normal entry.
- Unlocked draft at deadline: automatically finalize its latest server-acknowledged valid draft. Label the owner’s private result “Your saved draft was submitted.”
- Empty/invalid draft at deadline: forfeit. Render an absence card: **“This professional had nothing to announce.”** Do not insert a bot joke that could receive points.
- One forfeit: normal guess phase based on the remaining post. Endorse stage offers the remaining post and Neither. The absent post cannot receive votes.
- Two forfeits: skip read/guess/endorse; show a 5-second DUEL_RESULT with truth and **“Both positions remain unfilled.”** Nobody gets points for that duel.
- No endorsement ballots: both writers earn zero; correct guesses still score.
- Disconnected readers remain eligible and can reconnect before the deadline. They do not receive automatic votes or random guesses.
- No late submissions after the server deadline. An expired client timer is not authoritative; the server receipt time is.

### 1.7 Settings

| Setting | Values | Default | When editable |
|---|---|---|---|
| Game length | Quick: 1 round; Standard: 2 rounds | Standard | Lobby only |
| Writing time per round | 90, 120, 180 seconds | 90 | Lobby only |
| Fact-guess time | 20, 30 seconds | 20 | Lobby only |
| Endorse time | 20, 30 seconds | 20 | Lobby only |
| Prompt pack | Mixed; Everyday; Campus & Work | Mixed | Lobby only |
| Shared-display sound | On / Off | On after host gesture | Any phase, local display preference |
| Reduced motion | System / On | System | Local device preference |

Quick mode uses multiplier 1 only. Standard round 2 uses multiplier 2. Never advertise Quick as a special three-player rule.

READ lasts 12 seconds, RESULT 10 seconds, round intro 4 seconds, scoreboard 12 seconds. GUESS and ENDORSE end early when all eligible players have locked a response, but GUESS must last at least 5 seconds and ENDORSE at least 8 seconds. READ is always shown in full; writers need the room to actually read their work. Standard play with default timers takes roughly 8–21 minutes, depending on player count and early locks. Longer writing/judging settings can approach 30 minutes. For a conservative estimate in seconds use R * (4 + W + N * (12 + G + E + 10)) + 15 + (R - 1) * 12, where R is round count, W/G/E are configured seconds, and N is player count. This excludes pauses, extensions and untimed lobby/final screens. On setup show the range for N=3 and N=8, rounded up to minutes; in the lobby use actual N. Display an estimate, not a promise.

## 2. Scheduling and prompt content

### 2.1 Balanced assignments, including odd player counts

For roster of `N` players, create a circular ordering `p0…p(N-1)`. Its edges are duels: `(p0,p1), (p1,p2), …, (p(N-1),p0)`. This produces exactly N distinct duels and exactly two assignments for every player, including N=3 and odd N.

For each round:

1. Use an injectable seeded PRNG; generate a seed from server cryptographic randomness when creating a game.
2. For round 1, seeded-shuffle the roster and make the ring.
3. For round 2, generate 200 candidate shuffled rings. Count undirected edges that occurred in round 1. Pick the lowest-repeat candidate; use first generated candidate on ties. Repeats are unavoidable for some N, and all pairings necessarily repeat at N=3. Do not claim otherwise.
4. Independently shuffle duel presentation order with the same seeded PRNG stream. No guaranteed no-consecutive-appearance constraint.
5. For each duel, draw one unused prompt; copy its complete private content into server state. Randomize A/B writer positions once and retain them. Shuffle its four guess options once and retain opaque option IDs. Never reshuffle on reconnect.
6. Each player receives their two assignments sorted by eventual presentation index. Do not include the opponent’s ID or name in assignment payloads.
7. Never use a prompt as the actual prompt for two different duels within a game. This prevents one player from having seen another duel’s answer during writing.

Do not implement pairings as “random partner per player”; that can produce unequal assignments. Tests must assert degree exactly two and N edges for every N=3…8.

### 2.2 Prompt pack contract

Load `larpbox-prompts.json` on the server at boot; validate it before listening. The file root is `{ schemaVersion: 1, packId: "larpbox-core-v1", prompts: PromptDefinition[] }`. Load the prompts array, not the root object as an array. Validate the wrapper as well as each entry. Each entry has:

```ts
interface PromptDefinition {
  id: string;
  category: 'everyday' | 'campus-work';
  truth: string;
  facts: string[];          // 2–3 short facts
  boundaries: string[];     // 1–2 explicit no-invention constraints
  distractors: [string, string, string];
}
```

Each category in the supplied pack has at least 16 prompts, enough for a maximum-size two-round game. Mixed uses both. All entries require unique IDs, unique normalized truths, three unique distractors different from the truth, truth/distractor lengths <=100 graphemes, facts/boundaries <=140 each. Assert the selected pack has at least `N * roundCount` available before start. If insufficient, return CONFIG_INVALID; never silently reuse a truth.

Track used prompt IDs across rematches within the room. On a new game, if fewer than needed remain, reset the used set for that selected pack before drawing, and keep every prompt unique within that new game. Distractors are comparison choices, never hidden prompt IDs; no client API exposes the full pack.

Writing prompts should work for non-programmers. Campus/work includes ordinary student and office behavior, not compiler jokes. Keep the initial pack clean enough for a mixed adult friend group. Users can write mild profanity. Avoid default prompts about protected identities, real-person allegations, sexual violence, self-harm, or tragedies; the target is professional self-importance.

### 2.3 Example full duel

Private prompt to Alice and Ben:

> You replaced an empty toilet-paper roll.  
> Facts: one empty roll; one fresh roll; your own bathroom.  
> Boundary: no employer, customers, or team were involved.

Alice writes the example in section 0. Ben writes: “This morning I stepped into a resource gap others had left behind. One small rotation. A completely different outlook. Grateful for the opportunity to serve.”

TV displays anonymous A and B. Cara, Dev, and Eli choose among replacing the roll, refilling a soap dispenser, changing a light bulb, replacing a trash bag. Then everyone sees the true event and facts. Cara and Dev endorse A, Eli endorses B. The next screen reveals authors, totals, and score increments.

**No example answer is visible during real writing.** The tutorial uses a separate baked-in example about plugging in a charger that is not a playable prompt.

## 3. Art direction and design tokens

### 3.1 Visual concept

An overly self-important professional networking conference that has become a game show. Off-white paper, oversized black typography, cobalt-blue controls, acid-yellow emphasis, conference name badges, rubber-stamp reveals, and neatly ruled cards. It should feel deliberately designed and playable across a room.

Avoid: default SaaS dashboard layouts, purple gradients, glass panels, realistic LinkedIn logo, blue navigation clone, excessive stock icons, long marketing paragraphs, tiny text on the TV, or an AI chat interface. The writers’ posts are the visual centerpiece.

### 3.2 Fonts and assets

Use self-hosted WOFF2 fonts through `@fontsource` packages:

- `Space Grotesk` weights 500, 600, 700 for headings, scores, and wordmark.
- `Inter` weights 400, 500, 600, 700 for body/UI.
- `IBM Plex Mono` weights 400, 500 for room codes, timers, and small editorial labels.

Subset to Latin where the package offers it. Keep system fallbacks. No runtime Google Fonts dependency.

Icons: `lucide-react`, 20px phone / 28px TV, stroke width 2. QR: `qrcode.react`, SVG output with quiet zone and white background. Custom avatar SVGs: briefcase, coffee cup, ladder, trophy, necktie, spreadsheet, plant, rubber stamp. Flat 2-color vector silhouettes; no user uploads. Color and icon are both present so identity never depends only on hue.

### 3.3 Tokens

```css
:root {
  --paper: #F6F3EB;
  --surface: #FFFFFF;
  --ink: #171717;
  --muted: #595B62;
  --line: #C8C5BD;
  --blue: #1747E7;
  --blue-hover: #1036B7;
  --yellow: #E9FF70;
  --green: #166534;
  --red: #B42318;
  --red-bg: #FEE4E2;
  --blue-bg: #EAF0FF;
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --shadow-card: 5px 5px 0 var(--ink);
  --shadow-button: 3px 3px 0 var(--ink);
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
```

Use ink text on yellow, never white. Use white text on blue. Check actual contrast in implementation. Muted is for supporting text, not disabled-only low contrast. Disable controls through opacity plus semantic disabled attributes and explanatory text, not color alone.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Cards: 2px ink border; 16px radius; hard offset shadow. Buttons: 2px ink border; 12px radius; 56px min height on phone, 60px on desktop. Button press translates `(2px,2px)` and reduces shadow; disabled and reduced-motion alternatives do not jump.

Focus ring: 3px blue with 3px white offset. Selected choice: 3px ink outline + blue background tint + check icon and selected label. Error: red border, icon, and text.

### 3.4 Typography by surface

**TV at 1920×1080:** wordmark 36; phase headline 64/1.05; room code 88/1; post body 34/1.28; facts 28/1.3; supporting labels 24; scoreboard name 32; score 40; timer 36. At 1280×720 reduce using clamp to heading 44, body 26, supporting 20. Never reduce post text below 24px to fit. Size/layout must handle two worst-case 280-grapheme posts with 4 lines at 1280×720; test it. If vertical budget needs help, remove decorative elements and reduce gaps before font size. On very short displays, host reading cards may scroll; show an explicit scroll cue rather than clipping content.

**Phone:** wordmark 24; screen heading 28/1.1; prompt truth 22/1.3; body 17/1.45; textarea 18/1.45; supporting text >=14; timer 20. Inputs >=16px to avoid mobile Safari zoom. Content width max 480px, centered; horizontal gutter 16px.

## 4. Routes and exact screens

### 4.1 Routes

| Route | Purpose |
|---|---|
| `/` | Landing: Host / Join |
| `/host/new` | Settings and room creation |
| `/host/:code` | Host lobby and all shared-screen game phases |
| `/join` | Room-code entry |
| `/join/:code` | Name/avatar/join flow; accepts code from QR |
| `/play/:code` | Player controller; restores saved session |
| `/help` | Brief rules and connection help |
| `/dev` | Local-only isolated scenario tools, when explicit dev flag enabled |

Unknown route: branded 404 with **Back to Larpbox**. Host route without host credentials never exposes controls; show “This browser doesn’t host this room” with Join and Home links. Do not allow room code alone to claim hosting.

### 4.2 Landing

Off-white background; wordmark top left; **How to play** text link top right. Main left area: eyebrow **A PARTY GAME ABOUT PROFESSIONAL EXAGGERATION**, title **Tiny achievement. Huge announcement.**, subtext **Turn everyday nonsense into career milestones. Your friends supply the endorsements.** Two buttons: blue **Host a game**, white **Join a game**. Footer chips **3–8 players**, **Phones are controllers**, **No accounts**.

Right side: a single large fictional professional post card. Author “Some Guy”; subtitle “Thought Leader · Available Immediately”; body “Proud to announce I have successfully completed a full cycle of household resource redistribution.” A yellow stamp below says **HE TOOK OUT THE TRASH.** It is a static explanatory example, not a fake active room.

Phone: one column; buttons before example. Host button is available on phones but show short note on host setup: “For the best experience, host on a laptop or TV.” No mandatory device block.

### 4.3 Host setup

Heading **Let’s make this a networking event.** Labelled native select or accessible segmented controls for settings in 1.7. Summary line computes player range and approximate duration. Primary **Create room**; secondary **Back**. Loading label **Preparing the room…**; disable duplicate creates while request pending. Inline errors retain settings. Creating is the audio-unlock user gesture if sound is on.

### 4.4 Host lobby

Reference layout:

```text
larpbox [TV]                               SOUND  FULLSCREEN  SETTINGS

              YOUR NETWORK IS ASSEMBLING.

  JOIN ON YOUR PHONE                  [avatar] ALEX     Ready
  <actual host>/join                  [avatar] SAM      Joining…
  [      QR CODE      ]               [avatar] JO       Ready
  ROOM CODE                           [empty seat]
  K P R T                             ... up to 8 seats
  [Copy join link]

  3–8 players • Everyone joins on a phone, including the host.
                                   [Start game]  2 of 3 ready
```

1920px layout: max width 1680; outer padding 48; columns 40%/60%; gap 48. QR 240×240 with quiet zone, room code monospace and selectable, actual URL no invented purchased domain. Show one roster row per player, 72px height, name/fictional headline, avatar, connection status, ready status, host-only remove button. Name removal requires modal confirmation and revokes that session. No empty seat avatar pretending a real person joined.

Start button disabled below 3 players, above max, any offline member, or any unready member; adjacent text explains the first applicable reason. Host can remove a disconnected lobby member. Settings changes update server settings and clear everyone's readiness, displaying “Settings changed. Ready up again.” Sound toggle does not clear readiness because it is local.

### 4.5 Join screens

`/join`: wordmark; title **Join your network.** One room-code input, uppercase, exactly four letters, autocomplete off, autocapitalize characters; button **Continue**. Enter submits. Read-only room summary validates availability after code entry.

`/join/:code`: visible code chip, label **What should we call you?**, name input max 16 graphemes, 8 avatar buttons in 4×2 grid, and **Join room**. First available avatar selected; avatars can repeat if a player prefers, so availability is decorative only. Display names unique case-insensitively after NFC, trim, and collapsed whitespace; reject duplicate with **“That name’s taken in this room. Try another.”** Name length 2–16 graphemes; no line breaks/control characters. Emoji permitted.

On success replace route with `/play/:code`; persist role credentials first. Do not create a new player on controller refresh. If existing valid saved credentials exist, show **Rejoin as NAME** and **Join as someone else**; joining as someone else during play is blocked like any late join.

### 4.6 Player lobby

Header wordmark, code chip, network status dot with text. Large own avatar; **You’re in, NAME.** Fictional headline assigned by seat from the list in section 5. Button **I’m ready** toggles to **Ready — tap to undo**. Roster below with ready/connectivity status. Bottom supporting text: **“Keep this page open. Your first assignment will appear here.”** Link **Leave room** with confirmation, lobby only.

### 4.7 Tutorial

Host: three steps, one per column: **1. Inflate it. 2. Decode it. 3. Endorse it.** Below each a concise 1–2-sentence explanation. Show example ordinary fact and 100-character inflated post. Bottom: **“Impressive wording. No invented achievements.”** Countdown and host skip after 5s.

Phone: same three steps vertically, then **Look at the big screen**. Explain writers sit out guessing/voting on their own posts. No required tutorial checkbox. Tutorial closes on server time.

### 4.8 Round intro

Host fills screen with round number; **Open to work** / **Open to anything**; round 2 yellow pill **DOUBLE CLOUT**. Phone shows same plus **Two posts. One timer.** Four-second server phase; no inputs.

### 4.9 Writing — phone (most important screen)

Sticky top row: **Round 1** and timer. Below: segmented task tabs **Post 1** / **Post 2**, each with draft/locked status icon. The active assignment contains:

1. Small label **WHAT ACTUALLY HAPPENED**.
2. Truth in a blue-tinted box, 22px text.
3. Expandable **The facts** panel, expanded on first visit; facts and boundaries as short bullet lists. Expansion is local, never a server mutation.
4. Instruction **Make this sound like a career milestone.**
5. Textarea with placeholder **“I’m humbled to announce…”**. This placeholder is not saved text. Six visible rows; grows to 220px then scrolls.
6. Count **0 / 280**, turn red above limit. Show **20 characters minimum** when shorter after interaction.
7. Draft status **Saving… / Saved / Saved on this phone; reconnecting… / Couldn’t save—retry**.
8. Wide blue **Lock post** button. Disabled if invalid, locked, disconnected, saving a conflicting operation, or phase closed.
9. After lock, render the text in a read-only post card and show **Post locked.** + **Write your other post** if needed. No unlock in MVP.
10. When both locked, **Your personal brand is ready. Look at the big screen.** with two miniature submitted cards.

Local draft autosave immediately on every change; server draft save debounced 400ms and flushed on blur/tab switch. Lock sends the complete current text, not merely a draft reference. Deadline auto-submits server-saved valid draft as described above. A yellow 15-second warning says **“Time’s almost up. Your saved drafts will be submitted.”** Don't hide the second assignment behind a long first form.

Footer and buttons respect `env(safe-area-inset-bottom)`. When keyboard is open, allow page scrolling; do not fix a footer over the textarea. `100dvh` with fallback, not only `100vh`.

### 4.10 Writing — host

Heading **Building personal brands…**; timer large; roster grid each with 0/2, 1/2, 2/2 locked icons. Supporting copy **“Two posts each. Keep the facts. Inflate everything else.”** No actual prompt or draft on the host screen. Total locked count can update. A slow decorative marquee of fictional job titles is optional and must stop with reduced motion. Host controls available: Pause, Add 30 seconds once this writing phase, End game. No early force-close that could silently discard work.

### 4.11 Duel READ — host

Top: **Round 1 · Post-off 2 of 5**, room code small, timer. Headline **Two announcements. One very ordinary event.**

Two equally sized post cards labelled **A** and **B**. Each has identical neutral avatar, **Anonymous professional**, identical subtitle **Proud to share an update**, body text, decorative reaction icons, and **Agree?** footer. No author-specific name, avatar, headline, color, or timestamp before results. No actual truth yet. Put A and B on both cards, not color alone. Body must preserve line breaks, wrap long strings, and escape HTML. Post copy is never truncated behind “see more.”

Phone readers: both cards stacked; note **Read the posts. Guessing opens in a moment.** Writers: **Your announcement is up. You sit this one out.** They may see both public posts but no opponent identity until result.

### 4.12 Duel GUESS

Host: compact post cards still present; prompt **What actually happened?**; four options in 2×2 grid with number labels 1–4; aggregate **2 of 3 guesses locked** and timer. No visible answer distribution. Do not display the right choice early in DOM, props, API, CSS class names, ARIA text, or IDs.

Phone readers: posts in accessible collapsible panel (expanded by default); four full-width answer buttons >=56px, with plain-language event text. Tap selects; **Lock guess** confirms. Before lock, can change selection locally. After lock cannot edit; confirmation **Guess locked. We’ll reveal the truth next.** Correctness not shown yet. Writers get **You already know. Let the others figure it out.**

### 4.13 Duel ENDORSE

Host: yellow truth banner **WHAT ACTUALLY HAPPENED: [truth]**; fixed facts below in compact readable list; same two posts; heading **Who made the most out of the least?** Supporting rule **Endorse the funniest post that stayed true.** Timer and locked-vote count. Author names still hidden.

Phone readers: truth and full fact/boundary panel; cards; radio-style **Endorse A**, **Endorse B**, **Endorse neither**; selected state; **Lock endorsement** confirmation. A forfeited option is visibly unavailable. After lock: **Endorsement recorded.** Writers cannot vote. Readers can see their guess was right/wrong now, but score animation waits until result.

### 4.14 Duel RESULT

Host: reveal author identities and their real in-game avatars/headlines above corresponding cards. Show integer endorsement count each, Clout award, neither count, and fact-guesser count. Winning endorsement count produces a blue **ENDORSED** stamp. Positive equal counts produce **CO-ENDORSED** on both. With no positive votes: **NO ENDORSEMENTS**. Winner stamp is decorative; no extra points. No individual voter choice is public. Show small personal avatars of correct guessers only; avoid disclosing individual wrong choices.

Phone: personal breakdown **Writing +666**, **Decoded the truth +250**, **Total 1,416** as applicable. Show both authors and vote totals. Text is server-computed, not a second scoring implementation. 10s before next duel. Sound plays once per phase entry, not on reconnect.

### 4.15 Round scoreboard

Host: heading **Your network is growing.** Ranked rows with avatar, name, round gain and total. Animate rows to their new order over 400ms, once. Round 1 footer **Next: double Clout.** Last-round scoreboard is folded into final results rather than a redundant extra pause.

Phone: own rank and total, full list below. No writing inputs. 12-second server phase after non-final rounds.

### 4.16 Final results

Host: oversized winner name, award **Chief Exaggeration Officer**, or joint winners and **Co-CEOs of Doing Nothing**. Full scoreboard. Best post card: highest single-duel writer award, ties resolved by earliest duel then A before B; label **Highest-Clout Announcement** and show true event under it. If nobody earned writer points, omit that card and say **“A room full of professionals. No endorsements.”**

Buttons: blue **Play again**, white **Close room**. Play again opens a confirmation **“Return everyone to the lobby? Scores will reset.”** It preserves room code, connected participants, and avatars, clears readiness, resets game state, and removes disconnected roster members. Those removed tokens become invalid. Three connected players still required to start again. Closing requires confirmation and broadcasts an ended-room screen.

Phone: own final score/rank, winning post, **Waiting for the host**. Optional local screenshot hint; no mandatory image-export service or external sharing integration.

### 4.17 Pause, disconnection, expiry, and errors

- Paused host overlay: opaque enough to read **Meeting on hold**, reason, **Resume**, **End game**. Secret content stays projected by current phase rules, not erased/re-sent with secrets.
- Paused phone overlay: **Host paused the game. Your time is safe.** Local drafting may continue, but no server input commands accepted except state sync. On resume, reconcile draft before autosave.
- Disconnected phone: nonblocking amber banner **Reconnecting… Keep this page open.** Keep draft editable locally; disable lock/vote. Show last known screen marked offline.
- Host connection lost: server pauses timed play immediately; player overlay **The big screen disconnected. Waiting for the host.** Host reconnect screen restores phase and offers Resume; do not automatically resume before the operator is ready.
- Room expired/restarted: full screen **This room has ended. Ask the host for a new code.** + Join another / Home. Never pretend the game was recovered after process loss.
- Kicked lobby player: **You’ve been removed from this room.** Clear credential and disconnect; no automatic rejoin loop.
- Session superseded by another tab: **This player is active in another tab.** Button **Use this tab** deliberately attempts takeover. Do not let two tabs repeatedly auto-take over from each other.
- Slow HTTP/socket response: explicit spinner, timeout, and retry. Never silently leave an enabled button sending duplicates.

### 4.18 Help and modal details

Help page contains the three tutorial steps, score explanation (up to 1,000 Clout split by endorsement share, 250 per correct guess, round 2 doubled), and connection troubleshooting. State explicitly that the host joins on a separate phone to play, nobody needs an account, and the host controls pauses. Troubleshooting: check room code, stay on the correct network in LAN mode, restore via Rejoin rather than making a duplicate player, ask host to pause if needed. Include Home and Join a room buttons.

Host controls use a compact labelled menu anchored top right. Pause opens the pause overlay without a confirmation because it is reversible. End game/Close room uses a dialog: “End this room? Everyone will be disconnected and this game's results will be lost.” Buttons “Keep playing” and red “End room.” Lobby remove: “Remove NAME from the room?” with Cancel / Remove. Rematch dialog copy is in 4.16. Destructive actions never share the primary location/color of Start game.

Fullscreen is a host-local button invoking the browser Fullscreen API from a click; change label to Exit fullscreen while active. If unavailable/failing, keep gameplay working and show a small “Use your browser's fullscreen controls” hint. Copy join link copies only the public join URL and shows “Link copied”; if clipboard access fails, reveal a selectable URL input. Both features are optional conveniences, not prerequisites for joining.

## 5. Copy, motion, sound, and accessibility

### 5.1 Fictional player headlines

Use the smallest unoccupied seat index 0–7 on lobby join; removing a player frees that seat without renumbering others. Select avatar defaults and headlines from that index. Assign by seat: Thought Leader · Between Opportunities; Founder · Details Coming Soon; Strategic Coffee Professional; Open to Being Impressed; Head of Personal Branding; Synergy Consultant · Self-Appointed; Building in Public · Mostly Posting; Chief Meeting Attendee.

Headlines appear in lobby and revealed posts only. They would identify authors if used on anonymous posts. Status/error messages remain practical: “Post locked,” “Reconnecting,” “That name is taken.” Reserve jokes for headings and reveals. Do not mock players for accessibility needs or poor connections.

### 5.2 Motion and sound

Transitions: 180ms fade with 12px upward travel; host max 250ms. Truth stamp: 250ms downward slide and slight rotation. Score count-up: 500ms to the server-provided final value. Final confetti: max 80 original CSS/canvas particles, two seconds, once. Reduced motion removes travel, confetti, count-up and marquees. State must not wait for animation callbacks.

Host audio only; phones silent. Small Web Audio synthesis module, AudioContext initialized/resumed by a host click. Cues: join (two ascending notes), phase (pluck), truth (short resolve), results (chord), final (original short fanfare). Gain around 0.12; duration under 1.5 seconds except final under 3. Always-visible mute. Track last sounded phaseId in sessionStorage; reconnect does not replay cues. Blocked audio never blocks gameplay. No copyrighted recordings or required speech synthesis.

### 5.3 Accessibility

Semantic buttons, labels, headings, fieldsets/radio groups. Modal focus trap, Escape dismissal for local noncritical dialogs, restore focus to trigger. Polite live region for phase changes and confirmed actions, not every timer tick. Announce 10 seconds remaining once. No sound-only instructions. Visible keyboard focus; contrast tested; 48px minimum targets; buttons 56px. Do not disable pinch zoom. Test 200% zoom, long names, screen-reader labels, reduced motion and mobile safe areas. Preserve scrolling at large text sizes.

## 6. Technology and project structure

### 6.1 Selected stack

These are deliberately selected compatible version families, not claims that every major is the newest. Install current patched releases within these families, verify peer compatibility, and commit exact resolutions in package-lock.json.

| Layer | Decision | Responsibility |
|---|---|---|
| Runtime | Node.js 24 LTS + npm | Long-running service, build tools |
| Language | TypeScript 5.x strict | Client, server, shared contracts |
| Frontend | React 19.x / React DOM 19.x | TV and phone interfaces |
| Build | Vite 7.x + compatible React plugin | SPA build/dev server |
| Router | React Router DOM 7.x in declarative BrowserRouter mode | Client routes; no SSR |
| Styles | Tailwind CSS 4.x + @tailwindcss/vite + CSS | Original visual components/tokens |
| Client store | Zustand 5.x | Last authoritative snapshot, connection state |
| HTTP | Express 5.x | Bootstrap endpoints and static assets |
| Real time | socket.io 4.x and matching socket.io-client 4.x | Commands, state snapshots |
| Validation | Zod 4.x | Runtime validation and inferred types |
| Logging | pino | Structured, redacted server logs |
| Assets | lucide-react, qrcode.react, @fontsource packages | Local icons, SVG QR, fonts |
| Testing | Vitest 3.x, Testing Library, jsdom, Playwright 1.x | Unit/component/multi-browser tests |
| Tools | tsx 4.x, tsup 8.x, concurrently, ESLint, Prettier | Dev/build/checks |
| Storage | Process-local Map | Ephemeral rooms; no database |

Resolve exact versions when implementing; do not use floating latest tags in production. If a genuine peer/security incompatibility forces a version change, document it and preserve these contracts. No Next.js, Supabase, Firebase, LLM service, or serverless websocket workaround needed.

Node 24 meets the selected Vite 7 runtime target. Follow that major's documentation rather than a different major's setup. [Vite 7 guide](https://v7.vite.dev/guide/), [Node releases](https://nodejs.org/en/about/previous-releases)

Tailwind 4 uses its dedicated Vite plugin and CSS import. Do not mix in a Tailwind 3 recipe. [Official setup](https://tailwindcss.com/docs/installation/using-vite)

### 6.2 Repository layout

~~~text
larpbox-tv/
  package.json                   # private npm workspace
  package-lock.json
  .nvmrc                         # 24
  .env.example
  .gitignore
  README.md
  IMPLEMENTATION_STATUS.md
  tsconfig.base.json
  eslint.config.js
  vitest.config.ts
  playwright.config.ts
  Dockerfile
  .dockerignore
  apps/
    web/
      package.json
      index.html
      vite.config.ts
      tsconfig.json
      public/favicon.svg
      src/
        main.tsx
        App.tsx
        styles/{tokens,global,host,controller}.css
        routes/{Landing,HostSetup,HostRoom,JoinRoom,Controller,Help,NotFound}.tsx
        components/ui/{Button,Card,Modal,Input,ChoiceGroup,Timer,StatusBanner}.tsx
        components/game/{Wordmark,Avatar,RoomCode,JoinQR,PostCard,TruthBanner,Scoreboard}.tsx
        components/host/{Lobby,Rules,RoundIntro,Writing,Duel,Results,Final}.tsx
        components/controller/{Lobby,Rules,Writer,Reader,Waiting,Results}.tsx
        lib/{http,socket,session,drafts,clock,audio}.ts
        store/gameStore.ts
        hooks/{useRoomConnection,usePhaseTimer,useDraft}.ts
        dev/ScenarioGallery.tsx
        test/
    server/
      package.json
      tsconfig.json
      tsup.config.ts
      src/
        index.ts                 # compose service and listen
        app.ts                   # testable HTTP app factory
        config.ts
        http/{routes,errors,limits}.ts
        realtime/{server,auth,commands,publish}.ts
        game/{types,roomStore,engine,schedule,scoring,clock,projections}.ts
        game/{engine,schedule,scoring,projections}.test.ts
        content/{loadPrompts,headlines}.ts
        content/larpbox-prompts.json
        security/{tokens,origins,rateLimits}.ts
  packages/
    shared/
      package.json               # @larpbox/shared
      tsconfig.json
      tsup.config.ts
      src/{index,schemas,dto,events,constants,text}.ts
  tests/
    e2e/{lobby,completeGame,reconnect,privacy,hostControls}.spec.ts
    helpers/{players,clock,fixtures}.ts
~~~

Server-only prompts must never be imported by web or shared code. Shared contains only schemas, public DTOs, constants and text-normalization helpers. Internal server model imports shared types, never the reverse.

Use ESM ("type": "module") throughout. Shared builds to dist/index.js plus declaration files and exports these through package.json. Name workspaces @larpbox/web, @larpbox/server, @larpbox/shared. Apps depend on the matching private shared package using npm workspace-compatible "*". Build shared before apps. Server tsup bundles JSON prompts into its runtime output; verify server startup without src present. Vite outputs apps/web/dist; server outputs apps/server/dist/index.js.

### 6.3 Required scripts and TypeScript configuration

~~~json
{
  "dev": "npm run build -w @larpbox/shared && concurrently -k \"npm run dev -w @larpbox/shared\" \"npm run dev -w @larpbox/server\" \"npm run dev -w @larpbox/web\"",
  "build": "npm run build -w @larpbox/shared && npm run build -w @larpbox/web && npm run build -w @larpbox/server",
  "start": "node apps/server/dist/index.js",
  "typecheck": "npm run build -w @larpbox/shared && npm run typecheck --workspaces --if-present",
  "lint": "eslint .",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
~~~

Shared dev script is tsup watch. Server dev script is tsx watch with root .env loading (for example tsx watch --env-file=../../.env src/index.ts); document copying .env.example first. Production reads process env and must not require a local .env file. Web dev is Vite. Include workspace-specific build/typecheck scripts.

Use strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, esModuleInterop, resolveJsonModule, skipLibCheck. Use moduleResolution Bundler with Vite/tsup and test that emitted ESM imports resolve. Do not disable strictness to escape modeling the phase union. Vitest config uses Node for engine tests and jsdom for component tests. Root is not itself a workspace, preventing recursive typecheck.

### 6.4 Local networking

Vite: 0.0.0.0:5173, strictPort true. Node: 0.0.0.0:3001. Vite proxies /api and /socket.io to http://127.0.0.1:3001 with ws:true for the socket path. Browser uses relative /api and same-origin Socket.IO; never hardcode localhost in client requests.

Phones use http://LAPTOP_LAN_IP:5173 on the same reachable Wi-Fi. Set PUBLIC_ORIGIN to that exact origin for QR links. A localhost QR code is not usable from another device. Venue networks may isolate devices; test beforehand and use a public HTTPS deployment if necessary. Production serves frontend and API from one origin.

## 7. System architecture

~~~mermaid
flowchart LR
  H[Shared host browser] -->|HTTP create| API[Express bootstrap API]
  P[Player phones] -->|HTTP join| API
  H <-->|Commands / HostView| WS[Socket.IO gateway]
  P <-->|Commands / PlayerView| WS
  API --> STORE[In-memory room store]
  WS --> ENGINE[Authoritative engine]
  CLOCK[Server scheduler] --> ENGINE
  ENGINE <--> STORE
  CONTENT[Server-only prompt pack] --> ENGINE
  STORE --> PROJ[Per-recipient projections]
  PROJ --> WS
~~~

Server owns assignments, secrets, input eligibility, deadlines and scores. Client owns local typing, rendering, selection-before-lock, audio and cosmetic motion. No client decides a phase transition or score. No client accesses a database. HTTP and websocket layers use the same RoomStore instance.

Command flow: authenticate → validate → verify phase/ownership/deadline → synchronous mutation → optional transition → increment room revision → derive permitted views → publish → acknowledge. Never expose raw Room state through an endpoint.

## 8. State and storage model

### 8.1 Identity

All internal entity IDs are UUIDs: room, game, player, assignment, duel, phase, option and request. Four-letter public room codes use alphabet ABCDEFGHJKLMNPQRSTUVWXYZ (24 letters, excludes I and O). Generate cryptographically; retry collisions against live rooms and expired-code tombstones. Default 100 live rooms maximum.

Host/player tokens: 32 crypto-random bytes, base64url. Store SHA-256 hashes in session records, compare safely. Never put tokens in URLs, QR codes, logs, public DTOs, or analytics. A room code is not a hosting credential.

### 8.2 Domain data

~~~ts
type Phase =
  | 'LOBBY' | 'RULES' | 'ROUND_INTRO' | 'WRITING'
  | 'DUEL_READ' | 'DUEL_GUESS' | 'DUEL_ENDORSE' | 'DUEL_RESULT'
  | 'ROUND_SCOREBOARD' | 'FINAL' | 'CLOSED';
type Side = 'A' | 'B';
type Endorsement = Side | 'NEITHER';

interface RoomSettings {
  roundCount: 1 | 2;
  writingSeconds: 90 | 120 | 180;
  guessSeconds: 20 | 30;
  endorseSeconds: 20 | 30;
  pack: 'mixed' | 'everyday' | 'campus-work';
}
interface PlayerRecord {
  id: string;
  name: string;
  normalizedName: string;
  avatarId: string;
  seat: number;
  headline: string;
  ready: boolean;
  connected: boolean;
  everConnected: boolean;
  lastSeenAt: number;
  joinedAt: number;
  score: number;
}
interface SessionRecord {
  role: 'host' | 'player';
  playerId: string | null;
  tokenHash: string;
  revoked: boolean;
  activeSocketId: string | null;
  activeClientInstanceId: string | null;
  connectionGeneration: number;
  requests: Map<string, CachedAck>;
}
interface PhaseState {
  name: Phase;
  id: string;
  startedAt: number;
  deadlineAt: number | null;
  durationMs: number | null;
  elapsedBeforePauseMs: number;
  pause: null | {
    reason: 'HOST_PAUSED' | 'HOST_DISCONNECTED';
    pausedAt: number;
    remainingMs: number;
  };
  writeExtensionUsed: boolean;
}
interface Assignment {
  id: string;
  playerId: string;
  duelId: string;
  draftText: string;
  draftRevision: number;
  finalText: string | null;
  status: 'DRAFT' | 'LOCKED' | 'FORFEIT';
  lockedAt: number | null;
  autoSubmitted: boolean;
}
interface Duel {
  id: string;
  roundIndex: number;
  orderIndex: number;
  prompt: PromptDefinition;
  assignmentBySide: Record<Side, string>;
  writerBySide: Record<Side, string>;
  options: { id: string; label: string }[];
  correctOptionId: string;
  readerIds: string[];
  guesses: Map<string, string>;
  endorsements: Map<string, Endorsement>;
  settled: boolean;
  result: DuelResult | null;
}
interface Round {
  index: number;
  multiplier: 1 | 2;
  duelIds: string[];
  scoreAtStart: Record<string, number>;
}
interface GameState {
  id: string;
  seed: string;
  rosterIds: string[];
  rounds: Round[];
  assignments: Map<string, Assignment>;
  duels: Map<string, Duel>;
  roundIndex: number;
  duelIndex: number;
}
interface Room {
  id: string;
  code: string;
  revision: number;
  createdAt: number;
  lastHumanActivityAt: number;
  allDisconnectedSince: number | null;
  hostDisconnectedSince: number | null;
  settings: RoomSettings;
  phase: PhaseState;
  players: Map<string, PlayerRecord>;
  sessions: Map<string, SessionRecord>;
  game: GameState | null;
  usedPromptIds: Set<string>;
}
~~~

DuelResult contains: duelId, roundNumber, multiplier, truth/facts/boundaries, correctOptionId, resolved A/B authors/text/forfeit, votesA, votesB, votesNeither, ballotsCast, eligibleReaders, correctGuesserIds, per-player integer score deltas, total scores after settlement. It is immutable after settlement. Cache Acks with canonical command hash, timestamp, and exact Ack; cap 256 per session, TTL 10 minutes. Semantic lock/settled guards remain after request cache eviction.

Room runtime registry separately stores scheduled handles, monotonic start/deadline, early-transition check handles, and transport indexes. Clock provides nowEpochMs() and nowMonotonicMs(); implement with Date.now() and performance.now(). Epoch timestamps are for display. Deadline enforcement and elapsed/pause arithmetic use monotonic time. Tests inject a fake clock.

### 8.3 Why no database, and exact lifetime

MVP rooms are ephemeral; a single process can store their state. An accepted action mutates memory before ack. Refresh/reconnect restores from this memory; server restart does not.

- Absolute lifetime: six hours.
- Lobby/final inactivity: 30 minutes without a human action, even with sockets connected.
- All devices offline: ten minutes.
- Host absent during active game: immediate pause, ten minutes to reconnect before expiry.
- Manual pause inactivity: 30 minutes.
- Heartbeats/clock pings do not reset human activity.
- Close/expiry emits room:closed, revokes tokens, removes state, clears timers and idempotency caches.
- Keep only the expired room code in a ten-minute tombstone, to prevent confusing immediate reuse.
- Never-connected HTTP join reservations expire after 60 seconds; ordinary disconnected players do not use this rule.

On restart, missing room means ROOM_NOT_FOUND and an honest ended-room screen. Include a process bootId in health and views so a new process is recognizable.

Future durable version, not MVP: PostgreSQL tables rooms, players, sessions, games, assignments, duels, guesses, endorsements, score_events. Unique (duel_id,player_id) for guesses/endorsements; unique (duel_id,player_id,score_kind) for score events. Serialize room commands in transactions, publish after commit, pause recovered games after restart. A Redis Socket.IO adapter alone does not replicate domain state or create durable scoring.

## 9. Role-filtered snapshots

~~~ts
interface SnapshotBase {
  protocolVersion: 1;
  bootId: string;
  roomId: string;
  roomCode: string;
  revision: number;
  serverNow: number;
  gameId: string | null;
  phase: {
    name: Phase;
    id: string;
    startedAt: number;
    deadlineAt: number | null;
    remainingMs: number | null;
    paused: boolean;
    pauseReason: 'HOST_PAUSED' | 'HOST_DISCONNECTED' | null;
  };
  settings: RoomSettings;
  players: PublicPlayer[];
  roundNumber: number | null;
  duelNumber: number | null;
  duelsInRound: number | null;
}
~~~

PublicPlayer: id, name, avatarId, headline, seat, ready, connected, score. One-based numbers in views; zero-based engine indices.

Add a discriminated screen union:

| Screen | Common visible fields | Private per-player additions |
|---|---|---|
| LOBBY | Roster, readiness totals; host canStart/reason | Own ready state |
| RULES | Tutorial key, host skip availability | None |
| ROUND_INTRO | Multiplier, round title | None |
| WRITING | Host: locked counts only | Own two assignments: IDs, truth/facts/boundaries, draftText/revision, status/finalText, presentationNumber |
| DUEL_READ | Current duel ID, anonymous A/B text or forfeit | Own role writer/reader |
| DUEL_GUESS | Same posts, four options, aggregate locked count | Own locked guess only |
| DUEL_ENDORSE | Same posts/options, actual truth/facts/boundaries, correctOptionId, aggregate locked count | Own guess correctness and own locked endorsement |
| DUEL_RESULT | Author identities, public totals, points, facts, correct-guesser IDs | Own score breakdown |
| ROUND_SCOREBOARD | Rank rows, round gains | Own highlighted row |
| FINAL | Rankings, winner IDs, highlighted post | Own highlighted row |
| CLOSED | Reason, message | None |

WRITING assignment views never include opponent ID/name, promptId, distractors, correctOptionId, seed, future assignments, or future-round contents.

Privacy rules:
- Host has no access to unrevealed truth or player drafts, even if host operator is also a player.
- Other players see no drafts. Current final post text first appears at READ.
- Actual truth first appears publicly at ENDORSE. Guess options first appear at GUESS.
- Author identities first appear at RESULT. Anonymous avatars/headlines must be identical.
- Endorsement distributions first appear at RESULT; individual endorsement identities are never public.
- A player can see their own locked guess/endorsement. Wrong individual guesses are not publicly attributed.
- No tokens, PRNG seed, full prompt pack, raw server maps, hidden answer flags, or future duels on any public payload.

Implement projectHost(room) and projectPlayer(room,playerId) using explicit object construction. Never spread raw room/duel data then delete selected secrets. IDs in anonymous posts are A/B labels or unrelated opaque IDs, never author IDs. Test network JSON, not just visible DOM. All screens are driven by their actual projected DTO rather than routes guessing game state.

## 10. HTTP API

JSON request limit 8 KiB. All API responses Cache-Control:no-store. Errors have code, human-readable message, retryable boolean, optional fieldErrors and tracing requestId; no stack trace. Credentials returned only to the creating/joining caller.

### 10.1 Create

POST /api/rooms

~~~json
{
  "createRequestId": "UUID",
  "settings": {
    "roundCount": 2,
    "writingSeconds": 90,
    "guessSeconds": 20,
    "endorseSeconds": 20,
    "pack": "mixed"
  }
}
~~~

201 response:

~~~json
{
  "roomId": "UUID",
  "roomCode": "KPRT",
  "hostToken": "secret-base64url",
  "joinUrl": "https://your-configured-origin.example/join/KPRT",
  "bootId": "UUID"
}
~~~

Example origin is a placeholder. Build joinUrl from validated PUBLIC_ORIGIN, never arbitrary Host header. Browser persists host credential before navigation.

Generate and persist createRequestId before request. Cache exact response for two minutes in server memory as a short-lived idempotency response; same ID/same canonical body returns same room/credential, different body gives REQUEST_CONFLICT. Treat the unguessable requestId like a temporary secret, redact it in logs, remove cached response when room ends. Normal SessionRecord stores only token hashes; this short response cache is the explicit temporary exception. On a retry after cache expiry, do not automatically issue a new create without a new deliberate user action.

Errors: 400 BAD_INPUT, 429 RATE_LIMITED, 503 ROOM_CAPACITY.

### 10.2 Preview

GET /api/rooms/:code

200: {roomCode, state:'LOBBY'|'PLAYING'|'FINAL', playerCount, maxPlayers:8, canJoin}. No player names or secrets required. Count includes reserved seats. 404 ROOM_NOT_FOUND. Rate-limit code enumeration.

### 10.3 Join

POST /api/rooms/:code/players

Body: {joinRequestId:UUID, name:"Alex", avatarId:"coffee"}.

201: {roomId,roomCode,playerId,playerToken,bootId}. Same two-minute idempotency-response policy. Seat reservation happens atomically before success. Participant begins offline/unready until socket authenticates. If never connected after 60 seconds, remove reservation, revoke token and remove cached response. Retain a two-minute expired joinRequestId marker; a delayed retry gets REQUEST_EXPIRED rather than the old credential.

Reject lobby-overflow and duplicate names atomically. Errors: BAD_INPUT(400), ROOM_NOT_FOUND(404), ROOM_FULL/NAME_TAKEN/GAME_STARTED(409), RATE_LIMITED(429). FINAL accepts no new players until host returns to lobby.

### 10.4 Health and errors

GET /api/health => {ok:true,protocolVersion:1,bootId,version}. Respond healthy only after env/content validation. No room dumps.

~~~ts
interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string,string>;
  };
  requestId: string;
}
~~~

HTTP has no scoring/voting mutation endpoints. All game mutations below use authenticated sockets.

## 11. Socket contract and idempotency

### 11.1 Authenticate

One Socket.IO namespace at default /socket.io path. Handshake auth:

~~~ts
{
  protocolVersion: 1,
  roomCode: 'KPRT',
  role: 'host', // or 'player'
  token: 'saved-role-token',
  clientInstanceId: 'UUID-for-this-live-tab',
  takeover: false
}
~~~

Check token hash, role, revocation, room, protocol. Determine acting player from the token, not client-supplied playerId. Attach verified session, roomId and connectionGeneration to socket.data.

One active socket per session. Same live-tab instance may replace its disconnected/old transport. A different live instance needs explicit takeover:true if another socket is still active; otherwise SESSION_IN_USE. On takeover increment generation, mark old socket replaced, emit session:replaced and disconnect old socket. Old socket disconnect handler checks activeSocketId/generation before setting player offline. Old tab stops automatic reconnect until user presses Use this tab. Generate a clientInstanceId per page load and keep it during transport reconnects; a fast refresh may briefly need the explicit Reconnect here action if the old connection has not died yet.

Separate host/player localStorage keys permit the host operator to play in another tab. Host credentials never allow acting as a player. Route and token role must agree.

Target rooms may be named room:INTERNAL_ID:host and room:INTERNAL_ID:player:PLAYER_ID. Simpler MVP: iterate active sessions, individually project and emit. Never put private snapshots on a shared room-code broadcast. Socket.IO rooms are routing tools, not an authorization system. [Official rooms documentation](https://socket.io/docs/v4/rooms/)

### 11.2 Command envelope

One client transport event named command. Zod discriminated union on type; reject unknown fields.

~~~ts
interface CommandEnvelope<T> {
  requestId: string;
  phaseId: string;
  gameId: string | null;
  type: string;
  payload: T;
}
type Ack =
  | {ok:true; requestId:string; revision:number; serverNow:number; data?:unknown}
  | {ok:false; requestId:string; code:ErrorCode; message:string;
      retryable:boolean; fieldErrors?:Record<string,string>};
~~~

Use precise inferred unions in implementation; unknown above represents varying response data, not permission to omit schemas. Every logical action receives one requestId. Retries reuse it. A new user decision gets a new ID.

Client sendCommand: 3-second ack timeout, max two automatic retries, only while connected and phase relevant. Do not also configure another automatic retry layer. Do not emit gameplay events offline into Socket.IO's default send buffer; keep local drafts and wait for a new snapshot. Refresh loses transient JS promises, so reconcile locked state on reconnect before retrying.

Server order:
1. Confirm current authenticated generation, not revoked.
2. Enforce byte/rate limits; parse exact schema.
3. If same session/requestId in cache and canonical command hash matches, return stored ack without mutating. If mismatched hash, REQUEST_CONFLICT.
4. Advance overdue unpaused phase before processing new input.
5. Require current gameId and phaseId. Otherwise PHASE_CHANGED and send fresh snapshot. Room revision is not a global precondition: other players' input must not cause conflicts.
6. Check role, phase, pause, entity ownership, deadline, locks and payload validity.
7. Apply synchronous mutation and eligible transition; increment revision for transaction; cache ack; publish projected snapshots; acknowledge.

Serialize per room with a dispatch function. No await between validation and commit. Node cannot prevent races if handlers yield halfway through a check/write. Timers use the same dispatch route. No raw socket handler mutates scores directly.

### 11.3 Commands

| Type | Payload | Authorized role / phase | Effect |
|---|---|---|---|
| player.setReady | {ready:boolean} | Player / LOBBY | Own readiness |
| player.leave | {} | Player / LOBBY | Remove, revoke, disconnect |
| host.updateSettings | {settings:RoomSettings} | Host / LOBBY | Replace settings; clear readiness |
| host.removePlayer | {playerId} | Host / LOBBY | Revoke and remove selected player |
| host.startGame | {} | Host / LOBBY | Validate connected ready roster and pack; create game |
| host.skipRules | {} | Host / RULES after 5s active elapsed | Intro |
| writing.saveDraft | {assignmentId,text,expectedDraftRevision} | Owner / WRITING | Save draft and increment draftRevision |
| writing.lockPost | {assignmentId,text,expectedDraftRevision} | Owner / WRITING | Validate and atomically save+lock full text |
| duel.lockGuess | {duelId,optionId} | Reader / DUEL_GUESS | Lock own one guess |
| duel.lockEndorsement | {duelId,choice:'A'|'B'|'NEITHER'} | Reader / DUEL_ENDORSE | Lock own one endorsement |
| host.pause | {} | Host / active timed phase | Freeze remaining time |
| host.resume | {} | Host / paused timed phase | Resume with remaining duration |
| host.extendWriting | {seconds:30} | Host / unpaused WRITING once | Add exactly 30 seconds |
| host.returnToLobby | {} | Host / FINAL | Reset game and ready states; retain connected people |
| host.closeRoom | {} | Host / any live phase | End room and clean up |

Paused rooms reject writing/guessing/endorsement with GAME_PAUSED. Local writing remains possible. Host resume/close remain allowed. Host close with stale phase receives PHASE_CHANGED; UI refreshes and retries the confirmed intent with a new envelope rather than bypassing validation.

saveDraft accepts incomplete text (including empty) within byte/grapheme/line maxima; it is not a lock. Finalization checks minimum too. Owner can't edit after LOCKED/FORFEIT. A duplicate cached lock returns success, a fresh conflicting lock returns ALREADY_LOCKED. Reject endorsing a forfeited side with CHOICE_UNAVAILABLE. Writers cannot vote Neither or guess. Option ID must belong to current duel.

Autosave concurrency:
- One in-flight save per assignment; later typing replaces the queued next save.
- Ack includes draftRevision.
- Lock waits for outstanding save, discards obsolete queued autosave, then submits current full text with latest revision.
- Expected revision mismatch => REVISION_CONFLICT, private-state sync, retain local unsent text, retry only while assignment unsealed.
- Input stays editable during saves. Lock disables during its own flight.
- No delayed save can overwrite a locked post.

### 11.4 Other events

- state:request client → ack fresh role-filtered view; no mutation; rate limit.
- clock:ping client {clientSentAt} → ack {serverNow}; max once/10sec.
- room:state server → one complete HostView/PlayerView.
- room:closed server → {reason:'HOST_ENDED'|'EXPIRED',message}, then cleanup.
- session:replaced server → {message}, then old client stops reconnect.
- protocol:error server → malformed non-command event error only.

Snapshots, not incremental score events, drive the client. On connect always send full snapshot. On room mutation send full snapshot to relevant recipients. SaveDraft need only publish private writer view, although room revision still increases; others may skip revision numbers. Never require contiguous revisions. Optional five-second snapshot heartbeat for visible timers/state is okay, but it does not increment revision without a mutation.

Socket.IO guarantees ordering for delivered events but does not default to guaranteed arrival. Application-level acks, idempotency and fresh snapshots are required. [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

Leave connectionStateRecovery disabled in MVP so one explicit token-and-snapshot recovery mechanism is tested. If added later, keep fallback snapshots and do not skip revocation checks. [Server options](https://socket.io/docs/v4/server-options/)

### 11.5 Error code catalogue

| Code | Meaning / user behavior |
|---|---|
| BAD_INPUT | Show inline field error; preserve form |
| ROOM_NOT_FOUND / ROOM_ENDED | Clear stale room credential; join another |
| ROOM_FULL | Explain eight-player limit |
| GAME_STARTED | Wait for next lobby |
| NAME_TAKEN | Choose another name |
| UNAUTHORIZED / FORBIDDEN | Stop action; rejoin if credential invalid |
| PROTOCOL_MISMATCH | Reload deployed client |
| SESSION_IN_USE | Offer explicit takeover |
| SESSION_REPLACED | Stop reconnect, offer Use this tab |
| PHASE_CHANGED | Refresh view; do not blindly repeat expired vote |
| GAME_PAUSED | Preserve local text, wait |
| DEADLINE_PASSED | Close editor/action; show accepted final state |
| ALREADY_LOCKED | Show server's locked value |
| REVISION_CONFLICT | Reconcile draft while retaining unsent text |
| REQUEST_CONFLICT | Programming error: same ID different body; log without contents |
| REQUEST_EXPIRED | Bootstrap cache/reservation expired; deliberate retry with new ID |
| CHOICE_UNAVAILABLE | Forfeit/mismatched choice; refresh ballot |
| CONFIG_INVALID | Host pack/settings invalid |
| RATE_LIMITED | Back off per retryAfterMs |
| INTERNAL_ERROR | Friendly error + request ID; log server stack only |

## 12. Authoritative phase machine and time

### 12.1 Transition table

| Current | Exit trigger | Next |
|---|---|---|
| LOBBY | Valid host start | RULES (15s) |
| RULES | Timer or host skip after 5s | ROUND_INTRO (4s) |
| ROUND_INTRO | Timer | WRITING (configured time) |
| WRITING | Every 2N assignments locked, or deadline | First duel READ (12s), or RESULT(5s) if both absent |
| DUEL_READ | Timer | DUEL_GUESS (configured time) |
| DUEL_GUESS | All readers locked + >=5s, or deadline | DUEL_ENDORSE (configured time); reveal truth |
| DUEL_ENDORSE | All readers locked + >=8s, or deadline | DUEL_RESULT (10s); settle once |
| DUEL_RESULT | Timer, more duels | Next duel READ / empty RESULT |
| DUEL_RESULT | Last duel, more rounds | ROUND_SCOREBOARD (12s) |
| ROUND_SCOREBOARD | Timer | Next ROUND_INTRO (4s) |
| DUEL_RESULT | Last duel, last round | FINAL (untimed) |
| FINAL | Host rematch | LOBBY (untimed) |
| Any live phase | Host end / expiry | CLOSED then destruction |

ROUND_INTRO entry initializes round.scoreAtStart from current totals. Starting a game creates all private round schedules, but only the current round's own assignments are ever projected. Active roster is frozen. No joining, leaving, kicking, or replacing active players mid-game. Offline members keep their seats and may return. Rematch removes offline players, revokes their sessions, resets remaining scores/readiness, and reuses room code.

Pause is an overlay flag, not another phase. Every transition changes phaseId; pause/resume preserves phaseId so same-phase drafts remain meaningful. On resume all buttons wait for fresh snapshot. Extension also preserves phaseId.

### 12.2 Timers

Use one scheduled next-phase deadline per room and optional earliest-all-done check. Callback captures roomId, gameId and phaseId; stale callback does nothing. Clear old handles on phase exit, pause and room destruction.

At command receipt, compare monotonic time to authoritative monotonic deadline. If now >= deadline, finalize/advance before considering input. The request is now stale; do not accept based on client timestamp. At exact equality the deadline has passed. Cached prior successful retries may still return success before deadline check because they already happened.

If everyone locks before the minimum display period, schedule a check for that minimum, rather than waiting for full timeout. When paused, freeze both remaining phase duration and active-elapsed minimum-display time. Resuming must not accidentally satisfy minimum periods through paused wall time.

On extension add 30,000ms to remaining duration and reschedule. Only writing once per phase; no negative/arbitrary extension. On host disconnection, immediately pause active timed phase at remaining max(0, deadline-now). If already paused preserve the previous remaining time; do not double-subtract. On host reconnect stay paused until Resume.

Client countdown: estimate server offset from ping midpoint; prefer lowest RTT sample from three connection pings spaced briefly, then sample every 15 seconds and on tab visibility. remaining=max(0,deadlineAt-(Date.now()+offset)); display ceil(remaining/1000), locally refresh 250ms. Frozen pause uses remainingMs. Client timer zero changes status to “Finishing…” and disables relevant input but never advances phase itself. Server correctness is unaffected by client's system clock.

### 12.3 Settlement pseudocode

~~~ts
function settleDuel(room: Room, duel: Duel): DuelResult {
  if (duel.settled) return assertPresent(duel.result);
  const multiplier = room.game!.rounds[duel.roundIndex]!.multiplier;
  const counts = countAcceptedEndorsements(duel.endorsements);
  const V = counts.A + counts.B + counts.NEITHER;
  const deltas = zeroForEveryRosterPlayer(room.game!.rosterIds);
  for (const side of ['A', 'B'] as const) {
    const assignment = getAssignment(room, duel.assignmentBySide[side]);
    if (assignment.status !== 'FORFEIT' && V > 0) {
      deltas[duel.writerBySide[side]]! +=
        Math.floor(1000 * multiplier * counts[side] / V);
    }
  }
  for (const readerId of duel.readerIds) {
    if (duel.guesses.get(readerId) === duel.correctOptionId) {
      deltas[readerId]! += 250 * multiplier;
    }
  }
  // Apply once inside the same non-yielding room transaction.
  for (const playerId of room.game!.rosterIds) {
    getPlayer(room, playerId).score += deltas[playerId]!;
  }
  duel.result = buildImmutableResult(room, duel, counts, deltas);
  duel.settled = true;
  return duel.result;
}
~~~

Implement guards without unnecessary non-null assertions where practical. Both-forfeit duel has no accepted guesses/votes because those phases were skipped. If internal corruption would create them, fail a test/assert rather than silently awarding impossible points.

### 12.4 Early completion and offline people

All-done denominator is frozen readerIds or 2N writing assignments, not currently connected sockets. Offline participants can stall early completion only until the normal deadline. If all readers are offline, run normal countdown, award no endorsement points and allow reconnection. Do not grant a writer a free win. Host may pause while people reconnect. Host alone disconnecting does not remove player sessions.

## 13. Frontend state, drafts, and recovery

### 13.1 Store boundary

Zustand contains connection status, latest valid snapshot, confirmed active credentials reference, server clock offset, last handled phaseId. Component state contains unsent text, selected-but-unlocked choice, modal state, task tab, expanded facts. Only server view contains authoritative score/phase/submissions.

On snapshot:
1. Verify protocol/role and schema.
2. If same roomId/bootId, ignore revisions lower than the stored revision. Equal revision may update time/connection metadata; never replay animations.
3. New roomId/bootId triggers session revalidation, not silent carry-over.
4. Replace authoritative view as one unit. Do not merge absent secret fields from a prior phase into a new one.
5. Reconcile own draft/locked states and pending acknowledgments.
6. On phaseId change focus new heading and clear obsolete local ballot selections.
7. Derive one screen from discriminated union.

Socket object is a singleton per mounted room connection, not recreated on keystrokes. Bind named handlers in an effect; remove precisely those handlers on cleanup. React StrictMode double effects must not duplicate commands/listeners. Do not disconnect a global socket from an unrelated component cleanup.

### 13.2 Storage

Local keys:
- larpbox:host:ROOM_ID -> roomCode, token, createdAt.
- larpbox:player:ROOM_ID -> roomCode, playerId, token, name, createdAt.
- larpbox:roomIndex:CODE -> roomId; no secret.
- larpbox:draft:GAME_ID:ASSIGNMENT_ID -> text, lastAckRevision, updatedAt, pendingLockRequest if applicable.
- larpbox:prefs -> sound/reduced-motion; harmless preferences.
- sessionStorage lastPlayedPhaseId for audio.

Wrap storage calls for private-mode/quota failures. If persistent storage unavailable, use memory and explain “Keep this tab open to stay connected.” Credentials are scoped capabilities for a private game, not permanent accounts. XSS prevention is essential because they are in browser storage.

On reconnect, wait for snapshot before autosaving:
- If server locked/forfeited, server wins; retain local text only as a recoverable copy if different, never replace result.
- If same active writing assignment and server unsealed, prefer newer unsent local draft but rebase on current server revision; show restored-draft indicator.
- No server acknowledgment ever received and local text exists: restore it while writing remains open.
- Phase changed: do not replay write commands; remove active edit controls.
- Pending lock with server already locked to same text: treat success even if Ack lost.
- Pending guess/endorsement: authoritative own locked value confirms it; never create an alternate after reconnect.

Clear room credentials and related drafts after explicit leave, kick, or known room close. Expire abandoned local entries after 24 hours on next load. Do not clear host and player credentials for unrelated rooms.

### 13.3 Reconnection flow diagram

~~~mermaid
sequenceDiagram
  participant P as Phone
  participant S as Server
  P->>S: writing.lockPost(requestId=R, text, revision)
  S->>S: Validate, save, lock, cache Ack
  Note over P,S: Connection drops before acknowledgment
  P->>S: Reconnect with same player token
  S->>P: Fresh PlayerView: assignment LOCKED
  P->>P: Resolve pending lock; show locked post
  Note over P,S: No duplicate submission or points
~~~

## 14. Security, validation, and practical limits

This is a private party game, not a public social network. Implement ordinary protections that directly preserve gameplay:

- Express JSON limit 8 KiB; Socket.IO maxHttpBufferSize 16 KiB; command text raw cap 4,096 UTF-8 bytes.
- Zod strict objects on all HTTP/socket input, enum validation, UUID validation, and actual ownership checks. TypeScript types alone do not validate network data. Use safeParse to return structured input errors. [Zod basics](https://zod.dev/basics)
- Display user strings as React text. No dangerouslySetInnerHTML, user Markdown/HTML rendering, executable links, or uploaded images.
- NFC normalization, line-ending normalization and control-character handling shared across client/server. Remove zero-width/bidi override controls from names and posts except valid joining code points needed by emoji/languages; explicitly reject U+202A–U+202E and U+2066–U+2069 directional controls. Keep newline only where writing allows it.
- Recount graphemes on server. Browser support for Intl.Segmenter must be feature-detected; if missing, load a segmentation polyfill rather than reverting to UTF-16 length. The same input must pass/fail identically on phone and server.
- Origins: allow only configured PUBLIC_ORIGIN and explicit dev origin allowlist. Check websocket Origin using allowRequest as well as HTTP/CORS checks; CORS alone is not websocket authentication. Non-browser test clients still require valid token. Production reject browser-origin mismatches.
- Content Security Policy: default-src self; script-src self; style-src self plus required inline styles for calculated presentation; font-src self; img-src self data:; connect-src self and needed same-origin websocket; frame-ancestors none; object-src none. Set Vite-dev exceptions only in development. Do not enable unsafe-eval in production.
- A reasonable Helmet setup is allowed; verify it does not break fonts, SVG QR, or sockets.
- Do not log tokens, auth headers, raw post text, guesses, ballots, request-idempotency secrets, full commands, or snapshots. Log action type, internal room ID, duration, error code and nonsecret trace ID.
- Host can remove people in lobby and end an active room. MVP does not add risky mid-game roster edits. Private-room participants can write mild profanity; technical sanitation must not pretend to be a semantic moderation service.
- Avoid collecting email, location, camera, microphone, LinkedIn credentials or other unrelated data. The game needs none of them.

Suggested token-bucket limits:
- Create: 20 requests/hour/IP, burst 5; intentional high shared-NAT tolerance for the event.
- Join: 120 requests/min/IP, burst 20, plus maximum 8 reservations/room.
- Preview: 120/min/IP.
- Auth attempts: 60/min/IP.
- Authenticated commands: 30/sec/session, burst 40.
- Draft saves: client debounce 400ms; server 5/sec/assignment, burst 10.
- state:request: 2/sec/session; clock pings normally <=1/10sec.
- Capacity: 100 rooms, 900 active authenticated sockets maximum, configurable.

Do not trust arbitrary X-Forwarded-For. Default trust proxy false; enable a documented exact known proxy hop/subnet for the deployment. Clean token buckets with TTLs. If limits reject a valid party, show retry timing; don't turn users into a permanent blocklist.

## 15. Production build and deployment

### 15.1 One process, one origin

Use a long-running container/Node host supporting WebSockets. One instance/replica, no autoscaling, no serverless request execution. Keep it awake for the demonstration. This is a property requirement; no paid platform selection or deployment is authorized by this document alone.

Production request order:
1. /api routes.
2. /api unmatched -> JSON 404.
3. Socket.IO attaches to the same HTTP server at /socket.io.
4. Static hashed web assets from an absolute apps/web/dist location.
5. For browser HTML navigation only, recognized SPA routes serve index.html.
6. Unknown file/asset URLs -> 404, never index.html disguised as JS.

Express 5 route matching differs from older examples. Avoid a bare app.get('*') copied from Express 4. Use a tested named wildcard or final middleware conditioned on GET/HTML and known SPA paths. Resolve static paths relative to the built module/repository root, not process cwd assumptions. [Express static files](https://expressjs.com/en/starter/static-files/), [Express 5 migration](https://expressjs.com/en/guide/migrating-5/)

Cache hashed assets immutable; index.html no-cache; API no-store. Public HTTPS origin terminates TLS at hosting proxy and upgrades /socket.io connections. Proxy idle timeout must exceed heartbeat interval/timeout. Retain default polling fallback plus websocket upgrade; don't break fallback by missing proxy routes.

Socket.IO configuration: path default; serveClient false because bundle includes client; maxHttpBufferSize 16 KiB; explicit origin checks; heartbeat pingInterval 25 seconds / pingTimeout 20 seconds or documented defaults equivalent. Actual offline detection may take heartbeat timeout; once server knows host disconnected, pause immediately.

### 15.2 Environment

~~~dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=3001
PUBLIC_ORIGIN=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
MAX_ROOMS=100
ROOM_MAX_AGE_MS=21600000
ROOM_IDLE_MS=1800000
ROOM_ABANDONED_MS=600000
LOG_LEVEL=info
ENABLE_DEVTOOLS=false
~~~

Set PUBLIC_ORIGIN and allowed origins to the laptop LAN URL for real phone tests. Production: NODE_ENV=production, PORT from platform (fallback 3001), PUBLIC_ORIGIN=https://actual-domain, ALLOWED_ORIGINS matching it, ENABLE_DEVTOOLS=false. No API keys are required. Parse env through Zod and fail boot clearly for invalid URLs, negative values, or production devtools.

Commit .env.example, never .env. Validate config at startup, load/validate content, instantiate store/engine, create HTTP server+Socket.IO, install routes and cleanup jobs, then listen.

### 15.3 Container and build acceptance

Provide a multi-stage Dockerfile:
- Build image Node 24 slim.
- Copy root/workspace package manifests and lockfile, run npm ci.
- Copy source, run npm run build.
- Runtime image Node 24 slim, non-root node user.
- Copy required root/workspace package manifests and production dependencies (npm ci --omit=dev in runtime/dependency stage), shared dist, server dist, web dist.
- Ensure bundled server prompt JSON is present in server output.
- EXPOSE configured default port 3001; start node apps/server/dist/index.js.
- .dockerignore excludes node_modules, .git, local env, test screenshots, logs and caches.
- No source-mounted development server in production.
- On SIGTERM/SIGINT, stop accepting new rooms, emit ended-room notice, close sockets/server, clear timers, then exit. No fake promise of persisted game recovery.

Test built production locally before delivery, including direct refresh of /host/CODE and /play/CODE. If Docker isn't available, report that and still run npm build/start. Do not claim unrun container verification.

### 15.4 Load and observability

Target a tested single-process capacity of at least 10 simultaneous rooms with 8 players each, not an unverified scaling claim. Measure a synthetic 80-player/10-host run locally; record actual machine and results. Performance goals for that test: ordinary command ack p95 <250ms on local network/server; no invalid scores; no leaking snapshots between rooms; no room timers retained after cleanup. These are acceptance goals, not promises about venue internet.

Structured logs: room.created, player.joined, phase.changed, session.reconnected, room.closed, command.rejected. Include nonsecret room ID, counts, phase, error code; exclude authored contents. Public health has no room list. Optional aggregate process metrics may be logged locally, not exposed unauthenticated.

## 16. Implementation sequence for Claude Code

Work in this order. Finish the functional loop before polishing a landing page. Maintain IMPLEMENTATION_STATUS.md with completed steps, actual commands run, failing tests, deviations and remaining work.

### Milestone 1 — scaffold and contracts
1. Initialize npm workspaces, pinned major dependencies, TS configs, formatting/linting, .env.example.
2. Add shared constants, text normalization, settings/input schemas, Phase union, public DTOs and event types.
3. Copy companion prompt JSON into server content; validate on boot.
4. Build a minimal health route and Vite proxy.
5. Verify shared package imports work in browser and Node production bundles.

Done when install/typecheck/build succeed, health responds, and a phone can load the web app via LAN origin.

### Milestone 2 — pure domain engine
1. Implement injectable clock, seeded random scheduler, room store, phase transitions, prompt selection.
2. Implement writing states, immutable guesses/endorsements, scoring and rematch cleanup.
3. Implement host/player projection functions before network transport.
4. Write tests covering every player count, deadline boundaries, double settlement, missing posts and secrecy.
5. Add development scenario fixtures isolated from real rooms.

Done when complete games can execute in unit tests with deterministic results and no transport dependencies.

### Milestone 3 — actual multiplayer
1. HTTP create/preview/join with identity, collision handling, idempotency and limits.
2. Socket authentication, single-active-session handling, command dispatch, per-recipient publish.
3. Server timers and host-disconnect pause.
4. Bare but functional host and phone phase renderers.
5. Complete a real 3-player game and 5-player game across separate browser contexts.

Done when one host and real independent controllers complete both rounds with consistent totals.

### Milestone 4 — phone writing and recovery
1. Fully implement two-tab composer, counts, constraints, autosave, lock, server deadline finalization.
2. Implement join persistence, draft restoration, ack reconciliation and duplicate-tab behavior.
3. Implement guesses and endorsements with explicit lock.
4. Disconnect/reconnect one writer, one reader and host during their active phases.
5. Test ack-loss/retry effect semantics via integration tests.

Done when refresh/network drops preserve the correct state and no duplicate scores appear.

### Milestone 5 — full visual design
1. Build tokens, fonts, original avatars, reusable components.
2. Implement every route/screen specified in section 4.
3. Make posts readable on TV, controllers usable with keyboard open, QR links real.
4. Add motion, muteable host sounds, reduced-motion handling.
5. Perform screenshot review at all required sizes.

Done when visual criteria and accessibility checks pass, not just when cards exist.

### Milestone 6 — production and handoff
1. Complete e2e matrix and multi-room test.
2. Build and smoke-test production server with static client.
3. Add Dockerfile and operational README.
4. Document restart behavior and venue connectivity instructions.
5. Provide honest final status, tested commands, screenshots and remaining limitations.

Do not auto-publish a website or acquire a domain merely because deployment is described. Complete code/build verification first; actual hosting action follows the user's deployment authorization.

## 17. Required automated tests

### 17.1 Unit tests — meaningful rules

**Scheduling/content**
- N=3,4,5,6,7,8, both modes: N duels each round, two assignments/player, no self-duels, two distinct writers, reader count N-2.
- Same seed reproduces assignment/order/option arrangement; different seeds can change them.
- Correct option appears exactly once; IDs opaque; every actual prompt unique within game.
- Round-2 pairing candidate chosen by lowest overlap; N=3 repeats expected, not failure.
- Pack category has enough content; insufficient pack blocks start.
- Rematch prompt exhaustion resets between games, never midway through one.

**Text**
- Minimum and maximum with emoji, combining accents, CRLF, blank lines and long unbroken strings.
- Name uniqueness after normalization; 2/16-grapheme boundaries.
- HTML payload renders as text; code/control characters rejected as specified.
- Autosave can retain short draft but timeout only submits valid draft.

**Scoring**
- 2 A / 1 B =>666/333; round2=>1333/666.
- 1 A / 1 B / 1 Neither=>333/333; round2=>666/666.
- All Neither=>0 writers; correct readers still paid.
- No ballots=>0 writers.
- Tied positive votes=>co-endorsed, no bonus.
- One/both forfeits; no vote for absent side.
- Writer guess/vote rejected, even if forged.
- settle called twice returns identical result and unchanged totals.
- Shared final ranks and winner labels; no arbitrary tie-break.

**Timers/transition**
- Action at deadline minus 1ms accepted; at equality rejected/phase advanced.
- Early completion minimum time enforced even if all submit instantly.
- Early check fires at minimum when everyone already locked.
- Pausing freezes deadline AND minimum-display elapsed time.
- Writing extension once only, exactly 30s.
- Old callback after phase/room change is ignored.
- Host disconnect pause; reconnect doesn't unpause automatically.
- Expiry deletes timers, sessions, idempotency cache.
- Server wall-clock jump does not change monotonic remaining time.

**Secrecy**
- Host writing view lacks all truths/drafts.
- Player writing view contains only own two truths.
- READ excludes options, correctOptionId, writer IDs.
- GUESS lacks correct marker/truth field and identities.
- ENDORSE reveals facts but not identities/vote distribution.
- RESULT exposes only intended totals, never individual ballots/tokens/seed.
- Serialization of all DTOs contains no full prompt pack, raw private maps or token hashes.
- Frontend output contains no server prompt pack import.

### 17.2 Integration tests with real Socket.IO clients

Start service in-process with injected clock and ephemeral port. Connect one host and multiple actual socket.io-client instances. Verify:
- Duplicate HTTP create/join returns same reservation; collision/name/full-room race handled.
- Invalid role/token/room denied; expired/revoked sessions denied.
- Same request same effect once; changed body same ID rejected.
- Socket disconnect after mutation before ack; reconnect and retry preserves one effect.
- Draft revision conflict, stale autosave after lock, deadline race.
- No other room receives events or data.
- Different-tab takeover invalidates old socket without old disconnect marking new one offline.
- Host credential cannot submit player commands, player credential cannot pause/end.
- Late join rejected; lobby remove revokes; rematch drops disconnected participants correctly.
- Authenticated unknown IDs/options rejected.
- Message-size and rate-limit failure returns useful error without crashing.

### 17.3 Playwright multi-browser tests

Use separate browser contexts for host and each player, not a single shared localStorage. Playwright webServer starts app and waits for health. [Official webServer configuration](https://playwright.dev/docs/test-webserver)

Mandatory scenarios:
1. 3-player full Standard game: host setup, names/avatars, readiness, both writing tasks each round, guesses, endorsements, result totals, final, rematch.
2. 5-player full Quick game: odd player count fairness, 10 submissions, 5 duels, no one omitted.
3. 8-player game: all seats visible, full-room ninth join error, correct layout, 16 assignments per round.
4. Phone reload while drafting restores text; post lock state survives reload.
5. Reader reconnect before vote deadline can act; after deadline cannot.
6. Host offline during writing freezes all timers; returns paused; Resume continues.
7. 280-grapheme posts/emoji/long name/forfeit screens fit and remain readable.
8. All Neither, no votes, double forfeit and final all-zero tie.
9. Direct URL reload on built production server works.
10. Screenshot assertions for host 1920x1080 and 1280x720, controller 390x844 and 360x640, plus large text/reduced motion.

Use fake-clock engine tests for exhaustive timing. E2E may set GAME_TIME_SCALE=0.2 only when NODE_ENV=test and host binds loopback; multiply every timed phase/minimum/extension by the same scale. Production must reject this variable if it is not 1. Test UI deadlines reflect actual scaled server time; public lobby duration estimates need not change outside tests. Default app has no timer-skip HTTP endpoint. For E2E, fill players in parallel to finish the 18-second scaled writing phase, or use unscaled writing for the few slow typing tests. No unconditional production debug endpoints or secrets allowing public phase manipulation.

### 17.4 Visual acceptance checklist

- White/cream/cobalt/yellow design matches tokens; no generic gradient dashboard.
- Anonymous A/B cards same geometry and metadata; neither has identifying information.
- Both long posts readable without clipping at 1280x720.
- No primary phone action obscured by keyboard or safe-area inset.
- QR scanned by a real separate phone to correct origin/room.
- Controls don't shift position on validation errors.
- Waiting states explain next action.
- Screens can be understood without sound.
- Reduced motion has no moving confetti/marquee.
- Screenshot review performed by a human or image-capable agent, not merely file existence checks.
- Empty/loading/error/disconnected/paused/full-room/session-replaced states styled, not browser alerts.

## 18. Local developer tools and demonstration

### 18.1 Tools

Development-only scenario gallery renders fixture DTOs for every screen, including worst-case posts, forfeit, tie, offline and pause. It must be visually marked **LOCAL PREVIEW — NOT A LIVE GAME**. Import fixtures only when build mode is development and ENABLE_DEVTOOLS is explicit; exclude route and data in production bundle. No fixture-generated bots inside a room presented as real people.

An integration harness may create a host and scripted controllers for testing via the same public HTTP/socket API. Keep it in tests/work tooling, not a public create-bots endpoint. Prompts remain real server content. Do not disable authentication/eligibility for the normal game to make the harness work.

### 18.2 Hackathon demonstration

Show the actual product rather than a slideshow:
1. Put host lobby on projector; scan the QR with three real phones.
2. Use Quick mode and 90-second writing, or prejoin before the pitch.
3. Explain: “You all know somebody who writes LinkedIn posts about making breakfast. Tonight we're competing to be that person.”
4. Show one phone receiving a mundane event privately.
5. Let everyone write two posts; show host's locked-count progress.
6. Present one duel; audience can read while actual readers guess on phones.
7. Reveal the truth, then let readers endorse.
8. Show author reveal and score.
9. Explain remaining duels continue automatically.

If a timed stage demo needs prewritten entries, use an explicitly labelled demo recording or clearly disclosed fixture preview, not fake live users. Do not let a special demonstration path replace real gameplay testing.

## 19. Definition of done

The build is complete only when all are true:

- [ ] A host creates a room and 3–8 independent phones can join with code/QR.
- [ ] One or two configured rounds run from lobby through final results.
- [ ] Every player writes twice per round, including odd counts.
- [ ] Both competitors get exactly the same private facts.
- [ ] Readers guess before truth, endorse after truth, author reveal after endorsement.
- [ ] Correctness and point allocation exactly match specification.
- [ ] No secrets are shipped early to host/other phones or bundled content.
- [ ] Missing posts, missing votes, ties and reconnects resolve without deadlock.
- [ ] Host disconnect/pause protects remaining time.
- [ ] Draft autosave/lock behavior survives refresh and ack loss.
- [ ] Duplicate commands cannot duplicate points or overwrite locked work.
- [ ] All specified screens and error states are responsive and accessible.
- [ ] Real phone LAN/public-origin test performed; QR uses reachable address.
- [ ] Unit/integration/E2E tests passed; screenshots actually inspected.
- [ ] Production build serves frontend/API/socket on one origin; refresh routes work.
- [ ] README covers setup, scripts, env, phone joining, deployment, known restart loss.
- [ ] IMPLEMENTATION_STATUS lists actual verification and any deviations.
- [ ] No API key, external AI judge, user account, LinkedIn integration, or paid asset required.

## 20. Important non-goals and later possibilities

Do not expand scope before satisfying section 19. Later versions could add audience voting, custom prompt packs, share-card downloads, a durable history, or a “guess the original event” free-text mode. Any audience mode must keep player eligibility/scoring separate so 100 spectators do not multiply points. Custom prompts need moderation and secrecy rules. Free-text guesses need accepted-answer judging rules; the current four-option flow deliberately avoids those ambiguities.

Do not implement “AI makes the funny posts for you.” Writing the post is the player's game.

## 21. Implementation source references

These references informed technology choices; the game rules and designs are original product decisions in this document. Consult the official docs when coding APIs rather than assuming illustrative snippets are a complete application.

- [React versions](https://react.dev/versions) — select compatible React packages.
- [Vite 7 guide](https://v7.vite.dev/guide/) — the selected build-tool major.
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite) — v4 plugin setup.
- [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html) — compiler safety options.
- [Node releases](https://nodejs.org/en/about/previous-releases) — supported LTS runtime.
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) — why acks/idempotency/snapshots exist.
- [Socket.IO rooms](https://socket.io/docs/v4/rooms/) — targeted socket delivery.
- [Socket.IO server options](https://socket.io/docs/v4/server-options/) — limits/auth/recovery configuration.
- [Express static files](https://expressjs.com/en/starter/static-files/) and [Express 5 migration](https://expressjs.com/en/guide/migrating-5/) — single-service SPA serving.
- [Zod basics](https://zod.dev/basics) — runtime validation.
- [Playwright webServer](https://playwright.dev/docs/test-webserver) — automated multi-browser testing.

## 22. Instruction to the implementing coding agent

Read this entire document and the companion prompt JSON before editing application code. Build the real project using the milestone order. Make ordinary implementation decisions within the stated constraints; do not ask the user to re-decide specified rules. If a genuine contradiction or missing requirement blocks progress, record it, choose the smallest coherent implementation where safe, and explain it in the handoff.

Write code, run it, test it, inspect the UI, and fix failures. Do not stop after architecture, scaffolding, static mockups, or a fake local-only game. Do not claim tests passed unless you ran them. Do not invent API keys, deployed domains, real users, or vendor capabilities. Finish with how to run the game, what was verified, and any actual remaining limitation.
