# UPTOBEAR site (web/)

Static, no build step. Four pages, one stylesheet, a handful of small scripts. The look is the owner's flat
cartoon bear: thick ink outlines (`#2a1a10`), flat fills, rounded shapes, a sand field (`#F3E4C8`) alternating with cream
bands (`#FFF4E3`), paper boards/cards (`#FFFBF3`), joined by wavy dividers drawn in the same line style. Every drawn UI element (honey jars, the
horns on the token logos, the BULL name tag, the wave dividers, the board bars) is inline SVG/CSS in that style.
Contrast: light only, every letter and number is ink with no text shadow: ink on sand 13.4:1, on cream 15.4:1, on
paper 16.2:1, on honey 8.1:1. Honey is the money accent; orange survives only as small accents (BULL tag, rank
numerals 1–3 with an ink outline, active nav underline, stake hint). Buttons are one filled (ink) and one outlined style.

External resources: ethers 6.13.4 from cdnjs (stake.html and wake.html only, subresource-integrity hash; if
the version or URL ever changes recompute the hash with `openssl dgst -sha512 -binary ethers.umd.min.js |
openssl base64 -A` and update both tags) and two Google Fonts (Fredoka for display, Inter for body). Nothing else.

```
index.html      Home: hero (copy + "the day closes in" digit clock left, the full cut-out bear right, never cropped),
                sticker rail, four story sections (hibernate / vote / feeding / waking) with a transparent video scene
                + live number each, the three honey jars, the Top 10 by weight board
stake.html        The Den: "Put your bear to sleep" (approve + deposit), vote with symbol preview (prefilled from
                ?vote=<address>), your numbers, your share of the basket; "Wake your bear" (withdraw) appears only after waking
feedings.html   One menu card per day: the three fed tokens as horned logos, release tx + amount, returns; operator sweeps
wake.html       Waking: countdown, the basket so far; after waking, "Collect your basket" cards + "Wake your bear"
config.js       Addresses, chain, explorer, STATE_URL, UNLOCK_AT (unchanged)
abi.js          Den + Treasury ABIs + a minimal ERC-20 fragment (unchanged)
css/site.css    Palette, bands + waves, hero, buttons, cards, clock, sticker rail, scenes, tok (logo + horns), jars, board
js/common.js    Formatting (BigInt wei), state.json loader + sample fallback, digit clock, stale banner, footer, CLAIMS
js/motion.js    Drawn parts (horns/tag/jar/wave SVG), tokLogo + hydrateToks, scenes (video/poster/sticker), rail, MOO,
                reveal + armGrow (jar fill / bar grow), headline pop, tx loader
js/wallet.js    EIP-1193 connect, chain switch/add (4663), read vs write provider, tx status (+ loader hook)
js/index.js js/den.js js/feedings.js js/wake.js   one per page
assets/gen/     the owner's art (table below)
assets/bear/    the old pixel bear; only bear_96_orange.png is still referenced (header/footer avatar onerror fallback)
logos/          sample-1.png, sample-2.png: two flat sample token logos referenced by state.sample.json
state.sample.json   Fake data in the exact state.json schema; rendered with a "sample data" badge when state.json is missing
```

## Assets (`web/assets/gen/`)

| file | where it appears | if missing |
|---|---|---|
| `02-hero-bear.png` (transparent cut-out, 1215×1600) | index hero, `<img>` with `object-fit: contain`: on wide screens it starts at the top of the copy column and is capped at `min(100svh − 96px, 820px)` so it is never cropped and never below the fold; on phones it sits above the copy; click = MOO | the hero shows copy only |
| `03-hibernate.webm` + `.mov` + `.png` | index "Hibernate" scene; stake.html page head | see scene rule |
| `04-vote.webm` + `.mov` + `.png` | index "Today's bulls" scene | see scene rule |
| `05-feeding.webm` + `.mov` + `.png` | index "Feeding" scene; feedings.html page head | see scene rule |
| `06-waking.webm` + `.mov` + `.png` | index "Waking" scene; wake.html page head | see scene rule |
| `09-avatar.png` | header logo (42px circle), favicon, footer stamp | `assets/bear/bear_96_orange.png` |
| `10a-thumbs 10b-arms 10c-sleep 10d-phone 10e-diamonds 10f-blanket 10g-sign 10h-moo .png` | the sticker rail (marquee, pauses on hover, click = MOO); `10c-sleep.png` also the post-deposit "asleep" picture | the tile is removed |
| `11-og.png` | `og:image` on every page (relative path; set an absolute URL once the domain exists) | none |

Scene rule: `<div class="scene" data-scene="03-hibernate">` mounts, when within 400px of the viewport (page heads
eagerly), `<video autoplay muted loop playsinline poster="03-hibernate.png">` with two sources in this order:
`03-hibernate.mov` (`video/quicktime; codecs="hvc1"`, HEVC with alpha, Safari) then `03-hibernate.webm`
(VP9 with alpha, Chrome/Firefox). The videos are transparent and sit directly on the band colour with a
drop-shadow and a slow float; no card behind them. If both sources fail the poster PNG stays as a still; if
the poster fails too the matching sticker stands in (hibernate→10c, vote→10a, feeding→10b, waking→10g); if
that fails the space collapses. Under `prefers-reduced-motion` no video is created (poster only).

