// FF bot on the stand-in game: real run, practice run, screen check, Start opening the calculator, a game error,
// the B2B bid history, shipping won orders, machines, e-commerce, and prices never touched.
import { chromium } from "playwright";
const BASE = "http://localhost:" + (process.argv[2] || 8790), OUT = process.argv[3] || ".";
const PRODUCTS = [["Americano", "Coffee"], ["Hot Chocolate", "Chocolate"], ["Bubble Milk Tea", "Milk Tea"]].map(([name, ing]) =>
  ({name, price: 20, cost: 8, dim: 0.005, expire: 0, allow: "Yes", bom: [{q: 1, name: "Plastic Cup"}, {q: 2, name: "Straw"}, {q: 1, name: ing}]}));
const MEM = {setup: {setupDay: 1, modules: ["RTL", "B2B"], lead: 1, machines: [{name: "Machine A", price: 300000, cap: 10000, m2: 200, staff: 2}, {name: "Machine B", price: 200000, cap: 6000, m2: 150, staff: 1}],
  products: PRODUCTS}, ignored: ["Plastic Cup", "Straw", "Coffee", "Chocolate", "Milk Tea"]};
const PLAN = {ff: "plan", v: 1, mode: "12i", day: 5, planId: "test-d5", reserve: 100000,
  budgets: {b2b: 0, rent_shop: 60000, rent_wh: 35000, machine: 0, buy_raw: 60000, buy_store: 150000, marketing: 20000, price: 0},
  floors: {Americano: 7.5, "Hot Chocolate": 13},
  steps: [
    {id: "d5:b2b:accept:12", seq: 1, section: "b2b", action: "accept", target: "12", product: "Americano", qty: 3000, price: 14, qtyMax: 5000, cost: 0},
    {id: "d5:b2b:bid:13", seq: 2, section: "b2b", action: "bid", target: "13", product: "Hot Chocolate", qty: 2000, price: 15.03, floor: 13, cost: 0},
    {id: "d5:space:Berlin", seq: 3, section: "rent_shop", action: "rent", target: "Berlin", qty: 280, term: 30, qtyStep: 50},
    {id: "d5:open:Hamburg", seq: 4, section: "rent_shop", action: "rent", target: "Hamburg", qty: 100, term: 7, qtyStep: 50, cost: 26880},
    {id: "d5:space:warehouse", seq: 5, section: "rent_wh", action: "rent", target: "Dusseldorf Warehouse", qty: 1200, term: 30, qtyStep: 500, cost: 30000},
    {id: "d5:buy:Machine A", seq: 6, section: "machine", action: "buy", target: "Machine A", qty: 1, cost: 300000},
    {id: "d5:raw:Plastic Cup", seq: 7, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Plastic Cup", qty: 20000, qtyMin: 20000, qtyMax: 21000, unitPrice: 1, cost: 20000, must: true},
    {id: "d5:raw:Straw", seq: 8, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Straw", qty: 40000, qtyMin: 40000, qtyMax: 40000, unitPrice: 0.6, cost: 24000},
    {id: "d5:raw:Coffee", seq: 9, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Coffee", qty: 3000, qtyMin: 3000, qtyMax: 3000, unitPrice: 3, cost: 9000, deps: ["d5:buy:Machine A"]},
    {id: "d5:vendor:Berlin:Americano", seq: 10, section: "buy_store", action: "buy", target: "Berlin", product: "Americano", qty: 6000, qtyMin: 5000, qtyMax: 7000, unitPrice: 10, unitPriceMax: 10.2, cost: 60000, must: true},
    {id: "d5:vendor:Berlin:Hot Chocolate", seq: 11, section: "buy_store", action: "buy", target: "Berlin", product: "Hot Chocolate", qty: 5000, qtyMin: 4000, qtyMax: 6000, unitPrice: 13, cost: 65000},
    {id: "d5:vendor:Cologne:Bubble Milk Tea", seq: 12, section: "buy_store", action: "buy", target: "Cologne", product: "Bubble Milk Tea", qty: 8000, qtyMin: 6000, qtyMax: 9000, unitPrice: 16, cost: 128000},
    {id: "d5:mkt:Berlin:MA", seq: 13, section: "marketing", action: "set", target: "Berlin", price: 6000, agency: "MA", cost: 6000},
    {id: "d5:mkt:Hamburg:MA", seq: 14, section: "marketing", action: "set", target: "Hamburg", price: 3000, agency: "MA", cost: 3000, deps: ["d5:open:Hamburg"]},
    {id: "d5:price:Americano", seq: 15, section: "price", action: "set", target: "Americano", price: 21, cost: 0},
    {id: "d5:b2b:deliver:1042", seq: 0, section: "b2b", op: "b2bDeliver", notSentToBot: true, target: {order: "1042"}}]};
const only = (f, extra = {}) => ({...PLAN, ...extra, steps: PLAN.steps.filter(f)});
const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
const sh = s => `document.getElementById('ff-live').shadowRoot.querySelector('${s}')`;
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " :: " + extra : ""}`); if (!ok) fails++; };
const open = async (fail = "", mem = MEM, extra = "") => {   // extra: more of the stand-in game (&so=1 orders to ship, &wfg=1 goods in the warehouse, &mach=1 machines, &cash=)
  await (await fetch(BASE + "/reset?fail=" + fail + extra)).text();
  const ctx = await b.newContext({viewport: {width: 1200, height: 900}});
  await ctx.addInitScript(m => { try { localStorage.setItem("ff-reader:" + location.host + ":12i", m); } catch (e) {} }, JSON.stringify(mem));
  const p = await ctx.newPage(), errs = [], logs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => logs.push(m.text()));
  await p.goto(BASE + "/game.html");
  await p.evaluate(() => { window.__FF_MODE = "12i"; const s = document.createElement("script"); s.charset = "utf-8"; s.src = "/reader.js?t=" + Date.now(); document.head.appendChild(s); });
  await p.waitForFunction(() => window.__ff && window.__ff.data() && window.__ff.data().day === 5 && window.__ff.data().menus, null, {timeout: 60000});   // the first whole read is done
  await p.waitForTimeout(500);
  await p.evaluate(new Function(`${sh('[data-tab="bot"]')}.click()`));
  return {ctx, p, errs, logs};
};
const steps = p => p.evaluate(() => (window.__ff.bot.run || {steps: []}).steps.map(s => ({id: s.id, sec: s.sec, t: s.target, pr: s.product, st: s.state, why: s.why})));
const runDone = p => p.waitForFunction(() => window.__ff.bot.run && window.__ff.bot.run.took != null, null, {timeout: 90000});
const server = async () => (await fetch(BASE + "/log")).json();
const click = (p, sel) => p.evaluate(new Function(`${sh(sel)}.click()`));
const pane = p => p.evaluate(new Function(`return ${sh('[data-f="bot"]')}.innerText`));

{ // A: the real run of a pasted plan
  const {ctx, p, errs} = await open();
  console.log("A plan:", await p.evaluate(pl => window.__ff.plan(pl), PLAN) || "taken");
  const t = Date.now(); await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p), L = await server(), took = await p.evaluate(() => window.__ff.bot.run.took);
  console.log(`A took ${took} ms (wall ${Date.now() - t} ms)`); for (const s of S) console.log("  ", s.sec, s.t, s.pr || "", "=>", s.st, "|", s.why);
  const posts = L.log.filter(x => x.m === "POST"); for (const x of posts) console.log("   POST", x.cmd, x.body, "->", x.r);
  console.log("   timeline:", L.log.filter(x => x.t >= t).map(x => `${((x.t - t)/1000).toFixed(1)}s ${x.m} ${x.cmd || x.x}`).join(" | "));
  const st = (sec, t, pr) => S.find(s => s.sec === sec && s.t === t && (!pr || s.pr === pr)) || {};
  check("A b2b accept done", st("b2b", "12").st === "done"); check("A b2b bid done at 15.03", st("b2b", "13").st === "done" && posts.some(x => x.cmd === "B2B_BID" && /bidprice=15.03/.test(x.body)));
  check("A Berlin shop 300 m2", L.S.shops[11].area === 300); check("A Hamburg shop 100 m2, 7-day", L.S.shops[13].area === 100 && posts.some(x => /rent13=100/.test(x.body) && /terms13=7/.test(x.body)));
  check("A warehouse 1500 m2", L.S.whs[26].area === 1500);
  check("A machine over its budget skipped", st("machine", "Machine A").st === "skipped" && /machine budget/.test(st("machine", "Machine A").why) && !posts.some(x => x.cmd === "PRD_MACHINE_BUY"));
  check("A price step skipped: prices locked", st("price", "Americano").st === "skipped" && /locked/.test(st("price", "Americano").why));
  check("A no price command ever sent", !L.log.some(x => x.m === "PRICE"));
  check("A deal taken with its Deal link", posts.some(x => x.cmd === "B2B_DEAL" && /id=12/.test(x.q)) && L.S.offers[12] === "in");
  check("A raw: one order cups 20000 + straws 40000", posts.filter(x => x.cmd === "BUY_RM").length === 1 && L.S.wstock[26].P4 === 20000 && L.S.wstock[26].P5 === 40000);
  check("A Berlin Americano 6000 (inside 5000-7000)", L.S.stock[11].P1 === 2000 + 6000, "stock " + L.S.stock[11].P1);
  check("A raw Coffee waits for the machine", st("buy_raw", "Dusseldorf", "Coffee").st === "skipped" && /needs “.*Machine A.*”, which didn.t go through/.test(st("buy_raw", "Dusseldorf", "Coffee").why) && !L.S.wstock[26].P6);
  check("A Hamburg marketing ran after its rent (deps)", st("marketing", "Hamburg").st === "done");
  check("A not-for-bot step left out", !S.some(s => /deliver/.test(s.t || "")));
  check("A rent cost from rate x m2 x term", L.S.cash === 500000 - 31200 - 26880 - 30000 - 44000 - 125000, "cash " + L.S.cash);
  check("A Berlin Hot Chocolate 5000", L.S.stock[11].P2 === 1000 + 5000);
  check("A Cologne Bubble over budget skipped", st("buy_store", "Cologne").st === "skipped" && /budget/.test(st("buy_store", "Cologne").why));
  check("A 2 store orders", posts.filter(x => x.cmd === "BUY_FG").length === 2);
  check("A marketing Berlin 6000 Hamburg 3000 Cologne kept", L.S.mkt.MA[11] === 6000 && L.S.mkt.MA[13] === 3000 && L.S.mkt.MA[17] === 2000);
  check("A never touched Cancel", !L.log.some(x => x.cmd === "SPACE_CANCEL"));
  check("A cash above reserve", L.S.cash >= 100000, "cash " + L.S.cash);
  check("A under 30 s", took < 30000);
  check("A no page errors", !errs.length, errs.join("; "));
  await p.screenshot({path: OUT + "/bot-run.png"}); await ctx.close();
}
{ // B: practice: nothing is sent
  const {ctx, p, errs} = await open();
  await p.evaluate(pl => window.__ff.plan(pl), PLAN);
  await p.evaluate(new Function(`const c = ${sh('[data-bot="dry"]')}; c.checked = true; c.dispatchEvent(new Event("change", {bubbles: true, composed: true}));`));
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p), L = await server();
  check("B practice sends no POST", !L.log.some(x => x.m === "POST"), JSON.stringify(L.log.filter(x => x.m === "POST")));
  check("B practice opens no deal link", !L.log.some(x => /B2B_/.test(x.cmd || "")));
  check("B practice marks steps", S.filter(s => s.st === "done").length >= 8, S.map(s => s.st).join(","));
  check("B no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // C: check the screens
  const {ctx, p, errs} = await open();
  await click(p, '[data-bot="check"]');
  await p.waitForFunction(() => !window.__ff.bot.checking && window.__ff.bot.check.length >= 13, null, {timeout: 60000});
  const rows = await p.evaluate(() => window.__ff.bot.check); for (const r of rows) console.log("  ", r.ok ? "ready" : "no   ", r.name, "|", r.detail);
  const L = await server();
  check("C sections ready", rows.filter(r => r.ok).length >= 11 && ["B2B sales orders", "Machines", "E-commerce", "Prices"].every(k => (rows.find(r => r.name === k) || {}).ok), rows.filter(r => !r.ok).map(r => r.name).join(", "));
  check("C sends nothing", !L.log.some(x => x.m === "POST") && !L.log.some(x => x.m === "PRICE"));
  check("C no page errors", !errs.length, errs.join("; "));
  await p.screenshot({path: OUT + "/bot-check.png"}); await ctx.close();
}
{ // D: Start opens the calculator, links, and runs its plan
  const {ctx, p, errs} = await open();
  const pop = ctx.waitForEvent("page", {timeout: 15000});
  await click(p, '[data-bot="go"]');
  const calc = await pop; await calc.waitForLoadState();
  await runDone(p);
  const S = await steps(p), L = await server(), linked = await p.evaluate(() => document.getElementById("ff-live").shadowRoot.querySelector('[data-f="link"]').innerText);
  for (const s of S) console.log("  ", s.sec, s.t, s.pr || "", "=>", s.st, "|", s.why);
  check("D calculator opened at /calc/", calc.url().endsWith("/calc/"));
  check("D linked", /Linked/.test(linked), linked);
  check("D plan ran", L.S.mkt.MA[17] === 2500 && L.S.stock[13].P3 === 3000 && L.S.offers[12] === "in", JSON.stringify({mkt: L.S.mkt.MA, st: L.S.stock[13], o: L.S.offers}));
  await p.waitForTimeout(1500);
  const got = await calc.evaluate(() => window.got), rep = got.filter(m => m.ff === "step"), r = id => rep.find(m => m.id === id) || {};
  console.log("   to the calculator:", got.map(m => m.ff + (m.ff === "step" ? ` ${m.id} ${m.status}` : "")).join(" | "));
  check("D botHello sent", got.some(m => m.ff === "botHello"));
  check("D data has the B2B offers", got.some(m => m.ff === "data" && (m.data.b2bOffers || []).some(o => o.id === "12" && o.price === 14 && o.kind === "fixed") && m.data.b2bOffers.some(o => o.id === "13" && o.maxBid === 15.5)));
  check("D reports: accept done 3000 at 14", r("d5:b2b:accept:12").status === "done" && r("d5:b2b:accept:12").qty === 3000 && r("d5:b2b:accept:12").price === 14 && r("d5:b2b:accept:12").planId === "stub-d5");
  check("D reports: machine skip", r("d5:buy:Machine A").status === "skip");
  check("D reports: stock done 3000, 48000", r("d5:vendor:Hamburg:Bubble Milk Tea").status === "done" && r("d5:vendor:Hamburg:Bubble Milk Tea").qty === 3000 && r("d5:vendor:Hamburg:Bubble Milk Tea").amount === 48000);
  check("D reports: marketing done 2500", r("d5:mkt:Cologne:MA").status === "done" && r("d5:mkt:Cologne:MA").amount === 2500);
  check("D each step reported once", rep.filter(m => m.status === "done").length === new Set(rep.filter(m => m.status === "done").map(m => m.id)).size);
  check("D runEnd sent", got.some(m => m.ff === "runEnd" && m.day === 5));
  check("D bought once", (await server()).log.filter(x => x.m === "POST" && x.cmd === "BUY_FG").length === 1);
  check("D no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // E: the game refuses an order
  const {ctx, p, errs} = await open("BUY_FG");
  await p.evaluate(pl => window.__ff.plan(pl), only(s => s.section === "buy_store" && s.target !== "Cologne" || s.section === "marketing"));
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p); for (const s of S) console.log("  ", s.sec, s.t, s.pr || "", "=>", s.st, "|", s.why);
  check("E store order failed with the game's words", S.filter(s => s.sec === "buy_store").every(s => s.st === "failed" && /not enough cash/.test(s.why)));
  check("E marketing still done", S.filter(s => s.sec === "marketing").every(s => s.st === "done"));
  check("E no page errors", !errs.length, errs.join("; "));
  console.log("E pane:", (await pane(p)).slice(0, 400).replace(/\s+/g, " "));
  await ctx.close();
}
{ // F: cash on delivery: the dashboard cash doesn't move, the day still finishes
  const {ctx, p, errs} = await open("COD");
  await p.evaluate(pl => window.__ff.plan(pl), only(s => s.section === "buy_store" && s.target !== "Cologne" || s.section === "marketing"));
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p), on = await p.evaluate(() => window.__ff.bot.on), notes = await p.evaluate(() => window.__ff.bot.run.notes);
  check("F all steps done", S.every(s => s.st === "done"), S.map(s => s.st).join(","));
  check("F bot still on", on); console.log("F notes:", notes.join(" | "));
  check("F no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // G: a plan that doesn't match the game's cash waits; a matching one then runs
  const {ctx, p, errs} = await open();
  await p.evaluate(pl => window.__ff.plan(pl), only(s => s.section === "marketing", {verify: {day: 5, cash: 900000, tol: 1000}}));
  await click(p, '[data-bot="go"]');
  await p.waitForFunction(() => window.__ff.bot.run && window.__ff.bot.run.took != null && window.__ff.bot.run.stale, null, {timeout: 60000});
  const say1 = await p.evaluate(() => window.__ff.bot.say), L1 = await server();
  check("G mismatch sends nothing", !L1.log.some(x => x.m === "POST")); check("G says why", /doesn't match/.test(say1), say1);
  await p.evaluate(pl => window.__ff.plan(pl), only(s => s.section === "marketing", {verify: {day: 5, cash: 500000, tol: 1000}}));
  await p.waitForFunction(() => window.__ff.bot.run && window.__ff.bot.run.plan.verify.cash === 500000 && window.__ff.bot.run.took != null, null, {timeout: 60000});
  const S = await steps(p), L = await server();
  check("G matching plan runs", S.every(s => s.st === "done") && L.S.mkt.MA[11] === 6000, S.map(s => s.st).join(","));
  check("G no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // H: release, a rent step that would shrink, a too-dear vendor, one B2B deal per product, an offer that's gone
  const {ctx, p, errs} = await open();
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, steps: [
    {id: "h:rel", seq: 1, section: "rent_shop", action: "release", target: "Berlin", qty: 100, term: 30, qtyStep: 50, cost: 0},
    {id: "h:shrink", seq: 2, section: "rent_shop", action: "rent", target: "Cologne", qty: 50, term: 30, qtyStep: 50, cost: 0},
    {id: "h:rel0", seq: 3, section: "rent_wh", action: "release", target: "Dusseldorf", qty: 0, cost: 0},
    {id: "h:whshrink", seq: 3.5, section: "rent_wh", action: "rent", target: "Dusseldorf", qty: 500, term: 30, qtyStep: 500, cost: 0},
    {id: "h:dear", seq: 4, section: "buy_store", action: "buy", target: "Hamburg", product: "Americano", qty: 3000, qtyMin: 3000, qtyMax: 3000, unitPrice: 8.8, unitPriceMax: 9, cost: 27000},
    {id: "h:b2b1", seq: 5, section: "b2b", action: "accept", target: "12", product: "Americano", qty: 3000, price: 14, qtyMax: 5000, cost: 0},
    {id: "h:b2b2", seq: 6, section: "b2b", action: "accept", target: "14", product: "Americano", qty: 1000, price: 13, qtyMax: 5000, cost: 0},
    {id: "h:gone", seq: 7, section: "b2b", action: "accept", target: "99", product: "Hot Chocolate", qty: 1000, price: 13, cost: 0},
    {id: "h:big", seq: 8, section: "b2b", action: "bid", target: "13", product: "Hot Chocolate", qty: 2000, price: 15.03, qtyMax: 1500, cost: 0}]});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p), L = await server(), posts = L.log.filter(x => x.m === "POST"), st = id => (S.find(s => s.id === id) || {});
  for (const s of S) console.log("  ", s.id, "=>", s.st, "|", s.why);
  check("H release Berlin to 100 m2", L.S.shops[11].area === 100 && posts.some(x => /rent11=100/.test(x.body)));
  check("H rent never shrinks Cologne", L.S.shops[17].area === 100 && st("h:shrink").st === "done" && !posts.some(x => /rent17=/.test(x.body)));
  check("H release to 0 left to the user", st("h:rel0").st === "skipped" && L.S.whs[26].area === 1000);
  check("H warehouse area read (game format) and never shrunk", st("h:whshrink").st === "done" && /already 1,000/.test(st("h:whshrink").why) && !posts.some(x => /rent26=/.test(x.body)));
  check("H vendor over unitPriceMax skipped", st("h:dear").st === "skipped" && /allows up to 9/.test(st("h:dear").why) && L.S.stock[13].P1 === 0);
  check("H one B2B deal per product", st("h:b2b1").st === "done" && st("h:b2b2").st === "skipped" && L.S.offers[14] === "open");
  check("H gone offer skipped", st("h:gone").st === "skipped" && /isn't on the B2B list/.test(st("h:gone").why));
  check("H offer over qtyMax skipped", st("h:big").st === "skipped" && L.S.offers[13] === "open");
  check("H no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // I: a buy cut under the bulk lot is sized and booked at the full price
  const {ctx, p, errs} = await open();
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, budgets: {...PLAN.budgets, buy_store: 45000}, steps: [{id: "i:tier", seq: 1, section: "buy_store", action: "buy", target: "Hamburg", product: "Americano",
    qty: 5000, qtyMin: 3000, qtyMax: 5000, unitPrice: 10, unitPriceMax: 10.2, tierQty: 5000, unitPriceMaxBelowTier: 12, cost: 50000, must: true}]});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const s1 = await p.evaluate(() => { const s = window.__ff.bot.run.steps[0]; return {st: s.state, q: s.qtyDone, a: s.amount, why: s.why}; }), L = await server();
  check("I below the bulk lot: 3000 booked at 12", s1.st === "done" && s1.q === 3000 && s1.a === 36000 && L.S.stock[13].P1 === 3000, JSON.stringify(s1));
  check("I no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // J: an order whose answer is lost counts as bought (unsure), is not sent again, and stops nothing else
  const {ctx, p, errs} = await open("E500:BUY_FG");
  await p.evaluate(pl => window.__ff.plan(pl), only(s => s.section === "buy_store" && s.target === "Berlin" || s.section === "marketing" && s.target === "Berlin"));
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await p.evaluate(() => window.__ff.bot.run.steps.map(s => ({id: s.id, st: s.state, q: s.qtyDone, u: !!s.unsure, why: s.why}))), L = await server();
  const tried = await p.evaluate(() => [...window.__ff.bot.days[5].tried]);
  for (const s of S) console.log("  ", s.id, "=>", s.st, s.q, s.u ? "unsure" : "", "|", s.why);
  const am = S.find(s => s.id === "d5:vendor:Berlin:Americano"), hc = S.find(s => s.id === "d5:vendor:Berlin:Hot Chocolate");
  check("J lost answer counted as bought, unsure", am.st === "done" && am.u && am.q === 5000 && hc.st === "done" && hc.u && hc.q === 5000);
  check("J one store order only", L.log.filter(x => x.m === "POST" && x.cmd === "BUY_FG").length === 1);
  check("J not tried again today", tried.includes("d5:vendor:Berlin:Americano") && tried.includes("d5:vendor:Berlin:Hot Chocolate"));
  check("J marketing still done", S.find(s => s.id === "d5:mkt:Berlin:MA").st === "done");
  check("J no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // M: the reader pasted again the same day remembers what the bot did
  const {ctx, p, errs} = await open();
  const pl = only(s => s.id === "d5:vendor:Berlin:Americano" || s.id === "d5:mkt:Berlin:MA");
  await p.evaluate(pl => window.__ff.plan(pl), pl);
  await click(p, '[data-bot="go"]'); await runDone(p);
  const n1 = (await server()).log.filter(x => x.m === "POST").length;
  await p.evaluate(() => { window.__ff.stop(); window.__FF_MODE = "12i"; const s = document.createElement("script"); s.charset = "utf-8"; s.src = "/reader.js?t=" + Date.now(); document.head.appendChild(s); });
  await p.waitForFunction(() => window.__ff && window.__ff.data() && window.__ff.data().day === 5 && !window.__ff.bot.run, null, {timeout: 60000});
  await p.waitForTimeout(500); await p.evaluate(new Function(`${sh('[data-tab="bot"]')}.click()`));
  await p.evaluate(pl => window.__ff.plan(pl), pl);
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await steps(p), n2 = (await server()).log.filter(x => x.m === "POST").length;
  check("M nothing sent again", n2 === n1, `${n1} then ${n2}`);
  check("M steps known as done", S.every(s => s.why === "done earlier today"), S.map(s => s.why).join(" | "));
  check("M no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // N: Run by itself: nothing clicked, the bot starts after the first read, opens the calculator and runs its plan
  const {ctx, p, errs} = await open("", {...MEM, auto: true});
  let calc = null; for (let t = 0; t < 60 && !calc; t++) { calc = ctx.pages().find(x => x.url().endsWith("/calc/")); if (!calc) await p.waitForTimeout(250); }
  await runDone(p);
  const L = await server(), on = await p.evaluate(() => window.__ff.bot.on), box = await p.evaluate(new Function(`return ${sh('[data-f="botauto"]')}.checked`));
  check("N started by itself and opened the calculator", !!calc && on);
  check("N plan ran", L.S.mkt.MA[17] === 2500 && L.S.stock[13].P3 === 3000, JSON.stringify({mkt: L.S.mkt.MA, st: L.S.stock[13]}));
  check("N switch shows on", box);
  check("N no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // P: the B2B Sales Order list: every team's bid, each result, our team's name; the whole list after Load More
  const {ctx, p, errs} = await open();
  const d1 = await p.evaluate(() => window.__ff.data());
  check("P first page read with the day", (d1.b2bBids || []).filter(r => r.so).length === 5 && d1.b2bOrders === undefined, JSON.stringify((d1.b2bBids || []).map(r => r.so)));
  await p.evaluate(() => window.__ff.orders());
  const d = await p.evaluate(() => window.__ff.data()), B = id => d.b2bBids.find(r => r.so === String(id)) || {}, L = await server();
  for (const r of d.b2bBids) console.log("  ", r.so, r.id, r.product, r.result, r.winner, r.winPrice, "ours", r.ourBid, "|", r.bids.map(b => `${b.team} ${b.price}${b.us ? "*" : ""}`).join(", "));
  check("P whole list after Load More", d.b2bBids.filter(r => r.so).length === 7 && L.log.some(x => x.x === "list:B2BSOS"));
  check("P our team found", d.team === "FF", d.team);
  check("P lost: the winner and the winning price", B(703).result === "lost" && B(703).winner === "3 imut" && B(703).winPrice === 19.9 && B(703).ourBid === 20.5 && B(703).bids.some(b => b.team === "FF" && b.us) && B(703).bids.some(b => b.team === "3 imut" && !b.us));
  check("P void: too few bidders", B(704).result === "void" && B(704).winner === null && B(704).minBidders === 2);
  check("P a tie went to the other team", B(706).result === "lost" && B(706).winner === "TGED");
  check("P won and delivered", B(705).result === "won" && B(705).deliveredDay === 4 && B(705).winPrice === 12 && B(705).allocDay === 3 && B(705).due === 9 && B(705).penalty === 6000);
  check("P orders book once the whole list is read", (d.b2bOrders || []).length === 3 && d.b2bOrders.every(o => o.delivered), JSON.stringify(d.b2bOrders));
  check("P sends nothing", !L.log.some(x => x.m === "POST"));
  check("P no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // Q: shipping won orders: a plan step first, then the bot's own (web order, then the earliest due), warehouse stock only, hidBatchData as the game's page builds it
  const {ctx, p, errs} = await open("", MEM, "&so=1");
  await p.evaluate(() => window.__ff.orders());
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, steps: [{id: "q:ship:702", seq: 1, section: "b2b", action: "ship", target: "702", product: "Hot Chocolate", cost: 0}]});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await p.evaluate(() => window.__ff.bot.run.steps.map(s => ({id: s.id, st: s.state, q: s.qtyDone, why: s.why, auto: !!s.auto}))), L = await server(), d = await p.evaluate(() => window.__ff.data());
  for (const s of S) console.log("  ", s.id, "=>", s.st, s.q, "|", s.why);
  const o = id => L.S.sos.find(x => x.id === id) || {}, st = id => S.find(s => s.id === id) || {}, al = L.log.filter(x => x.m === "POST" && x.cmd === "B2BECM_SOS_ALLOC_FAST");
  for (const x of al) console.log("   POST", x.q, decodeURIComponent(x.body).slice(0, 300), "->", x.r);
  check("Q plan step ships what the warehouse has (part)", o(702).allocated === 1500 && st("q:ship:702").st === "done" && /500 still to go/.test(st("q:ship:702").why));
  check("Q the bot ships the other won order, all of it", o(701).allocated === 4000 && st("auto:ship:701").st === "done");
  check("Q web order shipped too (ECM)", L.S.wsos[0].allocated === 200 && st("auto:webship:801").st === "done");
  check("Q allocation data exactly as the game's page builds it", !L.S.allocErr.length && al.length === 3, L.S.allocErr.join("; "));
  check("Q store stock left alone", L.S.stock[11].P1 === 2000 && L.S.stock[11].P2 === 1000);
  check("Q finished orders not touched", !al.some(x => /id=70[3-9]&/.test(x.q)));
  check("Q the calculator's order book shows it", ((d.b2bOrders || []).find(x => x.id === "701") || {}).allocated === 4000, JSON.stringify(d.b2bOrders));
  check("Q a deal taken by others is in the history", d.b2bBids.some(r => r.id === "15" && r.result === "gone"));
  check("Q no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // Q2: practice ships nothing; with rules.autoShip false the bot doesn't ship at all
  const {ctx, p, errs} = await open("", MEM, "&so=1");
  await p.evaluate(() => window.__ff.orders());
  await p.evaluate(new Function(`const c = ${sh('[data-bot="dry"]')}; c.checked = true; c.dispatchEvent(new Event("change", {bubbles: true, composed: true}));`));
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, steps: []});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S1 = await p.evaluate(() => window.__ff.bot.run.steps.map(s => ({id: s.id, st: s.state, why: s.why}))), L1 = await server();
  check("Q2 practice: would ship, sends nothing", S1.filter(s => /^auto:/.test(s.id) && s.st === "done" && /practice/.test(s.why)).length === 3 && !L1.log.some(x => x.m === "POST"), JSON.stringify(S1));
  await click(p, '[data-bot="go"]'); await p.waitForFunction(() => !window.__ff.bot.loop, null, {timeout: 30000});
  await p.evaluate(new Function(`const c = ${sh('[data-bot="dry"]')}; c.checked = false; c.dispatchEvent(new Event("change", {bubbles: true, composed: true}));`));
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, b2b: {rules: {autoShip: false}}, steps: PLAN.steps.filter(s => s.id === "d5:mkt:Berlin:MA")});
  await p.evaluate(() => { window.__ff.bot.run = null; });
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S2 = await steps(p), L2 = await server();
  check("Q2 autoShip false: no shipping", !S2.some(s => /^auto:/.test(s.id)) && !L2.log.slice(L1.log.length).some(x => /ALLOC/.test(x.cmd || "")) && S2.find(s => s.id === "d5:mkt:Berlin:MA").st === "done", JSON.stringify(S2));
  check("Q2 no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // R: machines: buy as many as the floor space and the budget allow, one a submit; production order; what a machine makes is left to the user
  const {ctx, p, errs} = await open("", MEM, "&wfg=1&cash=5000000");
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, budgets: {...PLAN.budgets, machine: 1300000}, steps: [
    {id: "r:A", seq: 1, section: "machine", action: "buy", target: "Machine A", qty: 7, where: "Dusseldorf", cost: 2100000},
    {id: "r:B", seq: 2, section: "machine", action: "buy", target: "Machine B", qty: 1, cost: 200000},
    {id: "r:prio", seq: 3, section: "machine", action: "priority", order: ["Bubble Milk Tea", "Americano", "Hot Chocolate"]},
    {id: "r:set", seq: 4, section: "machine", action: "set", target: "Machine A", product: "Americano"}]});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await p.evaluate(() => window.__ff.bot.run.steps.map(s => ({id: s.id, st: s.state, q: s.qtyDone, why: s.why}))), L = await server(), d = await p.evaluate(() => window.__ff.data());
  for (const s of S) console.log("  ", s.id, "=>", s.st, s.q, "|", s.why);
  const st = id => S.find(s => s.id === id) || {}, buys = L.log.filter(x => x.m === "POST" && x.cmd === "PRD_MACHINE_BUY");
  check("R 4 Machine A: only 4 fit on the free floor", L.S.machines.length === 4 && buys.length === 4 && buys.every(x => /mac=1/.test(x.q) && x.body === "lc=26") && st("r:A").st === "done" && /only 4 fit/.test(st("r:A").why));
  check("R Machine B over the machine budget skipped", st("r:B").st === "skipped" && /machine budget/.test(st("r:B").why));
  check("R cash paid for 4", L.S.cash === 5000000 - 1200000, "cash " + L.S.cash);
  check("R production order set", L.S.prdline === "3,1,2" && st("r:prio").st === "done");
  check("R machine setup left to the user", st("r:set").st === "skipped" && /isn't mapped/.test(st("r:set").why));
  const A = (d.machineTypes || []).find(t => t.name === "Machine A") || {};
  check("R machine types for the calculator", d.machineTypes.length === 2 && A.price === 300000 && A.cap === 10000 && A.m2 === 200 && A.staff === 2, JSON.stringify(d.machineTypes));
  check("R no price command", !L.log.some(x => x.m === "PRICE"));
  check("R no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // R2: production read each day: units made (the grading counts them), and each machine's status
  const {ctx, p, errs} = await open("", MEM, "&mach=1");
  const d = await p.evaluate(() => window.__ff.data()), m = id => (d.ownMachines || []).find(x => x.id === id) || {};
  console.log("   machines:", JSON.stringify(d.ownMachines), "production:", String(JSON.stringify(d.production)).slice(0, 300));
  check("R2 production totals", d.production && d.production.total === 20000 && d.production.byProduct.Americano === 20000 && d.production.perDay.length === 4);
  check("R2 machine making", m("9001").status === "making" && m("9001").today === 10000);
  check("R2 machine short of a raw material", m("9002").status === "noRaw", JSON.stringify(m("9002")));
  check("R2 no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
{ // S: e-commerce: buy listings that match the plan (never over its price), post our own at the shop price only
  const {ctx, p, errs} = await open("", MEM, "&wfg=1");
  await p.evaluate(pl => window.__ff.plan(pl), {...PLAN, budgets: {...PLAN.budgets, ecom: 10000}, steps: [
    {id: "s:151", seq: 1, section: "ecom", action: "buy", target: "151", product: "Americano", qty: 500, price: 9.5, dest: "warehouse"},
    {id: "s:152", seq: 2, section: "ecom", action: "buy", target: "152", product: "Hot Chocolate", qty: 300, unitPriceMax: 12},
    {id: "s:122", seq: 3, section: "ecom", action: "buy", target: "122", product: "Bubble Milk Tea", qty: 500, price: 16},
    {id: "s:151b", seq: 4, section: "ecom", action: "buy", target: "151", product: "Americano", qty: 500, price: 9.5},
    {id: "s:153", seq: 5, section: "ecom", action: "buy", target: "153", product: "Bubble Milk Tea", qty: 200, price: 15, dest: "Berlin"},
    {id: "s:sell", seq: 6, section: "ecom", action: "sell", product: "Americano", qty: 300, price: 25, days: 2},
    {id: "s:sell2", seq: 7, section: "ecom", action: "sell", product: "Hot Chocolate", qty: 5000}]});
  await click(p, '[data-bot="go"]'); await runDone(p);
  const S = await p.evaluate(() => window.__ff.bot.run.steps.map(s => ({id: s.id, st: s.state, why: s.why}))), L = await server(), d = await p.evaluate(() => window.__ff.data());
  for (const s of S) console.log("  ", s.id, "=>", s.st, "|", s.why);
  const st = id => S.find(s => s.id === id) || {};
  check("S listing bought whole to the warehouse", st("s:151").st === "done" && L.S.wstock[26].P1 === 5500 && !L.S.web.some(w => w.id === 151));
  check("S over the plan's price skipped", st("s:152").st === "skipped" && /allows up to 12/.test(st("s:152").why) && st("s:122").st === "skipped" && /99999999.99/.test(st("s:122").why));
  check("S a listing already gone skipped", st("s:151b").st === "skipped" && /isn't on the Web Market/.test(st("s:151b").why));
  check("S listing bought to a store", st("s:153").st === "done" && L.S.stock[11].P3 === 700);
  check("S cash paid", L.S.cash === 500000 - 4500 - 3000, "cash " + L.S.cash);
  const post = L.S.posts[0] || {};
  check("S own post at the shop price, not the plan's", st("s:sell").st === "done" && post.bs === "S" && post.pcode === "p1" && post.qnt === "300" && post.price === "20" && post.days === "2" && post.type === "ONE", JSON.stringify(L.S.posts));
  check("S no post for more than the warehouse has", st("s:sell2").st === "skipped" && /only 1,000/.test(st("s:sell2").why) && L.S.posts.length === 1);
  check("S web listings for the calculator", (d.web.listings || []).some(w => w.seller === "FF" && w.price === 20) && d.web.listings.some(w => w.id === "152" && w.price === 12.5));
  check("S no price command", !L.log.some(x => x.m === "PRICE"));
  check("S no page errors", !errs.length, errs.join("; "));
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
