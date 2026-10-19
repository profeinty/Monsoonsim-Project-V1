# FF calculator → bot: the plan message (v1)

The calculator (calc/index.html, v35) sends this to the game tab; the bot (reader.js) follows it and reports back. Every quantity, price and budget comes from the plan; nothing is a fixed number in the bot. Sample: `plan-sample.json` next to this file.

## Messages

Calculator → game tab, posted to the game tab's own origin:

- `{ff:"ack", app:"ffcalc", mode, ok, planId}` after every `hello` / `data`.
- `{ff:"plan", app:"ffcalc", v:1, mode, day, planId, ...}` about 0.15 s after each data update that changes the plan, after `hello`, and at once on `botHello` / `getPlan`. The same plan isn't re-sent more than every 5 s unless asked. Only plans made from game data are sent (`source:"game"`), never the preset numbers.
- The calculator also takes messages from `window.opener` (the game tab, when the bot's Start button opened the calculator).

Game tab → calculator (`window.opener.postMessage(msg, "*")` or the calc window):

- `{ff:"botHello"}` / `{ff:"getPlan"}`: send the plan now.
- `{ff:"step", planId, id, status:"done"|"skip"|"fail", qty, price, amount, orderId, due, won, note}`: one report per step. On `done`, store and raw orders count as stock on the way until `arriveDay` (so they aren't ordered twice) and as a vendor bill on `billDay`; a B2B accept (or a won bid, `won:true`) becomes money owed to us; marketing remembers the amount per store and agency (an unchanged amount gets no step next time). A done step's id is left out of the next plan. A report sent twice is booked once, and a later repeat never undoes a `done`. `unsure: true` (the game's answer was lost after sending) is booked as done and listed on the calculator to check in the game.
- `{ff:"runEnd", day, done, skip, fail, sec}` / `{ff:"abort", reason}`: shown in the calculator.

Data fields the calculator uses when the reader sends them: `prep` (true in the prep stage), `b2bPayDays` (days from delivery until B2B money lands), `b2bDueDays`, `b2bOffers: [{id, product, qty, price, maxBid, kind:"fixed"|"bid", due, state}]` (needed for B2B steps: without offer numbers the plan has no B2B steps for the bot), `b2bOrders: [{id, product, qty, each, due, delivered, deliverDay, payDay, paid}]`, `inbound: [{dest:"store"|"wh", city, item, qty, arriveDay}]`, `payables: [{dueDay, amount}]`, and `warehouses[].name` (the warehouse used as the raw-material destination).

v34 also reads `b2bBids` (or `b2bHistory`): every bid we took part in, from the B2B sales orders, as `[{id, product, qty, kind:"bid"|"fixed", maxBid, minBidders, postDay, resultDay, due, ourBid, result:"won"|"lost"|"void", winPrice, winner, bids:[{team, price, us}]}]` (the format of `game-notes/b2b-bids-60day.json`). The calculator keeps the last 400 and learns from them how low the other teams bid. Void bids (too few bidders) are left out.

v35 also reads: `b2bOrders[].status` (Cancelled / void → dropped, owed to no one; Completed or a `deliverDay`/`deliveredDay` → delivered), `b2bOrders[].allocated` / `.delivered` (units already allocated or delivered have left the warehouse: only the rest is owed; all of it → delivered), an order whose `b2bBids` row (matched by `so`, else `offer`) has a result other than "won" (a bid still waiting, lost, void) → not an order, `machineTypes` (used when `machines` is missing), `production.perDay` (machine output % = units made on the last full day ÷ capacity of the machines that made something, used when the team leaves "Machine output %" blank; under 50% is ignored; with no table, `ownMachines[].today` of machines with status "making"), and `web.listings: [{id, product, price, qty, days, seller}]` (Web Market listings; ours are the ones whose seller is `team`, else "FF").

## Top level

- `day`, `stage` ("prep" or "day"), `ok` (self-checks passed), `rescue` (cash is short: only `must` steps), `warnings`.
- `reserve`: the bot keeps **dashboard cash minus what it spent** at or above this. It can be negative: the plan uses part of the overdraft (cash floor = overdraft we allow + days of costs kept, plus the overdraft already used).
- `budgets`: one number per bot section: `b2b`, `rent_shop`, `rent_wh`, `machine`, `buy_raw`, `buy_store`, `buy_wh_goods` (finished goods to the warehouse for B2B), `marketing` (EUR/day, one day), `price`, `ecom` (v35: Web Market buys). A section's running total never passes its number; 0 means no paid steps there. In a plan re-sent during the day, each number is what's LEFT after the done steps the calculator has booked, so the bot starts every new plan's running totals at 0.
- `floors` (= `b2bBidFloor`): per product, never accept or bid under it (cost × margin; while clearing, the cash cost + `clearMargin`).
- `rules` (v34): `priceLock: true` (never change a selling price: there are no `price` steps), `machineGoal` ("seven" = up to 7 machines at full output, "sell", "b2b"), `rawSpareDays` (raw orders top up to lead + this many days of use, so the machines never stop), `machineOutputPct` (the output the plan expects from each machine; `machineOutputFrom` "typed", "game" or "default").
- `b2b` (v34): `rules.bidCut`, `rules.tieLoses: true` (a tie went to the other team in our games: bid strictly under), `rules.autoShip: true` and `rules.shipFromStores: false` (v35: the bot ships won orders by itself from the warehouse), `phase` ("normal" or "clear"), `clearFrom` (the day the clearing starts; `clearAuto` when the calculator picked it), `clearShare` (% of B2B demand we aim to win while clearing), `clearUnits`, `leftAtEnd` (units per product still in the warehouse on the last day at that share). `b2b.products[]` adds `floorNormal`, `floorClear`, `unitCost`, `cashEach`, `holdEach`, `phase`.
- `ecom` (v34, `null` when the game has no Web Market): `rules` {`storePricesLocked`, `sellPrice` ("store" = the store price, the default; "plan" = `sellAsk`, the team's choice), `sellNeverUnder`, `askUnderLowestListingBy` 0.01, `lot` (units per listing), `buyWholeListingTo` "warehouse", `nextVendorB2BBuySmaller`} and `products[]` {`name`, `sellUnits` (units B2B won't take by the end: post them on our own sell listing), `sellMin` (never under), `sellAsk` (a cent under the cheapest other listing; with none, what B2B would pay; never under `sellMin`), `lowestListing`, `ourListing`, `storePrice` (unchanged), `buyBelow` (buy a seller's whole listing only at or under this: 3% under the vendor's price for today's B2B order, tier included), `buyMaxUnits` (at most this many, for B2B stock), `buyMaxShipDays`}. Today's vendor `buy_wh_goods` step stays whole; a done web buy is stock on the way, so the next plan's vendor order is that much smaller.
- `verify`: `{day, cash, tol, cashMin}`: stop if the game day isn't `day` or cash is more than `tol` off; after the run, cash should be ≥ `cashMin`.
- `warnings` also names a B2B order that is due but not all in the warehouse yet.
- Also: `b2bPayWait`, `b2bMoneyBackDays`, `b2b.products` (`capQty` = most we can deliver by the due day), `caps` (the calculator's own section caps), `cash` (low point in the next days), `cutoffs`, `next` (the next 3 days, in case a plan is late), `replanOn`, `checks`, `timeline`, `limits` (`botSec`, `safeTargetPct` 90, `errorBudgetPct` 10, `maxPlanAgeSec` 90), `estSecNow`.

B2B and stock rules behind the numbers: `b2b.products[].capQty` already takes off every order won and not delivered yet; `buy_wh_goods` only buys what the warehouse (and what's on the way) doesn't already hold; no `buy_raw` after `cutoffs.lastRawPO` and no `buy_wh_goods` after `cutoffs.lastB2BAcceptVendor`; a new store is rented big enough for the stock that lands in it.

## A step

| Field | Meaning |
|---|---|
| `id` | `d<day>:<what>`, stable for the day: report with it; never repeat an id reported `done` |
| `section` | `b2b`, `rent_shop`, `rent_wh`, `machine`, `buy_raw`, `buy_store`, `buy_wh_goods`, `marketing`, `ecom` (no `price` steps since v34) |
| `action` | `accept`, `bid`, `rent`, `release`, `buy`, `set`, `switch`, `pause`, `priority` (machine), `sell` (ecom) |
| `target` | rent_shop / buy_store / marketing: the city (store) name; rent_wh / buy_raw / buy_wh_goods: the warehouse name (or its city); machine: the machine type (empty for `priority`); b2b: the offer number; ecom buy: the listing id; ecom sell: the product |
| `product` | buy steps: the product or raw material; machine set/switch: the product |
| `perDay` | machine set/switch: units a day the plan expects from that machine |
| `where` | machine buy: the warehouse the machines stand in |
| `order` | machine priority: product names, first made first. Sent only when a B2B order owed is short in the warehouse, and not again once done |
| `dest` | ecom buy: "warehouse". The bot buys the whole listing: `qty` and `price` are the listing's; at most 2 a day; depends on the warehouse rent step; slot "later" first when time is short (skipping it loses nothing) |
| `days`, `repeat`, `priceRule`, `priceMin` | ecom sell: days to ship, `repeat: false` (post once: there is no pause step; the next plan posts again while there's leftover), "store" (type the store price) or "plan" (type `price`, never under `priceMin`). Not sent while our listing for that product shows in `web.listings`, nor the day after a done post when none of ours shows |
| `qty` | rent: the TOTAL m² wanted (whole 50 m² shop / 500 m² warehouse steps, `qtyStep`); buy: the ideal amount from forecast demand; b2b: the offer's quantity; machine buy: how many |
| `qtyMin`, `qtyMax` | buy steps: the range that's still right (`qtyMin` = the store's first days, lead + 2). Pick the game's order sizes inside it |
| `term` | rent steps: days (default 1, set in the calculator's inputs) |
| `cost` (= `budget`) | what the step spends, counted against `budgets[section]`. Rent: rate × extra m² × term. Buy: qty × unit price. Marketing: EUR/day |
| `price` | marketing: EUR/day; b2b accept: the offer's price; b2b bid: the bid. With bid history it is the price with the best chance to win × profit against the other teams' past bids (`winP` = that chance, `maxBid` = the offer's max); without history, the max bid less the cut. Never under the floor. No `price` section steps since v34 |
| `floor` | b2b: the product's floor |
| `agency` | marketing: "MA", "MB"… (from the media split when the age groups are known, else the calculator's default agency) |
| `unitPrice`, `unitPriceMax` | buy: expected vendor price; skip if the game asks more than `unitPriceMax` |
| `tierQty`, `unitPriceMaxBelowTier` | buy_store, only when `qty` is a bulk lot and `qtyMin` is under it: the game charges the full price below `tierQty`, so a cut-down buy is fine up to `unitPriceMaxBelowTier` each |
| `m2Each` | buy_store: shelf space per unit (0.005), so qty can be cut to the free space if the extra rent didn't go through |
| `must`, `deps`, `slot` | `must`: do even on a rescue day. A step that a must step depends on is a must too (the space before the stock), and so is marketing that goes down or stops; on a rescue day giving space back is a must. `deps`: ids that must be done first (ids not in the list are done). `slot:"later"`: only if time is left |
| `arriveDay`, `billDay`, `text`, `why`, `estSec` | when it lands / is paid; plain words; the reason; estimated seconds |

Not sent to the bot (they stay on the calculator's list): the two dashboard checks (see `verify`), B2B delivery reminders, and B2B rules when no offer numbers are known.
