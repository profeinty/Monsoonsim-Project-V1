(async () => {
  /* FF game reader v4 (live): reads this MonsoonSIM game, then follows it as it runs: a new day reaches the calculator
     within about a second, that day's sales a second or two later. Paste it again any time: it restarts cleanly and remembers
     the game setup, so it starts in seconds. It only reads, unless you start Auto-click or the Bot (each off until you start it). */
  if (window.__ff && window.__ff.stop) window.__ff.stop();
  document.getElementById("ff-reader-box")?.remove();
  const V = 4, BUILD = "v7", GAP = 900, CLICK = 1500;   // the game blocks fast clicks: page reads at least GAP ms apart, clicks in Configuration CLICK ms
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
    if (B2B.used) await quiet(b2bCheck, "B2B offers");
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
  /* The bot (Bot tab): carries out the calculator's plan for the day ({ff: "plan"} from the calculator that opened this tab, or
     pasted), one section after the other: B2B deals, shop space, warehouse space, machines, raw materials, store stock,
     marketing, prices. Off every time the panel starts; Stop, Esc or × ends it. Each section stays within its budget and cash
     never goes under the plan's reserve. Every answer from the game is read: error words stop that section, 2 failures in a
     row (or orders the dashboard cash doesn't show) stop the bot. It never opens a Cancel link, and skips screens not mapped yet.
     Order sizes are the game's own choices, read from its order form each day (they follow the demand), and a store never gets
     more than its market's forecast demand can buy before the game ends. */
  const SECTIONS = [["b2b", "B2B deals"], ["rent_shop", "Shop space"], ["rent_wh", "Warehouse space"], ["machine", "Machines"],
    ["buy_raw", "Raw materials"], ["buy_store", "Store stock"], ["marketing", "Marketing"], ["price", "Prices"]];
  const secName = k => (SECTIONS.find(x => x[0] === k) || [k, k])[1];
  const BOT = {on: false, busy: false, prepping: false, cut: false, loop: null, say: "", note: "", warn: "", plans: {}, run: null, days: {},
    pages: {}, forms: {}, expect: [], fails: 0, prepDay: 0, startAt: 0, dry: false, checking: false, check: [], checkAt: 0};
  const dayKey = d => BOT.dry ? "p" + d : d;   // a practice day is kept apart: the real run that day still does every step
  const today = () => (D && D.day) || 0, live = day => BOT.on && !stopped && today() === day;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k), reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tx = el => (el && el.textContent || "").replace(/\s+/g, " ").trim();
  const nm = s => norm(s).replace(/(retail|warehouse|whs|store|shop)$/, ""), same = (a, b) => !!nm(a) && nm(a) === nm(b);
  const pick1 = (list, name, f) => {   // the one item called `name` (exact, else the only one that starts the same), or null
    const b = nm(name); if (!b) return null;
    const ex = list.filter(x => nm(f(x)) === b); if (ex.length) return ex.length === 1 ? ex[0] : null;
    const pre = list.filter(x => { const a = nm(f(x)); return a && (a.startsWith(b) || b.startsWith(a)); });
    return pre.length === 1 ? pre[0] : null;
  };
  const termOf = s => s.term ?? s.terms ?? null;
  const stepText = s => { const q = s.qty != null ? n(+s.qty) : "", t = termOf(s), m2 = () => `${s.target}: ${q} m²${t ? `, ${t}-day` : ""}`, buy = () => `${s.target}: ${s.product || "?"} ${q}`;
    return ({b2b: () => `${s.action === "bid" ? "Bid on" : "Accept"} offer ${s.target}${q ? " · " + q : ""}${s.price != null ? " at " + s.price : ""}`, rent_shop: m2, rent_wh: m2,
      machine: () => `${s.target} × ${q}`, buy_raw: buy, buy_store: buy, marketing: () => `${s.target}: ${n(+s.price)}/day${s.agency ? " · " + s.agency : ""}`,
      price: () => `${s.target}: ${s.price}`}[s.section] || (() => `${s.action || ""} ${s.target || ""} ${q}`.trim()))(); };

  /* the plan: the newest one for each day. "" when it was taken, else why not */
  const takePlan = (p, from) => {
    if (!p || typeof p !== "object" || !Array.isArray(p.steps) || !(+p.day > 0)) return "That isn't a plan: it needs a day and a list of steps.";
    if (p.v != null && +p.v !== 1) return `Plan version ${p.v} isn't known to this reader.`;
    if (p.mode && TAG && String(p.mode) !== TAG) return `That plan is for Mode ${p.mode}, this game is Mode ${TAG}.`;
    const seen = {}, steps = p.steps.filter(s => s && typeof s === "object").map(s => {   // an id per step, so a restarted day skips what's done
      const b = String(s.id ?? [s.section, s.action, s.target, s.product, s.agency].join("|")), k = seen[b] = (seen[b] || 0) + 1;
      return {...s, id: k > 1 ? b + "#" + k : b};
    });
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
  const locs = h => blocks(h, u => /cmd=SPACE_MANAGE/i.test(u), u => arg(u, "ac")).map(b => ({...b, ac: b.key,
    name: ((b.text.match(/Location\s*:\s*(.+?)\s*(?:\$\(|Specification|Retail Rental|Warehouse Rental|Rental\b|Current Area|Seniors|Population|$)/i) || [])[1] || "").trim(),
    rate: toNum((b.text.match(/Rental\s*:\s*([\d.]+)/i) || [])[1]), area: toNum((b.text.match(/Current Area\s*:?\s*([\d,]+)/i) || [])[1]) || 0,
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
  const ERR = /not enough|insufficient|cannot|can't|unable|error|failed|exceed|invalid|not allowed|already have/gi;
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

  /* money: a section's running total stays within its budget, and cash (the dashboard's, or less by what was ordered) above the reserve */
  const capOf = (run, part) => { const b = (run.plan.budgets || {})[part]; if (b != null && b !== "" && isFinite(+b)) return +b; const s = run.steps.find(s => s.section === part && s.budget != null && s.budget !== "" && isFinite(+s.budget)); return s ? +s.budget : null; };
  const cashNow = run => { const c = dash().cash ?? D.cash; return c == null || run.cash0 == null ? null : Math.min(c, run.cash0 - run.spent); };
  const refuse = (run, part, cost, pend = 0) => {   // why a step can't spend `cost` (pend: what the section has lined up already), or ""
    if (!(cost > 0)) return "";
    const cap = capOf(run, part), used = (run.used[part] || 0) + pend, keep = +run.plan.reserve, c = cashNow(run);
    if (cap == null) return "the plan has no budget for this section";
    if (used + cost > cap + 0.5) return `over the budget: ${n(Math.round(used))} used, ${n(Math.round(cost))} more > ${n(Math.round(cap))}`;
    if (run.plan.reserve == null || run.plan.reserve === "" || !isFinite(keep)) return "the plan has no cash reserve";
    if (c == null) return "can't read the cash on the dashboard";
    if (c - pend - cost < keep) return `cash would go under the reserve: ${n(Math.round(c - pend))} − ${n(Math.round(cost))} < ${n(Math.round(keep))}`;
    return "";
  };
  const mark = (s, state, why = "") => { s.state = state; s.why = why; log(`Bot · ${secName(s.section)} · ${stepText(s)}: ${state}${why ? " (" + why + ")" : ""}`); paint(); };
  const oops = () => { if (++BOT.fails >= 2) botStop("Stopped after 2 failures in a row. Check the game, then press Start."); };
  const spend = (run, part, cost) => { BOT.fails = 0; run.used[part] = (run.used[part] || 0) + cost; run.spent += cost; run.paid[part] = (run.paid[part] || 0) + cost; };
  const clock = (run, s) => {   // a step that starts after 30 s still runs, in order, with a warning
    if (!s.late && Date.now() - run.t0 > 30000) { s.late = true; const m = `Past 30 s: ${secName(s.section)} · ${stepText(s)} still runs.`; run.notes.push(m); log("Bot warning: " + m); }
    s.state = "running"; paint();
  };
  const settle = (run, s, r, cost, ok) => {   // a step's answer: true when it went through
    if (r.skip) { mark(s, "skipped", r.skip); return false; }
    if (r.err) { s.unsure = !!r.unsure; mark(s, "failed", r.err); oops(); return false; }
    spend(run, s.section, cost); mark(s, "done", r.note ? `${ok}: ${r.note}` : ok); return true;
  };

  /* B2B: the offer card by its number. Accept = its accept control's form; bid = the Bid form with the plan's price (never under
     the floor or over the max) and the offer's quantity. Neither screen has been seen in a running game yet */
  const ctl = (card, re) => [...card.querySelectorAll("a,button,input[type=button],input[type=submit]")].find(b => re.test(((b.textContent || "") + " " + (b.getAttribute("value") || "")).trim()));
  const acceptOn = async (card, list) => {
    const c = ctl(card, /accept|take|confirm/i); if (!c) return {err: "no Accept button on the offer card"};
    const fe = c.closest("form");
    if (fe) { const f = formData(fe); if (c.type === "submit" && c.name) f.btn = [c.name, c.value]; return submit(f, {}, list); }
    const u = urlOf(c); if (!u) return {err: "the Accept button has no link the bot can follow"};
    const h = await get(abs(u)), f = formOf(h);
    if (/similar transaction/i.test(plain(h))) return {skip: "the game takes one similar deal a day"};
    if (!f) { const b = errIn(h, list); return b ? {err: `the game said “${b}”`} : {ok: true, note: "no form came up after Accept"}; }
    return submit(f, {}, h);
  };
  const bidOn = async (run, s, o, card) => {
    const c = ctl(card, /^bid$/i), u = c && urlOf(c); if (!u) return {err: "no Bid link on the offer card"};
    const h = await get(abs(u)), f = formOf(h);
    if (/similar transaction/i.test(plain(h))) return {skip: "the game takes one similar deal a day"};
    if (!f) { const b = errIn(h, ""); return {err: b ? `the game said “${b}”` : "no bid form came up"}; }
    const boxes = Object.keys(f.types).filter(k => /^(text|number|tel)$/.test(f.types[k])), one = x => x.length === 1 ? x[0] : null;
    const pk = boxes.find(k => /price|bid/i.test(k)) || one(boxes.filter(k => /price|bid/i.test(f.labels[k] || ""))) || one(boxes);
    if (!pk) return {err: "couldn't tell which box takes the bid price"};
    const floor = +(s.floor ?? (run.plan.floors || {})[o.product] ?? s.price), price = Math.round(Math.min(+s.price, o.maxBid ?? Infinity)*100)/100;
    if (!(price > 0) || price < floor) return {skip: `the bid would be ${price}, under the floor ${floor}`};
    const set = {[pk]: String(price)}, qk = boxes.find(k => k !== pk && /qty|quant|unit/i.test(k + " " + (f.labels[k] || "")));
    if (qk) set[qk] = String(o.qty ?? s.qty);
    return submit(f, set, h);
  };
  const b2bRun = async (run, list) => {
    const h = await page("MENU2_B2Bincm"), cards = offerCards(dom(h));   // read fresh: the deals go fast
    for (const s of list) {
      if (!live(run.day)) return;
      clock(run, s);
      const card = cards.find(c => parseOffer(c).id === String(s.target).replace(/\D/g, "")), o = card && parseOffer(card);
      if (!o) { mark(s, "skipped", "the offer isn't on the list any more"); continue; }
      if (o.state !== "open") { mark(s, "skipped", o.state === "gone" ? "taken by others" : "already in"); continue; }
      const cost = +s.cost || 0, why = refuse(run, "b2b", cost); if (why) { mark(s, "skipped", why); continue; }
      if (BOT.dry) { settle(run, s, s.action === "bid" || s.action === "accept" ? {ok: true, note: "practice, the offer screen isn't opened"} : {skip: `unknown action “${s.action}”`}, cost, `would ${s.action}`); continue; }   // opening a deal's link may already take it
      const r = s.action === "bid" ? await bidOn(run, s, o, card) : s.action === "accept" ? await acceptOn(card, h) : {skip: `unknown action “${s.action}”`};
      if (!settle(run, s, r, cost, "sent (unverified screen)") && r.err) return;   // an error stops the section
    }
  };

  /* shop / warehouse space: the location's Rental Manage form, rent<ac> = the total area (up to whole 50 / 500 m² steps), terms<ac> */
  const SPACE = {rent_shop: {menu: "MENU2_retail_location", unit: 50, what: "shop"}, rent_wh: {menu: "MENU2_whs_location", unit: 500, what: "warehouse"}};
  const rentRun = part => async (run, list) => {
    const K = SPACE[part], rows = locs(await pageAt(K.menu)); checkExpect();   // the page once: each change is kept on its row
    for (const s of list) {
      if (!live(run.day)) return;
      clock(run, s);
      const r = locOf(rows, s.target);
      if (!r) { mark(s, "failed", `no location “${s.target}” on the ${K.what} space page`); oops(); return; }
      const want = Math.ceil(+s.qty/K.unit)*K.unit;
      if (!(want > 0)) { mark(s, "skipped", "the plan asks for 0 m²: giving up a location is left to you"); continue; }
      if (want === r.area) { mark(s, "skipped", `already ${n(want)} m²`); continue; }
      const known = s.cost != null && s.cost !== "" && isFinite(+s.cost);
      if (!known && !r.rate && want > r.area) { mark(s, "skipped", "no rent rate on the page to work out the cost"); continue; }
      const F = await formAt(r.link), f = F.f, rk = "rent" + r.ac, tk = "terms" + r.ac;
      if (!f.has(rk)) { delete BOT.forms[r.link]; mark(s, "failed", `the rent form has no ${rk} box`); oops(); return; }
      const term = String(termOf(s) ?? f.val(tk) ?? ""), opt = (f.opts[tk] || []).find(o => o.v === term);
      if (f.has(tk) && !opt) { mark(s, "failed", `no ${term}-day choice on the rent form`); oops(); return; }
      const off = opt ? +((opt.t.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1] || 0)/100 : 0;
      const cost = known ? +s.cost : r.rate*Math.max(0, want - r.area)*(+term || 1)*(1 - off), why = refuse(run, part, cost);
      if (why) { mark(s, "skipped", why); continue; }
      const set = {[rk]: String(want)}; if (f.has(tk)) set[tk] = term;
      const res = await submit(f, set, F.html);
      delete BOT.forms[r.link]; delete BOT.pages[K.menu];   // its numbers changed (or it failed): read again next time
      if (settle(run, s, res, cost, `${n(r.area)} → ${n(want)} m²${BOT.dry ? "" : ": check the area tomorrow"}`) && !BOT.dry) { BOT.expect.push({day: run.day, menu: K.menu, name: r.name || s.target, area: want}); r.area = want; }
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

  /* stock: one order = one size per product (the form's own choices), so a quantity takes several orders; products for the same
     store and vendor share orders. The fewest orders for the most units up to the plan; up to 5% over only when that's closer */
  const BUY = {buy_store: {menu: "MENU2_retail_vendor", dest: "destination_rtl", test: u => /cmd=BUY_FG/i.test(u) && /loctype=RTL/i.test(u)},
    buy_raw: {menu: "MENU2_warehouse_vendor", dest: "destination_whs", test: u => /cmd=BUY_RM/i.test(u)}};
  const vendorsOf = async part => blocks(await pageAt(BUY[part].menu), BUY[part].test, u => arg(u, "vc") || u);
  const priceIn = (t, name) => { const m = String(t).match(new RegExp(reEsc(name) + "\\s*[:@-]?\\s*(?:EUR|€)?\\s*(\\d+(?:\\.\\d+)?)", "i")); return m ? +m[1] : null; };
  const unitOf = (v, product) => priceIn(v.text, product) ?? costOf(dash().costs || {}, product) ?? costOf(D.costs || {}, product);
  const vendorFor = (vs, s) => {   // the plan's vendor, else the only one, else the cheapest for the product
    if (s.vendor) { const k = String(s.vendor).toLowerCase(), x = vs.filter(v => String(v.key).toLowerCase() === k || norm(v.text).includes(norm(s.vendor))); return x.length === 1 ? x[0] : null; }
    const priced = vs.map(v => ({v, p: priceIn(v.text, s.product)})).filter(x => x.p != null).sort((a, b) => a.p - b.p);
    return vs.length === 1 ? vs[0] : priced.length ? priced[0].v : vs[0];
  };
  const fieldFor = (f, product, v) => {   // P1, P2…: the list whose empty choice is the product's name, else the vendor page's order
    const ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)).sort((a, b) => a.slice(1) - b.slice(1));
    const hit = pick1(ps, product, k => (f.opts[k].find(o => o.v === "") || {}).t || ""); if (hit) return hit;
    const known = [...new Set((D.products || []).flatMap(p => [p.name, ...(p.bom || []).map(b => b.name)]))];
    const names = known.map(x => ({x, i: v.text.indexOf(x)})).filter(y => y.i >= 0).sort((a, b) => a.i - b.i).map(y => y.x), i = names.findIndex(x => same(x, product));
    return names.length === ps.length && i >= 0 ? ps[i] : null;
  };
  const tiersOf = (f, k) => (f.opts[k] || []).map(o => ({v: o.v, q: toNum(o.v)})).filter(t => t.q > 0);
  const split = (q, tiers, over) => {   // order sizes adding up to the most units <= q in the fewest orders (over: or up to 5% above, when closer)
    const t = [...tiers].sort((a, b) => b.q - a.q); q = Math.floor(q); if (!t.length || !(q > 0)) return [];
    const g = t.reduce((a, x) => { let b = x.q; while (b) [a, b] = [b, a % b]; return a; }, 0), below = Math.floor(q/g), top = Math.floor((over ? q*1.05 : q)/g);
    if (top > 50000) { const out = []; let r = q; for (const x of t) while (r >= x.q) { out.push(x); r -= x.q; } return out; }   // too fine to count through: largest first
    const cnt = new Array(top + 1).fill(Infinity), via = new Array(top + 1); cnt[0] = 0;
    for (let i = 1; i <= top; i++) for (const x of t) { const k = x.q/g; if (k <= i && cnt[i - k] + 1 < cnt[i]) { cnt[i] = cnt[i - k] + 1; via[i] = x; } }
    let i = below; while (i > 0 && cnt[i] === Infinity) i--;
    let j = below + 1; while (j <= top && cnt[j] === Infinity) j++;
    if (j <= top && (j*g - q < q - i*g || (j*g - q === q - i*g && cnt[j] < cnt[i]))) i = j;
    const out = []; for (; i > 0; i -= via[i].q/g) out.push(via[i]);
    return out.sort((a, b) => b.q - a.q);
  };
  const fcCap = s => {   // the most the store's whole market can buy before the game ends (or the goods expire): its forecast, peak days included
    const city = (D.cities || []).find(c => same(c.name, s.target)), fc = city && (D.forecast || {})[`${city.name}-${s.product}`];
    if (!(fc > 0) || !D.maxDay || !D.day) return null;
    const exp = +((D.products || []).find(p => same(p.name, s.product)) || {}).expire || 0, to = exp ? Math.min(D.maxDay, D.day + exp) : D.maxDay;
    const days = Math.max(0, to - D.day + 1), peaks = (D.holidays || []).filter(d => d >= D.day && d <= to).length;
    const st = (D.stores || []).find(x => same(x.name, s.target)), have = st ? ((st.items || []).find(i => same(i.name, s.product)) || {}).qty || 0 : 0;
    return {cap: Math.max(0, Math.floor(fc*(days + peaks*Math.max(0, (D.spike || 1) - 1)) - have)), fc, to};
  };
  const buyRun = part => async (run, list) => {
    const K = BUY[part], vs = await vendorsOf(part), groups = [];
    if (!vs.length) { list.forEach(s => mark(s, "failed", "no order link on the vendor page")); oops(); return; }
    for (const s of list) {
      const v = vendorFor(vs, s); if (!v) { mark(s, "failed", `no single vendor “${s.vendor}” on the page`); oops(); return; }
      const g = groups.find(g => g.v === v && nm(g.target) === nm(s.target)); if (g) g.steps.push(s); else groups.push({v, target: s.target, steps: [s]});
    }
    for (const g of groups) {
      if (!live(run.day)) return;
      const F = await formAt(g.v.url), f = F.f, dest = pick1((f.opts[K.dest] || []).filter(o => o.v !== ""), g.target, o => o.t);
      if (!dest) { g.steps.forEach(s => mark(s, "failed", `no “${g.target}” among the order form's destinations`)); oops(); return; }
      const ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)), stuck = ps.find(k => !f.opts[k].some(o => o.v === ""));
      if (stuck) { g.steps.forEach(s => mark(s, "failed", `the order form has no "none" choice for ${stuck}`)); oops(); return; }
      const lines = []; let pend = 0;
      for (const s of g.steps) {
        clock(run, s);
        const k = fieldFor(f, s.product, g.v), tiers = k ? tiersOf(f, k) : [];
        if (!tiers.length) { mark(s, "failed", k ? `no order sizes for ${s.product} on the form` : `no ${s.product} on the order form`); oops(); return; }
        let qty = Math.floor(+s.qty) || 0, extra = "";
        const fc = part === "buy_store" ? fcCap(s) : null;
        if (fc && qty > fc.cap) { qty = fc.cap; extra = `cut to ${n(qty)}: its forecast (${n(fc.fc)}/day) can't sell more by day ${fc.to}`; }
        const unit = unitOf(g.v, s.product);
        if (unit == null && !(+s.cost > 0)) { mark(s, "skipped", `no price for ${s.product}`); continue; }
        const sum = ts => ts.reduce((a, t) => a + t.q, 0), costFor = ts => Math.max(unit != null ? sum(ts)*unit : 0, +s.cost > 0 && +s.qty > 0 ? +s.cost*sum(ts)/+s.qty : 0);
        let ts = split(qty, tiers, true), why = refuse(run, part, costFor(ts), pend);
        if (why && sum(ts) > qty) { ts = split(qty, tiers, false); why = refuse(run, part, costFor(ts), pend); }   // the 5% over doesn't fit: round down
        if (!ts.length) { mark(s, "skipped", `${n(qty)} is under the smallest order (${n(Math.min(...tiers.map(t => t.q)))})${extra ? "; " + extra : ""}`); continue; }
        if (why) { mark(s, "skipped", why); continue; }
        const cost = costFor(ts); pend += cost;
        lines.push({s, k, ts, cost, total: sum(ts), got: 0, extra, max: Math.max(...tiers.map(t => t.q))});
      }
      const orders = [], blank = Object.fromEntries(ps.map(k => [k, ""]));
      for (const l of lines) l.ts.forEach((t, i) => { const o = orders[i] = orders[i] || {set: {...blank, [K.dest]: dest.v}, cost: 0, lines: []}; o.set[l.k] = t.v; o.cost += l.cost*t.q/l.total; o.lines.push([l, t.q]); });
      const partly = why => { for (const l of lines) if (l.s.state === "running" && l.got) mark(l.s, "done", `${n(l.got)} of ${n(l.total)} bought, then ${why}`); };
      for (const o of orders) {
        if (!live(run.day)) { partly(BOT.on ? "the day ended" : "the bot was stopped"); return; }
        lines.forEach(l => l.s.state === "running" && clock(run, l.s));
        const c = cashNow(run), keep = +run.plan.reserve;
        if (c == null || !isFinite(keep) || c - o.cost < keep) { partly("cash would go under the reserve"); for (const l of lines) if (l.s.state === "running") mark(l.s, "skipped", "cash would go under the reserve"); return; }
        const res = await submit(f, o.set, F.html);
        if (res.skip) { partly(res.skip); for (const l of lines) if (l.s.state === "running") mark(l.s, "skipped", res.skip); break; }
        if (res.err) { delete BOT.forms[g.v.url]; partly(res.err); for (const l of lines) if (l.s.state === "running") { l.s.unsure = !!res.unsure; mark(l.s, "failed", res.err); } oops(); return; }
        spend(run, part, o.cost); for (const [l, q] of o.lines) l.got += q;
      }
      for (const l of lines) if (l.s.state === "running") mark(l.s, "done", `${BOT.dry ? "practice, not sent: " : ""}${n(l.got)} in ${l.ts.length} order${l.ts.length > 1 ? "s" : ""} (${l.ts.map(t => n(t.q)).join(" + ")}; the biggest order the game offers today: ${n(l.max)})${l.got !== +l.s.qty ? `, plan ${n(+l.s.qty)}` : ""}${l.extra ? "; " + l.extra : ""}`);
    }
  };

  /* marketing: one form per media agency, invest<storeId> = EUR per day for the plan's stores, the other stores as they are */
  const storeIdOf = (name, f) => {   // from a store order form's destinations, else the words beside the marketing boxes
    for (const c of Object.values(BOT.forms)) { const o = c.f.opts.destination_rtl, hit = o && pick1(o.filter(x => x.v !== ""), name, x => x.t); if (hit) return hit.v; }
    const hit = f.fields.map(x => x[0]).filter(k => /^invest\d+$/i.test(k) && nm(name) && norm(f.labels[k] || "").includes(nm(name)));
    return hit.length === 1 ? hit[0].replace(/^invest/i, "") : null;
  };
  const mktRun = async (run, list) => {
    const ags = blocks(await pageAt("MENU2_retail_media"), u => /cmd=INVEST_MKT/i.test(u), u => u), by = new Map();
    for (const s of list) {
      const k = String(s.agency || "").toLowerCase(), byLink = ags.filter(a => [...new URL(a.url).searchParams.values()].some(x => x.toLowerCase() === k));   // its link's code (MA), else its name as whole words ("MA" is in "marketing")
      const a = !k ? ags : byLink.length ? byLink : ags.filter(a => new RegExp(`(^|[^a-z0-9])${reEsc(k)}([^a-z0-9]|$)`, "i").test(a.text));
      if (a.length !== 1) { mark(s, "failed", s.agency ? `no single media agency “${s.agency}” on the page` : "the plan doesn't say which media agency"); oops(); return; }
      by.set(a[0], [...(by.get(a[0]) || []), s]);
    }
    for (const [a, ss] of by) {
      if (!live(run.day)) return;
      const F = await formAt(a.url), f = F.f, set = {}, sent = []; let pend = 0;
      for (const s of ss) {
        clock(run, s);
        let id = storeIdOf(s.target, f);
        if (!id && !Object.values(BOT.forms).some(c => c.f.opts.destination_rtl)) { const v = (await vendorsOf("buy_store"))[0]; if (v) { await formAt(v.url); id = storeIdOf(s.target, f); } }
        const k = id && "invest" + id, val = Math.round(+s.price), cost = s.cost != null && s.cost !== "" && isFinite(+s.cost) ? +s.cost : val;
        if (!k || !f.has(k)) { mark(s, "failed", `no marketing box for ${s.target} on the form`); oops(); return; }
        if (!(val >= 0)) { mark(s, "failed", "the plan has no EUR/day for it"); oops(); return; }
        const why = refuse(run, "marketing", cost, pend); if (why) { mark(s, "skipped", why); continue; }
        if (toNum(f.val(k)) === val) { spend(run, "marketing", cost); mark(s, "done", `already ${n(val)}/day`); continue; }
        set[k] = String(val); pend += cost; sent.push({s, k, val, cost});
      }
      if (!sent.length) continue;
      const res = await submit(f, set, F.html);
      if (res.err || res.skip) { delete BOT.forms[a.url]; sent.forEach(x => { x.s.unsure = !!res.unsure; mark(x.s, "failed", res.err || res.skip); }); oops(); return; }
      const G = BOT.dry ? null : await formAt(a.url, true).catch(() => null), bad = G ? sent.filter(x => toNum(G.f.val(x.k)) !== x.val) : [];   // read the form back
      for (const x of sent) { spend(run, "marketing", x.cost); if (bad.includes(x)) mark(x.s, "failed", `the form shows ${G.f.val(x.k)} after the change`); else mark(x.s, "done", BOT.dry ? `practice, not sent: ${n(toNum(f.val(x.k)))} → ${n(x.val)}/day` : G ? "the form shows the new amount" : "sent; couldn't read the form back"); }
      if (bad.length) { run.sec.marketing = "the game shows other amounts"; oops(); return; }
      run.sec.marketing = BOT.dry ? "practice" : "checked on the form";
    }
  };
  const notMapped = async (run, list) => list.forEach(s => mark(s, "skipped", "screen not mapped yet"));
  const RUN = {b2b: b2bRun, rent_shop: rentRun("rent_shop"), rent_wh: rentRun("rent_wh"), machine: notMapped, buy_raw: buyRun("buy_raw"), buy_store: buyRun("buy_store"), marketing: mktRun, price: notMapped};

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

  /* one day: the sections in order; a restarted day skips the steps already done (or that may have gone through) */
  const botDay = async (day, plan) => {
    const rec = BOT.days[dayKey(day)] = BOT.days[dayKey(day)] || {ids: new Set(), at: 0, complete: false}, X = dash();
    const run = BOT.run = {day, plan, t0: Math.max(seenDay === day ? dayAt : 0, BOT.startAt), steps: plan.steps.map(s => ({...s, state: "", why: ""})),
      used: {}, paid: {}, sec: {}, spent: 0, notes: [], cash0: X.cash ?? D.cash, took: null};
    rec.at = Date.now(); rec.complete = false;
    for (const s of run.steps) if (rec.ids.has(s.id)) Object.assign(s, {state: "skipped", why: "done earlier today"});
    for (const s of run.steps) if (!s.state && !RUN[s.section]) Object.assign(s, {state: "skipped", why: "not a section the bot knows"});
    log(`Bot: ${BOT.dry ? "practice, " : ""}day ${day}, ${run.steps.length} steps from ${plan.from === "pasted" ? "a pasted plan" : "the calculator"}.`);
    for (const [part, name] of SECTIONS) {
      const list = run.steps.filter(s => s.section === part && !s.state);
      if (!list.length) continue;
      if (!live(day)) break;
      BOT.say = `Day ${day}: ${name.toLowerCase()}…`; paint();
      const Y = dash(), before = {cash: Y.cash, od: Y.odUsed};
      try { await RUN[part](run, list); }
      catch (e) { for (const s of list) if (s.state === "running") { s.unsure = true; mark(s, "failed", e.message); } oops(); }
      const why = !BOT.on || stopped ? "the bot was stopped" : today() !== day ? "the day ended first" : "the section stopped after an error";
      for (const s of list) if (!s.state || s.state === "running") mark(s, "skipped", why);
      for (const s of list) if (s.state === "done" || s.unsure) rec.ids.add(s.id);
      if (list.some(s => s.state === "done")) { if (SPACE[part]) run.sec[part] = "check the areas tomorrow"; if (part === "b2b") run.sec[part] = "unverified screen"; }
      if (BUY[part] && !BOT.dry) await verify(run, part, before);
    }
    for (const s of run.steps) if (!s.state) Object.assign(s, {state: "skipped", why: today() !== day ? "the day ended first" : "the bot was stopped"});
    run.took = Date.now() - run.t0; rec.complete = live(day) || today() !== day;
    const c = run.steps.reduce((a, s) => (a[s.state] = (a[s.state] || 0) + 1, a), {});
    const sum = `Day ${day} ${rec.complete ? "done" : "stopped"} in ${sec(run.took)}${run.took > 30000 ? " (over the 30 s target)" : ""}: ${c.done || 0} done, ${c.skipped || 0} skipped, ${c.failed || 0} failed.`;
    log("Bot: " + sum); if (BOT.on) BOT.say = sum + (rec.complete ? ` Waiting for day ${day + 1}…` : ""); paint();
  };

  /* prep: while the day's data goes out, read the screens the plan will need; the day's run cuts it short (the rest is read when needed) */
  const botPrep = async day => {
    BOT.prepping = true;
    const p = BOT.plans[day] || Object.values(BOT.plans).sort((a, b) => b.day - a.day)[0], parts = new Set(p ? p.steps.map(s => s.section) : SECTIONS.map(x => x[0]));
    const go = () => BOT.on && !stopped && !BOT.cut && today() === day, jobs = [];
    for (const part of ["rent_shop", "rent_wh"]) if (parts.has(part)) jobs.push(async () => {
      const K = SPACE[part], rows = locs(await pageAt(K.menu));
      if (p && p.day === day) for (const s of p.steps.filter(s => s.section === part)) { const r = locOf(rows, s.target); if (go() && r && Math.ceil(+s.qty/K.unit)*K.unit !== r.area) await formAt(r.link); }
    });
    for (const part of ["buy_raw", "buy_store"]) if (parts.has(part)) jobs.push(async () => { for (const v of await vendorsOf(part)) if (go()) await formAt(v.url); });
    if (parts.has("marketing")) jobs.push(async () => { for (const a of blocks(await pageAt("MENU2_retail_media"), u => /cmd=INVEST_MKT/i.test(u), u => u)) if (go()) await formAt(a.url); });
    for (const j of jobs) { if (!go()) break; botSay(`Day ${day}: reading the game's order screens…`); await quiet(j, "Bot prep"); }
    checkExpect(); BOT.prepDay = day; BOT.prepping = false; paint();
  };
  const botSay = m => { if (BOT.say !== m) { BOT.say = m; paint(); } };
  const botLoop = async () => {
    let readyDay = 0, readyAt = 0, prep = null;
    while (BOT.on && !stopped) {
      const day = today(), rec = BOT.days[dayKey(day)], p = BOT.plans[day];
      if (!ready || !day) { botSay("Waiting for the first read of the game…"); await sleep(250); continue; }
      if (rec && rec.complete && !(p && p.from === "pasted" && p.got > rec.at)) { await sleep(250); continue; }   // done today (a newer pasted plan runs again)
      if (BOT.prepDay !== day && !prep) { BOT.cut = false; prep = botPrep(day).finally(() => { prep = null; }); }
      if (dayRead !== day || (salesWait && salesWait.day === day)) { if (!BOT.prepping) botSay(`Day ${day}: waiting for the day's data…`); await sleep(150); continue; }
      if (readyDay !== day) { readyDay = day; readyAt = Date.now(); }
      const since = lap.day === day ? lap.sales || lap.read || 0 : 0, waited = Date.now() - readyAt;   // a plan made from this day's sales; else after 8 s the day's newest
      if (!p || (p.from !== "pasted" && p.got < since && waited < 8000)) {
        if (!BOT.prepping || waited >= 8000) botSay(`Waiting for the calculator plan for day ${day}${link.state === "linked" || waited < 8000 ? "" : " (not linked: unlock the calculator tab, or open the game with Go live there, or paste a plan)"}.`);
        await sleep(150); continue;
      }
      BOT.cut = true; if (prep) await prep;
      if (!BOT.on || stopped || today() !== day) continue;
      BOT.busy = true; paint();
      try { await botDay(day, p); } catch (e) { botSay("Problem: " + e.message); log("Bot: " + e.message); } finally { BOT.busy = false; }
      paint();
    }
  };
  const spin = () => { BOT.loop = botLoop().catch(e => botStop("Problem: " + e.message)).finally(() => { BOT.loop = null; if (BOT.on && !stopped) spin(); }); };
  const botStart = () => {
    if (BOT.on || stopped) return;
    Object.assign(BOT, {on: true, fails: 0, cut: false, prepDay: 0, startAt: Date.now(), note: "", say: "Starting…"}); log(BOT.dry ? "Bot on, practice: nothing is sent." : "Bot on."); paint();
    if (link.state !== "linked" && openCalc()) BOT.note = "Opened the calculator in a new tab: unlock it there if it asks. Its plan comes back here.";
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
        const r = rows.find(r => r.area > 0) || rows[0], F = await formAt(r.link, true), tk = "terms" + r.ac;
        if (!F.f.has("rent" + r.ac)) throw new Error(`the ${r.name} form has no rent${r.ac} box`);
        return `${rows.length} locations, ${r.name} form ready${F.f.opts[tk] ? ` (terms ${F.f.opts[tk].map(o => o.v).join(" / ")} days)` : ""}`;
      });
      for (const part of ["buy_raw", "buy_store"]) await tryRow(secName(part), async () => {
        const vs = await vendorsOf(part); if (!vs.length) throw new Error("no order link on the vendor page");
        const f = (await formAt(vs[0].url, true)).f, dest = BUY[part].dest, ps = Object.keys(f.opts).filter(k => /^P\d+$/i.test(k)), sizes = ps.length ? tiersOf(f, ps[0]).map(t => t.q) : [];
        if (!f.opts[dest]) throw new Error(`the order form has no ${dest} list`);
        if (!sizes.length) throw new Error("no products with order sizes on the order form");
        return `${vs.length} vendor${vs.length > 1 ? "s" : ""}, ${ps.length} products, ${f.opts[dest].filter(o => o.v !== "").length} destinations, sizes ${n(Math.min(...sizes))} to ${n(Math.max(...sizes))}`;
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
  const botStop = (why, force) => { if (!BOT.on && !force) return; BOT.on = false; BOT.cut = true; BOT.say = why || "Stopped."; log("Bot: " + BOT.say); paint(); };
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
    const time = !r ? "" : r.took != null ? `Day ${r.day} took ${sec(r.took)}${r.took > 30000 ? " (over the 30 s target)" : ""}.` : `Day ${r.day}: ${sec(Date.now() - r.t0)} so far.`;
    const box = (name, k, ss) => { const cap = k ? capOf({plan: p, steps}, k) : null;
      return `<p style="margin-top:8px"><b>${esc(name)}</b>${k ? ` <span class="k">${n(Math.round((r && r.used[k]) || 0))} of ${cap == null ? "no budget" : n(Math.round(cap))} EUR</span>` : ""}${r && r.sec[k] ? ` <span class="k">· ${esc(r.sec[k])}</span>` : ""}</p>
      <table>${ss.map(s => `<tr><td>${esc(stepText(s))}${s.why ? `<div class="k">${esc(s.why)}</div>` : ""}</td><td class="n">${s.cost != null && s.cost !== "" ? n(Math.round(+s.cost)) : ""}</td><td class="st ${esc(s.state || "")}">${esc(s.state || "to do")}${s.late ? " · late" : ""}</td></tr>`).join("")}</table>`; };
    const other = steps.filter(s => !RUN[s.section]);
    return top + `<p><b>Plan for day ${n(p.day)}</b>${p.day !== d ? ` <span class="w">(the game is on day ${n(d)})</span>` : ""} <span class="k">${p.from === "pasted" ? "pasted" : "from the calculator"} ${esc(new Date(p.got).toLocaleTimeString())} · reserve ${n(p.reserve)}</span></p>
      ${time ? `<p class="m">${esc(time)}</p>` : ""}${SECTIONS.map(([k, name]) => (ss => ss.length ? box(name, k, ss) : "")(steps.filter(s => s.section === k))).join("")}${other.length ? box("Not known", "", other) : ""}
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
      <div class="r"><button class="a" data-bot="check" data-f="botcheck">Check the screens</button><label class="k"><input type="checkbox" data-bot="dry" data-f="botdry"> Practice: do everything but send</label></div><div role="status" data-f="bot"></div>
      <details><summary class="k">Paste a plan (for testing)</summary><textarea data-bot="paste" spellcheck="false" placeholder="{&quot;ff&quot;:&quot;plan&quot;,&quot;v&quot;:1,&quot;day&quot;:1,&quot;reserve&quot;:0,&quot;budgets&quot;:{},&quot;steps&quot;:[]}"></textarea><div class="r"><button class="a" data-bot="load">Load</button></div></details></div>
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
    const bd = root.querySelector('[data-f="botdry"]'); bd.checked = BOT.dry; bd.disabled = BOT.on;
    const bc = root.querySelector('[data-f="botcheck"]'); bc.disabled = BOT.on || BOT.checking; put('[data-f="botcheck"]', BOT.checking ? "Checking…" : "Check the screens");
    put('[data-f="stopbar"]', (AC.on ? `<button class="a stop" data-ac="stop">■ Stop auto-click</button>` : "") + (BOT.on && tab !== "bot" ? `<button class="a stop" data-bot="stop">■ Stop the bot</button>` : ""));   // on the Bot tab its own button stops it
    put('[data-f="msg"]', esc(note && Date.now() - noteAt < 6000 ? note : msg));
    root.querySelector('[data-a="copy"]').disabled = !ready;
    for (const k of ["read", "setup"]) root.querySelector(`[data-a="${k}"]`).disabled = busy === "setup";
  }
  root.addEventListener("change", e => {
    if (e.target.dataset && e.target.dataset.bot === "dry") { if (!BOT.on) BOT.dry = !!e.target.checked; paint(); return; }
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
  return D;
})();
