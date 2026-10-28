# AGENTS.md — handover for humans and coding agents

## Ground rules

- **Play chips only.** Never add real-money, deposit, cash-out, prize or ad features.
- **Server-authoritative.** Clients send intents; all rules, dealing, timers and payouts live in the
  Durable Object. Never trust a client-sent card, total, chip value or seat.
- **Hidden information never leaves the server.** Any new field in a snapshot must be checked against
  `view()` for *every* viewer (owner, other players, spectators). The deck, the seed (before reveal) and
  other players' cards must never be serialised to a socket.
- **No build step, no frameworks, no runtime npm dependencies** in `public/` or `src/`.

## Layout

```
src/worker.js              HTTP API + WS routing (only /api/* and /ws/* run the worker first)
src/table/TableDO.js       per-table actor: queue, storage, sockets, alarm, rate limit
src/table/core.js          plain-data table logic (seats, ledger, hands, timers, snapshots)
src/table/HostDO.js        per-host table limit (5)
src/table/lobby.js         LobbyDO: public tables for “random table” (code/game/seats/taken/online only)
src/games/<game>/engine.js game engine (common interface — see README)
src/lib/protocol.js        message whitelist, validation, nick cleaning, token bucket
public/js/domain/          pure rules shared with the client (cards, shuffle, xidach, tienlen, holdem, fengshui)
public/js/App.js           state, router, render loop, actions, socket handling
public/js/views/           (app) => HTML string; game views registered in views/games.js GAME_VIEWS
public/js/learn/           courses: lessons + exam generators per game (pure), certificate canvas
public/js/ui/, lib/        cards, ring, accent picker, esc, i18n, qr, csv, motion, store
scripts/local-server.mjs   offline server running the real DO classes on Node 22
tests/unit|security|ui     node:test unit + protocol tests, Playwright UI tests
```

## Conventions

- Views return strings; **every** user-controlled value goes through `esc()` (nicknames, codes, labels).
- Events: `data-act="name"` → `actions.name(dataset, event)`; forms use `data-submit`; inputs that must
  survive re-renders get an `id` and `data-keep`.
- One-shot animations use `oneShot(key, cls, ms)` (negative `animation-delay`) so re-rendering does not
  restart them. Keys for a hand start with `h` and are cleared on leaving the table.
- Colours come from CSS variables; accents are `[data-accent]` on `<html>` with a dark and a light tone each.
- New labels go into both `vi` and `en` in `public/js/lib/i18n.js`. Error codes map to `err_<code>`.
- New message types: add to `CLIENT_MESSAGES` (with allowed fields), validate in the engine/core,
  add a security test.
- New game: implement the engine interface, register in `src/games/index.js`, add a view module to
  `GAME_VIEWS`, pure rules in `public/js/domain/<game>.js`, rules table in README.

## How to verify

```bash
npm run check          # node --check + relative imports resolve
npm test               # unit tests (rules, shuffle chi-square, protocol, table core flows)
npm run test:smoke     # boots local server, plays a hand over real WebSockets
npm run test:security  # leaks, out-of-turn, bad amounts, impersonation, rate limit, origin, proto, size
npm run test:ui        # Playwright: full hand with bots, one-screen fit (4 sizes), reconnect mid-hand
```

Without network access to npm, Playwright can run from a global install:
`PW_CHROMIUM_PATH=/path/to/chrome node <global>/playwright/cli.js test` (with a local
`node_modules/@playwright/test` shim that re-exports `playwright/test`).

Test helpers (`tests/helpers.mjs`): `client.exchange(msg)` sends `msg` followed by a `ping` and waits for
the `pong` — because the table processes messages in order, every reply to `msg` is in that window.
The helper throttles itself under the server's token bucket. `server.advance(ms)` moves the clock and
fires due alarms (in-process only).

## UI rule

No page scrolling: the table, home, settings sheet, rules sheet and learn guide must fit the viewport
(360×640 up to 2560×1400). Long content goes into tabs inside a sheet, not a scrolling page.
Below 1024px the home page shows one `[data-mtab]` section at a time (play / recent / learn), switched by
the fixed `.bottom-bar`; at 1024px+ all sections are visible (learn menu in the right column).

## Security model

See the table in README → *Security model*. Key invariants with tests:

1. Other players' cards appear in a viewer's snapshot only after that hand is settled or the hand is over
   (Xì dách dealer cards only after the dealer has checked someone; Tiến lên hands only at the end).
   Tiến lên's "must include 3♠" hint is sent to the leader only. Hold'em hole cards: owner only, live hands
   at showdown / all-in run-out; a fold-out winner never shows.
2. A pid can't be chosen by the client (`hello` accepts only `secret` + `nick`); host powers need the host
   secret.
3. Unknown types/fields, prototype keys, non-integer/negative/overflow amounts, oversized frames and
   wrong origins are rejected.

## Status / next steps

- Step 1 (lobby + table actor + Xì dách): done.
- Step 2 (Tiến lên miền Nam: combos, chặt heo toggles, tới trắng, scoring table): done.
- Step 3 (Texas Hold'em: 7-card evaluator, side pots, odd chip, short all-in rule, run-out, beginner guide): done.
- Courses for every game with generated exams and PNG certificates: done (tests/unit/courses, tests/ui/learn).
- Random table for public tables (host opt-in, LobbyDO): done.
- Learn menu: desktop right column + table sidebar tab, mobile bottom bar (tests/ui/nav): done.
- Commit `package-lock.json` once dependencies are installed with network access, then switch CI to `npm ci`.
