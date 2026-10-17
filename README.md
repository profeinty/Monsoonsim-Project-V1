# FF live reader

Hosts the FF MonsoonSIM game reader so the **FF live** bookmark can load the newest version on every click.

- `reader.js` is the reader (read-only). It opens a draggable FF panel on the game tab with Live, Today, Stores, Stock and Checks tabs; Alt+F hides it. Edit it and push to `main` to update everyone's bookmark.
- `index.html` is the install page with the bookmarks for Mode 12i and Mode 14.
- `.nojekyll` makes GitHub Pages serve the files as they are.

## Setup (once)

1. Push these files to the repo (here: `profeinty/Monsoonsim-Project-V1`).
2. In the repo: Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://profeinty.github.io/Monsoonsim-Project-V1/` and drag the bookmark for your mode to the bookmarks bar.

## How the bookmark works

It sets `window.__FF_MODE` to the calculator mode, then adds a `<script>` tag for `reader.js` with a time stamp on the address so the browser never runs an old cached copy. If the game page blocks outside scripts, it shows a message and you fall back to pasting the reader in the Console.