## Token logos and the horns

`state.json` carries `logo` on every entry of `live.top[]`, `days[].top3[]` and `treasury.basket[]`: `""` or a
same-origin relative path like `logos/0xabc…def.png` (a 128×128 PNG the indexer mirrors next to `state.json`).
`tokLogo(entry, rank, cls)` in `js/motion.js` draws a round disc wearing the SVG headband + horns (ranks 1–3;
rank 1 also the BULL name tag; other ranks a plain disc) with the first 3–4 letters of the symbol on a flat colour
(hue from the address) as the fallback. The path is never put into markup: the markup carries an integer index,
and `hydrateToks(root)` (called by `setHtml`) resolves the path against the directory of `CONFIG.STATE_URL`,
accepts only a plain relative path with an image extension on the same origin, creates the `<img>` by DOM
(`loading="lazy"`, `referrerpolicy="no-referrer"`, fixed CSS box), sets `src` by property and removes it on
`error` so the initials show again. The same component sits on the jar labels, the bulls, the board, the
feedings plates and the wake baskets.

## The board (Top 10 by weight)

Paper panel on the sand band, one row per token: rank numeral (top 3 in orange with an ink outline and a horns badge), the horned logo, symbol +
shortened address, a honey bar whose width is the token's share of all vote weight (`--f`, grows from 0 with
`transform: scaleX` when the panel scrolls in and after every re-render that changes the token set; only the
numbers move otherwise), the % pinned to the end of the bar, and a "Vote for this" pill linking to
`stake.html?vote=<address>#vote-card` (den.js prefills the vote input from that query param after `isAddress`).
Ten skeleton rows are in the HTML until state loads. On phones the bar drops to a second full-width line.

## Motion rules

Transforms and opacity only; no layout property is animated except the board's % pill (`left`, once per
render). The jars translate the honey group inside a clip path (`--fill`); the marquee is one `translateX`
keyframe on a doubled track; scenes and stickers float with keyframes. `prefers-reduced-motion: reduce`
disables every animation and transition, the marquee, the float and video creation, shows every reveal
immediately and jumps the jars and bars to their values. Clicking the hero bear, any sticker, any scene or
the footer stamp (`[data-moo]`) wobbles it and pops a "MOO" bubble.

## Hosting

Copy `web/` as-is to any static host (GitHub Pages, Cloudflare Pages, nginx, S3). Everything is relative
(`./css/…`, `./js/…`, `./assets/…`, `./state.json`), so it works at a domain root or under a subpath. No server code.
The pages use `fetch` for state.json, so they must be served over http(s), not opened as `file://`.

## After deploy: fill config.js

| key | value |
|---|---|
| `TOKEN` | the $UPTOBEAR token address |
| `DEN` | the Den address |
| `TREASURY` | the Treasury address |
| `UNLOCK_AT` | leave at `1793491200` (2026-11-01T00:00:00Z); must equal `den.UNLOCK()` |
| `EXPLORER_URL` / `EXPLORER_TX_URL` | shipped as `""` (plain addresses and full hashes, no links). Fill only with a verified explorer base (`…` and `…/tx/`) |
| `NO_EXEMPTIONS_VERIFIED` | set `true` only after DEPLOY.md step 6 shows exactly two SnipeTaxExempted events (Launcher, Treasury); this adds the "No launch-minute exemptions." line to the fine print |

Nothing else changes. If the ABIs change, regenerate `abi.js` from `out/Den.sol/Den.json` and
`out/Treasury.sol/Treasury.json` (abi field only; the ERC-20 fragment at the bottom stays).

## state.json

Everything global on the site comes from `state.json`, written by the read-only indexer
(`script/ops/indexer.py`) on a cron every 60 s and placed next to `index.html` (same origin, so no CORS).
The pages re-fetch it every 30 s with a cache-busting query. If it is missing or fails to parse the pages
fall back to `state.sample.json` and show a "sample data" badge, so a broken indexer is visible at a glance.
If `updatedAt` is older than 10 minutes every page shows a "Data is N minutes old" banner under the header
(`#stale-slot`). The fine print of every page prints "indexed at block … · <blockTime> UTC".

Per-wallet numbers (balances, allowance, weight, vote, claimable) are read on-chain in the browser through
`RPC_URL`; the site never calls `eth_getLogs`.

Schema (wei and weights as strings; `pct`, `slicePct`, `hibernatingPct` as plain numbers in percent;
`updatedAt` and `blockTime` unix seconds):

