# FF Tech

Hosts the FF MonsoonSIM game reader so the **FF live** bookmark can load the newest version on every click.

- `reader.js` is the reader (read-only). It opens a draggable FF panel on the game tab with Live, Today, Stores, Stock, Checks and Auto tabs; Alt+F hides it. Auto-click (reader v5, allowed by the Rexar XIV organizers) presses buttons you pick, in order, on a timer. It is off each time the panel opens, stops with Esc or the Stop bar, skips a button whose words changed, and never types into fields. Edit it and push to `main` to update everyone's bookmark.
- `index.html` is the install page with the bookmarks for Mode 12i and Mode 14.
- `calc/index.html` is the FF calculator as a web page (v32): https://profeinty.github.io/Secret-FF-Doomsday-Project/calc/. Same team passcode; numbers stay on each device (team sharing is only in the other version). Its Go live, FF live bookmark and Copy game reader all use `reader.js` from this site.
- `.nojekyll` makes GitHub Pages serve the files as they are.

## Setup (once)

1. Push these files to the repo (here: `profeinty/Secret-FF-Doomsday-Project`).
2. In the repo: Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://profeinty.github.io/Secret-FF-Doomsday-Project/` and drag the bookmark for your mode to the bookmarks bar.

The repo was renamed from Monsoonsim-Project-V1 on 2026-10-18. A bookmark made from the old page still points at the old address and stops loading: delete it and drag it again from the page above.

## How the bookmark works

It sets `window.__FF_MODE` to the calculator mode, then adds a `<script>` tag for `reader.js` with a time stamp on the address so the browser never runs an old cached copy. If the game page blocks outside scripts, it shows a message and you fall back to pasting the reader in the Console.

## B2B deals (reader v6, preview)

The Auto tab checks B2B > B2B Offers and shows which open deals it would grab. Smart mode: enough stock in the warehouses and price at least cost x margin (default 1.15); bids go in 3% under the max price. Grab all mode skips those checks. One deal per product per day (the game's limit). It only previews for now; pressing Accept and placing bids are added once the open-deal screen and bid form have been seen in a running game.

## 📄 License
MIT © Profeinty
