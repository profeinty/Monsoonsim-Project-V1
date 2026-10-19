# FF Tech

Hosts the FF MonsoonSIM game reader so the **FF live** bookmark can load the newest version on every click.

- `reader.js` is the reader (v8). It opens a draggable FF panel on the game tab with Live, Today, Stores, Stock, Checks, Auto and Bot tabs; Alt+F hides it. Auto-click (allowed by the Rexar XIV organizers) presses buttons you pick, in order, on a timer. It is off each time the panel opens, stops with Esc or the Stop bar, skips a button whose words changed, and never types into fields. The Bot tab plays the day from the calculator's plan (see below). Edit it and push to `main` to update everyone's bookmark.
- `index.html` is the install page with the bookmarks for Mode 12i and Mode 14.
- `calc/index.html` is the FF calculator as a web page (v32): https://profeinty.github.io/Secret-FF-Doomsday-Project/calc/. Same team passcode; numbers stay on each device (team sharing is only in the other version). Its Go live, FF live bookmark and Copy game reader all use `reader.js` from this site.
- `docs/plan-format.md` is the message the calculator sends the bot each day, and the reports the bot sends back. `docs/plan-sample.json` is an example.
- `test/` is a stand-in game for testing the bot without a real game. See [test/README.md](test/README.md).
- `.nojekyll` makes GitHub Pages serve the files as they are.

## Setup (once)

1. Push these files to the repo (here: `profeinty/Secret-FF-Doomsday-Project`).
2. In the repo: Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://profeinty.github.io/Secret-FF-Doomsday-Project/` and drag the bookmark for your mode to the bookmarks bar.

The repo was renamed from Monsoonsim-Project-V1 on 2026-10-18. A bookmark made from the old page still points at the old address and stops loading: delete it and drag it again from the page above.

## How the bookmark works

It sets `window.__FF_MODE` to the calculator mode, then adds a `<script>` tag for `reader.js` with a time stamp on the address so the browser never runs an old cached copy. If the game page blocks outside scripts, it shows a message and you fall back to pasting the reader in the Console.

## B2B deals (Auto tab preview)

The Auto tab checks B2B > B2B Offers and shows which open deals it would grab. Smart mode: enough stock in the warehouses and price at least cost x margin (default 1.15); bids go in 3% under the max price. Grab all mode skips those checks. One deal per product per day (the game's limit). The Auto tab only previews; the Bot tab accepts and bids on the deals the calculator's plan picks.

## Bot (reader v8)

The Bot tab follows the calculator's plan: every quantity, price and budget comes from the calculator, nothing is a fixed number in the bot.

1. Open the game and click your FF live bookmark, then open the **Bot** tab.
2. **Check the screens** reads every screen the bot uses and sends nothing. **Practice** does everything except send, so you can see what it would do.
3. **Start** opens the web calculator in a new tab (if it isn't linked yet), takes its plan for the day and runs it in order: B2B deals, shop space, warehouse space, raw materials, store stock, marketing. Each section stays within its budget and cash stays above the plan's reserve. It reports each step back to the calculator and takes the next day's plan when the day changes.
4. Stop it with its own button, the Stop bar or Esc.

Safety: it never opens a cancel-rental link, never shrinks a shop or warehouse unless the plan says release (and leaves giving up a whole location to you), checks a B2B offer's number before accepting or bidding, and counts an order whose answer got lost as bought so it is never sent twice. Machines and prices aren't done by the bot yet: do those in the game.

## 📄 License
MIT © Profeinty