```
{ updatedAt, block, blockTime, chainId: 4663, token, den, operator, unlockAt: 1793491200,
  totalSupply, totalLocked, hibernatingPct, hibernators, totalWeight,
  live: { top: [ {token, symbol, weight, pct} × 10 ] },
  days: [ { day: "2026-10-04", closed: bool, tallyBlock, top3: [ {token, symbol, weight, pct, slicePct} ],
            releases: [ {tx, block, amountWei} ], release: last of releases | null, releasedWei,
            returns: [ {token, symbol, decimals, amount, from, fromOperator, tx, block} ] } ],   // stops at 2026-10-31
  sweeps: [ {token, symbol, decimals, amount, tx, block} ],
  latestRelease: {tx, block, amountWei} | null,
  treasury: { balanceWei, ownerOwed, basket: [ {token, symbol, decimals, held, distributed} ] },
  fees: { claimedTotalWei, ownerPaidWei } }
```

Note: COORDINATION.md lists `treasury` twice (the address and the object). A JSON object cannot hold both,
and the indexer's dict keeps the object, so `treasury` is the `{balanceWei, ownerOwed, basket}` object and the
Treasury address comes from `config.js`.

What each page reads: every page → `updatedAt` (stale banner), `block` + `blockTime` (fine print line).
index → `treasury.balanceWei`, `treasury.ownerOwed` (releasable ETH, the three jars at 50/30/20),
`hibernatingPct`, `hibernators`, `live.top[]` (today's bulls = first three; the board = all ten, bar width = pct), `latestRelease` ("last feeding: X ETH"). den → `treasury.basket[]`. feedings → `days[]` (newest
first by `day`; the day amount is `releasedWei`, every `releases[]` tx is listed, a return with
`fromOperator: false` is marked "transfer from another address") and `sweeps[]` (newest first; "None so far."
when empty). wake → `treasury.basket[]`. `fees`, `totalSupply`, `totalLocked`, `totalWeight`, `token`, `den`,
`operator` are in the schema but not rendered.

## Copy discipline: MAY-CLAIM sentences and the short lines

Rule: above the fine print, no line longer than ~12 words, one idea per line. The 16 MAY-CLAIM sentences from
COORDINATION.md live verbatim in `js/common.js` (`CLAIMS`, untouched) and are rendered, in order, in the footer
of every page inside `<details><summary>The fine print, honestly</summary>` (contract addresses stay visible above
it). Page bodies carry only short plain-HTML lines that are derivable from those sentences (review/COPY_AUDIT.md
has the exact before → after list and the derivability check); there are no `data-say` injections any more, and
`renderSayings()` is kept in common.js for compatibility but finds nothing.

Short lines in use: index hero "Lock $UPTOBEAR until Nov 1. / Vote for any token. / Every day, fees buy the top 3. /
Wake up to the basket."; "Locked until Nov 1. No early exit. No admin."; "Any token. Change your vote any time.";
"If the day closed now, these three get fed."; "Every day the treasury's ETH buys the top 3: 50 / 30 / 20. / The
operator buys by hand. Every transaction is public."; "Nov 1: the basket is split by weight. Claim each token
yourself."; "Bar = share of all votes. Leader gets the biggest jar." — den "Locked until Nov 1 2026, 00:00 UTC. No
early exit."; "No early exit until Nov 1 2026. I know." (error: "Tick the box: no early exit until Nov 1 2026.");
"Weight = amount × days left. It is your vote and your share."; "Any token address. Sticky. Change it any time.";
"After Nov 1: get back exactly what you locked." — feedings "Day closes at 00:00 UTC. / The vote picks the top 3. /
The operator buys and returns them. / Every step is on-chain."; "The operator can move basket tokens out at any
time. Every sweep shows here." — wake "Claim each basket token. Your share = your weight."; "More can arrive later.
Come back and claim again."; "Get back exactly what you locked."

The rest is UI labels and headings ("In October, every bear is a bull.", "Put a bear to sleep", "the day closes in",
"Bears sleep. Bulls wake up.", "Today's bulls", "Three jars, every day.", "Nov 1. Hibernators get the basket.",
"Top 10 by weight", "Vote for this", "share of vote weight", "Put your bear to sleep.", "Today's menu.", "Rise and
shine.", "Collect your basket", "Wake your bear", "Claims open at waking.", "sample data", "Asleep until Nov 1 2026
00:00 UTC.", "Every sentence below is what the contracts do."), the empty states ("No feedings yet. The first day
closes at 00:00 UTC." / "None so far." / "no feeding yet" / "No votes yet."), "Operator sweeps", "transfer from
another address", the stale banner "Data is N minutes old. The indexer has not written since.", and "MOO".

## Checks before shipping

- assets/gen populated (see the asset table; 09-avatar.png and 11-og.png have no drawn fallback)

```
for f in js/*.js config.js abi.js; do node --check $f; done
grep -rniE "nobody can withdraw|exact fees|NFT|guarantee|trustless|rug|\bsafe\b|audited" index.html stake.html feedings.html wake.html js/
   # the only hit must be the MAY-CLAIM `roll` sentence itself ("not a promise of one day's exact fees")
python3 -c "import json; json.load(open('state.sample.json'))"
python3 -m http.server 8765   # then open each page at 390×844, 768×1024, 1440×900, 1440×700, 1920×1080; the badge must read
                              # "sample data" until state.json exists; scrollWidth must equal the viewport width; the hero
                              # bear, the scenes and the stickers must never be clipped
```
