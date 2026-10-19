// FF bot on the stand-in game: real run, practice run, screen check, Start opening the calculator, a game error.
import { chromium } from "playwright";
const BASE = "http://localhost:" + (process.argv[2] || 8790), OUT = process.argv[3] || ".";
const PRODUCTS = [["Americano", "Coffee"], ["Hot Chocolate", "Chocolate"], ["Bubble Milk Tea", "Milk Tea"]].map(([name, ing]) =>
  ({name, price: 20, cost: 8, dim: 0.005, expire: 0, allow: "Yes", bom: [{q: 1, name: "Plastic Cup"}, {q: 2, name: "Straw"}, {q: 1, name: ing}]}));
const MEM = {setup: {setupDay: 1, modules: ["RTL", "B2B"], lead: 1, machines: [], products: PRODUCTS}, ignored: ["Plastic Cup", "Straw", "Coffee", "Chocolate", "Milk Tea"]};
const PLAN = {ff: "plan", v: 1, mode: "12i", day: 5, planId: "test-d5", reserve: 100000,
  budgets: {b2b: 0, rent_shop: 60000, rent_wh: 35000, machine: 0, buy_raw: 60000, buy_store: 150000, marketing: 20000, price: 0},
  floors: {Americano: 7.5, "Hot Chocolate": 13},
  steps: [
    {id: "d5:b2b:accept:12", seq: 1, section: "b2b", action: "accept", target: "12", product: "Americano", qty: 3000, price: 14, qtyMax: 5000, cost: 0},
    {id: "d5:b2b:bid:13", seq: 2, section: "b2b", action: "bid", target: "13", product: "Hot Chocolate", qty: 2000, price: 15.03, floor: 13, cost: 0},
    {id: "d5:space:Berlin", seq: 3, section: "rent_shop", action: "rent", target: "Berlin", qty: 280, term: 30, qtyStep: 50},
    {id: "d5:open:Hamburg", seq: 4, section: "rent_shop", action: "rent", target: "Hamburg", qty: 100, term: 7, qtyStep: 50, cost: 26880},
    {id: "d5:space:warehouse", seq: 5, section: "rent_wh", action: "rent", target: "Dusseldorf Warehouse", qty: 1200, term: 30, qtyStep: 500, cost: 30000},
    {id: "d5:buy:Coffee Machine", seq: 6, section: "machine", action: "buy", target: "Coffee Machine", qty: 1, cost: 0},
    {id: "d5:raw:Plastic Cup", seq: 7, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Plastic Cup", qty: 20000, qtyMin: 20000, qtyMax: 21000, unitPrice: 1, cost: 20000, must: true},
    {id: "d5:raw:Straw", seq: 8, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Straw", qty: 40000, qtyMin: 40000, qtyMax: 40000, unitPrice: 0.6, cost: 24000},
    {id: "d5:raw:Coffee", seq: 9, section: "buy_raw", action: "buy", target: "Dusseldorf", product: "Coffee", qty: 3000, qtyMin: 3000, qtyMax: 3000, unitPrice: 3, cost: 9000, deps: ["d5:buy:Coffee Machine"]},
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
const open = async (fail = "", mem = MEM) => {
  await (await fetch(BASE + "/reset?fail=" + fail)).text();
  const ctx = await b.newContext({viewport: {width: 1200, height: 900}});
  await ctx.addInitScript(m => { try { localStorage.setItem("ff-reader:" + location.host + ":12i", m); } catch (e) {} }, JSON.stringify(mem));
  const p = await ctx.newPage(), errs = [], logs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => logs.push(m.text()));
  await p.goto(BASE + "/game.html");
  await p.evaluate(() => { window.__FF_MODE = "12i"; const s = document.createElement("script"); s.charset = "utf-8"; s.src = "/reader.js?t=" + Date.now(); document.head.appendChild(s); });
  await p.waitForFunction(() => window.__ff && window.__ff.data() && window.__ff.data().day === 5, null, {timeout: 60000});
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
  check("A machine skipped", st("machine", "Coffee Machine").st === "skipped"); check("A price skipped", st("price", "Americano").st === "skipped");
  check("A raw: one order cups 20000 + straws 40000", posts.filter(x => x.cmd === "BUY_RM").length === 1 && L.S.wstock[26].P4 === 20000 && L.S.wstock[26].P5 === 40000);
  check("A Berlin Americano 6000 (inside 5000-7000)", L.S.stock[11].P1 === 2000 + 6000, "stock " + L.S.stock[11].P1);
  check("A raw Coffee waits for the machine", st("buy_raw", "Dusseldorf", "Coffee").st === "skipped" && /needs “.*Coffee Machine.*”, which didn.t go through/.test(st("buy_raw", "Dusseldorf", "Coffee").why) && !L.S.wstock[26].P6);
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
  await p.waitForFunction(() => !window.__ff.bot.checking && window.__ff.bot.check.length >= 8, null, {timeout: 60000});
  const rows = await p.evaluate(() => window.__ff.bot.check); for (const r of rows) console.log("  ", r.ok ? "ready" : "no   ", r.name, "|", r.detail);
  const L = await server();
  check("C sections ready", rows.filter(r => r.ok).length >= 7); check("C sends nothing", !L.log.some(x => x.m === "POST"));
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
await b.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
