(async () => {
  /* FF game reader v4 (live): read-only. Reads this MonsoonSIM game, then follows it as it runs: a new day reaches the calculator
     within about a second, that day's sales a second or two later. Paste it again any time: it restarts cleanly and remembers
     the game setup, so it starts in seconds. */
  if (window.__ff && window.__ff.stop) window.__ff.stop();
  document.getElementById("ff-reader-box")?.remove();
  const V = 4, GAP = 900, CLICK = 1500;   // the game blocks fast clicks: page reads at least GAP ms apart, clicks in Configuration CLICK ms
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
  const get = async url => {
    for (let t = 0; ; t++) {
      await pace(); hits++;
      const ctl = typeof AbortController === "function" ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 20000);
      let h; try { h = await (await fetch(url, {credentials: "same-origin", signal: ctl ? ctl.signal : undefined})).text(); } finally { clearTimeout(to); }
      if (h.length > 4000 || !/slow down|too fast/i.test(h)) { if (gap > floor && Date.now() - slowAt > 120000) gap = Math.max(floor, gap - 300); return h; }
      floor = Math.min(3000, Math.max(floor, gap + 300)); mem.gapFloor = floor; save();
      slowAt = Date.now(); gap = Math.min(Math.max(gap*2, floor), 6000); log(`The game asked to slow down: reading ${sec(gap)} apart for a while, then at least ${sec(floor)}.`);
      if (t >= 2) return h;
      await sleep(3000);
    }
  };
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
    D.menus = menuList(); dayRead = day; checkNew();
    deliver(); msg = ""; dayLog(day);
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
    if (!prev) Object.assign(D, X); else mergeDash(X);
    if (ready && D.day !== dayRead) await daily();   // a new day came in meanwhile (e.g. while the setup was read): its sales go out first
    say("Reading store rents…"); await quiet(SLOW.rents, "Store rents"); await quiet(SLOW.warehouse);
    say("Reading the demand forecasts…"); await quiet(SLOW.forecast, "Forecast"); D.forecast = D.forecast || {};
    await quiet(SLOW.b2b); D.b2bForecast = D.b2bForecast || {};
    rememberStock(); lastSlow = Date.now(); wantFull = false;
    say("Reading sales…"); await daily();
    if (!ready) { ready = true; lastSig = ""; paint(); log(`Live: the box at the bottom right follows the game${link.state === "linked" ? " and sends each change to the calculator at once" : ". Click Copy data there to paste it in the calculator"}.`); }
  };

  /* 5. Hand the data over: straight to the calculator when this tab was opened from it, else by Copy data */
  const link = {state: window.opener ? "looking" : "none", origin: "*", ackAt: 0, helloAt: 0, sentAt: 0};
  const toCalc = m => { try { if (window.opener && !window.opener.closed) { window.opener.postMessage(m, link.origin); return true; } } catch (e) {} return false; };
  const hello = () => { link.helloAt = Date.now(); link.origin = "*"; toCalc({ff: "hello", v: V, mode: TAG}); };
  const onMsg = e => {
    if (!window.opener || e.source !== window.opener || !e.data || e.data.ff !== "ack") return;
    const was = link.state;
    link.origin = e.origin && e.origin !== "null" ? e.origin : "*"; link.state = "linked"; link.ackAt = Date.now();
    if (was !== "linked") { log("Linked to the FF calculator."); if (ready) send(); }
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

  /* 6. The box in the corner (built once; only its words change, so a button never moves under a click) */
  host = document.createElement("div"); host.id = "ff-live";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  const root = host.attachShadow({mode: "open"});
  document.body.appendChild(host);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const say = m => { msg = m; paint(); };
  const CSS = `<style>:host{all:initial}*{box-sizing:border-box;font:13px/1.4 system-ui,sans-serif}.b{width:min(330px,calc(100vw - 32px));background:#FAFBF8;color:#18231E;border:2px solid #B4451C;border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
      .h{display:flex;align-items:center;gap:6px}.h b{flex:1;font-weight:700}.x{border:0;background:none;cursor:pointer;font-size:16px;color:#18231E;padding:0 4px}
      p{margin:6px 0}p:empty{display:none}.m{color:#5a6660;font-size:12px}.w{color:#9a3412}.ok{color:#15803d;font-weight:600}
      .r{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}button.a{border:1px solid #999;background:#fff;color:#18231E;border-radius:5px;padding:6px 10px;cursor:pointer}button.p{background:#B4451C;border-color:#B4451C;color:#fff;font-weight:600}button:disabled{opacity:.55;cursor:default}
      .pill{display:inline-flex;gap:6px;align-items:center;background:#FAFBF8;color:#18231E;border:2px solid #B4451C;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:600}
      @media (pointer:coarse){button.a{min-height:42px;padding:8px 14px}.x{min-width:40px;min-height:40px}.pill{min-height:42px}}
</style>`;
  let shape = "";
  function paint(){
    if (!host) return;
    const ok = link.state === "linked", day = esc((D && D.day) || seenDay || "…");
    if (shape !== (mini ? "mini" : "box")) {
      shape = mini ? "mini" : "box";
      root.innerHTML = CSS + (mini ? `<button class="pill" data-a="max"></button>` : `<div class="b"><div class="h"><b data-f="title"></b><button class="x" data-a="min" title="Minimise">–</button><button class="x" data-a="stop" title="Stop reading">×</button></div>
      <p data-f="link"></p><p class="m" data-f="speed"></p><p class="m" data-f="info"></p><p class="w" data-f="stale"></p><p class="m" role="status" data-f="msg"></p>
      <div class="r"><button class="a p" data-a="copy">Copy data</button><button class="a" data-a="read">Read now</button><button class="a" data-a="setup">Update setup</button></div></div>`);
    }
    const put = (f, html) => { const el = root.querySelector(f); if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } };
    if (mini) { put(".pill", `FF live${TAG ? " " + esc(TAG) : ""} · day ${day} ${ok ? "✓" : ""}`); return; }
    put('[data-f="title"]', `FF live${TAG ? " · Mode " + esc(TAG) : ""} · day ${day}${D && D.maxDay ? "/" + esc(D.maxDay) : ""}`);
    put('[data-f="link"]', ok ? '<span class="ok">Linked ✓</span> The calculator follows the game live.' : link.state === "looking" ? "Looking for the FF calculator that opened this tab…" : "Not linked: click <b>Copy data</b> and paste it in the calculator (or use <b>Go live</b> there).");
    put('[data-f="speed"]', !ready || !lap.day || lap.day !== (D && D.day) ? "" : ok && lap.sent ? `Day ${esc(lap.day)} was on the calculator ${after(lap.sent - lap.seen)}${lap.sales ? `, its sales ${after(lap.sales - lap.seen)}` : ""}.`
      : lap.read ? `Day ${esc(lap.day)}: sales read ${after(lap.read - lap.seen)}.` : "");
    put('[data-f="info"]', D && D.at ? `Last change ${esc(new Date(D.at).toLocaleTimeString())} · ${(D.stores || []).length} stores · sales: ${esc(D.salesFrom || "not found yet")}` : "Starting…");
    put('[data-f="stale"]', stale && busy !== "setup" ? `${esc(stale[0].toUpperCase() + stale.slice(1))}. The setup is read again when you stop clicking for 20 s, or now:` : "");
    put('[data-f="msg"]', esc(note && Date.now() - noteAt < 6000 ? note : msg));
    root.querySelector('[data-a="copy"]').disabled = !ready;
    for (const k of ["read", "setup"]) root.querySelector(`[data-a="${k}"]`).disabled = busy === "setup";
  }
  root.addEventListener("click", async e => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const k = a.dataset.a, tell = m => { note = m; noteAt = Date.now(); paint(); };
    if (k === "min" || k === "max") { mini = k === "min"; paint(); return; }
    if (k === "stop") { stop(); log("Stopped. Paste the reader again to restart."); return; }
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
    if (stale && Date.now() - lastInput > 20000 && setupTried !== D.day) {   // the setup clicks in the game: only while nobody is clicking
      setupTried = D.day;
      await run(async () => {
        const before = [...unseen];
        await readSetup(stale); await readAll();
        const still = unseen.filter(nm => before.includes(nm));   // still unknown after reading the setup again: not a product, stop asking
        if (still.length) { mem.ignored = [...new Set([...(mem.ignored || []), ...still])]; save(); unseen = unseen.filter(nm => !still.includes(nm)); if (!unseen.length) stale = ""; }
      });
      return true;
    }
    if (Date.now() - lastSlow > 20000 && (!dayLen || Date.now() - dayAt < dayLen/2)) {   // early in a day, far from the next one: rents and forecasts stay fresh too
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
    if (link.state !== "none" && (!window.opener || window.opener.closed)) { link.state = "none"; paint(); }   // the calculator's page was closed
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
    for (const w of waits) w.go(); waits.clear();
    host?.remove(); host = null; if (window.__ff && window.__ff.timer === timer) delete window.__ff;
  }
  window.__ff = {timer, stop, read: () => { wantFull = true; }, data: () => D};
  if (window.opener) hello();
  if (self.origin === "null") msg = "This tab was opened in a sandbox, so it can't read the game. Open your game normally, run the reader there and use Copy data.";
  paint();
  log(mem.setup ? "Starting (setup remembered from before)…" : "Starting: the first read takes under half a minute…");
  pulse(); work();
  while (!ready && !stopped) await sleep(500);
  return D;
})();
