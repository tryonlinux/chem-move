# ChemMove ⚗️

A chemistry swapping puzzle. Every row has a compound on the left and every column
one on top, by its common name: *Water*, *Rust*, *Laughing gas*. Swap neighbouring
tiles until a line spells that compound's formula in order, as one unbroken run,
with blank tiles in the leftover cells before or after it. Made lines score, refill with new tiles and get a new compound.

Live at **[chemmove.tryonlinux.com](https://chemmove.tryonlinux.com)**.

A sibling of [SolveSum](https://solvesum.tryonlinux.com) with atoms in place of
numbers. No build step, no dependencies, no framework: static files served by a
Cloudflare Worker.

## Playing

| | |
|---|---|
| **Swap** | Tap a tile, then a neighbour (or swipe toward it). Costs 1 swap. |
| **Make** | A line that spells its compound's formula in order (left to right, or top to bottom) as one unbroken run, with blanks only before or after it: water is `H H O`, never `H O H` or `H _ H O`. Brackets repeat: Ca(OH)₂ is `Ca O H O H`. Worth 5 points per atom (water 15, rust 25). |
| **Combo** | Make *k* compounds with one swap (chains included) for *k* × their total. |
| **Clue** | Tap a name: atom count, points and a fact. The formula shows once you've made it. Free. |
| **Hint** | −2 swaps. Plans a full route to a compound (the best single swap, else the fewest straight slides) and lights it up one pair at a time. Any other swap cancels it. Free if nothing can be made. |
| **Shuffle** | Deals fresh tiles and compounds. Free, 3 per round, plus unlimited whenever nothing on the board can be made. |
| **Swaps** | `12 + 8n` per round (52 on the 5×5 daily). The round ends at zero. |

Formulas are never printed on the board: knowing (or working out) that fool's gold is
FeS₂ is the puzzle. Compounds are sized to the board, from 2–3 atoms on 3×3 up to
6–10 atoms on 10×10, and blank tiles are dealt in proportion to the space the average
compound leaves free.

### Games

- **Daily**: a 5×5 board seeded from the local date, the same for everyone. The first
  finish is the one saved to stats; replays are marked as such.
- **Random**: a board from 3×3 to 10×10 with a shareable code like `K3F9QZ-6`
  (`/?g=K3F9QZ-6`).

Every compound the player makes goes in the **lab notebook** (70 to find). Games in
progress, settings, the notebook and stats (daily streaks, best by size, recent
rounds) live in `localStorage` under `chemmove:v1:`. Nothing leaves the browser.

### Variety

The RNG is seeded from a hash of the game id, so boards are effectively unlimited. A
year of dailies checked in Node gave 365 distinct opening boards and 365 distinct
target layouts, used 31 of the 32 compounds a 5×5 board can ask for, and never
repeated more than 3 of the 10 targets in the same place on consecutive days.

## How targets are chosen

Each target is a compound the line can actually be turned into from the board it was
dealt with. A DP over the line's positions finds the cheapest mix of straight slides
along the crossing lines that leaves exactly the formula's atoms plus blanks; a
target is picked from the compounds within `n + 1` slides, preferring ones no other
line is asking for. The same DP powers the hint.

## Layout

```
public/
  index.html          markup, dialogs, meta/OG tags, JSON-LD
  404.html            "no reaction" page
  game.js             compounds, rules, seeded RNG, hints, rendering, persistence
  style.css           theming (light/dark), board, dialogs
  _headers            CSP and security headers, cache policy
  robots.txt, sitemap.xml, site.webmanifest
  favicon.svg         source icon; apple-touch-icon and icon-192/512 are rendered from it
  og-image.svg/.png   social card source and the 1200×630 PNG that ships
wrangler.jsonc        Cloudflare Worker static-asset config
```

The CSP is `'self'` only, with no `unsafe-inline`. There are no inline scripts,
styles or `style="..."` attributes; dynamic styling goes through
`el.style.setProperty`.

To add a compound, append a row to `COMPOUNDS` in `game.js` with a new id. Formulas
are written as displayed (`Ca(OH)₂`) and parsed for their atoms; an isomer of an
existing formula would make two names interchangeable, so avoid those.

To re-render the PNGs after editing an SVG:

```sh
printf '<body style="margin:0">' > /tmp/og.html && cat public/og-image.svg >> /tmp/og.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=public/og-image.png --window-size=1200,630 --hide-scrollbars file:///tmp/og.html
```

The icons are rendered the same way from `favicon.svg` on a `#0e8f7e` background, at
180, 192 and 512 px.

## Running it

```sh
npx wrangler dev          # or: python3 -m http.server -d public 8765
```

Opening `public/index.html` directly also works.

## Deploying

```sh
npx wrangler deploy
```

The `routes` entry binds `chemmove.tryonlinux.com` as a custom domain, which requires
`tryonlinux.com` to be an active zone on the same Cloudflare account.

Changing `COMPOUNDS`, `reachableTarget`, `deal` or the RNG changes every daily board.
If you do, bump `PREFIX` in `game.js` so saved games don't resume onto a different
board.
