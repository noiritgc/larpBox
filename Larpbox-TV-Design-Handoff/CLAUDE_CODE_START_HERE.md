# Larpbox TV — handoff to Claude Code

Put these three files at the root of the repository where you want the game built:

1. LARPBOX_TV_BUILD_SPEC.md
2. larpbox-prompts.json
3. CLAUDE_CODE_START_HERE.md

Open Claude Code in that repository and paste the instruction below. Select the model you want through your normal Claude Code controls; the specification does not depend on an assumed model ID.

---

Build **Larpbox TV**, a complete multiplayer browser party game, using LARPBOX_TV_BUILD_SPEC.md as the implementation contract and larpbox-prompts.json as the initial server-only content pack.

Read the entire specification before implementing. The game is competitive professional humblebragging: two players privately receive the same mundane event and write inflated announcements; other players guess the event, see the truth, and endorse the funniest technically truthful post. One shared host display and 3–8 phone controllers play together in real time.

Implement the whole functioning game—not just a plan, landing page, visual prototype, chatbot, or single-browser simulation. Follow the specified React/Vite/TypeScript/Express/Socket.IO architecture, phase machine, fair assignment scheduling, exact scoring, private state projections, UI layouts, visual tokens, draft autosave, reconnect behavior, and tests. No AI API, account system, LinkedIn integration, or database is required for this version.

Use the milestone order in the specification. Create IMPLEMENTATION_STATUS.md and keep it current. Make ordinary implementation choices yourself when the document already supplies the intended behavior. If the existing repository has code, inspect it first and preserve unrelated work. Do not overwrite unrelated files or initialize a second project inside an existing app without reason.

Copy the prompt file to the server content directory. Its root object is { schemaVersion, packId, prompts }; validate and load the prompts array. Do not bundle it into the web client.

Verify the real product with engine tests, actual Socket.IO clients, separate Playwright browser contexts, a production build, and visual inspection of both phone and TV layouts. Test all player counts 3–8, missed deadlines, forfeits, ties, duplicate commands, lost acknowledgments, phone refresh, host disconnection, and information secrecy. Fix failures before stopping.

The deliverable includes working application code, exact dependency lockfile, scripts, .env.example, Dockerfile, tests, and a clear README. Do not automatically publish, purchase a domain, or claim a deployment you have not performed. If a check cannot run, report precisely why and distinguish it from passing checks.

At the end, report:
- How to install, run, and join from real phones.
- What you implemented.
- The commands and tests actually run.
- Any remaining limitations or documented deviations.

Start with the repository inspection and implementation now.

---

## What is in this handoff

- **Build spec:** product rules, complete screen designs, tokens and interaction copy, architecture, API/events, data models, deadlines, secrecy, reconnects, deployment and acceptance criteria.
- **Prompt pack:** 32 original mundane events; each has fixed facts, anti-fabrication boundaries and three plausible guess alternatives. There are 16 Everyday and 16 Campus & Work events.
- **This file:** an implementation prompt, not application code.

## Deliberate scope choices

Players write and judge; an AI model does not generate or score their posts. In-memory rooms recover from browser disconnects while the server is alive, but disappear on server restart. The host display is separate from a scoring phone controller. Default play is two rounds, with two posts per player per round. Truth is revealed before endorsement so voters can judge whether posts invented achievements.

These files are a design and implementation handoff. They are not a claim that the game has already been coded or tested.
