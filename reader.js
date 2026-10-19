(async () => {
  /* FF game reader v4 (live): reads this MonsoonSIM game, then follows it as it runs: a new day reaches the calculator
     within about a second, that day's sales a second or two later. Paste it again any time: it restarts cleanly and remembers
     the game setup, so it starts in seconds. It only reads, unless you start Auto-click or the Bot (each off until you start it). */
  if (window.__ff && window.__ff.stop) window.__ff.stop();
  document.getElementById("ff-reader-box")?.remove();
  const V = 4, BUILD = "v8.2", GAP = 900, CLICK = 1500;   // the game blocks fast clicks: page reads at least GAP ms apart, clicks in Configuration CLICK ms
  const MODE = String(window.__FF_MODE || ""), TAG = MODE;   // the calculator mode the bookmark was made for (Mode 12i or Mode 14), set by loader.js
  const log = m => console.log("%c[FF] " + m, "color:#B4451C;font-weight:bold");
  const toNum = s => s == null ? null : +String(s).replace(/[^\d.]/g, "");
  const dom = h => new DOMParser().parseFromString(h, "text/html");
  const text = h => dom(h).body.textContent.replace(/\s+/g, " ");
  const $id = id => document.getElementById(id);
  const hrefOf = a => { const h = a && a.getAttribute("href"); return h && !/^(#|javascript:)/i.test(h) ? h : null; };
  const menus = () => [...document.querySelectorAll('[id^="MENU2_"]')];
  const sec = ms => (Math.max(0, ms)/1000).toFixed(1) + " s", after = ms => ms < 100 ? "at once" : "after " + sec(ms);

  /* waits that keep time in a background tab: browsers slow a hidden tab's own timers down to once a minute, but not a worker's
     beat, so a tiny worker beats 10 times a second when the page allows one (the tab's own timer is the fallback) */
  const waits = new Set();
  const wake = () => { const now = Date.now(); for (const w of waits) if (now >= w.at) { waits.delete(w); w.go(); } };
  const sleep = ms => new Promise(go => { const w = {at: Date.now() + ms, go}; waits.add(w); setTimeout(() => { if (waits.delete(w)) go(); }, ms); });

  /* what we learned about this game, kept in this browser so a restart is quick */
  const KEY = "ff-reader:" + location.host + (TAG ? ":" + TAG : "");   // each mode remembers its own game
  let mem = {}; try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };

  /* requests go one at a time, apart. If the game ever says to slow down: much further apart for a while, and never again
     closer than the gap it refused (remembered for this game, up to 3 s) */
  let floor = Math.min(3000, Math.max(GAP, +mem.gapFloor || 0)), gap = floor, lastHit = 0, slowAt = 0, hits = 0;
  const pace = async (ms = gap) => { for (let w; (w = lastHit + ms - Date.now()) > 0;) await sleep(w); lastHit = Date.now(); };
  const req = async (url, body) => {   // a GET, or a form POST (the bot) when there's a body: both in the same queue
    if (/SPACE_CANCEL/i.test(url)) throw new Error("refused: that link cancels a rental");
    if (body != null && new URL(url, location.href).origin !== location.origin) throw new Error("refused: not this game's address");
    for (let t = 0; ; t++) {
      await pace(); hits++;
      const ctl = typeof AbortController === "function" ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 20000);
      const opt = {credentials: "same-origin", signal: ctl ? ctl.signal : undefined};
      if (body != null) Object.assign(opt, {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body});
      let h, ok = true; try { const r = await fetch(url, opt); ok = r.ok; h = await r.text(); } finally { clearTimeout(to); }
      if (body != null && !ok) throw new Error("the game answered with an error page");
      if (h.length > 4000 || !/slow down|too fast/i.test(h)) { if (gap > floor && Date.now() - slowAt > 120000) gap = Math.max(floor, gap - 300); return h; }
      floor = Math.min(3000, Math.max(floor, gap + 300)); mem.gapFloor = floor; save();
      slowAt = Date.now(); gap = Math.min(Math.max(gap*2, floor), 6000); log(`The game asked to slow down: reading ${sec(gap)} apart for a while, then at least ${sec(floor)}.`);
      if (t >= 2) { if (body != null) throw new Error("the game kept asking to slow down"); return h; }
      await sleep(3000);
    }
  };
  const get = url => req(url), post = (url, body) => req(url, body);
  const page = async id => { const h = hrefOf($id(id)); if (!h) throw new Error("Menu " + id + " not found. Open your game page first."); return get(h); };
  const quiet = async (job, name) => { try { await job(); } catch (e) { if (name) log(name + ": " + e.message); } };

  let D = null, ready = false, host = null, stopped = false, busy = "", msg = "", note = "", noteAt = 0, stale = "", unseen = [], setupTried = -1, setupFailAt = 0,
    wantFull = false, wantSetup = "", newGame = false, lastSig = "", kpiDay = 0, lookAt = 0, seenDay = 0, dayAt = 0, dayLen = 0, backDays = 0, dayRead = 0,
    b2bSeries = null, salesWait = null, slowNext = 0, lastSlow = 0, sentBody = "", sendDue = false, lastSent = 0, mini = false, lastInput = 0, lap = {day: 0};

  /* 1. Today's dashboard: day, cash, stores, warehouses (our own box is hidden while reading, so its words never count) */
  const dash = () => {
    if (host) host.style.display = "none";
    const body = document.body.innerText;
    if (host) host.style.display = "";
    const X = {};
    const dm = (($id("KPI_DAY____") || {}).innerText || "").match(/(\d+)\s*\/\s*(\d+)/) || body.match(/(\d+)\s*\/\s*(\d+)/);
    if (dm) { X.day = +dm[1]; X.maxDay = +dm[2]; }
    const pick = re => { const m = body.match(re); return m ? toNum(m[1]) : null; };
    X.costs = Object.fromEntries([...body.matchAll(/(?:^|\n)\s*Cost - ([^\n]+?)\s*\n?\s*(\d[\d.,]*)\s*(?=\n|$)/g)].map(m => [m[1].replace(/\.{2,}$|…$/, "").trim(), toNum(m[2])]));
    X.cash = pick(/(?:^|\n)\s*Cash in Bank\s*\n?\s*([\d,]+)/); X.odUsed = pick(/(?:^|\n)\s*Overdraft Used\s*\n?\s*([\d,]+)/);
    X.delinq = pick(/(?:^|\n)\s*Delinquent Payouts\s*\n?\s*([\d,]+)/);
    X.stores = [...body.matchAll(/(?:^|\n)([^\n@]+)\n((?:[^\n@]+?\s*@\s*[\d.]+\s*\n\s*[\d,]+\s*\n)+)\s*Space utilization\s*\n?\s*\((\d+)%\)\s*([\d,]+)\s*\/\s*([\d,]+)/g)]
      .map(m => ({name: m[1].trim(), area: toNum(m[5]), used: toNum(m[4]),
        items: [...m[2].matchAll(/([^\n@]+?)\s*@\s*([\d.]+)\s*\n\s*([\d,]+)/g)].map(x => ({name: x[1].trim(), price: +x[2], qty: toNum(x[3])}))}));
    if (!X.stores.length) X.stores = boxStores();   // a screen laid out differently: read the retail boxes themselves
    X.warehouses = [...body.matchAll(/(?:^|\n)([^\n@\d][^\n@]*)\n((?:[^\n@\d][^\n@]*\n\s*[\d,]+\s*\n)+)\s*Machines\s*\n\s*(\d+)\s*\n\s*Space utilization\s*\n?\s*\((\d+)%\)\s*([\d,]+)\s*\/\s*([\d,]+)/g)]
      .map(m => ({name: m[1].trim(), machines: +m[3], area: toNum(m[6]),
        items: [...m[2].matchAll(/([^\n]+?)\s*\n\s*([\d,]+)/g)].map(x => ({name: x[1].trim(), qty: toNum(x[2])}))}));
    return X;
  };
  const boxStores = () => [...document.querySelectorAll("#RTL .kpi_title")].map(tl => {
    const st = {name: tl.textContent.replace(/\s+/g, " ").trim(), area: null, used: null, items: []};
    for (let el = tl.nextElementSibling; el && !el.classList.contains("kpi_title"); el = el.nextElementSibling)
      for (const li of el.matches("li") ? [el] : el.querySelectorAll("li")) {
        const tx = li.innerText.replace(/\s+/g, " ").trim(), m = tx.match(/^(.+?)\s*@\s*([\d.]+)\s*([\d,]+)?/), sp = tx.match(/Space utilization.*?([\d,]+)\s*\/\s*([\d,]+)/i);
        if (m) { const q = li.querySelector("span.right"); st.items.push({name: m[1].trim(), price: +m[2], qty: toNum(q ? q.textContent : m[3]) || 0}); }
        else if (sp) { st.used = toNum(sp[1]); st.area = toNum(sp[2]); }
      }
    return st;
  }).filter(st => st.items.length);
  /* keep the last good value when the dashboard isn't on screen (another module open) */
  const mergeDash = X => {
    for (const k of ["day", "maxDay", "cash", "odUsed", "delinq"]) if (X[k] != null) D[k] = X[k];
    if (X.cash != null) D.cashDay = X.day ?? D.day;   // the day that cash was read on (the bot doesn't trust yesterday's)
    if (X.stores.length || !D.stores) D.stores = X.stores;
    if (X.warehouses.length || !D.warehouses) D.warehouses = X.warehouses;
  };

  /* 2. The game setup (Configuration): about 20 s of clicks (the game blocks fast clicks), then the box is closed again.
     Read again when something new shows up, e.g. raw materials on day 20. */
  const readSetup = async why => {
    say(`Reading the game setup${why ? " (" + why + ")" : ""}: under half a minute, please don't click in the game.`);
    const cf = $id("MENU2_INF_cf"); if (!cf) throw new Error("The Configuration menu isn't on this page. Open your game's main page.");
    const box = () => $id("SlideTableMODE_CFG_PLAYER"), shown = () => !!(box() && box().getClientRects().length);
    const flat = () => (box() ? box().innerText : "").replace(/\n\s*\n+/g, "\n").split("\n").map(s => s.trim()).filter(Boolean).join("|");
    const until = async (ok, ms) => { for (const end = Date.now() + ms; !ok() && Date.now() < end;) await sleep(100); return ok(); };
    let wait = CLICK;
    const click = async el => { await pace(Math.max(gap, wait)); el.click(); };
    const loaded = () => shown() && /GEN General|FIN Finance|Allow\|/.test(flat());
    busy = "setup"; paint();
    const wasOpen = shown();
    await click(cf); await sleep(600); await until(loaded, 5000);
    if (!shown()) { await click(cf); await sleep(600); await until(loaded, 5000); }   // that click closed a box left open: open it again
    const expand = async (label, check) => {
      for (let t = 0; t < 3 && box() && !flat().includes(check); t++) {
        const c = [...box().querySelectorAll("[onclick], a")].filter(e => /^\d+$/.test(e.textContent.trim()))
          .find(e => { const r = e.closest("[id^=row]"); return r && r.innerText.replace(/\s+/g, " ").trim().startsWith(label); });
        if (!c) return;
        await click(c);
        if (!await until(() => flat().includes(check), 4000)) wait = 3500;   // the game was slow to answer: more time between clicks
      }
    };
    const steps = [["GEN General","Product 1 Allow"],["FIN Finance","Initial Cash"],["PMN Procurement","Vendor 1 Allow"],["RTL Retail","Consumer Store Loyalty"],
      ["MKT Marketing","Marketing Report Fee"],["PRD Production","Equipment 1 Allow"],["HCM Human","Initial Staff Salary"],["Vendor 1 Allow","Vendor 1 Lead Time"]];
    const between = async () => { if (ready && D && D.day !== dayRead) await daily(); };   // a new day while the setup is read: its sales go out first
    for (const [l, c] of steps) { await between(); say(`Reading the game setup: ${l}…`); await expand(l, c); }
    for (let i = 1; i <= 12 && flat().includes(`Equipment ${i} Allow`); i++) { await between(); say(`Reading the game setup: Equipment ${i}…`); await expand(`Equipment ${i} Allow`, `Equipment ${i} Name`); }
    for (let i = 1; i <= 24 && flat().includes(`Product ${i} Allow`); i++) { await between(); say(`Reading the game setup: Product ${i}…`); await expand(`Product ${i} Allow`, `Product ${i} Name`); }
    const T = flat(), g = re => { const m = T.match(re); return m ? m[1] : null; };
    if (!wasOpen && shown()) { await click(cf); await until(() => !shown(), 3000); }   // close the Configuration box again: the game screen as it was
    const X = {setupDay: dash().day || 1, modules: [...new Set([...T.matchAll(/(?:^|\|)([A-Z][A-Z0-9]{1,3}) [A-Z][a-z]+/g)].map(m => m[1]))]};
    X.initialCash = toNum(g(/Initial Cash\|([\d,]+)/));
    X.overdraftLimit = toNum(g(/Overdraft limit\|([\d,]+)/));
    X.maxDelinq = toNum(g(/Maximum Delinquent Payouts\|([\d,]+)/));
    X.lead = toNum(g(/Vendor 1 Lead Time\|(\d+)/));
    X.payTerms = toNum(g(/Vendor 1 Payment Terms\|(\d+)/));
    X.loyalty = g(/Consumer Store Loyalty\|(\w+)/);
    X.fmcg = g(/Fast Moving Consumer Goods Industry Allow\|(\w+)/);
    X.reportFee = toNum(g(/Marketing Report Fee\|([\d,]+)/));
    X.salary = toNum(g(/Initial Staff Salary\|([\d,.]+)/)); X.headcount = toNum(g(/Planned Dept Headcount\|(\d+)/)); X.hireFee = toNum(g(/Hire Fee\|([\d,]+)/));
    X.machines = [];
    for (let i = 1; i <= 12; i++) {
      if (g(new RegExp(`Equipment ${i} Allow\\|(\\w+)`)) !== "Yes") continue;
      X.machines.push({name: g(new RegExp(`Equipment ${i} Name\\|([^|]+)`)), price: toNum(g(new RegExp(`Equipment ${i} Price\\|([\\d,]+)`))),
        cap: toNum(g(new RegExp(`Equipment ${i} Production Capacity\\|([\\d,]+)`))), m2: toNum(g(new RegExp(`Equipment ${i} Dimension\\|([\\d.,]+)`))),
        staff: toNum(g(new RegExp(`Equipment ${i} Staff Required\\|(\\d+)`)))});
    }
    X.products = [];
    for (let i = 1; i <= 24; i++) {
      const name = g(new RegExp(`Product ${i} Name\\|([^|]+)`)); if (!name) continue;
      const bom = (g(new RegExp(`Product ${i} Bill of Material\\|(.*?)\\|Product ${i} `)) || "").split("|")
        .map(s => s.match(/^([\d.]+) (.+?) \(/)).filter(Boolean).map(m => ({q: +m[1], name: m[2]}));
      X.products.push({name, price: toNum(g(new RegExp(`Product ${i} Initial Price\\|([\\d.,]+)`))), cost: toNum(g(new RegExp(`Product ${i} Initial Costs\\|([\\d.,]+)`))),
        dim: toNum(g(new RegExp(`Product ${i} Dimension\\|([\\d.,]+)`))), expire: toNum(g(new RegExp(`Product ${i} Expire Day\\|(\\d+)`))), allow: g(new RegExp(`Product ${i} Allow\\|(\\w+)`)), bom});
    }
    busy = "yes";
    if (!X.products.length) throw new Error("Couldn't read the products in Configuration. Try Update setup again.");
    // a recipe item the setup doesn't list yet (e.g. raw materials that show up later): look again when it appears
    const names = new Set(X.products.map(p => p.name));
    X.missing = [...new Set(X.products.flatMap(p => p.bom.map(b => b.name)).filter(nm => !names.has(nm)))];
    mem.setup = X; mem.menusSeen = [...new Set([...(mem.menusSeen || []), ...menus().map(a => a.id)])]; save();
    stale = ""; log(`Setup read: ${X.products.length} products, ${X.machines.length} machine types${X.missing.length ? `, not shown yet: ${X.missing.join(", ")}` : ""}.`);
  };

  /* 3. Real sales: the game's retail sales report (Day, Dept, Product, Unit Sold); else a sales chart; else how much stock dropped */
  const norm = s => String(s ?? "").toLowerCase().replace(/\s+retail\s*$/, "").replace(/[^a-z0-9]+/g, "");
  const seriesIn = h => {   // chart series in a page's scripts: {name, pts: [[day, value], ...]}
    const sc = [...dom(h).querySelectorAll("script")].map(s => s.textContent).join("\n"), out = [];
    for (const m of sc.matchAll(/name\s*:\s*['"]([^'"]+)['"][\s\S]{0,300}?data\s*:\s*\[/g)) {
      const i = m.index + m[0].length - 1; let j = i, depth = 0;
      for (; j < sc.length; j++) { if (sc[j] === "[") depth++; else if (sc[j] === "]" && --depth === 0) break; }
      let d; try { d = JSON.parse(sc.slice(i, j + 1).replace(/\s+/g, "")); } catch (e) { continue; }
      if (!Array.isArray(d) || !d.length) continue;
      const start = +((sc.slice(m.index, i).match(/pointStart\s*:\s*(\d+)/) || [])[1] || 1);
      const pts = d.map((p, k) => Array.isArray(p) ? [+p[0], +p[1]] : [start + k, +p]).filter(p => isFinite(p[0]) && isFinite(p[1]));
      if (pts.length) out.push({name: m[1], pts, pairs: Array.isArray(d[0])});
    }
    return out;
  };
  const rowsIn = (doc, keyOf) => {   // tables with a "Unit Sold" column
    const out = [];
    for (const t of doc.querySelectorAll("table")) {
      const trs = [...t.rows], hi = trs.findIndex(r => [...r.cells].some(c => /^\s*(units?\s*sold|sold|qty\s*sold)\s*$/i.test(c.textContent)));
      if (hi < 0) continue;
      const head = [...trs[hi].cells].map(c => c.textContent.trim().toLowerCase()), col = re => head.findIndex(x => re.test(x));
      const cD = col(/^day$/), cL = col(/dept|location|store|city|outlet/), cP = col(/product|item/), cS = col(/^(units?\s*sold|sold|qty\s*sold)$/);
      if (cS < 0 || cP < 0) continue;
      const above = cL < 0 ? (t.caption?.textContent || t.previousElementSibling?.textContent || "").trim() : "";   // one table per store, named above it
      for (const r of trs.slice(hi + 1)) { const v = [...r.cells].map(c => c.textContent.trim()), k = keyOf(cL >= 0 ? v[cL] : above, v[cP]); if (k) out.push({day: cD >= 0 ? toNum(v[cD]) : null, k, q: toNum(v[cS]) || 0}); }
    }
    return out;
  };
  const csvRows = (csv, keyOf) => {   // the same report as a CSV download
    const lines = csv.split(/\r?\n/).filter(Boolean).map(l => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").trim()));
    if (lines.length < 2) return [];
    const head = lines[0].map(x => x.toLowerCase()), col = re => head.findIndex(x => re.test(x));
    const cD = col(/^day$/), cL = col(/dept|location|store|city/), cP = col(/product|item/), cS = col(/^(units?\s*sold|sold)$/);
    if (cS < 0 || cP < 0 || cL < 0) return [];
    return lines.slice(1).map(v => ({day: cD >= 0 ? toNum(v[cD]) : null, k: keyOf(v[cL], v[cP]), q: toNum(v[cS]) || 0})).filter(r => r.k);
  };
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m])/2) : 0; };
  const normalDaily = (rows, today, hol) => {   // median of the last 5 full non-holiday days, from the store's first sale
    const by = {};
    for (const r of rows) (by[r.k] = by[r.k] || []).push(r);
    const out = {}; let days = 0;
    for (const [k, rs] of Object.entries(by)) {
      const dated = rs.filter(r => r.day != null);
      let vals;
      if (dated.length) {
        const per = {}; for (const r of dated) if (r.day < today && !hol.has(r.day)) per[r.day] = (per[r.day] || 0) + r.q;
        const ds = Object.keys(per).map(Number).sort((a, b) => a - b), first = ds.findIndex(d => per[d] > 0);
        vals = first < 0 ? [] : ds.slice(first).slice(-5).map(d => per[d]);
      } else vals = rs.map(r => r.q);
      if (vals.length) { out[k] = Math.round(median(vals)); days = Math.max(days, vals.length); }
    }
    return {sales: out, days};
  };
  const readSales = async () => {   // the last day in the report it read (null: no days in it)
    const cities = (D.cities || []).map(c => c.name), prods = (D.products || []).map(p => p.name), pair = {};
    for (const c of cities) for (const p of prods) pair[norm(c) + "|" + norm(p)] = pair[norm(c) + norm(p)] = `${c}-${p}`;
    const keyOf = (loc, prod) => pair[norm(loc) + "|" + norm(prod)] || null, today = D.day || 1, hol = new Set(D.holidays || []);
    const score = a => (/retail|rtl/i.test(a.id + a.textContent) ? 2 : 0) - (/b2b|whole/i.test(a.id + a.textContent) ? 3 : 0) + (a.id === mem.salesId ? 9 : 0);
    const cands = menus().filter(a => hrefOf(a) && /sale|sold/i.test(a.id + " " + a.textContent) && !/forecast|fcst/i.test(a.id + " " + a.textContent))
      .sort((a, b) => score(b) - score(a)).slice(0, 3);
    D.salesChecked = cands.map(a => a.id);
    for (const a of cands) {
      let h; try { h = await page(a.id); } catch (e) { continue; }
      const doc = dom(h);
      let rows = rowsIn(doc, keyOf);
      if (!rows.length) {   // a CSV download link on that page
        const csv = [...doc.querySelectorAll("a[href]")].find(x => /csv/i.test(x.getAttribute("href") + x.textContent) && /sale/i.test(x.getAttribute("href") + x.textContent));
        if (csv) try { rows = csvRows(await get(csv.getAttribute("href")), keyOf); } catch (e) {}
      }
      if (!rows.length) for (const s of seriesIn(h)) { const k = pair[norm(s.name)]; if (k) for (const [d, q] of s.pts) rows.push({day: d, k, q}); }
      if (!rows.length) continue;
      const {sales, days} = normalDaily(rows, today, hol);
      if (!Object.keys(sales).length) continue;
      mem.salesId = a.id; save();
      D.sales = sales; D.salesFrom = `game sales report${days ? `, last ${days} day${days > 1 ? "s" : ""}` : ""}`;
      const dated = rows.filter(r => r.day != null);
      return dated.length ? Math.max(...dated.map(r => r.day)) : null;
    }
    // no sales report found: estimate from how much each store's stock dropped from one day to the next (days with a delivery are skipped)
    const ds = Object.keys(mem.stock || {}).map(Number).filter(d => d < today).sort((a, b) => a - b).slice(-6);
    const rows = [];
    for (let i = 1; i < ds.length; i++) {
      const a = mem.stock[ds[i - 1]], b = mem.stock[ds[i]];
      for (const k of Object.keys(b)) if (a[k] != null && b[k] <= a[k]) rows.push({day: ds[i], k, q: (a[k] - b[k])/(ds[i] - ds[i - 1])});
    }
    const {sales, days} = normalDaily(rows, today, hol);
    if (Object.keys(sales).length) { D.sales = sales; D.salesFrom = `estimated from stock drops, ${days} day${days > 1 ? "s" : ""}`; }
    else { delete D.sales; D.salesFrom = ""; }
    return null;
  };
  const rememberStock = () => {   // each store's stock at the latest read of each day
    const snap = {}, city = nm => (D.cities || []).find(c => norm(c.name) === norm(nm))?.name || nm;   // "Berlin Retail" on the dashboard = Berlin
    for (const s of D.stores || []) for (const it of s.items) snap[`${city(s.name)}-${it.name}`] = it.qty;
    if (!Object.keys(snap).length || !D.day) return;
    mem.stock = mem.stock || {}; mem.stock[D.day] = snap;
    for (const d of Object.keys(mem.stock).map(Number).sort((a, b) => b - a).slice(8)) delete mem.stock[d];
    save();
  };

  /* 4. What changes during the game. Each new day: its sales, then the machines (a request or two, read at once).
     Between days, one at a time: store rents, warehouse rent, the forecasts. */
  const SLOW = {
    rents: async () => {
      const loc = text(await page("MENU2_retail_location"));
      const cities = [...loc.matchAll(/Location: ([^$]+?)\s*(?:\$\(|Specification)[\s\S]*?Retail Rental:\s*([\d.]+)/g)].map(m => {
        const demo = m[0].match(/Seniors ([\d,]+) Adults ([\d,]+) Juniors ([\d,]+)/);
        return {name: m[1].trim(), rent: +m[2], demo: demo ? demo.slice(1).map(toNum) : null};
      });
      if (cities.length) D.cities = cities;
    },
    warehouse: async () => { const wh = text(await page("MENU2_whs_location")).match(/Warehouse Rental:\s*([\d.]+)/); if (wh) D.whRent = +wh[1]; },
    forecast: async () => {
      const fh = await page("MENU2_chart_rtl_forecast"), f = {}, spikes = new Set(), ratios = [];
      for (const s of seriesIn(fh).filter(s => s.pairs)) {
        const cnt = {}; s.pts.forEach(p => cnt[p[1]] = (cnt[p[1]] || 0) + 1);
        const base = +Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        f[s.name] = base; s.pts.forEach(p => { if (base > 0 && p[1] > base*1.5) spikes.add(p[0]); });
        if (base > 0) ratios.push(Math.max(...s.pts.map(p => p[1]))/base);
      }
      if (Object.keys(f).length) { D.forecast = f; D.holidays = [...spikes].sort((a, b) => a - b); D.spike = ratios.length ? Math.round(Math.max(...ratios)*10)/10 : 1; }
    },
    b2b: async () => { b2bSeries = seriesIn(await page("MENU2_chart_b2b_forecast")).filter(s => s.pairs); b2bNow(); }
  };
  const b2bNow = () => {   // the B2B forecast: average of the next 15 days, worked out again each day from the chart read last
    if (!b2bSeries || !D) return;
    const b = {};
    for (const s of b2bSeries) { const ahead = s.pts.filter(p => p[0] >= (D.day || 1)).slice(0, 15), use = ahead.length ? ahead : s.pts; b[s.name] = Math.round(use.reduce((t, p) => t + p[1], 0)/use.length); }
    D.b2bForecast = b;
  };
  const readMachines = async () => {
    if (!$id("MENU2_PRDmach")) { D.ownMachines = []; return; }
    const mt = text(await page("MENU2_PRDmach"));
    D.ownMachines = [...mt.matchAll(/Asset ID (\d+) Type : (.+?) Age :[\s\S]*?Current Production capacity : ([\d,]+)[\s\S]*?Setup for : ([^$]*?)\s*Timetable/g)]
      .map(m => ({id: m[1], type: m[2].trim(), cap: toNum(m[3]), product: m[4].trim()}));
  };
  const menuList = () => menus().map(a => a.id + (a.textContent.trim() ? "=" + a.textContent.trim().slice(0, 30) : "")).slice(0, 150);
  const checkNew = () => {   // something the setup doesn't know yet (raw materials, machines, a module switched on later): read the setup again
    const known = new Set([...(D.products || []).map(p => p.name), ...(mem.ignored || [])]), types = new Set([...(D.machines || []).map(m => m.name), ...(mem.ignored || [])]);
    unseen = [...new Set([...(D.stores || []).flatMap(s => s.items.map(i => i.name)), ...(D.warehouses || []).flatMap(w => w.items.map(i => i.name)),
      ...(D.ownMachines || []).map(o => o.type).filter(t => !types.has(t))].filter(nm => nm && !known.has(nm)))];
    const newMenus = menus().map(a => a.id).filter(id => !(mem.menusSeen || []).includes(id));
    stale = unseen.length ? "new in the game: " + unseen.slice(0, 3).join(", ") : newMenus.length ? "new menus in the game (a module switched on?)" : "";
  };
  const daily = async () => {   // the new day: its sales go out the moment they're read, the machines right after
    const day = D.day;
    if (lap.day === day && lap.h0 == null) lap.h0 = hits;
    if (ready) say(`Day ${day}: reading sales…`);
    let last = null; try { last = await readSales(); } catch (e) { log("Sales: " + e.message); }
    salesWait = last != null && last < day - 1 ? {day, tries: 0, at: Date.now()} : null;   // the report doesn't have yesterday yet: look again in a moment
    if (!salesWait) salesDone(day);
    if (D.ownMachines) deliver();   // (the first read waits for the machines too)
    await quiet(readMachines);
    if (BOT.on && !B2B.used && $id("MENU2_B2Bincm")) await quiet(readOffers, "B2B offers");   // the bot's plan needs the offer numbers
    D.menus = menuList(); dayRead = day; checkNew();
    const b0 = sentBody; deliver(); if (lap.day === day && sentBody !== b0) lap.full = Date.now();   // the bot waits for the plan made from all of it
    msg = ""; dayLog(day);
    if (B2B.used) { await quiet(b2bCheck, "B2B offers"); deliver(); }
    paint();
  };
  const dayLog = day => {   // in the Console: how fast each day went out
    if (!ready || lap.day !== day || lap.logged || salesWait) return;
    lap.logged = true; const n = hits - lap.h0;
    log(link.state === "linked" && lap.sent ? `Day ${day}: on the calculator ${after(lap.sent - lap.seen)}, its sales ${after((lap.sales || Date.now()) - lap.seen)} (${n} request${n === 1 ? "" : "s"}).`
      : `Day ${day}: sales read ${after(lap.read - lap.seen)} (${n} request${n === 1 ? "" : "s"}).`);
  };
  const salesDone = day => { D.salesDay = day; if (lap.day === day) lap.read = Date.now(); };
  const salesAgain = async () => {
    const w = salesWait; w.at = Date.now(); w.tries++;
    let last = null; try { last = await readSales(); } catch (e) {}
    if (last == null || last >= w.day - 1 || w.tries >= 4) { salesWait = null; salesDone(w.day); }
    deliver(); dayLog(w.day);
  };
  const readAll = async () => {   // everything: the first read, Read now, after the setup is read again
    const X = dash(), prev = D;
    D = Object.assign({ffcalc: V}, prev || {}, mem.setup || {}, {mode: TAG});
    if (!prev) { Object.assign(D, X); if (X.cash != null) D.cashDay = X.day; } else mergeDash(X);
    if (ready && D.day !== dayRead) await daily();   // a new day came in meanwhile (e.g. while the setup was read): its sales go out first
    say("Reading store rents…"); await quiet(SLOW.rents, "Store rents"); await quiet(SLOW.warehouse);
    say("Reading the demand forecasts…"); await quiet(SLOW.forecast, "Forecast"); D.forecast = D.forecast || {};
    await quiet(SLOW.b2b); D.b2bForecast = D.b2bForecast || {};
    rememberStock(); lastSlow = Date.now(); wantFull = false;
    say("Reading sales…"); await daily();
    if (!ready) { ready = true; lastSig = ""; paint(); log(`Live: the box at the bottom right follows the game${link.state === "linked" ? " and sends each change to the calculator at once" : ". Click Copy data there to paste it in the calculator"}.`); }
  };

  /* 5. Hand the data over: straight to the calculator when this tab was opened from it (or the bot opened it), else by Copy data */
  const link = {state: window.opener ? "looking" : "none", origin: "*", ackAt: 0, helloAt: 0, sentAt: 0, win: null};
  const SELF = [...document.scripts].map(s => s.src).filter(s => /\/reader\.js(\?|$)/.test(s)).pop() || "";
  const CALC = SELF ? new URL("calc/", SELF).href : "";   // the calculator next to this reader, for the bot to open
  const calcWin = () => link.win && !link.win.closed ? link.win : window.opener && !window.opener.closed ? window.opener : null;
  const toCalc = m => { try { const w = calcWin(); if (w) { w.postMessage(m, link.origin); return true; } } catch (e) {} return false; };
  const hello = () => { link.helloAt = Date.now(); link.origin = "*"; toCalc({ff: "hello", v: V, mode: TAG}); };
  const openCalc = () => {   // from a click (Start): the calculator in its own tab, linked to this one
    if (!CALC || calcWin() === link.win && link.win) return false;
    let w = null; try { w = window.open(CALC, "ff-calc-" + (TAG || "game")); } catch (e) {}
    if (!w) return false;
    link.win = w; link.state = "looking"; link.helloAt = Date.now(); log("Opened the FF calculator: unlock it there if it asks, and it links to this tab."); return true;
  };
  const onMsg = e => {
    if (!calcWin() || e.source !== calcWin() || !e.data) return;
    if (e.data.ff === "plan") { const bad = takePlan(e.data, "calculator"); if (bad) log("Bot: " + bad); return; }   // today's plan, for the Bot tab
    if (e.data.ff !== "ack") return;
    const was = link.state;
    link.origin = e.origin && e.origin !== "null" ? e.origin : "*"; link.state = "linked"; link.ackAt = Date.now();
    if (was !== "linked") { log("Linked to the FF calculator."); if (ready) send(); if (BOT.on) toCalc({ff: "botHello", v: 1}); for (const m of Object.values((BOT.days[today()] || {}).reports || {})) toCalc(m); }
    paint();
  };
  window.addEventListener("message", onMsg);
  const send = () => {   // at once; a burst of changes goes out as one message (on the next beat)
    if (stopped || link.state !== "linked" || !D) return;
    const now = Date.now();
    if (now - lastSent < 300) { sendDue = true; return; }
    sendDue = false;
    if (!toCalc({ff: "data", v: V, data: D})) return;
    lastSent = link.sentAt = now;
    if (lap.day === D.day) { lap.sent = lap.sent || now; if (D.salesDay === lap.day) lap.sales = lap.sales || now; }
  };
  const deliver = () => {   // only what changed goes out
    if (stopped || !D) return;
    D.url = location.href;
    const body = JSON.stringify({...D, at: 0});
    if (body !== sentBody) { sentBody = body; D.at = Date.now(); window.__ffdata = JSON.stringify(D); send(); }
    paint();
  };

  /* 6. The panel (built once; only its words change, so a button never moves under a click). Drag it by its title bar; it
     remembers where it was. Alt+F hides or shows it. Tabs: Live (the link), Today, Stores, Stock, Checks, Auto, Bot. */
  host = document.createElement("div"); host.id = "ff-live";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  const POS = "ff-panel-pos";
  let tab = "live", hidden = false;
  try { const q = JSON.parse(localStorage.getItem(POS)); if (q && q.tab) tab = q.tab; if (q && q.x != null) place(q.x, q.y); } catch (e) {}
  function place(x, y){
    x = Math.max(0, Math.min(x, innerWidth - 60)); y = Math.max(0, Math.min(y, innerHeight - 40));
    Object.assign(host.style, {left: x + "px", top: y + "px", right: "auto", bottom: "auto"});
  }
  const keep = () => { try { const r = host.getBoundingClientRect(); localStorage.setItem(POS, JSON.stringify({x: host.style.left ? r.left : null, y: r.top, tab})); } catch (e) {} };
  const root = host.attachShadow({mode: "open"});
  document.body.appendChild(host);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const say = m => { msg = m; paint(); };
  const CSS = `<style>:host{all:initial}*{box-sizing:border-box;font:13px/1.4 system-ui,sans-serif}.b{width:min(330px,calc(100vw - 32px));background:#FAFBF8;color:#18231E;border:2px solid #B4451C;border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
      .h{display:flex;align-items:center;gap:6px}.h b{flex:1;font-weight:700}.x{border:0;background:none;cursor:pointer;font-size:16px;color:#18231E;padding:0 4px}
      p{margin:6px 0}p:empty{display:none}.m{color:#5a6660;font-size:12px}.w{color:#9a3412}.ok{color:#15803d;font-weight:600}
      .r{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}button.a{border:1px solid #999;background:#fff;color:#18231E;border-radius:5px;padding:6px 10px;cursor:pointer}button.p{background:#B4451C;border-color:#B4451C;color:#fff;font-weight:600}button:disabled{opacity:.55;cursor:default}
      .h{cursor:move;user-select:none;touch-action:none;margin:-10px -12px 0;padding:8px 12px;background:#B4451C;color:#fff;border-radius:5px 5px 0 0}.h .x{color:#fff}
      .tabs{display:flex;flex-wrap:wrap;gap:2px;margin:8px 0 2px;border-bottom:1px solid #D0D8D1}.tabs button{border:0;background:none;padding:5px 8px;cursor:pointer;color:#55655D;border-bottom:2px solid transparent;margin-bottom:-1px}.tabs button[aria-selected="true"]{color:#18231E;font-weight:600;border-bottom-color:#B4451C}
      .pane{max-height:min(320px,55vh);overflow:auto}table{border-collapse:collapse;width:100%;margin-top:4px}td,th{padding:3px 4px;border-top:1px solid #E2E7E1;text-align:left;vertical-align:top}th{font-size:11px;color:#55655D;font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .bar{height:6px;background:#E2E7E1;border-radius:3px;overflow:hidden;margin-top:2px}.bar i{display:block;height:100%;background:#2A7546}.bar i.hi{background:#B2261E}
      ul{margin:4px 0;padding-left:18px}li{margin:3px 0}.k{color:#55655D;font-size:11px}
      .stopbar:empty{display:none}.stopbar{margin-top:8px}button.stop{width:100%;background:#B2261E;border-color:#B2261E;color:#fff;font-weight:700}
      input[type=number]{font:inherit;padding:2px 4px;border:1px solid #999;border-radius:4px}label{cursor:pointer}
      button.big{width:100%;margin:4px 0;padding:9px;font-size:15px;font-weight:700}button.go{background:#2A7546;border-color:#2A7546;color:#fff}
      textarea{width:100%;min-height:64px;margin-top:4px;font:12px/1.3 ui-monospace,monospace;border:1px solid #999;border-radius:4px;padding:4px}summary{cursor:pointer;margin-top:10px}
      td.st{white-space:nowrap;font-weight:600}td.done{color:#15803d}td.failed{color:#B2261E}td.skipped{color:#5a6660;font-weight:400}
      .pill{display:inline-flex;gap:6px;align-items:center;background:#FAFBF8;color:#18231E;border:2px solid #B4451C;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:600}
      @media (pointer:coarse){button.a{min-height:42px;padding:8px 14px}.x{min-width:40px;min-height:40px}.pill{min-height:42px}}
</style>`;
  const TABS = [["live", "Live"], ["today", "Today"], ["stores", "Stores"], ["stock", "Stock"], ["checks", "Checks"], ["auto", "Auto"], ["bot", "Bot"]];

  /* Auto-click (allowed by the Rexar XIV organizers): you pick the game's own buttons, it presses them in order, then waits and
     repeats. Off every time the panel starts; Stop, Esc or × ends it. It only presses buttons and links: it never types into a
     field or changes hidden data. A button whose words changed is skipped, so a moved layout can't make it press the wrong one. */
  const CKEY = KEY + ":clicks", CLICKABLE = 'button,a[href],input[type=button],input[type=submit],[role=button],[onclick]';
  const AC = {on: false, picking: false, every: 5, rounds: 0, done: 0, last: "", picks: []};
  try { const q = JSON.parse(localStorage.getItem(CKEY)) || {}; AC.picks = q.picks || []; AC.every = +q.every || 5; AC.rounds = +q.rounds || 0; } catch (e) {}
  const acSave = () => { try { localStorage.setItem(CKEY, JSON.stringify({picks: AC.picks, every: AC.every, rounds: AC.rounds})); } catch (e) {} };
  const words = el => (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const selOf = el => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      if (e.id) { parts.unshift("#" + window.CSS.escape(e.id)); break; }
      let i = 1; for (let x = e; (x = x.previousElementSibling);) if (x.tagName === e.tagName) i++;
      parts.unshift(e.tagName.toLowerCase() + ":nth-of-type(" + i + ")");
    }
    return parts.join(" > ");
  };
  const findPick = pk => { try { return document.querySelector(pk.sel); } catch (e) { return null; } };
  const usable = el => el && el.isConnected && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.getClientRects().length > 0 && !host.contains(el);
  let glow = null;
  const unglow = () => { if (glow) { glow.el.style.outline = glow.o; glow = null; } };
  const onOver = e => { if (!AC.picking) return; const el = e.target.closest && e.target.closest(CLICKABLE); if (!el || host.contains(el) || (glow && glow.el === el)) return;
    unglow(); glow = {el, o: el.style.outline}; el.style.outline = "3px solid #B4451C"; };
  const onPick = e => {
    if (!AC.picking || e.composedPath().includes(host)) return;
    const el = e.target.closest && e.target.closest(CLICKABLE);
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    AC.picking = false; unglow();
    if (!el) { AC.last = "That isn't a button. Press Pick a button and try again."; paint(); return; }
    AC.picks.push({sel: selOf(el), label: words(el)}); acSave(); AC.last = `Added “${words(el) || "button"}”.`; paint();
  };
  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("click", onPick, true);
  const acStop = why => { if (!AC.on && !AC.picking) return; AC.on = false; AC.picking = false; unglow(); AC.last = why || "Stopped."; log("Auto-click: " + AC.last); paint(); };
  const acRun = async () => {
    if (AC.on || !AC.picks.length) return;
    AC.on = true; AC.done = 0; AC.last = "Running…"; log("Auto-click on."); paint();
    while (AC.on && !stopped) {
      for (const pk of AC.picks) {
        if (!AC.on) break;
        const el = findPick(pk);
        if (!usable(el)) AC.last = `Skipped “${pk.label || "button"}”: not on the screen right now.`;
        else if (pk.label && words(el) !== pk.label) AC.last = `Skipped “${pk.label}”: that spot now says “${words(el)}”.`;
        else { el.click(); AC.last = `Pressed “${pk.label || "button"}”.`; }
        paint(); await sleep(CLICK);
      }
      AC.done++; paint();
      if (AC.rounds && AC.done >= AC.rounds) { acStop(`Done: ${AC.done} round${AC.done === 1 ? "" : "s"}.`); break; }
      for (let t = 0; AC.on && t < AC.every * 10; t++) await sleep(100);
    }
  };
  /* B2B deals (B2B > B2B Offers). Two kinds: fixed price ("Each: 14 EUR", first team to accept gets it) and bids ("Max bid price
     allowed"). Smart mode grabs a deal only when the warehouses hold enough of the product and the price is at least cost × margin;
     a bid goes in 3% under the max price, never below that. The game takes one similar deal a day, so one per product per day.
     For now this only previews: the pressing and bidding are wired up once the open-deal screen and the bid form are known. */
  const B2B = {used: false, mode: "smart", margin: 1.15, at: 0, offers: [], err: "", taken: {}};
  try { const q = JSON.parse(localStorage.getItem(KEY + ":b2b")) || {}; if (q.mode) B2B.mode = q.mode; if (+q.margin) B2B.margin = +q.margin; } catch (e) {}
  const b2bSave = () => { try { localStorage.setItem(KEY + ":b2b", JSON.stringify({mode: B2B.mode, margin: B2B.margin})); } catch (e) {} };
  const isLabel = e => e.children.length < 3 && /^\s*OFFER\s*$/.test(e.textContent);
  const offerCards = doc => [...doc.querySelectorAll("body *")].filter(isLabel).map(l => {
    let c = l; while (c.parentElement && c.parentElement !== doc.body && [...c.parentElement.querySelectorAll("*")].filter(isLabel).length === 1) c = c.parentElement;
    return c;
  });
  const offerData = o => ({id: o.id, product: o.product, qty: o.qty, price: o.each, maxBid: o.maxBid, kind: o.kind, due: o.due, state: o.state});
  const readOffers = async () => { D.b2bOffers = offerCards(dom(await page("MENU2_B2Bincm"))).map(parseOffer).filter(o => o.id).map(offerData); };   // for the calculator: it plans deals by offer number
  const parseOffer = c => {
    const t = c.textContent.replace(/\s+/g, " "), g = (re, f = x => x) => { const m = t.match(re); return m ? f(m[1]) : null; };
    const pm = t.match(/Product\s*:\s*(.+?)\s+([\d,]+)\s*Unit/i);
    const bid = [...c.querySelectorAll("a,button,input[type=button],input[type=submit]")].find(b => /^\s*bid\s*$/i.test(b.textContent || b.value));
    const o = {id: g(/OFFER\s*(\d+)/), client: g(/Client\s*:\s*(.+?)\s+Product/), product: pm && pm[1].trim(), qty: pm && toNum(pm[2]),
      each: g(/Each\s*:\s*([\d.]+)/, Number), maxBid: g(/Max bid price allowed\s*:\s*([\d.]+)/, Number), due: g(/Expected Delivery Day\s*:\s*(\d+)/, Number),
      penalty: g(/Late penalty\s*:\s*([\d,]+)/, toNum), asked: g(/Requested\s*(\d+)/, Number)};
    o.kind = o.maxBid != null ? "bid" : "fixed";
    o.state = /We participated/i.test(t) ? "done" : /Taken by others/i.test(t) ? "gone" : /\b(won|lost|accepted|awarded|expired|closed)\b/i.test(t) ? "done" : o.kind === "bid" && !bid ? "done" : "open";
    return o;
  };
  const costOf = (costs, name) => { for (const k in costs) if (name && (name === k || name.startsWith(k))) return costs[k]; return null; };
  const stockOf = name => (D && D.warehouses || []).reduce((t, w) => t + (w.items || []).filter(it => it.name === name).reduce((a, it) => a + (it.qty || 0), 0), 0);
  const judge = (o, costs, used) => {
    const price = o.kind === "bid" ? Math.floor(o.maxBid * 97) / 100 : o.each, cost = costOf(costs, o.product), have = stockOf(o.product) - (used[o.product] || 0);
    const v = {price, cost, have, go: false, why: ""};
    if (o.state !== "open") { v.why = o.state === "gone" ? "taken by others" : "already in"; return v; }
    if (B2B.taken[o.product] === (D && D.day)) { v.why = "already one for this product today"; return v; }
    if (B2B.mode === "all") { v.go = true; v.why = "grab all"; return v; }
    if (cost == null) { v.why = "no cost per unit on the dashboard"; return v; }
    if (price < cost * B2B.margin) { v.why = `${price} is under cost ${cost} × ${B2B.margin}`; return v; }
    if (have < o.qty) { v.why = `only ${have.toLocaleString()} in the warehouses`; return v; }
    v.go = true; v.why = `+${Math.round((price - cost) * o.qty).toLocaleString()} profit`; return v;
  };
  const b2bCheck = async () => {
    B2B.used = true; B2B.err = ""; paint();
    const h = await page("MENU2_B2Bincm"), costs = dash().costs || {}, used = {};
    B2B.offers = offerCards(dom(h)).map(parseOffer).filter(o => o.id).map(o => {
      const v = judge(o, costs, used); if (v.go) used[o.product] = (used[o.product] || 0) + o.qty; return {...o, v};
    });
    D.b2bOffers = B2B.offers.map(offerData);
    const seen = {}; for (const o of B2B.offers) if (o.v.go) { if (seen[o.product]) { o.v.go = false; o.v.why = "one per product per day"; } seen[o.product] = 1; }
    B2B.at = Date.now(); paint();
  };
  const paneB2B = () => {
    const open = B2B.offers.filter(o => o.state === "open");
    return `<p style="margin-top:12px"><b>B2B deals</b> <span class="k">preview: shows what it would grab</span></p>
      <p class="r"><label>Mode <select data-b2b="mode"><option value="smart" ${B2B.mode === "smart" ? "selected" : ""}>Smart: in stock and profitable</option><option value="all" ${B2B.mode === "all" ? "selected" : ""}>Grab all</option></select></label>
      <label>Margin × <input type="number" min="1" max="3" step="0.01" value="${B2B.margin}" data-b2b="margin" style="width:4.5em"></label>
      <button class="a" data-ac="b2b">${B2B.at ? "Check again" : "Check offers"}</button></p>
      ${B2B.err ? `<p class="w">${esc(B2B.err)}</p>` : ""}
      ${!B2B.at ? "" : !open.length ? '<p class="m">No open deals right now.</p>' : `<table><tr><th>Deal</th><th class="n">Price</th><th></th></tr>${open.map(o => `<tr><td>${esc(o.product)} ${n(o.qty)}<div class="k">${o.kind === "bid" ? "bid, max " + o.maxBid : "fixed"} · due day ${n(o.due)}</div></td><td class="n">${n(o.v.price)}</td><td>${o.v.go ? '<span class="ok">Grab</span>' : "Skip"}<div class="k">${esc(o.v.why)}</div></td></tr>`).join("")}</table>`}
      ${B2B.at ? `<p class="k">Checked ${esc(new Date(B2B.at).toLocaleTimeString())}, then again each new day.</p>` : ""}`;
  };
  const paneAuto = () => `<p><label><input type="checkbox" data-ac="on" ${AC.on ? "checked" : ""} ${AC.picks.length ? "" : "disabled"}> <b>Auto-click ${AC.on ? '<span class="ok">ON</span>' : "off"}</b></label></p>
      <p class="k">Presses the buttons below in order, waits, then repeats. Esc or Stop ends it. It never types into fields.</p>
      ${AC.picks.length ? `<table><tr><th>#</th><th>Button</th><th></th></tr>${AC.picks.map((pk, i) => `<tr><td>${i + 1}</td><td>${esc(pk.label || pk.sel)}</td><td class="n"><button class="x" data-ac="del" data-i="${i}" title="Remove" ${AC.on ? "disabled" : ""}>×</button></td></tr>`).join("")}</table>` : '<p class="m">No buttons yet. Press <b>Pick a button</b>, then click the game button you want pressed.</p>'}
      <div class="r"><button class="a" data-ac="pick" ${AC.on ? "disabled" : ""}>${AC.picking ? "Click a game button…" : "Pick a button"}</button>${AC.picks.length ? `<button class="a" data-ac="clear" ${AC.on ? "disabled" : ""}>Clear all</button>` : ""}</div>
      <p class="r"><label>Wait <input type="number" min="2" max="600" step="1" value="${AC.every}" data-ac="every" style="width:4.5em"> s between rounds</label>
      <label>Stop after <input type="number" min="0" max="9999" step="1" value="${AC.rounds}" data-ac="rounds" style="width:4.5em"> rounds (0 = never)</label></p>
      <p class="m">${AC.on ? `Round ${AC.done + 1}. ` : ""}${esc(AC.last)}</p>
      <p class="k">If a button opens a new page, the panel closes and auto-click stops: run the bookmark again.</p>${paneB2B()}`;
  /* The bot (Bot tab): carries out the FF calculator's plan for the day. The calculator sends {ff: "plan"} after each update of the
     game data (or a plan is pasted, for testing); the bot does its steps in their order and reports each one back ({ff: "step"}),
     so the calculator books what was bought and leaves done steps out of its next plan. Off every time the panel starts; Stop,
     Esc or × ends it. Every number comes from the plan: amounts and their ranges, prices, budgets. Each section's running total
     stays under its budget, and cash (the dashboard's, less what the bot spent today) above the plan's reserve. The game must be
     on the plan's day with about the plan's cash, else the bot asks for a fresh plan. Every answer from the game is read: error
     words fail the step; 2 failures in a row, or more than the plan's error budget, stop the bot (and tell the calculator).
     It never opens a Cancel link and skips screens not mapped yet (machines, prices). Practice does everything but send, and
     reports nothing to the calculator. Plan format: plan-format.md, written by the calculator side. */
  const SECTIONS = [["b2b", "B2B deals"], ["machine", "Machines"], ["rent_wh", "Warehouse space"], ["rent_shop", "Shop space"],
    ["buy_store", "Store stock"], ["buy_raw", "Raw materials"], ["buy_wh_goods", "Stock for B2B"], ["price", "Prices"], ["marketing", "Marketing"], ["other", "Not known"]];
  const secName = k => (SECTIONS.find(x => x[0] === k) || [k, k])[1];
  const ACTS = {b2b: ["accept", "bid"], rent_shop: ["rent", "release"], rent_wh: ["rent", "release"], buy_store: ["buy"], buy_raw: ["buy"], buy_wh_goods: ["buy"],
    marketing: ["set", "pause"], machine: null, price: null};   // what the bot can do in each section (null: its screens aren't mapped yet)
  const BOT = {on: false, busy: false, prepping: false, cut: false, loop: null, say: "", note: "", warn: "", plans: {}, run: null, days: {},
    pages: {}, forms: {}, expect: [], fails: 0, prepDay: 0, startAt: 0, dry: false, checking: false, check: [], checkAt: 0, askAt: 0};
  const dayKey = d => BOT.dry ? "p" + d : d;   // a practice day is kept apart: the real run that day still does every step
  const today = () => (D && D.day) || 0, live = day => BOT.on && !stopped && today() === day;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k), reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const num = v => v == null || v === "" || typeof v === "boolean" || !isFinite(+v) ? null : +v;
  const tx = el => (el && el.textContent || "").replace(/\s+/g, " ").trim();
  const nm = s => norm(s).replace(/(retail|warehouse|whs|store|shop)$/, ""), same = (a, b) => !!nm(a) && nm(a) === nm(b);
  const prodIs = (a, b) => same(a, b) || (nm(a).length >= 5 && nm(b).length >= 5 && (nm(a).startsWith(nm(b)) || nm(b).startsWith(nm(a))));   // "Bubble Milk Te..." on some screens
  const pick1 = (list, name, f) => {   // the one item called `name` (exact, else the only one that starts the same), or null
    const b = nm(name); if (!b) return null;
    const ex = list.filter(x => nm(f(x)) === b); if (ex.length) return ex.length === 1 ? ex[0] : null;
    const pre = list.filter(x => { const a = nm(f(x)); return a && (a.startsWith(b) || b.startsWith(a)); });
    return pre.length === 1 ? pre[0] : null;
  };
  const stepText = s => s.text || [s.act, s.offer ? "offer " + s.offer : s.where || (s.target !== s.product ? s.target : ""), s.product, s.qty != null ? n(s.qty) : "", s.price != null ? "at " + s.price : ""].filter(Boolean).join(" ");

  /* the plan: the newest one for each day, its steps in the bot's terms. "" when it was taken, else why not */
  const toStep = (c, i) => {   // target: the city, warehouse, offer number, machine type or product (a string; an object's city/store/order also works)
    const t = c.target, o = t && typeof t === "object" ? t : {}, sec = own(ACTS, c.section) ? c.section : "other", act = String(c.action || "").toLowerCase();
    const tgt = String(t != null && typeof t !== "object" ? t : o.city || o.store || o.warehouse || o.order || o.offer || "").trim();
    return {...c, id: String(c.id ?? [sec, act, tgt, c.product || o.product, c.agency].join("|")), sec, act, target: tgt, where: /^(b2b|machine|price)$/.test(sec) ? "" : tgt.replace(/\s+(retail|store|shop)$/i, ""),
      offer: sec === "b2b" ? tgt : "", product: c.product || o.product || (sec === "price" ? tgt : null), qty: num(c.qty), qtyMin: num(c.qtyMin), qtyMax: num(c.qtyMax), qtyStep: num(c.qtyStep),
      price: num(c.price), floor: num(c.floor), unitPrice: num(c.unitPrice), unitPriceMax: num(c.unitPriceMax), cost: num(c.cost) ?? num(c.budget) ?? 0, key: c.budgetKey || sec,
      must: !!c.must, deps: Array.isArray(c.deps) ? c.deps.map(String) : [], slot: c.slot === "later" ? "later" : "now", seq: num(c.seq) ?? i, text: typeof c.text === "string" ? c.text : "",
      term: c.term ?? c.terms ?? null, state: "", why: ""};
  };
  const takePlan = (p, from) => {
    if (!p || typeof p !== "object" || !Array.isArray(p.steps) || !(+p.day > 0)) return "That isn't a plan: it needs a day and a list of steps.";
    if (p.v != null && +p.v !== 1) return `Plan version ${p.v} isn't known to this reader.`;
    if (p.mode && TAG && String(p.mode) !== TAG) return `That plan is for Mode ${p.mode}, this game is Mode ${TAG}.`;
    if (from !== "pasted" && p.source != null && p.source !== "game") return "";   // only plans made from the game's own numbers
    const seen = {}, steps = p.steps.filter(s => s && typeof s === "object" && !s.notSentToBot).map(toStep).map(s => { const k = seen[s.id] = (seen[s.id] || 0) + 1; if (k > 1) s.id += "#" + k; return s; })
      .sort((a, b) => (a.slot === "later") - (b.slot === "later") || a.seq - b.seq);
    const day = +p.day; BOT.plans[day] = {...p, day, steps, got: Date.now(), from};
    for (const d of Object.keys(BOT.plans)) if (+d < day - 2) delete BOT.plans[d];
    paint(); return "";
  };

  /* the game's screens: action links, location rows, forms. Read once a day (or again after a failed order) and kept */
  const urlOf = el => { const h = hrefOf(el); if (h) return h; const m = ((el.getAttribute("href") || "") + " " + (el.getAttribute("onclick") || "")).match(/['"]([^'"]*ms_sure_learner\?[^'"]*)['"]/); return m ? m[1] : null; };
  const abs = u => new URL(u, location.href).href, arg = (u, k) => new URL(u, location.href).searchParams.get(k);
  const linksIn = (el, test) => [...el.querySelectorAll("a,button,input,[onclick]")].map(e => ({el: e, url: urlOf(e)})).filter(x => x.url && test(x.url)).map(x => ({el: x.el, url: abs(x.url)}));
  const blocks = (h, test, key) => {   // each action link with its part of the page (the biggest box around it with no other one in it)
    const doc = dom(h), out = [], keys = el => new Set(linksIn(el, test).map(x => key(x.url)));
    for (const {el, url} of linksIn(doc, test)) {
      let c = el; while (c.parentElement && c.parentElement !== doc.body && keys(c.parentElement).size <= 1) c = c.parentElement;
      const b = out.find(b => b.key === key(url)); if (b) b.urls.push(url); else out.push({key: key(url), url, urls: [url], text: tx(c)});
    }
    return out;
  };
  const AREA = /Current Area\s*:?\s*(?:Current\s*:?\s*)?([\d,]+)/i;   // shops: "Current Area: 250 m2", warehouses: "Current Area: Current:8000 m2"
  const locs = h => blocks(h, u => /cmd=SPACE_MANAGE/i.test(u), u => arg(u, "ac")).map(b => ({...b, ac: b.key,
    name: ((b.text.match(/Location\s*:\s*(.+?)\s*(?:\$\(|Specification|Retail Rental|Warehouse Rental|Rental\b|Current Area|Seniors|Population|$)/i) || [])[1] || "").trim(),
    rate: toNum((b.text.match(/Rental\s*:\s*([\d.]+)/i) || [])[1]), area: toNum((b.text.match(AREA) || [])[1]) || 0, known: AREA.test(b.text), rented: /Rental Manage|Auto Renew|Contract\s*:/i.test(b.text) || b.urls.some(u => /SPACE_CANCEL|[?&]edit=1/i.test(u)),
    link: b.urls.find(u => /[?&](edit=1|id=)/i.test(u)) || b.url}));   // an existing rental: its edit link
  const locOf = (rows, name) => pick1(rows.filter(r => r.name), name, r => r.name) || (x => x.length === 1 ? x[0] : null)(rows.filter(r => nm(name) && norm(r.text).includes(nm(name))));
  const formData = fe => {   // a form as the game filled it in: each field's value, each list's choices, the words beside each box
    const fields = [], opts = {}, labels = {}, types = {}, els = [...fe.elements];
    for (const el of els) {
      const k = el.name, t = (el.type || "").toLowerCase();
      if (!k || el.disabled || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || /^(submit|button|image|reset|file)$/.test(t) || (/^(checkbox|radio)$/.test(t) && !el.checked)) continue;
      if (el.tagName === "SELECT") opts[k] = [...el.options].map(o => ({v: o.value, t: tx(o)}));
      fields.push([k, el.value]); types[k] = t;
      if (t !== "hidden") labels[k] = tx(el.closest("tr,li,p,label") || el.parentElement).slice(0, 120);
    }
    const b = fe.querySelector("#dbutton,#submit_button") || els.find(e => e.id === "dbutton" || e.id === "submit_button");   // the game's Submit (both ids are in use)
    return {action: abs(fe.getAttribute("action") || location.href), fields, opts, labels, types, ok: !!b, btn: b && b.type === "submit" && b.name ? [b.name, b.value] : null,
      has: k => fields.some(x => x[0] === k), val: k => (fields.find(x => x[0] === k) || [])[1]};
  };
  const formOf = h => { const fs = [...dom(h).forms].map(formData); return fs.find(f => f.ok) || (fs.length === 1 ? fs[0] : null); };
  const cmdOf = f => arg(f.action, "cmd") || f.val("cmd") || "";
  const sameForm = (a, b) => a.action === b.action && a.fields.map(x => x[0]).sort().join() === b.fields.map(x => x[0]).sort().join();
  const pageAt = async (id, fresh) => { const c = BOT.pages[id]; if (c && !fresh && c.day >= today()) return c.html; const html = await page(id); BOT.pages[id] = {day: today(), html}; return html; };
  const formAt = async (url, fresh) => {
    const c = BOT.forms[url]; if (c && !fresh && c.day >= today()) return c;
    const html = await get(url), f = formOf(html); if (!f) throw new Error("no form on that screen");
    return (BOT.forms[url] = {day: today(), html, f});
  };

  /* sending a form: the game's own values, only the step's fields changed. An answer with error words is a failure (words
     already on the form page, its help text, don't count); a confirm screen for the same action gets one answer */
  const ERR = /not enough|not have enough|do(?:es)? not have|don't have|insufficient|cannot|can not|can't|unable|error|failed|failure|exceed|invalid|not allowed|already have|rejected|denied|no longer|not available|limit reached|please (?:select|choose)/gi;
  const plain = h => { const d = dom(h); d.querySelectorAll("script,style,noscript,select").forEach(e => e.remove()); return tx(d.body); };
  const errIn = (h, before) => {
    const t = plain(h), b = before ? plain(before) : "";
    for (const m of t.matchAll(ERR)) {   // the sentence it's in (up to 160 letters), so the game's own words show in full
      const from = Math.max(0, m.index - 80), to = Math.min(t.length, m.index + m[0].length + 80), pre = t.slice(from, m.index), post = t.slice(m.index);
      const s0 = from + Math.max(pre.lastIndexOf(". "), pre.lastIndexOf("! "), pre.lastIndexOf("? ")) + 1, e0 = post.search(/[.!?](\s|$)/), end = e0 < 0 ? to : Math.min(to, m.index + e0 + 1);
      const bit = t.slice(s0 > from ? s0 : from, end).trim(); if (!b.includes(bit)) return bit;
    }
    return "";
  };
  const verdict = (h, before) => /similar transaction/i.test(plain(h)) ? {skip: "the game takes one similar deal a day"} : (b => b ? {err: `the game said “${b}”`} : null)(errIn(h, before));
  const fill = (f, set) => { const q = new URLSearchParams(); for (const [k, v] of f.fields) q.append(k, own(set, k) ? set[k] : v); if (f.btn) q.append(f.btn[0], f.btn[1]); return q.toString(); };
  const submit = async (f, set, before) => {
    for (const k in set) if (!f.has(k)) return {err: `the form has no ${k} box`};
    if (!BOT.on || stopped) return {skip: "the bot was stopped", wait: true};   // checked again right before sending: Stop, Esc and a new day win
    if (BOT.run && today() !== BOT.run.day) return {skip: "the day ended first", wait: true};
    if (BOT.dry) return {ok: true, note: "practice, not sent"};
    const send = async (g, s) => { try { return await post(g.action, fill(g, s)); } catch (e) { return {err: `no clear answer from the game (${e.message}): check whether it went through`, unsure: true}; } };
    const h = await send(f, set); if (typeof h !== "string") return h;
    const v = verdict(h, before); if (v) return v;
    const c = formOf(h);
    if (!c || !c.ok || sameForm(c, f) || cmdOf(c) !== cmdOf(f)) return {ok: true};   // no confirm step: the form again, or another screen
    const h2 = await send(c, {}); if (typeof h2 !== "string") return h2;
    const v2 = verdict(h2, h); if (v2) return {...v2, unsure: true};
    const c2 = formOf(h2);
    return c2 && c2.ok && !sameForm(c2, f) && cmdOf(c2) === cmdOf(f) ? {err: "the game asked to confirm again", unsure: true} : {ok: true};
  };

  /* money: each section's running total stays under budgets[section], and cash (the dashboard's, or less by what the bot spent
     today: with cash on delivery the dashboard may not show it yet) at or above the plan's reserve, which can be negative */
  const capOf = (plan, key) => { const b = (plan.budgets || {})[key]; return b == null || b === "" ? null : typeof b === "object" ? num(b.cap) : num(b); };
  const cashToday = () => dash().cash ?? (D.cashDay === today() ? D.cash : null);   // never yesterday's figure
  const cashNow = run => { const c = cashToday(); return run.cash0 == null ? c : c == null ? run.cash0 - run.spent : Math.min(c, run.cash0 - run.spent); };
  const floorOf = p => num(p.reserve) ?? (c => num(c.spendable) != null && num(c.net0 ?? c.cash) != null ? num(c.net0 ?? c.cash) - num(c.spendable) : null)(p.cash || {});
  const room = (run, s, pend = 0) => {   // how much this step may still spend (pend: what its section has lined up already): {eur, why}
    const cap = capOf(run.plan, s.key), used = (run.used[s.key] || 0) + pend;
    if (cap == null) return {eur: 0, why: `the plan has no ${s.key} budget`};
    let eur = cap - used, why = `the ${s.key} budget (${n(Math.round(used))} of ${n(Math.round(cap))} used)`;
    if (run.floor == null) return {eur: 0, why: "the plan has no cash reserve"};
    const c = cashNow(run); if (c == null) return {eur: 0, why: "can't read the cash on the dashboard"};
    const left = c - pend - run.floor; if (left < eur) { eur = left; why = `the cash reserve (${n(Math.round(run.floor))}, cash ${n(Math.round(c - pend))})`; }
    return {eur: Math.max(0, eur), why};
  };
  const refuse = (run, s, cost, pend = 0) => { if (!(cost > 0)) return ""; const r = room(run, s, pend); return cost > r.eur + 0.5 ? `over ${r.why}: ${n(Math.round(cost))} more is too much` : ""; };
  const report = s => {   // the step's outcome to the calculator, so it books it (not in practice, and not a step left for later)
    const r = BOT.run; if (!r || BOT.dry || !s.final || !/^(done|skipped|failed)$/.test(s.state)) return;
    const m = {ff: "step", planId: r.plan.planId ?? null, id: s.id, status: {done: "done", skipped: "skip", failed: "fail"}[s.state], qty: s.qtyDone ?? null, price: s.priceDone ?? null,
      amount: s.amount ?? null, orderId: s.orderId ?? null, due: s.due ?? null, unsure: !!s.unsure, note: s.why || ""};
    if (r.rec) { r.rec.reports[s.id] = m; botSave(); }   // kept for the day: sent again when the plan still lists it or the link comes back
    toCalc(m);
  };
  const mark = (s, state, why = "", final = true) => { s.state = state; s.why = why; s.final = final; log(`Bot · ${secName(s.sec)} · ${stepText(s)}: ${state}${why ? " (" + why + ")" : ""}`); report(s); paint(); };
  const oops = run => {   // a failed step: 2 in a row, or more than the plan's error budget for the day, stop the bot
    run.failed++; const pct = num((run.plan.limits || {}).errorBudgetPct) ?? 10, allowed = Math.max(1, Math.floor(run.steps.length*pct/100));
    if (++BOT.fails >= 2) botStop("Stopped after 2 failures in a row. Check the game, then press Start.", false, "2 failures in a row");
    else if (run.failed > allowed) botStop(`Stopped: ${run.failed} failed steps today is more than the plan allows (${pct}%). Check the game, then press Start.`, false, "over the error budget");
  };
  const book = (run, s, cost) => {   // money a step spent (or may have: an order with no clear answer), for its budget, the cash and the day's record
    run.used[s.key] = (run.used[s.key] || 0) + cost; run.spent += cost; run.paid[s.sec] = (run.paid[s.sec] || 0) + cost;
    if (run.rec) { run.rec.cost[s.id] = (run.rec.cost[s.id] || 0) + cost; run.rec.spent = run.spent; }
  };
  const spend = (run, s, cost) => { BOT.fails = 0; book(run, s, cost); };
  const clock = (run, s) => {   // a step that starts after the plan's time box (30 s, or the prep stage's) still runs, in order, with a warning
    if (!s.late && Date.now() - run.t0 > run.limit) { s.late = true; const m = `Past ${sec(run.limit)}: ${secName(s.sec)} · ${stepText(s)} still runs.`; run.notes.push(m); log("Bot warning: " + m); }
    s.state = "running"; paint();
  };
  const settle = (run, s, r, cost, ok) => {   // a step's answer: true when it went through
    if (r.skip) { mark(s, "skipped", r.skip, !r.wait); return false; }
    if (r.err) { s.unsure = !!r.unsure; if (s.unsure && cost) book(run, s, cost); mark(s, "failed", r.err); oops(run); return false; }
    spend(run, s, cost); if (s.amount == null && cost) s.amount = cost; mark(s, "done", r.note ? `${ok}: ${r.note}` : ok); return true;
  };

  /* the plan's checks (verify): before the steps, the game is on the plan's day with about the plan's cash (or that less what the
     bot spent today): "" or what doesn't match, and then the bot asks for a fresh plan. After the steps: a note when cash is under cashMin */
  const preCheck = (run, rec) => {
    const v = run.plan.verify || {}, day = dash().day ?? D.day, cash = cashToday(), want = num(v.cash), tol = num(v.tol) ?? 0;
    if (num(v.day) != null && day !== num(v.day)) return `the game is on day ${day}, the plan is for day ${v.day}`;
    if (want == null) return "";
    if (cash == null) return "can't read the cash on the dashboard";
    return Math.min(Math.abs(cash - want), Math.abs(cash - (want - rec.spent))) > tol ? `cash is ${n(cash)}, the plan expected about ${n(want)}` : "";
  };
  const postCheck = run => {
    const min = num((run.plan.verify || {}).cashMin), cash = cashToday(); if (min == null || cash == null || cash >= min) return;
    const m = `Cash is ${n(cash)} after the steps, the plan expected at least ${n(min)}.`; run.notes.push(m); BOT.warn = `Day ${run.day}: ${m}`; log("Bot warning: " + m);
  };

  /* B2B: the plan names the offer by its number. Accept = the offer's Accept control (and its form); bid = the Bid form at the
     plan's price. Never under the product's floor, never more units than the plan can deliver, one deal per product a day.
     Neither screen has been seen in a running game yet, so their answers are only read for error words */
  const ctl = (card, re) => [...card.querySelectorAll("a,button,input[type=button],input[type=submit]")].find(b => re.test(((b.textContent || "") + " " + (b.getAttribute("value") || "")).trim()));
  const forOffer = (f, id) => /B2B/i.test(cmdOf(f) + " " + f.action) && new RegExp(`(^|\\D)${reEsc(id)}(\\D|$)`).test(f.action + " " + f.fields.map(x => x[1]).join(" "));
  const strange = what => ({err: `an unexpected screen came up after ${what}, so nothing more was sent: check the offer in the game`, unsure: true});
  const acceptOn = async (card, list, id) => {
    const c = ctl(card, /accept|take|confirm/i); if (!c) return {err: "no Accept button on the offer card"};
    const fe = c.closest("form");
    if (fe) { const f = formData(fe); if (c.type === "submit" && c.name) f.btn = [c.name, c.value]; return submit(f, {}, list); }
    const u = urlOf(c); if (!u) return {err: "the Accept button has no link the bot can follow"};
    const h = await get(abs(u)), f = formOf(h);
    if (/similar transaction/i.test(plain(h))) return {skip: "the game takes one similar deal a day"};
    if (!f) { const b = errIn(h, list); return b ? {err: `the game said “${b}”`} : {ok: true, note: "no form came up after Accept"}; }
    return forOffer(f, id) ? submit(f, {}, h) : strange("Accept");   // only a form for this offer
  };
  const bidOn = async (card, o, price) => {
    const c = ctl(card, /^bid$/i), u = c && urlOf(c); if (!u) return {err: "no Bid link on the offer card"};
    const h = await get(abs(u)), f = formOf(h);
    if (/similar transaction/i.test(plain(h))) return {skip: "the game takes one similar deal a day"};
    if (!f) { const b = errIn(h, ""); return {err: b ? `the game said “${b}”` : "no bid form came up"}; }
    const boxes = Object.keys(f.types).filter(k => /^(text|number|tel)$/.test(f.types[k])), one = x => x.length === 1 ? x[0] : null;
    if (!forOffer(f, o.id)) return strange("Bid");
    const pk = one(boxes.filter(k => /price/i.test(k))) || one(boxes.filter(k => /bid/i.test(k) && !/qty|quant|max|id/i.test(k))) || one(boxes.filter(k => /price/i.test(f.labels[k] || ""))) || one(boxes);
    if (!pk) return {err: "couldn't tell which box takes the bid price"};
    const set = {[pk]: String(price)}, qk = boxes.find(k => k !== pk && /qty|quant/i.test(k));
    if (qk) set[qk] = String(o.qty);
    return submit(f, set, h);
  };
  const b2bRun = async (run, list) => {
    const h = await page("MENU2_B2Bincm"), cards = offerCards(dom(h)).map(c => ({c, o: parseOffer(c)})).filter(x => x.o.id);   // read fresh: the deals go fast
    const rules = (run.plan.b2b || {}).rules || {}, floors = run.plan.floors || run.plan.b2bBidFloor || {}, sent = [];
    for (const s of list) {
      if (!live(run.day)) return;
      clock(run, s);
      const bid = s.act === "bid", x = cards.find(x => String(x.o.id) === s.offer), o = x ? x.o : {}, most = s.qtyMax ?? s.qty, floor = s.floor ?? num(floors[s.product] ?? floors[o.product]);
      const no = !s.offer ? "the plan gives no offer number" : !x ? `offer ${s.offer} isn't on the B2B list now` : o.state !== "open" ? `offer ${s.offer} is ${o.state === "gone" ? "taken by others" : "already done or closed"}`
        : o.kind !== (bid ? "bid" : "fixed") ? `offer ${s.offer} is a ${o.kind === "bid" ? "bid" : "fixed-price"} offer, the plan says ${s.act}`
        : s.product && !prodIs(o.product, s.product) ? `offer ${s.offer} is for ${o.product}, the plan says ${s.product}`
        : most != null && o.qty > most ? `offer ${s.offer} wants ${n(o.qty)}, more than the ${n(most)} the plan can deliver`
        : rules.onePerProductPerDay !== false && run.b2bProd.has(nm(o.product)) ? `already a deal for ${o.product} today: the game takes one a day` : "";
      if (no) { mark(s, "skipped", no); continue; }
      const price = bid ? s.price ?? (o.maxBid != null ? Math.floor(o.maxBid*(1 - (num(rules.bidCut) ?? 0.03))*100)/100 : null) : o.each;
      const bad = price == null ? "the plan gives no bid price" : floor != null && price < floor - 1e-9 ? `${price} is under the floor ${floor}`
        : bid && o.maxBid != null && price > o.maxBid + 1e-9 ? `the plan's bid ${price} is over the offer's max ${o.maxBid}`
        : !bid && s.price != null && price < s.price - 0.005 ? `the offer pays ${price} now, the plan counted on ${s.price}` : "";
      if (bad) { mark(s, "skipped", bad); continue; }
      const cost = s.cost || 0, why = refuse(run, s, cost); if (why) { mark(s, "skipped", why); continue; }
      run.b2bProd.add(nm(o.product)); Object.assign(s, {qtyDone: o.qty, priceDone: price, amount: Math.round(o.qty*price*100)/100, orderId: o.id, due: o.due ?? null});
      const what = `offer ${o.id}: ${n(o.qty)} ${o.product} at ${price}`;
      if (BOT.dry) { settle(run, s, {ok: true, note: "practice, the offer screen isn't opened"}, cost, `would ${bid ? "bid on" : "accept"} ${what}`); continue; }   // opening a deal's link may already take it
      const r = bid ? await bidOn(x.c, o, price) : await acceptOn(x.c, h, o.id);
      if (r.skip || (r.err && !r.unsure)) { if (!settle(run, s, r, cost, what) && r.err) break; continue; }   // a clear no (an error stops the section)
      sent.push({s, r, what, cost});
      if (r.err) break;   // no clear answer: look at the list before anything else
    }
    if (!sent.length) return;
    let after = null; try { after = offerCards(dom(await page("MENU2_B2Bincm"))).map(parseOffer); } catch (e) {}   // did the game take it? its card says
    for (const {s, r, what, cost} of sent) {
      const o = after && after.find(o => String(o.id) === s.offer);
      if (o && o.state === "done") { s.unsure = false; settle(run, s, {ok: true}, cost, `${what}: the offer card shows it`); }
      else if (o && o.state === "gone") mark(s, "skipped", `${what}: another team took it first`);
      else if (after) { s.unsure = true; mark(s, "failed", r.err || (o ? `${what}: the offer still shows open after the bot's answer` : `${what}: the offer left the list, check it in the game`)); oops(run); }
      else settle(run, s, r, cost, `${what} (the list couldn't be read again to check)`);
    }
  };

  /* shop / warehouse space: the location's Rental Manage form, rent<ac> = the total area wanted (whole steps of 50 / 500 m²), terms<ac>.
     A rent step only adds space and a release step only gives it back (down to the plan's area, never to 0) */
  const SPACE = {rent_shop: {menu: "MENU2_retail_location", unit: 50, what: "shop"}, rent_wh: {menu: "MENU2_whs_location", unit: 500, what: "warehouse"}};
  const rentRun = part => async (run, list) => {
    const K = SPACE[part], rows = locs(await pageAt(K.menu)); checkExpect();   // the page once: each change is kept on its row
    for (const s of list) {
      if (!live(run.day)) return;
      clock(run, s);
      const r = locOf(rows, s.where);
      if (!r) { mark(s, "failed", `no location “${s.where || "?"}” on the ${K.what} space page`); oops(run); return; }
      if (r.rented && !r.known) { mark(s, "failed", `can't read how much ${K.what} space ${r.name || s.where} has now, so it was left alone`); continue; }
      const step = s.qtyStep > 0 ? s.qtyStep : K.unit;
      let want = s.qty == null ? null : Math.ceil(s.qty/step)*step;
      if (want != null && s.qtyMax != null && want > s.qtyMax) want = Math.floor(s.qtyMax/step)*step;
      if (!(want > 0)) { mark(s, "skipped", want === 0 ? "the plan asks for 0 m²: giving up a whole location is left to you" : "the plan gives no area"); continue; }
      if (s.qtyMin != null && want < s.qtyMin) { mark(s, "skipped", `no whole ${step} m² step between ${n(s.qtyMin)} and ${n(s.qtyMax)} m²`); continue; }
      const out = s.act === "release";
      if (want === r.area || (out ? want > r.area : want < r.area)) { s.qtyDone = r.area; mark(s, "done", want === r.area ? `already ${n(want)} m²` : `already ${n(r.area)} m², ${out ? "under" : "over"} the plan's ${n(want)} m²`); continue; }
      const F = await formAt(r.link), f = F.f, rk = "rent" + r.ac, tk = "terms" + r.ac;
      if (!f.has(rk)) { delete BOT.forms[r.link]; mark(s, "failed", `the rent form has no ${rk} box`); oops(run); return; }
      const term = String(s.term ?? 1), opt = (f.opts[tk] || []).find(o => o.v === term);
      if (f.has(tk) && !opt) { mark(s, "failed", `no ${term}-day choice on the rent form`); oops(run); return; }
      const off = opt ? +((opt.t.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1] || 0)/100 : 0;
      const cost = out ? 0 : Math.max(s.cost || 0, (r.rate || 0)*Math.max(0, want - r.area)*(+term || 1)*(1 - off));   // the plan's number, or more if the screen shows less area than it thought
      const why = refuse(run, s, cost); if (why) { mark(s, "skipped", why); continue; }
      const set = {[rk]: String(want)}; if (f.has(tk)) set[tk] = term;
      const res = await submit(f, set, F.html);
      delete BOT.forms[r.link]; delete BOT.pages[K.menu];   // its numbers changed (or it failed): read again next time
      s.qtyDone = want; s.amount = cost;
      if (settle(run, s, res, cost, `${n(r.area)} → ${n(want)} m²${term ? `, ${term}-day` : ""}${BOT.dry ? "" : ": check the area tomorrow"}`) && !BOT.dry) {
        BOT.expect.push({day: run.day, menu: K.menu, name: r.name || s.where, area: want}); r.area = want;
        for (const u in BOT.forms) if (!/cmd=SPACE_/i.test(u)) delete BOT.forms[u];   // order and marketing forms list the places rented: read them again
      }
      else if (res.err) return;
    }
  };
  const checkExpect = () => {   // earlier space changes, as today's location pages show them
    BOT.expect = BOT.expect.filter(e => {
      const c = BOT.pages[e.menu]; if (e.day >= today() || !c || c.day < today()) return true;
      const r = locOf(locs(c.html), e.name);
      if (r && r.area !== e.area) { BOT.warn = `${e.name}: asked for ${n(e.area)} m² on day ${e.day}, the game shows ${n(r.area)} m².`; log("Bot warning: " + BOT.warn); }
      else if (r) log(`Bot: ${e.name} has ${n(r.area)} m², as asked on day ${e.day}.`);
      return false;
    });
  };

  /* stock: one order = one size per product (the form's own choices), so an amount takes several orders; products for the same
     place and vendor share orders. The amount: the plan's qty, or the nearest the sizes allow inside [qtyMin, qtyMax] in the
     fewest orders; less only to stay in the budget, never under qtyMin. A vendor asking more than unitPriceMax is skipped */
  const BUY = {buy_store: {menu: "MENU2_retail_vendor", test: u => /cmd=BUY_FG/i.test(u) && /loctype=RTL/i.test(u), what: "store"},
    buy_raw: {menu: "MENU2_warehouse_vendor", test: u => /cmd=BUY_RM/i.test(u), what: "warehouse"},
    buy_wh_goods: {menu: ["MENU2_warehouse_vendor", "MENU2_retail_vendor"], test: u => /cmd=BUY_FG/i.test(u) && /loctype=WHS/i.test(u), what: "warehouse"}};
  const vendorsOf = async part => {   // the vendors with an order link for this kind of order (the first vendor page that has any)
    for (const m of [].concat(BUY[part].menu)) { const vs = blocks(await pageAt(m), BUY[part].test, u => arg(u, "vc") || u); if (vs.length) return vs; }
    return [];
  };
  const destOf = f => Object.keys(f.opts).find(k => /^destination/i.test(k));
  const priceIn = (t, name) => { const m = String(t).match(new RegExp(reEsc(name) + "\\s*[:@-]?\\s*(?:EUR|€)?\\s*(\\d+(?:\\.\\d+)?)(?![\\d+]|,\\d)", "i")); return m ? +m[1] : null; };   // not "1,000+": an order size
  const vendorFor = (vs, s) => {   // the plan's vendor, else the one nearest the plan's price, else the only one
    if (s.vendor) { const k = String(s.vendor).toLowerCase(), x = vs.filter(v => String(v.key).toLowerCase() === k || norm(v.text).includes(norm(s.vendor))); return x.length === 1 ? x[0] : null; }
    const u = s.unitPrice, priced = vs.map(v => ({v, p: priceIn(v.text, s.product)})).filter(x => x.p != null)   // the one the plan priced (its lead time and terms), else the cheapest
      .sort((a, b) => (u != null ? Math.abs(a.p - u) - Math.abs(b.p - u) : 0) || a.p - b.p);
    return priced.length ? priced[0].v : vs.length === 1 ? vs[0] : null;
  };
  const rentedWh = async () => {   // the team's warehouses: the dashboard's, else the warehouse space page's rows with an area
    const d = (D.warehouses || []).filter(w => w.name && w.area > 0).map(w => w.name);
    return d.length ? d : locs(await pageAt("MENU2_whs_location")).filter(r => r.area > 0 && r.name).map(r => r.name);
  };
  const fieldFor = (f, product, v) => {   // P1, P2…: the list whose empty choice is the product's name, else the vendor page's order
    const ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)).sort((a, b) => a.slice(1) - b.slice(1));
    const hit = pick1(ps, product, k => (f.opts[k].find(o => o.v === "") || {}).t || ""); if (hit) return hit;
    const known = [...new Set((D.products || []).flatMap(p => [p.name, ...(p.bom || []).map(b => b.name)]))];
    const names = known.map(x => ({x, i: v.text.indexOf(x)})).filter(y => y.i >= 0).sort((a, b) => a.i - b.i).map(y => y.x), i = names.findIndex(x => same(x, product));
    return names.length === ps.length && i >= 0 ? ps[i] : null;
  };
  const shelfFor = (run, s) => {   // a store buy whose shop rent in this plan didn't go through: no more than fits on the free shelf (m2Each a unit)
    const none = {most: Infinity, why: ""}, m2 = num(s.m2Each); if (s.sec !== "buy_store" || !(m2 > 0)) return none;
    const r = run.steps.find(x => x.sec === "rent_shop" && x.act === "rent" && same(x.where, s.where)); if (!r || r.state === "done" || run.rec.done.has(r.id)) return none;
    const st = [...(dash().stores || []), ...(D.stores || [])].find(x => same(x.name, s.where)), free = st && st.area != null ? Math.max(0, st.area - (st.used || 0)) : 0;
    return {most: Math.floor(free/m2), why: `the shelf space: the ${s.where} rent didn't go through, ${n(Math.round(free))} m² free`};
  };
  const tiersOf = (f, k) => (f.opts[k] || []).map(o => ({v: o.v, q: toNum(o.v)})).filter(t => t.q > 0);
  const pickSizes = (want, lo, hi, tiers) => {   // order sizes adding up to an amount in [lo, hi], nearest `want`, then the fewest orders
    const t = [...tiers].sort((a, b) => b.q - a.q); hi = Math.floor(hi); if (!t.length || !(hi > 0) || hi < lo) return [];
    const g = t.reduce((a, x) => { let b = x.q; while (b) [a, b] = [b, a % b]; return a; }, 0), top = Math.floor(hi/g), bot = Math.max(1, Math.ceil(lo/g));
    if (top > 200000) { const out = []; let r = Math.min(hi, want); for (const x of t) while (r >= x.q) { out.push(x); r -= x.q; } return out.reduce((a, x) => a + x.q, 0) >= lo ? out : []; }   // too fine to count through
    const cnt = new Array(top + 1).fill(Infinity), via = new Array(top + 1); cnt[0] = 0;
    for (let i = 1; i <= top; i++) for (const x of t) { const k = x.q/g; if (k <= i && cnt[i - k] + 1 < cnt[i]) { cnt[i] = cnt[i - k] + 1; via[i] = x; } }
    let best = 0; for (let i = bot; i <= top; i++) if (cnt[i] < Infinity && (!best || Math.abs(i*g - want) < Math.abs(best*g - want) || (Math.abs(i*g - want) === Math.abs(best*g - want) && cnt[i] < cnt[best]))) best = i;
    const out = []; for (let i = best; i > 0; i -= via[i].q/g) out.push(via[i]);
    return out.sort((a, b) => b.q - a.q);
  };
  const buyRun = part => async (run, list) => {
    const K = BUY[part], vs = await vendorsOf(part), groups = [];
    if (!vs.length) { list.forEach(s => mark(s, "failed", "no order link on the vendor page")); oops(run); return; }
    let whs = null;
    for (const s of list) {
      const v = vendorFor(vs, s); if (!v) { mark(s, "failed", s.vendor ? `no single vendor “${s.vendor}” on the page` : `no vendor price for ${s.product} on the vendor page`); oops(run); continue; }
      let where = s.where;
      if (!where && K.what === "warehouse") { whs = whs || await rentedWh(); if (whs.length === 1) where = whs[0]; else { mark(s, "failed", whs.length ? `the plan doesn't say which warehouse (${whs.join(", ")})` : "no rented warehouse found"); oops(run); continue; } }
      const g = groups.find(g => g.v === v && same(g.where, where) && !g.steps.some(x => prodIs(x.product, s.product))); if (g) g.steps.push(s); else groups.push({v, where, steps: [s]});
    }
    for (const g of groups) {
      if (!live(run.day)) return;
      const at = F => { const dk = destOf(F.f); return {dk, dest: dk && pick1((F.f.opts[dk] || []).filter(o => o.v !== ""), g.where, o => o.t)}; };
      let F = await formAt(g.v.url); if (!at(F).dest) F = await formAt(g.v.url, true);   // a place rented since the form was read
      const f = F.f, {dk, dest} = at(F);
      if (!dest) { g.steps.forEach(s => mark(s, "failed", `no “${g.where}” among the order form's destinations`)); oops(run); continue; }
      const ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)), stuck = ps.find(k => !f.opts[k].some(o => o.v === ""));
      if (stuck) { g.steps.forEach(s => mark(s, "failed", `the order form has no "none" choice for ${stuck}`)); oops(run); continue; }
      const lines = []; let pend = 0;
      for (const s of g.steps) {
        clock(run, s);
        const k = fieldFor(f, s.product, g.v), tiers = k ? tiersOf(f, k) : [];
        if (!tiers.length) { mark(s, "failed", k ? `no order sizes for ${s.product} on the form` : `no ${s.product} on the order form`); oops(run); continue; }
        const unit = priceIn(g.v.text, s.product) ?? num(s.unitPrice) ?? (s.cost > 0 && s.qty > 0 ? s.cost/s.qty : null);
        if (unit == null) { mark(s, "skipped", `no price for ${s.product}`); continue; }
        const want = s.qty ?? s.qtyMax ?? 0, hi = s.qtyMax ?? want, lo = s.qtyMin ?? 1, free = room(run, s, pend), fit = shelfFor(run, s);
        const size = u => { const most = Math.min(hi, fit.most, Math.floor(free.eur/u)), ts = pickSizes(want, lo, most, tiers); return {u, most, ts, sum: ts.reduce((a, t) => a + t.q, 0), why: fit.most < Math.floor(free.eur/u) ? fit.why : free.why}; };
        let z = size(unit), cap = s.unitPriceMax ?? (s.unitPrice != null ? s.unitPrice*(1 + (num((run.plan.limits || {}).priceTolPct) ?? 2)/100) : null);
        if (s.tierQty > 0 && z.ts.length && z.sum < s.tierQty) {   // under the bulk lot the game charges the full price
          if (s.unitPriceMaxBelowTier == null) { mark(s, "skipped", `${n(z.sum)} is under the bulk lot of ${n(s.tierQty)}, and the plan gives no price for less`); continue; }
          cap = s.unitPriceMaxBelowTier; z = size(Math.max(unit, cap));
        }
        if (cap != null && unit > cap + 1e-9) { mark(s, "skipped", `the vendor asks ${unit} a unit, the plan allows up to ${Math.round(cap*100)/100}`); continue; }
        const {u, most, ts, sum} = z, extra = sum < want && pickSizes(want, lo, hi, tiers).reduce((a, t) => a + t.q, 0) > sum ? `less to stay within ${z.why}` : "";
        if (!ts.length) { mark(s, "skipped", most < lo ? `${n(lo)} at least would be over ${z.why}` : `no order sizes add up to ${n(lo)}–${n(Math.floor(hi))} (sizes: ${tiers.map(t => n(t.q)).join(", ")})`); continue; }
        if (sum*u > free.eur + 0.5) { mark(s, "skipped", `over ${free.why}`); continue; }
        pend += sum*u; lines.push({s, k, ts, unit: u, total: sum, got: 0, extra});
      }
      const orders = [], blank = Object.fromEntries(ps.map(k => [k, ""]));
      for (const l of lines) l.ts.forEach((t, i) => { const o = orders[i] = orders[i] || {set: {...blank, [dk]: dest.v}, cost: 0, lines: []}; o.set[l.k] = t.v; o.cost += t.q*l.unit; o.lines.push([l, t.q]); });
      const partly = why => { for (const l of lines) if (l.s.state === "running" && l.got) { Object.assign(l.s, {qtyDone: l.got, priceDone: l.unit, amount: l.got*l.unit}); mark(l.s, "done", `${n(l.got)} of ${n(l.total)} bought, then ${why}`); } };
      for (const o of orders) {
        if (!live(run.day)) { partly(BOT.on ? "the day ended" : "the bot was stopped"); return; }
        lines.forEach(l => l.s.state === "running" && clock(run, l.s));
        const c = cashNow(run);
        if (run.floor == null || c == null || c - o.cost < run.floor) { partly("cash would go under the plan's floor"); for (const l of lines) if (l.s.state === "running") mark(l.s, "skipped", "cash would go under the plan's floor"); return; }
        const res = await submit(f, o.set, F.html);
        if (res.skip) { partly(res.skip); for (const l of lines) if (l.s.state === "running") mark(l.s, "skipped", res.skip, !res.wait); break; }
        if (res.err) {
          delete BOT.forms[g.v.url];
          if (res.unsure) for (const [l, q] of o.lines) { l.got += q; l.s.unsure = true; book(run, l.s, q*l.unit); }   // no clear answer: it may have gone through, so it counts as bought
          partly(res.err); for (const l of lines) if (l.s.state === "running") { l.s.unsure = !!res.unsure; mark(l.s, "failed", res.err); } oops(run); return;
        }
        for (const [l, q] of o.lines) { l.got += q; spend(run, l.s, q*l.unit); }
      }
      for (const l of lines) if (l.s.state === "running") {
        Object.assign(l.s, {qtyDone: l.got, priceDone: l.unit, amount: l.got*l.unit});
        mark(l.s, "done", `${BOT.dry ? "practice, not sent: " : ""}${n(l.got)} at ${l.unit} in ${l.ts.length} order${l.ts.length > 1 ? "s" : ""} (${l.ts.map(t => n(t.q)).join(" + ")})${l.s.qty != null && l.got !== l.s.qty ? `, plan ${n(l.s.qty)}` : ""}${l.extra ? "; " + l.extra : ""}`);
      }
    }
  };

  /* marketing: one form per media agency, invest<storeId> = EUR per day for the plan's stores (split by agency as the plan says),
     the other stores as they are; the form is read back after the change */
  const storeIdOf = (name, f) => {   // from a store order form's destinations, else the words beside the marketing boxes
    for (const c of Object.values(BOT.forms)) { const o = c.f.opts.destination_rtl, hit = o && pick1(o.filter(x => x.v !== ""), name, x => x.t); if (hit) return hit.v; }
    const hit = f.fields.map(x => x[0]).filter(k => /^invest\d+$/i.test(k) && nm(name) && norm(f.labels[k] || "").includes(nm(name)));
    return hit.length === 1 ? hit[0].replace(/^invest/i, "") : null;
  };
  const mktRun = async (run, list) => {
    const ags = blocks(await pageAt("MENU2_retail_media"), u => /cmd=INVEST_MKT/i.test(u), u => u), by = new Map();
    const agOf = name => {   // its link's code (MA), else its name as whole words ("MA" is in "marketing")
      const k = String(name || "").toLowerCase(); if (!k) return ags.length === 1 ? ags[0] : null;
      const byLink = ags.filter(a => [...new URL(a.url).searchParams.values()].some(x => x.toLowerCase() === k));
      const hit = byLink.length ? byLink : ags.filter(a => new RegExp(`(^|[^a-z0-9])${reEsc(k)}([^a-z0-9]|$)`, "i").test(a.text));
      return hit.length === 1 ? hit[0] : null;
    };
    for (const s of list) {
      const parts = s.media && typeof s.media === "object" && Object.keys(s.media).length ? Object.entries(s.media) : [[s.agency || "", s.act === "pause" ? 0 : s.price ?? s.qty]], got = [];
      for (const [name, v] of parts) { const a = agOf(name); if (!a) { got.length = 0; mark(s, "failed", name ? `no single media agency “${name}” on the page` : "the plan doesn't say which media agency"); break; } got.push([a, Math.round(+v)]); }
      if (s.state === "failed") { oops(run); continue; }
      if (got.some(([, v]) => !(v >= 0))) { mark(s, "failed", "the plan has no EUR/day for it"); oops(run); continue; }
      const cost = s.cost > 0 ? s.cost : got.reduce((a, [, v]) => a + v, 0);
      const why = refuse(run, s, cost, list.filter(x => x !== s && x.queued).reduce((a, x) => a + x.cost, 0)); if (why) { mark(s, "skipped", why); continue; }
      s.queued = true; s.cost = cost; s.parts = got.length; s.okParts = 0; s.amount = cost; s.qtyDone = cost; s.priceDone = cost;
      for (const [a, v] of got) by.set(a, [...(by.get(a) || []), {s, val: v}]);
    }
    for (const [a, xs] of by) {
      if (!live(run.day)) return;
      const F = await formAt(a.url), f = F.f, set = {}, sent = [];
      for (const x of xs) {
        if (x.s.state === "failed") continue;
        clock(run, x.s);
        let id = storeIdOf(x.s.where, f);
        if (!id && !Object.values(BOT.forms).some(c => c.f.opts.destination_rtl)) { const v = (await vendorsOf("buy_store"))[0]; if (v) { await formAt(v.url); id = storeIdOf(x.s.where, f); } }
        const k = id && "invest" + id;
        if (!k || !f.has(k)) { mark(x.s, "failed", `no marketing box for ${x.s.where} on the form`); oops(run); continue; }
        x.k = k; if (toNum(f.val(k)) === x.val) { x.same = true; continue; }
        set[k] = String(x.val); sent.push(x);
      }
      const res = sent.length ? await submit(f, set, F.html) : {ok: true};
      if (res.skip) { sent.forEach(x => mark(x.s, "skipped", res.skip, !res.wait)); continue; }
      if (res.err) { delete BOT.forms[a.url]; sent.forEach(x => { x.s.unsure = !!res.unsure; if (x.s.unsure) book(run, x.s, x.s.cost/x.s.parts); mark(x.s, "failed", res.err); }); oops(run); continue; }
      const G = BOT.dry || !sent.length ? null : await formAt(a.url, true).catch(() => null);   // read the form back
      for (const x of xs) {
        if (!x.k || x.s.state === "failed") continue;
        if (G && toNum(G.f.val(x.k)) !== x.val) { mark(x.s, "failed", `${a.key.match(/[?&]\w+=(\w+)/)?.[1] || "the agency"}'s form shows ${G.f.val(x.k)} after the change, not ${x.val}`); oops(run); continue; }
        if (++x.s.okParts === x.s.parts) { spend(run, x.s, x.s.cost); mark(x.s, "done", `${n(x.s.cost)}/day${BOT.dry ? ", practice, not sent" : x.same && !sent.length ? ", already set" : G ? ", the forms show it" : ""}`); }
      }
    }
    run.sec.marketing = BOT.dry ? "practice" : "checked on the forms";
  };
  const notMapped = async (run, list) => list.forEach(s => mark(s, "skipped", `${secName(s.sec).toLowerCase()} aren't mapped yet: do it in the game`));
  const RUN = {b2b: b2bRun, rent_shop: rentRun("rent_shop"), rent_wh: rentRun("rent_wh"), machine: notMapped, buy_raw: buyRun("buy_raw"), buy_store: buyRun("buy_store"),
    buy_wh_goods: buyRun("buy_wh_goods"), marketing: mktRun, price: notMapped};

  /* after the orders of a section: does the dashboard cash show them? A short look only, and a note either way: with cash on
     delivery the game may take the money when the goods arrive, so an unmoved cash line doesn't stop the bot */
  const verify = async (run, part, before) => {
    const paid = run.paid[part] || 0; if (!(paid > 0)) return;
    let moved = 0;
    for (const end = Date.now() + 1500; ;) {
      const X = dash(); if (X.cash != null && before.cash != null) moved = (before.cash - X.cash) + ((X.odUsed || 0) - (before.od || 0));
      if (moved >= 0.5*paid || Date.now() > end || stopped) break;
      await sleep(250);
    }
    if (moved >= 0.5*paid) { run.sec[part] = `cash went down ${n(Math.round(moved))} (orders ${n(Math.round(paid))})`; return; }
    run.sec[part] = "the game took the orders; cash not down yet";
    run.notes.push(`${secName(part)}: orders for ${n(Math.round(paid))} went through, the dashboard cash hasn't moved yet${before.cash == null ? " (is the dashboard on screen?)" : " (paid on delivery?)"}.`);
  };

  /* one pass over the day's plan: its steps in order, a section at a time. Steps done (or tried) earlier today are left out: a
     newer plan for the same day runs again only for steps not tried yet, or for skipped ones once 15 s have passed */
  const newRec = () => ({done: new Set(), tried: new Set(), skipped: new Set(), b2bProd: new Set(), cost: {}, reports: {}, at: 0, t0: 0, cash0: null, spent: 0, complete: false, stale: 0, staleAt: 0, pass: 0});
  const botSave = () => {   // the real day's record, so a reader pasted again the same day doesn't do the steps again
    try { const d = today(), r = BOT.days[d]; if (d && r) localStorage.setItem(KEY + ":bot", JSON.stringify({day: d, at: Date.now(), done: [...r.done], tried: [...r.tried], b2bProd: [...r.b2bProd], cost: r.cost, reports: r.reports, cash0: r.cash0, spent: r.spent})); } catch (e) {}
  };
  try {   // (only from the last 10 minutes: an older one is another game)
    const q = JSON.parse(localStorage.getItem(KEY + ":bot"));
    if (q && q.day && Date.now() - q.at < 600000) BOT.days[q.day] = Object.assign(newRec(), {done: new Set(q.done), tried: new Set(q.tried), b2bProd: new Set(q.b2bProd || []), cost: q.cost || {}, reports: q.reports || {}, cash0: q.cash0 ?? null, spent: +q.spent || 0});
  } catch (e) {}
  const botDay = async (day, plan) => {
    const key = dayKey(day), rec = BOT.days[key] = BOT.days[key] || newRec();
    if (!rec.pass) rec.t0 = Math.max(seenDay === day ? dayAt : 0, BOT.startAt);
    if (rec.cash0 == null) rec.cash0 = cashToday();   // the day's cash before the bot's first order
    const steps = plan.steps.map(s => ({...s, state: "", why: ""})), used = {};
    for (const s of steps) if (rec.cost[s.id]) used[s.key] = (used[s.key] || 0) + rec.cost[s.id];   // a plan that still lists a step the bot paid for still counts that money in its budget
    const run = BOT.run = {day, plan, steps, rec, t0: rec.pass ? Date.now() : rec.t0, used, paid: {}, sec: {}, spent: rec.spent, cash0: rec.cash0, floor: floorOf(plan), failed: 0,
      notes: [], took: null, b2bProd: rec.b2bProd, stale: "", limit: (num((plan.limits || {}).botSec) ?? (plan.stage === "prep" ? 150 : 30))*1000};
    rec.pass++; rec.at = Date.now(); rec.complete = false;
    run.stale = preCheck(run, rec);
    if (run.stale) { run.notes.push(run.stale); log(`Bot: day ${day}: ${run.stale}, so the plan waits${link.state === "linked" ? ": asking the calculator for a fresh one" : ""}.`); ask(); }
    else {
      const only = plan.rescue === true || plan.ok === false;
      for (const s of steps) {
        if (rec.tried.has(s.id)) { Object.assign(s, {state: "skipped", why: rec.done.has(s.id) ? "done earlier today" : "tried earlier today"}); if (!BOT.dry && rec.reports[s.id]) toCalc(rec.reports[s.id]); }   // its report again, in case it was lost (booked once)
        else if (!RUN[s.sec]) mark(s, "skipped", `the bot doesn't know “${s.section || "?"}” steps`);
        else if (ACTS[s.sec] && !ACTS[s.sec].includes(s.act)) mark(s, "skipped", `the bot doesn't know “${s.act || "?"}” for ${secName(s.sec).toLowerCase()}`);
        else if (only && !s.must) mark(s, "skipped", plan.rescue === true ? "cash is short today: only the must-do steps" : "the plan's own checks didn't all pass: only the must-do steps");
      }
    }
    log(`Bot: ${BOT.dry ? "practice, " : ""}day ${day}${rec.pass > 1 ? ` (pass ${rec.pass})` : ""}, ${steps.filter(s => !s.state).length} steps from ${plan.from === "pasted" ? "a pasted plan" : "the calculator"}.`);
    const todo = run.stale ? [] : steps.filter(s => !s.state), isDone = id => rec.done.has(id) || steps.some(x => x.id === id && x.state === "done");
    for (let i = 0; i < todo.length;) {
      let j = i; while (j < todo.length && todo[j].sec === todo[i].sec && todo[j].slot === todo[i].slot) j++;
      const part = todo[i].sec, all = todo.slice(i, j); i = j;
      if (!live(day)) break;
      if (all[0].slot === "later" && Date.now() - rec.t0 > run.limit*0.8) { all.forEach(s => mark(s, "skipped", "no time left today for the later steps", false)); continue; }
      const list = all.filter(s => {   // ids not in the plan are done
        const wait = s.deps.filter(d => steps.some(x => x.id === d) && !isDone(d)); if (!wait.length) return true;
        const dead = wait.filter(d => rec.tried.has(d) || steps.some(x => x.id === d && x.final && x.state !== "done"));   // a step it needs ended without going through
        const nm = ids => ids.map(d => { const x = steps.find(x => x.id === d); return x ? `“${stepText(x)}”` : d; }).join(", ");
        mark(s, "skipped", dead.length ? `needs ${nm(dead)}, which didn't go through` : `waits for ${nm(wait)}`, !!dead.length); return false;
      });
      if (!list.length) continue;
      BOT.say = `Day ${day}: ${secName(part).toLowerCase()}…`; paint();
      const Y = dash(), before = {cash: Y.cash, od: Y.odUsed};
      try { await RUN[part](run, list); }
      catch (e) { for (const s of list) if (s.state === "running") { s.unsure = true; mark(s, "failed", e.message); } oops(run); }
      const why = !BOT.on || stopped ? "the bot was stopped" : today() !== day ? "the day ended first" : "the section stopped after an error";
      for (const s of list) if (!s.state || s.state === "running") mark(s, "skipped", why, false);
      if (BUY[part] && !BOT.dry) await verify(run, part, before);
    }
    for (const s of steps) {
      if (!s.state) mark(s, "skipped", run.stale ? "waiting for a plan that matches the game" : today() !== day ? "the day ended first" : "the bot was stopped", false);
      if (s.final) { if (s.state === "done") rec.done.add(s.id); if (s.state === "done" || s.state === "failed") rec.tried.add(s.id); else rec.skipped.add(s.id); }
    }
    rec.spent = run.spent; rec.waitFresh = !!run.stale; run.took = Date.now() - run.t0;
    rec.complete = !run.stale && (live(day) || today() !== day);
    if (!run.stale && !BOT.dry) postCheck(run);
    if (!run.stale) rec.stale = 0;
    else if (Date.now() - rec.staleAt > 3000 && (rec.staleAt = Date.now()) && ++rec.stale >= 3) botStop(`Stopped: 3 plans in a row didn't match the game (${run.stale}). Check the calculator, then press Start.`, true, "plans don't match the game");   // strikes at least 3 s apart
    const k = steps.filter(s => s.why !== "done earlier today" && s.why !== "tried earlier today").reduce((a, s) => (a[s.state] = (a[s.state] || 0) + 1, a), {}), ran = steps.some(s => s.final);
    const sum = run.stale ? `Day ${day}: the plan doesn't match the game (${run.stale}). ${plan.from === "pasted" ? "Paste a fresh plan." : "Waiting for a fresh plan from the calculator…"}`
      : `Day ${day} ${rec.complete ? "done" : "stopped"} in ${sec(run.took)}${run.took > run.limit ? ` (over the ${sec(run.limit)} target)` : ""}: ${k.done || 0} done, ${k.skipped || 0} skipped, ${k.failed || 0} failed.`;
    if (!BOT.dry && !run.stale && ran) toCalc({ff: "runEnd", day, done: k.done || 0, skip: k.skipped || 0, fail: k.failed || 0, sec: Math.round(run.took/100)/10});
    if (ran || run.stale || rec.pass === 1) { log("Bot: " + sum); if (BOT.on) BOT.say = sum + (rec.complete ? ` Waiting for day ${day + 1}…` : ""); }   // a pass with nothing new keeps the day's summary
    if (!BOT.dry) botSave(); paint();
  };

  /* prep: while the day's data goes out, read the screens the plan will need; the day's run cuts it short (the rest is read when needed) */
  const botPrep = async day => {
    BOT.prepping = true;
    const p = BOT.plans[day] || Object.values(BOT.plans).sort((a, b) => b.day - a.day)[0], parts = new Set(p ? p.steps.map(s => s.sec) : SECTIONS.map(x => x[0]));
    const go = () => BOT.on && !stopped && !BOT.cut && today() === day, jobs = [];
    for (const part of ["rent_shop", "rent_wh"]) if (parts.has(part)) jobs.push(async () => {
      const K = SPACE[part], rows = locs(await pageAt(K.menu));
      if (p && p.day === day) for (const s of p.steps.filter(s => s.sec === part)) { const r = locOf(rows, s.where); if (go() && r && s.qty != null && Math.ceil(s.qty/(s.qtyStep || K.unit))*(s.qtyStep || K.unit) !== r.area) await formAt(r.link); }
    });
    for (const part of ["buy_raw", "buy_store", "buy_wh_goods"]) if (parts.has(part)) jobs.push(async () => { for (const v of await vendorsOf(part)) if (go()) await formAt(v.url); });
    if (parts.has("marketing")) jobs.push(async () => { for (const a of blocks(await pageAt("MENU2_retail_media"), u => /cmd=INVEST_MKT/i.test(u), u => u)) if (go()) await formAt(a.url); });
    for (const j of jobs) { if (!go()) break; botSay(`Day ${day}: reading the game's order screens…`); await quiet(j, "Bot prep"); }
    checkExpect(); BOT.prepDay = day; BOT.prepping = false; paint();
  };
  const botSay = m => { if (BOT.say !== m) { BOT.say = m; paint(); } };
  const canRun = s => !!RUN[s.sec] && !!ACTS[s.sec] && ACTS[s.sec].includes(s.act);   // machines, prices and unknown steps never start another pass
  const ask = () => { if (link.state === "linked" && Date.now() - BOT.askAt > 5000) { BOT.askAt = Date.now(); toCalc({ff: "getPlan"}); } };   // a plan now, not after the next update
  const botLoop = async () => {
    let readyDay = 0, readyAt = 0, prep = null, oldAt = 0;
    while (BOT.on && !stopped) {
      const day = today(), rec = BOT.days[dayKey(day)]; let p = BOT.plans[day];
      if (!ready || !day) { botSay("Waiting for the first read of the game…"); await sleep(250); continue; }
      if (rec && rec.complete) {   // done today, unless a newer plan has steps not tried yet (or skipped ones, after 15 s)
        const fresh = p && p.got > rec.at && p.steps.some(s => canRun(s) && !rec.tried.has(s.id) && (!rec.skipped.has(s.id) || Date.now() - rec.at > 15000));
        if (!fresh) { await sleep(250); continue; }
      }
      if (rec && rec.waitFresh && !(p && p.got > rec.at)) { ask(); await sleep(250); continue; }   // the last plan didn't match the game
      if (BOT.prepDay !== day && !prep) { BOT.cut = false; prep = botPrep(day).finally(() => { prep = null; }); }
      if (dayRead !== day || (salesWait && salesWait.day === day && Date.now() - dayAt < 8000)) { if (!BOT.prepping) botSay(`Day ${day}: waiting for the day's data…`); await sleep(150); continue; }   // yesterday's sales late: 8 s at most, then the newest plan
      if (readyDay !== day) { readyDay = day; readyAt = Date.now(); }
      const since = lap.day === day ? Math.max(lap.full || 0, lap.sales || 0, lap.read || 0) : 0, waited = Date.now() - readyAt;   // a plan made from this day's sales; else after 8 s the day's newest
      if (!p || (p.from !== "pasted" && p.got < since && waited < 8000)) {
        if (waited > 3000) ask();
        if (!BOT.prepping || waited >= 8000) botSay(`Waiting for the calculator plan for day ${day}${link.state === "linked" || waited < 8000 ? "" : " (not linked: unlock the calculator tab, or open the game with Go live there, or paste a plan)"}.`);
        await sleep(150); continue;
      }
      const maxAge = (num((p.limits || {}).maxPlanAgeSec) ?? 90)*1000;   // an old plan: ask for a fresh one first (its checks still guard it after 6 s)
      if (p.from !== "pasted" && link.state === "linked" && Date.now() - p.got > maxAge && (oldAt = oldAt || Date.now()) > Date.now() - 6000) {
        ask(); botSay(`Day ${day}: the plan is over ${Math.round(maxAge/1000)} s old: asking the calculator for a fresh one…`); await sleep(150); continue;
      }
      oldAt = 0; BOT.cut = true; if (prep) await prep;
      if (!BOT.on || stopped || today() !== day) continue;
      if (BOT.plans[day] && BOT.plans[day].got > p.got) p = BOT.plans[day];   // a plan that came in while prep finished
      BOT.busy = true; paint();
      try { await botDay(day, p); } catch (e) { botSay("Problem: " + e.message); log("Bot: " + e.message); } finally { BOT.busy = false; }
      paint();
    }
  };
  const spin = () => { BOT.loop = botLoop().catch(e => botStop("Problem: " + e.message, false, e.message)).finally(() => { BOT.loop = null; if (BOT.on && !stopped) spin(); else paint(); }); };
  const botStart = () => {
    if (BOT.on || stopped) return;
    Object.assign(BOT, {on: true, fails: 0, cut: false, prepDay: 0, startAt: Date.now(), note: "", say: "Starting…", askAt: 0}); log(BOT.dry ? "Bot on, practice: nothing is sent." : "Bot on."); paint();
    if (ready && $id("MENU2_B2Bincm")) quiet(readOffers, "B2B offers").then(deliver);   // the calculator plans B2B steps from the offers' numbers
    if (link.state === "linked") toCalc({ff: "botHello", v: 1});
    else if ((BOT.plans[today()] || {}).from !== "pasted" && openCalc()) BOT.note = "Opened the calculator in a new tab: unlock it there if it asks. Its plan comes back here.";   // a pasted plan runs without it
    if (!BOT.loop) spin();   // one loop at a time: a quick Stop and Start keeps the one still running
  };
  /* Check the screens: every screen the bot uses, read now and checked for the boxes it fills in. It sends nothing */
  const botCheck = async () => {
    if (BOT.on || BOT.checking) return;
    BOT.checking = true; BOT.check = []; paint();
    const row = (name, ok, detail) => { BOT.check.push({name, ok, detail}); paint(); };
    const tryRow = async (name, job) => { try { row(name, true, await job()); } catch (e) { row(name, false, e.message); } };
    try {
      await tryRow("Day and cash", async () => { const X = dash(); if (!X.day) throw new Error("can't read the day: show the dashboard"); if (X.cash == null) throw new Error("can't read Cash in Bank: show the dashboard"); return `day ${X.day}/${X.maxDay || "?"}, cash ${n(X.cash)}`; });
      for (const part of ["rent_shop", "rent_wh"]) await tryRow(secName(part), async () => {
        const K = SPACE[part], rows = locs(await pageAt(K.menu, true)).filter(r => r.name);
        if (!rows.length) throw new Error("no locations with a rent link on the page");
        const lost = rows.filter(r => r.rented && !r.known); if (lost.length) throw new Error(`can't read the current area of ${lost.map(r => r.name).join(", ")}`);
        const had = rows.filter(r => r.area > 0).map(r => `${r.name} ${n(r.area)} m²`).join(", ");
        const r = rows.find(r => r.area > 0) || rows[0], F = await formAt(r.link, true), tk = "terms" + r.ac;
        if (!F.f.has("rent" + r.ac)) throw new Error(`the ${r.name} form has no rent${r.ac} box`);
        return `${rows.length} locations${had ? ` (rented: ${had})` : ""}, ${r.name} form ready${F.f.opts[tk] ? ` (terms ${F.f.opts[tk].map(o => o.v).join(" / ")} days)` : ""}`;
      });
      for (const part of ["buy_raw", "buy_store", "buy_wh_goods"]) await tryRow(secName(part), async () => {
        const vs = await vendorsOf(part); if (!vs.length) throw new Error("no order link on the vendor page");
        const f = (await formAt(vs[0].url, true)).f, dk = destOf(f), ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)), sizes = ps.length ? tiersOf(f, ps[0]).map(t => t.q) : [];
        if (!dk) throw new Error("the order form has no destination list");
        if (!sizes.length) throw new Error("no products with order sizes on the order form");
        return `${vs.length} vendor${vs.length > 1 ? "s" : ""}, ${ps.length} products, ${f.opts[dk].filter(o => o.v !== "").length} destinations, sizes ${n(Math.min(...sizes))} to ${n(Math.max(...sizes))}`;
      });
      await tryRow("Marketing", async () => {
        const ags = blocks(await pageAt("MENU2_retail_media", true), u => /cmd=INVEST_MKT/i.test(u), u => u); if (!ags.length) throw new Error("no Set Marketing Expense link");
        const boxes = (await formAt(ags[0].url, true)).f.fields.map(x => x[0]).filter(k => /^invest\d+$/i.test(k));
        if (!boxes.length) throw new Error("no store boxes on the marketing form");
        return `${ags.length} media agenc${ags.length > 1 ? "ies" : "y"}, ${boxes.length} store boxes`;
      });
      await tryRow("B2B deals", async () => { const c = offerCards(dom(await page("MENU2_B2Bincm"))).length; return `${c} offer${c === 1 ? "" : "s"} on the list (the bid and accept screens are still unseen)`; });
      row("Machines, prices", false, "not mapped yet: the bot skips these steps");
      row("Calculator", link.state === "linked", link.state === "linked" ? "linked" : CALC ? "not linked yet: Start opens it" : "not linked: open the game with Go live in the calculator");
    } finally { BOT.checking = false; BOT.checkAt = Date.now(); paint(); }
  };
  const botStop = (why, force, abort) => {
    if (!BOT.on && !force) return;
    BOT.on = false; BOT.cut = true; BOT.say = why || "Stopped."; log("Bot: " + BOT.say);
    if (abort && !BOT.dry) toCalc({ff: "abort", reason: abort, day: today()});   // the calculator shows it too
    paint();
  };
  const loadPaste = () => {
    const ta = root.querySelector('[data-bot="paste"]'); let p;
    try { p = JSON.parse(ta.value); } catch (e) { BOT.note = "That isn't valid JSON."; return; }
    const bad = takePlan(p, "pasted");
    BOT.note = bad || (+p.day === today() ? `Loaded the plan for day ${p.day}: it runs ${BOT.on ? "now" : "when you press Start"}.` : `Loaded the plan for day ${p.day}. The game is on day ${today() || "?"}, so it waits for its day.`);
  };
  const paneBot = () => {
    const d = today(), last = Object.values(BOT.plans).sort((a, b) => b.day - a.day || b.got - a.got)[0];
    const r = BOT.run && BOT.run.day === d ? BOT.run : null, p = r ? r.plan : BOT.plans[d] || last || null, steps = r ? r.steps : p ? p.steps : [];
    const top = `<p class="m">${esc(BOT.say || "Off. Press Start: each day it carries out the calculator's plan.")}</p>${BOT.note ? `<p class="w">${esc(BOT.note)}</p>` : ""}${BOT.warn ? `<p class="w">${esc(BOT.warn)}</p>` : ""}`
      + (BOT.check.length ? `<p style="margin-top:6px"><b>Screen check</b>${BOT.checkAt && !BOT.checking ? ` <span class="k">${esc(new Date(BOT.checkAt).toLocaleTimeString())}</span>` : ""}</p><table>${BOT.check.map(c => `<tr><td>${esc(c.name)}<div class="k">${esc(c.detail)}</div></td><td class="st ${c.ok ? "done" : "failed"}">${c.ok ? "ready" : "no"}</td></tr>`).join("")}</table>` : "");
    if (!p) return top + `<p class="m">No plan yet. ${link.state === "linked" ? "The calculator sends one after each update." : CALC ? "Start opens the calculator and links it to this tab (or paste a plan below)." : "Open the game with Go live in the calculator, or paste a plan below."}</p>`;
    const limit = r ? r.limit : (num((p.limits || {}).botSec) ?? (p.stage === "prep" ? 150 : 30))*1000;
    const time = !r ? "" : r.took != null ? `Day ${r.day} took ${sec(r.took)}${r.took > limit ? ` (over the ${sec(limit)} target)` : ""}.` : `Day ${r.day}: ${sec(Date.now() - r.t0)} so far.`;
    const money = k => { const cap = capOf(p, k); return `${esc(k)} ${n(Math.round((r && r.used[k]) || 0))} of ${cap == null ? "no budget" : n(Math.round(cap))}`; };
    const box = (k, ss) => `<p style="margin-top:8px"><b>${esc(secName(k))}</b> <span class="k">${[...new Set(ss.map(s => s.key).filter(Boolean))].map(money).join(" · ")}${r && r.sec[k] ? ` · ${esc(r.sec[k])}` : ""}</span></p>
      <table>${ss.map(s => `<tr><td>${esc(stepText(s))}${s.why ? `<div class="k">${esc(s.why)}</div>` : ""}</td><td class="n">${s.cost ? n(Math.round(s.cost)) : ""}</td><td class="st ${esc(s.state || "")}">${esc(s.state || "to do")}${s.must ? " · must" : ""}${s.late ? " · late" : ""}</td></tr>`).join("")}</table>`;
    const groups = []; for (const s of steps) { const g = groups[groups.length - 1]; if (g && g.k === s.sec) g.ss.push(s); else groups.push({k: s.sec, ss: [s]}); }
    return top + `<p><b>Plan for day ${n(p.day)}</b>${p.stage === "prep" ? " · prep stage" : ""}${p.day !== d ? ` <span class="w">(the game is on day ${n(d)})</span>` : ""} <span class="k">${p.from === "pasted" ? "pasted" : "from the calculator"} ${esc(new Date(p.got).toLocaleTimeString())}${floorOf(p) != null ? ` · cash stays above ${n(Math.round(floorOf(p)))}` : ""}${p.rescue ? " · rescue day" : ""}</span></p>
      ${(p.warnings || []).length ? `<p class="w">${esc(p.warnings.slice(0, 2).join(" "))}</p>` : ""}${time ? `<p class="m">${esc(time)}</p>` : ""}${groups.map(g => box(g.k, g.ss)).join("")}
      ${r && r.notes.length ? `<ul>${r.notes.slice(-6).map(x => `<li class="k">${esc(x)}</li>`).join("")}</ul>` : ""}`;
  };
  const n = v => v == null || isNaN(v) ? "–" : Number(v).toLocaleString();
  const none = '<p class="m">Nothing read yet. Wait for the first read, or press Read now.</p>';
  const paneToday = () => !D ? none : `<table>
      <tr><td>Day</td><td class="n">${n(D.day)}${D.maxDay ? " / " + n(D.maxDay) : ""}</td></tr>
      ${D.maxDay ? `<tr><td>Days left</td><td class="n">${n(D.maxDay - D.day)}</td></tr>` : ""}
      <tr><td>Cash in bank</td><td class="n">${n(D.cash)}</td></tr>
      <tr><td>Overdraft used</td><td class="n">${n(D.odUsed)}</td></tr>
      <tr><td>Delinquent payouts</td><td class="n">${n(D.delinq)}</td></tr>
      <tr><td>Stores · warehouses</td><td class="n">${(D.stores || []).length} · ${(D.warehouses || []).length}</td></tr></table>
      <p class="k">The full plan for today is on the FF calculator.</p>`;
  const paneStores = () => !D || !(D.stores || []).length ? none : D.stores.map(st => {
      const pc = st.area ? Math.round(100 * st.used / st.area) : null;
      return `<p><b>${esc(st.name)}</b> <span class="k">${pc == null ? "" : pc + "% full · " + n(st.used) + " / " + n(st.area)}</span></p>
        ${pc == null ? "" : `<div class="bar"><i class="${pc >= 90 ? "hi" : ""}" style="width:${Math.min(100, pc)}%"></i></div>`}
        <table><tr><th>Item</th><th class="n">Price</th><th class="n">Qty</th></tr>${(st.items || []).map(it => `<tr><td>${esc(it.name)}</td><td class="n">${n(it.price)}</td><td class="n">${n(it.qty)}</td></tr>`).join("")}</table>`;
    }).join("");
  const paneStock = () => !D || !(D.warehouses || []).length ? none : D.warehouses.map(w =>
      `<p><b>${esc(w.name)}</b> <span class="k">${n(w.machines)} machines</span></p>
      <table><tr><th>Item</th><th class="n">Qty</th></tr>${(w.items || []).map(it => `<tr><td>${esc(it.name)}</td><td class="n">${n(it.qty)}</td></tr>`).join("")}</table>`).join("");
  const paneChecks = () => {
    if (!D) return none;
    const c = [];
    if (D.delinq > 0) c.push(`Delinquent payouts: <b>${n(D.delinq)}</b>. These cost you; pay them first.`);
    if (D.odUsed > 0) c.push(`Overdraft in use: <b>${n(D.odUsed)}</b>.`);
    for (const st of D.stores || []) {
      const pc = st.area ? Math.round(100 * st.used / st.area) : 0;
      if (pc >= 90) c.push(`<b>${esc(st.name)}</b> is ${pc}% full.`);
      for (const it of st.items || []) if (it.qty === 0) c.push(`<b>${esc(st.name)}</b> is out of ${esc(it.name)}.`);
    }
    if (D.maxDay && D.maxDay - D.day <= 5) c.push(`Only ${n(D.maxDay - D.day)} days left.`);
    return (c.length ? `<ul>${c.map(x => `<li>${x}</li>`).join("")}</ul>` : '<p class="ok">Nothing flagged right now.</p>') + '<p class="k">Quick checks only. The FF calculator has the full plan.</p>';
  };
  let drag = null;
  root.addEventListener("pointerdown", e => {
    const h = e.target.closest(".h"); if (!h || e.target.closest("button")) return;
    const r = host.getBoundingClientRect(); drag = {dx: e.clientX - r.left, dy: e.clientY - r.top};
    try { h.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
  });
  root.addEventListener("pointermove", e => { if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy); });
  const endDrag = () => { if (drag) { drag = null; keep(); } };
  root.addEventListener("pointerup", endDrag); root.addEventListener("pointercancel", endDrag);
  const onKey = e => {
    if (e.key === "Escape" && (AC.on || AC.picking || BOT.on)) { if (BOT.on) botStop("Stopped with Esc."); if (AC.on || AC.picking) acStop(AC.on ? "Stopped with Esc." : "Picking cancelled."); return; } if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyF")) { e.preventDefault(); hidden = !hidden; paint(); } };
  document.addEventListener("keydown", onKey, true);
  let shape = "";
  function paint(){
    if (!host) return;
    const ok = link.state === "linked", day = esc((D && D.day) || seenDay || "…");
    if (shape !== (mini ? "mini" : "box")) {
      shape = mini ? "mini" : "box";
      root.innerHTML = CSS + (mini ? `<button class="pill" data-a="max"></button>` : `<div class="b"><div class="h"><b data-f="title"></b><button class="x" data-a="min" title="Minimise (Alt+F hides)">–</button><button class="x" data-a="stop" title="Stop reading">×</button></div>
      <div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}">${n}</button>`).join("")}</div>
      <div class="pane" data-t="live"><p data-f="link"></p><p class="m" data-f="speed"></p><p class="m" data-f="info"></p><p class="w" data-f="stale"></p></div>
      <div class="stopbar" data-f="stopbar"></div>
      <div class="pane" data-t="today" data-f="today"></div><div class="pane" data-t="auto" data-f="auto"></div><div class="pane" data-t="stores" data-f="stores"></div><div class="pane" data-t="stock" data-f="stock"></div><div class="pane" data-t="checks" data-f="checks"></div>
      <div class="pane" data-t="bot"><button class="a big go" data-bot="go" data-f="botgo"></button>
      <div class="r"><button class="a" data-bot="check" data-f="botcheck">Check the screens</button><label class="k"><input type="checkbox" data-bot="dry" data-f="botdry"> Practice: do everything but send</label></div><div class="r"><label class="k"><input type="checkbox" data-bot="auto" data-f="botauto"> Run by itself: start now and every time the game opens (this computer)</label></div><div role="status" data-f="bot"></div>
      <details><summary class="k">Paste a plan (for testing)</summary><textarea data-bot="paste" spellcheck="false" placeholder="{&quot;ff&quot;:&quot;plan&quot;,&quot;v&quot;:1,&quot;day&quot;:1,&quot;reserve&quot;:0,&quot;budgets&quot;:{&quot;marketing&quot;:5000},&quot;steps&quot;:[{&quot;id&quot;:&quot;d1:mkt&quot;,&quot;section&quot;:&quot;marketing&quot;,&quot;action&quot;:&quot;set&quot;,&quot;target&quot;:&quot;Berlin&quot;,&quot;price&quot;:5000,&quot;agency&quot;:&quot;MA&quot;,&quot;cost&quot;:5000}]}"></textarea><div class="r"><button class="a" data-bot="load">Load</button></div></details></div>
      <p class="m" role="status" data-f="msg"></p>
      <div class="r"><button class="a p" data-a="copy">Copy data</button><button class="a" data-a="read">Read now</button><button class="a" data-a="setup">Update setup</button></div></div>`);
    }
    host.style.display = hidden ? "none" : "";
    const put = (f, html) => { const el = root.querySelector(f); if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } };
    if (mini) { put(".pill", `FF live${TAG ? " " + esc(TAG) : ""} · day ${day} ${ok ? "✓" : ""}${AC.on ? " · ● auto" : ""}${BOT.on ? " · ● bot" : ""}`); return; }
    put('[data-f="title"]', `FF live${TAG ? " · Mode " + esc(TAG) : ""} · day ${day}${D && D.maxDay ? "/" + esc(D.maxDay) : ""}`);
    put('[data-f="link"]', ok ? '<span class="ok">Linked ✓</span> The calculator follows the game live.' : link.state === "looking" ? "Looking for the FF calculator that opened this tab…" : "Not linked: click <b>Copy data</b> and paste it in the calculator (or use <b>Go live</b> there).");
    put('[data-f="speed"]', !ready || !lap.day || lap.day !== (D && D.day) ? "" : ok && lap.sent ? `Day ${esc(lap.day)} was on the calculator ${after(lap.sent - lap.seen)}${lap.sales ? `, its sales ${after(lap.sales - lap.seen)}` : ""}.`
      : lap.read ? `Day ${esc(lap.day)}: sales read ${after(lap.read - lap.seen)}.` : "");
    put('[data-f="info"]', (D && D.at ? `Last change ${esc(new Date(D.at).toLocaleTimeString())} · ${(D.stores || []).length} stores · sales: ${esc(D.salesFrom || "not found yet")}` : "Starting…") + ` · reader ${BUILD}`);
    put('[data-f="stale"]', stale && busy !== "setup" ? `${esc(stale[0].toUpperCase() + stale.slice(1))}. The setup is read again when you stop clicking for 20 s, or now:` : "");
    for (const el of root.querySelectorAll("[data-tab]")) el.setAttribute("aria-selected", el.dataset.tab === tab);
    for (const el of root.querySelectorAll("[data-t]")) el.hidden = el.dataset.t !== tab;
    if (tab === "today") put('[data-f="today"]', paneToday());
    if (tab === "stores") put('[data-f="stores"]', paneStores());
    if (tab === "stock") put('[data-f="stock"]', paneStock());
    if (tab === "checks") put('[data-f="checks"]', paneChecks());
    if (tab === "auto" && !root.activeElement?.matches?.('input[type="number"],select')) put('[data-f="auto"]', paneAuto());
    if (tab === "bot") put('[data-f="bot"]', paneBot());
    const bg = root.querySelector('[data-f="botgo"]'); put('[data-f="botgo"]', BOT.on ? "■ Stop the bot" : BOT.dry ? "▶ Start a practice run" : "▶ Start the bot"); bg.classList.toggle("go", !BOT.on); bg.classList.toggle("stop", BOT.on);
    const bd = root.querySelector('[data-f="botdry"]'); bd.checked = BOT.dry; bd.disabled = BOT.on || !!BOT.loop;
    const ba = root.querySelector('[data-f="botauto"]'); ba.checked = !!mem.auto; ba.disabled = BOT.dry;
    const bc = root.querySelector('[data-f="botcheck"]'); bc.disabled = BOT.on || BOT.checking; put('[data-f="botcheck"]', BOT.checking ? "Checking…" : "Check the screens");
    put('[data-f="stopbar"]', (AC.on ? `<button class="a stop" data-ac="stop">■ Stop auto-click</button>` : "") + (BOT.on && tab !== "bot" ? `<button class="a stop" data-bot="stop">■ Stop the bot</button>` : ""));   // on the Bot tab its own button stops it
    put('[data-f="msg"]', esc(note && Date.now() - noteAt < 6000 ? note : msg));
    root.querySelector('[data-a="copy"]').disabled = !ready;
    for (const k of ["read", "setup"]) root.querySelector(`[data-a="${k}"]`).disabled = busy === "setup";
  }
  root.addEventListener("change", e => {
    if (e.target.dataset && e.target.dataset.bot === "auto") { mem.auto = !!e.target.checked; save(); log(mem.auto ? "Bot: runs by itself from now on, every time the game opens." : "Bot: starts only when you press Start."); if (mem.auto && !BOT.dry) botStart(); paint(); return; }
    if (e.target.dataset && e.target.dataset.bot === "dry") { if (!BOT.on && !BOT.loop) BOT.dry = !!e.target.checked; paint(); return; }   // not while a pass is still finishing
    const bk = e.target.dataset && e.target.dataset.b2b;
    if (bk === "mode") { B2B.mode = e.target.value === "all" ? "all" : "smart"; b2bSave(); if (B2B.at) b2bCheck().catch(() => {}); paint(); return; }
    if (bk === "margin") { B2B.margin = Math.min(3, Math.max(1, +e.target.value || 1.15)); b2bSave(); paint(); return; }
    const k = e.target.dataset && e.target.dataset.ac; if (!k) return;
    if (k === "on") { if (e.target.checked) acRun(); else acStop(); }
    if (k === "every") { AC.every = Math.min(600, Math.max(2, Math.round(+e.target.value || 5))); acSave(); }
    if (k === "rounds") { AC.rounds = Math.min(9999, Math.max(0, Math.round(+e.target.value || 0))); acSave(); }
    paint();
  });
  root.addEventListener("click", async e => {
    const bb = e.target.closest("button[data-bot]");
    if (bb) { const k = bb.dataset.bot; if (k === "go") { if (BOT.on) botStop("Stopped."); else botStart(); } if (k === "stop") botStop("Stopped."); if (k === "load") loadPaste(); if (k === "check") botCheck().catch(e => log("Bot check: " + e.message)); paint(); return; }
    const c = e.target.closest("[data-ac]");
    if (c && c.tagName !== "INPUT") {
      const k = c.dataset.ac;
      if (k === "stop") acStop();
      if (k === "pick") { AC.picking = !AC.picking; AC.last = AC.picking ? "Click the game button to add. Esc cancels." : ""; if (!AC.picking) unglow(); }
      if (k === "del") { AC.picks.splice(+c.dataset.i, 1); acSave(); }
      if (k === "clear") { AC.picks = []; acSave(); AC.last = ""; }
      if (k === "b2b") { b2bCheck().catch(err => { B2B.err = "Couldn't read the offers: " + err.message; paint(); }); return; }
      paint(); return;
    }
    const a = e.target.closest("[data-a],[data-tab]"); if (!a) return;
    const k = a.dataset.a, tell = m => { note = m; noteAt = Date.now(); paint(); };
    if (a.dataset.tab) { tab = a.dataset.tab; keep(); paint(); return; }
    if (k === "min" || k === "max") { mini = k === "min"; paint(); return; }
    if (k === "stop") { acStop(); stop(); log("Stopped. Paste the reader again to restart."); return; }
    if (k === "read") { wantFull = true; tell("Reading everything again…"); return; }
    if (k === "setup") { wantSetup = "asked"; tell("The game setup is read next…"); return; }
    if (k === "copy" && D) {
      const json = JSON.stringify(D);
      try { await navigator.clipboard.writeText(json); tell("Copied. Paste it into the FF calculator."); }
      catch (err) {
        const ta = document.createElement("textarea"); ta.value = json; ta.readOnly = true; ta.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px"; document.body.appendChild(ta);
        ta.focus(); ta.select(); try { ta.setSelectionRange(0, json.length); } catch (_) {}
        let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove();
        tell(ok ? "Copied. Paste it into the FF calculator." : "Couldn't copy here. Use Go live in the calculator instead, or on a computer type copy(__ffdata) in the Console.");
      }
    }
  });

  /* 7. The reading, one thing at a time, most urgent first: the setup, a full read, the new day, then one slower page now and then */
  const touched = () => { lastInput = Date.now(); };
  const EVENTS = ["keydown", "mousedown", "wheel", "touchstart"];
  EVENTS.forEach(t => document.addEventListener(t, touched, true));
  const run = async job => {
    if (stopped) return; busy = busy || "yes"; paint();
    try { await job(); } catch (e) { msg = "Problem: " + e.message; log(msg); }
    busy = ""; paint();
  };
  async function next(){   // false: nothing to read right now
    if (newGame) { newGame = false; mem = mem.gapFloor ? {gapFloor: mem.gapFloor} : {}; save(); D = null; ready = false; dayRead = 0; sentBody = lastSig = ""; b2bSeries = salesWait = null; stale = ""; lap = {day: 0}; log("A new game: starting over."); }
    if (!seenDay) return false;   // the day counter isn't on screen
    if (!mem.setup || wantSetup) {
      if (!wantSetup && Date.now() - setupFailAt < 60000) return false;
      const why = wantSetup || "first time"; wantSetup = "";
      await run(async () => { await readSetup(why); await readAll(); });
      if (!mem.setup) setupFailAt = Date.now();
      return true;
    }
    if (!D || wantFull || D.setupDay !== mem.setup.setupDay) { await run(readAll); return true; }
    if (D.day !== dayRead) { await run(daily); return true; }
    if (salesWait && (salesWait.day !== D.day ? (salesWait = null, false) : Date.now() - salesWait.at > 2500)) { await run(salesAgain); return true; }
    const botBusy = BOT.busy || BOT.prepping;   // the bot's day goes first: no setup clicks or slow pages meanwhile
    if (stale && !botBusy && Date.now() - lastInput > 20000 && setupTried !== D.day) {   // the setup clicks in the game: only while nobody is clicking
      setupTried = D.day;
      await run(async () => {
        const before = [...unseen];
        await readSetup(stale); await readAll();
        const still = unseen.filter(nm => before.includes(nm));   // still unknown after reading the setup again: not a product, stop asking
        if (still.length) { mem.ignored = [...new Set([...(mem.ignored || []), ...still])]; save(); unseen = unseen.filter(nm => !still.includes(nm)); if (!unseen.length) stale = ""; }
      });
      return true;
    }
    if (!botBusy && Date.now() - lastSlow > 20000 && (!dayLen || Date.now() - dayAt < dayLen/2)) {   // early in a day, far from the next one: rents and forecasts stay fresh too
      lastSlow = Date.now();
      const k = Object.keys(SLOW)[slowNext++ % 4];
      await run(async () => { await quiet(SLOW[k]); deliver(); });
      return true;
    }
    return false;
  }
  async function work(){ while (!stopped) if (!await next().catch(e => (log("Problem: " + e.message), false))) await sleep(150); }

  /* 8. Live: the day counter is watched 10 times a second, the whole dashboard every second; a change goes out at once */
  const lagging = now => document.hidden && dayLen > 0 && now - dayAt > Math.max(2.5*dayLen, 45000) && !(D && D.maxDay && D.day >= D.maxDay);
  function look(now){
    lookAt = now;
    const X = dash();
    if (!X.day) { seenDay = 0; if (!D && !busy) say("Can't see the day counter: open your game's main page."); return; }
    if (D && X.day < D.day - 1) { if (++backDays >= 3) { backDays = 0; newGame = true; } return; }   // the day went back: a new game
    backDays = 0;
    if (X.day !== seenDay) { if (seenDay && X.day === seenDay + 1 && dayAt) dayLen = now - dayAt; seenDay = X.day; dayAt = now; }
    if (!D || !ready) return;   // nothing goes out before the first full read
    const lag = lagging(now), sig = JSON.stringify([X.day, X.cash, X.odUsed, X.delinq, X.stores, X.warehouses, lag]);
    if (sig === lastSig) return;
    lastSig = sig;
    const fresh = X.day !== D.day;
    if (fresh) lap = {day: X.day, seen: now};
    mergeDash(X); D.lag = lag;
    if (fresh) b2bNow();
    rememberStock(); deliver();
  }
  function pulse(){
    if (stopped) return;
    wake();
    const now = Date.now(), m = (($id("KPI_DAY____") || {}).textContent || "").match(/(\d+)\s*\/\s*(\d+)/), d = m ? +m[1] : 0;
    if ((d && d !== kpiDay) || now - lookAt >= 1000) { kpiDay = d || kpiDay; look(now); }
    if (sendDue && now - lastSent >= 300) send();
    if (link.state !== "none" && !calcWin()) { link.state = "none"; paint(); }   // the calculator's page was closed
    if (link.state === "looking" && now - link.helloAt > 5000) hello();
    if (link.state === "linked" && link.ackAt < link.sentAt && now - link.sentAt > 8000) { link.state = "looking"; hello(); paint(); }   // the calculator stopped answering
    if (link.state === "linked" && ready && now - lastSent > 15000) send();   // a beat: the calculator knows this tab is still here, even when the game is paused
  }
  const timer = setInterval(pulse, 400);
  let beat = null, beatUrl = "";
  try { beatUrl = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 100)"], {type: "text/javascript"})); beat = new Worker(beatUrl); beat.onmessage = pulse; beat.onerror = () => { beat = null; }; } catch (e) { beat = null; }
  function stop(){
    stopped = true; clearInterval(timer); try { beat?.terminate(); } catch (e) {} if (beatUrl) URL.revokeObjectURL(beatUrl);
    window.removeEventListener("message", onMsg);
    EVENTS.forEach(t => document.removeEventListener(t, touched, true));
    document.removeEventListener("keydown", onKey, true);
    AC.on = false; AC.picking = false; unglow(); BOT.on = false; BOT.cut = true; document.removeEventListener("mouseover", onOver, true); document.removeEventListener("click", onPick, true);
    for (const w of waits) w.go(); waits.clear();
    host?.remove(); host = null; if (window.__ff && window.__ff.timer === timer) delete window.__ff;
  }
  window.__ff = {timer, stop, read: () => { wantFull = true; }, data: () => D, bot: BOT, plan: p => takePlan(p, "pasted")};
  if (window.opener) hello();
  if (self.origin === "null") msg = "This tab was opened in a sandbox, so it can't read the game. Open your game normally, run the reader there and use Copy data.";
  paint();
  log(mem.setup ? "Starting (setup remembered from before)…" : "Starting: the first read takes under half a minute…");
  pulse(); work();
  while (!ready && !stopped) await sleep(500);
  if (mem.auto && !stopped && !BOT.on) {   // Run by itself: no click needed. A game opened from the calculator's Go live links to it first
    for (let t = 0; window.opener && link.state === "looking" && t < 16 && !stopped; t++) await sleep(500);
    if (!stopped && !BOT.on) { BOT.dry = false; log("Bot: started by itself (Run by itself is on)."); botStart();
      if (BOT.on && link.state !== "linked" && !link.win) { BOT.note = "Started by itself, but Chrome blocked the calculator window. Click the blocked pop-up sign at the right of the address bar and choose Always allow, then press Stop and Start once (or open the game from the calculator's Go live)."; paint(); } }
  }
  return D;
})();
