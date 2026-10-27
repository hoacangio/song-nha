# Sòng Nhà

Realtime card games with friends in the browser — **play chips only** (no real money, no deposits,
no cash-out, no prizes, no ads). Create a private table, share the link or QR code, play.

| Game | Status | Seats |
| --- | --- | --- |
| Xì dách (Vietnamese blackjack) | ✅ playable | 2–8 |
| Tiến lên miền Nam | ✅ playable | 2–4 |
| Texas Hold'em (No-Limit) | ⏳ next | 2–9 |

## Features

- Private tables with codes like `SEN-123`, invite dialog with QR code (dependency-free encoder) and full screen.
- Bots for empty seats (host adds/removes them) — handy for testing and for two-person games.
- Server-authoritative rules, dealing, timers and payouts; per-player views (no one ever receives
  another player's hidden cards); commit–reveal fairness proof for every hand.
- Turn timer (host-configurable, default 30 s) with auto-stand/auto-play; reconnect with backoff and a
  60 s seat hold.
- Session leaderboard (chip change vs. buy-in), host top-up ("rebuy"), hand history with CSV export
  (formula-safe).
- Mobile-first: the table fits one screen without scrolling on 390×844, 375×667, 360×640 and desktop.
  Sidebar on ≥1024 px, drawer below.
- Dark theme by default, light theme option, six warm accent colours; Vietnamese/English.
- App-like motion (deal, flip, chip, result pop) that survives re-renders; honours `prefers-reduced-motion`.
  Haptics on your turn; sounds off by default.
- PWA (manifest, network-first service worker, install prompt), strict CSP.

## Architecture

```
Browser (vanilla ES modules, no build)            Cloudflare
┌──────────────────────────────┐   /api/*   ┌──────────────┐   ┌───────────────────────┐
│ App.js  views/  ui/  lib/    │ ─────────▶ │ Worker       │──▶│ HostDO (1 per host)    │
│ services/socket.js  ◀──WS──▶ │  /ws/CODE  │ src/worker.js│   │ max 5 tables / host    │
│ domain/  (shared pure rules) │ ─────────▶ │              │──▶│ TableDO (1 per table)  │
└──────────────────────────────┘            └──────────────┘   │ actor, SQLite storage, │
         static assets ◀── Workers Static Assets                │ hibernatable WS, alarm │
                                                                └───────────────────────┘
```

- **`src/table/TableDO.js`** — one Durable Object per table. Every event (message, close, alarm, HTTP)
  runs through a promise queue, so the table is a strict actor even across `await`s. State is one
  storage value; a single alarm drives turn timeouts, bot moves, seat holds, auto next hand and the
  7-day idle expiry.
- **`src/table/core.js`** — plain-data table logic (seats, ledger, hand lifecycle, timers, snapshots).
  Unit-testable without sockets.
- **`src/games/<game>/engine.js`** — game engines with a common interface
  (`sanitizeOptions, canStart, startHand, act, timeout, botDue, botAct, view, summary, involved`).
- **`public/js/domain/`** — pure rules shared by server and client (cards, shuffle/commitment, Xì dách totals,
  Tiến lên combos/beating/scoring/move search).
- **`scripts/local-server.mjs`** — runs the *real* Worker and DO classes on Node 22 with an in-memory DO
  emulation (storage, alarms, hibernation API, auto-responses) and a dependency-free WebSocket server.

### Security model (summary)

| Concern | Measure |
| --- | --- |
| Hidden cards | `view(table, hand, viewerSeat)` builds a separate snapshot per socket; the deck and seed never leave the DO before the reveal. |
| Fair shuffle | `crypto.getRandomValues` Fisher–Yates with rejection sampling; `SHA-256(seed:deck)` published before dealing, seed + deck revealed after the hand (Fairness tab verifies it in the browser). |
| Identity | Random device UUID in localStorage, sent only in `hello`; broadcast id is `pid = SHA-256(pid:salt:secret)[:16]` with a per-table salt; host key = `SHA-256(host:secret)`. |
| Input | 2 KB frame cap, JSON reviver rejects `__proto__`/`constructor`/`prototype`, whitelisted message types and fields, integer chip amounts, seat indices and options clamped server-side. |
| Abuse | Per-socket token bucket (20 burst, 8/s), socket cap 40 per table, Origin check on WS and mutating API calls, 5 tables per host. |
| Browser | CSP `script-src 'self'`, no inline scripts, `frame-ancestors 'none'`, every user string through `esc()`. |

## Protocol

WebSocket at `/ws/<CODE>`. Client → server messages are JSON objects with a `t` field:

| `t` | Fields | Who | Notes |
| --- | --- | --- | --- |
| `hello` | `secret`, `nick` | anyone | must be first; returns `welcome {pid,isHost}` + `state` |
| `sit` / `stand` | `seat?` | player | `stand` during a hand leaves after the hand |
| `start` | | host | deals a new hand |
| `bet` | `amount` | player | Xì dách, integer within `[minBet, min(maxBet, chips)]` |
| `hit` / `stay` | | player or dealer | `stay` needs ≥ `playerMin` (đủ tuổi) |
| `xet` / `xetAll` | `seat` | dealer | only once the dealer has ≥ `dealerMin` |
| `play` | `cards` | player | Tiến lên: 1–13 distinct card ids from your hand forming a combo that beats the table |
| `pass` | | player | Tiến lên: not allowed when you lead the round |
| `addBot` / `removeBot` / `kick` | `seat` | host | |
| `rebuy` | `amount` | host | adds chips to every seated player (counted as buy-in) |
| `settings` | `options` | host | between hands only; sanitised |
| `history` | | anyone | replies `history {items}` |
| `deleteTable` | | host | |
| `ping` | | anyone | replies `pong {now}` (processed in order — used by tests) |

The plain-text frame `hb` is answered with `hb!` by the runtime auto-response (never wakes the DO).
Server → client: `state` (per-viewer snapshot), `welcome`, `history`, `err {code}`, `deleted`, `pong`.

HTTP: `POST /api/tables {secret, game, options}` → `{code}` · `GET /api/tables/:code` → info ·
`DELETE /api/tables/:code {secret}` (host only).

## Rules — Xì dách (defaults; all are host options)

| Rule | Default |
| --- | --- |
| Card values | 2–10 face value, J/Q/K = 10, A = 1, 10 or 11 (`aceRule: flex`). `classic`: 2 cards 10/11, 3 cards 1/10, 4+ cards 1 |
| Instant hands (first 2 cards) | **Xì bàng** A+A > **Xì dách** A + 10/J/Q/K. Dealer instant → everything is settled at once |
| Ranking | Xì bàng > Xì dách > **Ngũ linh** (5 cards ≤ 21) > normal total |
| Đủ tuổi | Players need ≥ 16 to stand (timeout stands anyway → "non" if < 16); dealer must reach ≥ 15 before checking |
| Quắc | > 21 is bust; bust players stop silently until checked |
| Comparisons | Higher total wins; equal → push; two ngũ linh → lower total wins; player bust or non always pays; dealer bust pays players who are not bust; **both bust → push** (`bothBustPush`) |
| Xét | Dealer may check players one by one (and keep drawing), or "Xét hết" |
| Payouts | ×1 normal · ×2 xì dách · ×3 xì bàng · ×2 ngũ linh — multiplier of the *winning* hand |
| Dealer | Rotates each hand (`dealerMode: rotate`) or host deals (`host`) |
| Bets | Placed before dealing, within min/max bet (default 10–200); no bet before the timer = sit out |
| Chips | Player losses are capped at their stack; the dealer may go negative (host can top up) |

## Rules — Tiến lên miền Nam (defaults; all are host options)

| Rule | Default |
| --- | --- |
| Deck & deal | 52 cards, 13 each (2–4 players; with fewer than 4 the rest stay in the deck) |
| Order | Ranks 3 < 4 < … < K < A < 2 (heo); suits ♠ < ♣ < ♦ < ♥; a card is compared by rank, then suit |
| Who leads | First game: holder of 3♠ (with < 4 players: holder of the lowest dealt card) and the first play must include it. Later games: winner of the previous game |
| Combos | Single (lẻ), pair (đôi), triple (sám), four of a kind (tứ quý), straight (sảnh, ≥ 3 ranks, no 2), consecutive pairs (đôi thông, ≥ 3 pairs, no 2) |
| Beating | Same combo type and length with a higher top card |
| Passing | Pass = out until the round resets; when everyone else has passed, the last player starts a new round. The leader cannot pass |
| Chặt heo | ✅ 3 đôi thông beat a single 2 · ✅ tứ quý beats a single 2 · ✅ tứ quý beats a pair of 2s · ✅ tứ quý beats 3 đôi thông · ✅ 4 đôi thông beat a single 2, a pair of 2s, tứ quý and 3 đôi thông. A bigger chopper of the same shape beats a chopper (chặt chồng) |
| Chop payment | ✅ `chopPay`: the chopped player pays at once — black 2 = 5, red 2 = 10, tứ quý = 10, 3 đôi thông = 5 points; chặt chồng adds the previous chain |
| Tới trắng | ✅ sảnh rồng (3 → A) · ✅ tứ quý 2 · ✅ 5 đôi thông · ✅ 6 đôi — the game ends at the deal and every other player pays 26 points |
| End of game | The first player to empty their hand wins; every other player pays: 1 point per card left (cóng — never played a card — pays 26 instead), plus thối: black 2 = 5, red 2 = 10 each, tứ quý = 10, 3 đôi thông = 5 |
| Points → chips | points × `unit` (default 10 chips); losses are capped at the player's stack |
| Timer | Timeout: the leader auto-plays the cheapest lead (incl. the required card); others auto-pass |

## Development

```bash
npm install                 # wrangler + @playwright/test (dev only; no runtime deps)
npm run dev                 # offline server on http://127.0.0.1:8787 (real DO classes, in-memory)
npm run dev:cf              # wrangler dev (workerd)
npm run test:all            # syntax check → unit → offline smoke → protocol security
npx playwright install chromium && npm run test:ui
```

## Deploy

1. `npx wrangler login` (or create an API token with *Workers Scripts: Edit*).
2. `npm run deploy` → `https://song-nha.<your-subdomain>.workers.dev`.
3. Optional custom domain: Workers & Pages → song-nha → Settings → Domains & Routes → Add custom domain.
   If the site is also served from another origin, list it in `ALLOWED_ORIGINS` (wrangler.jsonc `vars`).
4. CI: add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; pushes to `main`
   run all tests then deploy with `cloudflare/wrangler-action` (wrangler 4).

## Free plan capacity (rough estimate)

Workers Free limits for Durable Objects per day: 100,000 requests, 13,000 GB-s duration, 5M rows read,
100,000 rows written, 5 GB storage. WebSocket connects count as requests; incoming messages are billed
20:1; outgoing messages and auto-responses are free. Static assets are free.

A typical 4-player Xì dách hand ≈ 12 incoming messages + ~6 alarms ≈ **7 DO requests** and, since every
state change writes the table and its alarm, ≈ **35 rows written**. Rows written is the binding limit:
≈ **2,500 hands/day** (roughly 40 table-hours of continuous play), which is plenty for friends and family.
Idle tables hibernate and cost nothing until the 7-day expiry alarm deletes them.

---

*For fun only – no real money.*
