# Bot tests on a stand-in game

A fake MonsoonSIM game (dashboard, rent, vendor, marketing and B2B screens, and forms that take orders) for testing the bot in `reader.js` without touching a real game. Plans use the format in [docs/plan-format.md](../docs/plan-format.md).

    npm install playwright            # once, anywhere on your computer
    node test/server.mjs 8791 reader.js &
    node test/test.mjs 8791 test      # set CHROMIUM=/path/to/chromium to use your own browser

Fail modes on the server: `?fail=<CMD>` (the game refuses), `COD` (cash on delivery), `E500:<CMD>` (the order goes through, then the game answers with an error page).

Cases: A full plan run for real, B practice run (nothing sent), C screen check, D Start opens the calculator (`calc-stub.html`) and runs its plan, E the game refuses an order, F cash on delivery, G plan doesn't match the game's cash, H release, shrink, vendor price and B2B limits, I below the bulk lot price, J lost answer counted as bought, M reader loaded again the same day sends nothing twice, N Run by itself starts the bot with no click.

Result for reader v8.2: all 74 checks pass; a 15-step day takes about 25 s.
