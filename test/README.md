# Bot tests on a stand-in game

A fake MonsoonSIM game (dashboard, rent, vendor, marketing, B2B offers and sales orders, shipping, machines, production and Web Market screens, and forms that take orders) for testing the bot in `reader.js` without touching a real game. Plans use the format in [docs/plan-format.md](../docs/plan-format.md).

    npm install playwright            # once, anywhere on your computer
    node test/server.mjs 8791 reader.js &
    node test/test.mjs 8791 test      # set CHROMIUM=/path/to/chromium to use your own browser

Fail modes on the server: `?fail=<CMD>` (the game refuses), `COD` (cash on delivery), `E500:<CMD>` (the order goes through, then the game answers with an error page). More of the game: `&so=1` (won orders and a web order to ship), `&wfg=1` (goods in the warehouse), `&mach=1` (two machines with a production history), `&cash=N`.

Cases: A full plan run for real, B practice run (nothing sent), C screen check, D Start opens the calculator (`calc-stub.html`) and runs its plan, E the game refuses an order, F cash on delivery, G plan doesn't match the game's cash, H release, shrink, vendor price and B2B limits, I below the bulk lot price, J lost answer counted as bought, M reader loaded again the same day sends nothing twice, N Run by itself starts the bot with no click, P bid history with every team's price (Load More), Q shipping won and web orders exactly as the game's page does, Q2 practice and autoShip off ship nothing, Q3 2 refused shipments stop the bot, R machines fit the floor and the budget, R2 production and machine status, S Web Market buys and our own post at the shop price.

Result for reader v9: all 122 checks pass; a 15-step day takes about 26 s.
