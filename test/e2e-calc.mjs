// The real calculator (calc/index.html) with the bot on the stand-in game: Start opens the calculator, it makes the day's plan from
// the game data, and the bot runs it. Prints every step and what came back; fails on page errors, a price command or a step the bot
// doesn't know. Run: node test/server.mjs 8791 reader.js &   then   node test/e2e-calc.mjs 8791
import { chromium } from "playwright";
const BASE = "http://localhost:" + (process.argv[2] || 8790), PASS = "e2e-test-pass";
const PRODUCTS = [["Americano", "Coffee"], ["Hot Chocolate", "Chocolate"], ["Bubble Milk Tea", "Milk Tea"]].map(([name, ing]) =>
  ({name, price: 20, cost: 8, dim: 0.005, expire: 0, allow: "Yes", bom: [{q: 1, name: "Plastic Cup"}, {q: 2, name: "Straw"}, {q: 1, name: ing}]}));
const MEM = {setup: {setupDay: 1, modules: ["RTL", "B2B"], lead: 1, machines: [{name: "Machine A", price: 300000, cap: 10000, m2: 200, staff: 2}, {name: "Machine B", price: 200000, cap: 6000, m2: 150, staff: 1}],
  products: PRODUCTS}, ignored: ["Plastic Cup", "Straw", "Coffee", "Chocolate", "Milk Tea"]};
const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
const sh = s => `document.getElementById('ff-live').shadowRoot.querySelector('${s}')`;
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " :: " + extra : ""}`); if (!ok) fails++; };
const server = async () => (await fetch(BASE + "/log")).json();

for (const [name, extra] of [["plain game", ""], ["orders, goods, machines, cash", "&so=1&wfg=1&mach=1&cash=5000000"]]) {
  console.log(`\n== ${name}`);
  await (await fetch(BASE + "/reset?calc=real" + extra)).text();
  const ctx = await b.newContext({viewport: {width: 1300, height: 900}});
  await ctx.addInitScript(m => { try { if (location.pathname === "/game.html") localStorage.setItem("ff-reader:" + location.host + ":12i", m); } catch (e) {} }, JSON.stringify(MEM));
  const c0 = await ctx.newPage();   // a test passcode for the calculator's lock, on this browser only (low rounds)
  await c0.goto(BASE + "/calc/");
  await c0.evaluate(async pass => { const salt = b64(crypto.getRandomValues(new Uint8Array(16))), key = await deriveTeamKey(pass, salt, 1000);
    localStorage.setItem(SEC.flag, JSON.stringify({v: 1, salt, iter: 1000, check: await sealV(SEC.check, key)})); }, PASS);
  await c0.close();
  const p = await ctx.newPage(), errs = [], cerrs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/game.html");
  await p.evaluate(() => { window.__FF_MODE = "12i"; const s = document.createElement("script"); s.charset = "utf-8"; s.src = "/reader.js?t=" + Date.now(); document.head.appendChild(s); });
  await p.waitForFunction(() => window.__ff && window.__ff.data() && window.__ff.data().day === 5 && window.__ff.data().menus, null, {timeout: 60000});
  await p.evaluate(() => window.__ff.orders());
  await p.evaluate(new Function(`${sh('[data-tab="bot"]')}.click()`));
  const pop = ctx.waitForEvent("page", {timeout: 15000});
  await p.evaluate(new Function(`${sh('[data-bot="go"]')}.click()`));
  const calc = await pop; calc.on("pageerror", e => cerrs.push(e.message));
  await calc.waitForLoadState();
  await calc.waitForFunction(() => typeof Sec !== "undefined" && Sec.access === "locked", null, {timeout: 20000}).catch(() => {});
  const un = await calc.evaluate(pass => unlockTeam(pass, false), PASS);
  check(`${name}: calculator unlocked with the test passcode`, un === "ok", un);
  const ran = await p.waitForFunction(() => window.__ff.bot.run && window.__ff.bot.run.took != null, null, {timeout: 120000}).then(() => true, () => false);
  check(`${name}: the bot ran a plan from the calculator`, ran);
  const R = await p.evaluate(() => { const r = window.__ff.bot.run; return r && {from: r.plan.from, planId: r.plan.planId, stale: r.stale, notes: r.notes,
    budgets: r.plan.budgets, rules: r.plan.rules, b2bRules: (r.plan.b2b || {}).rules, steps: r.steps.map(s => ({id: s.id, sec: s.sec, act: s.act, t: s.target, pr: s.product, q: s.qty, st: s.state, why: s.why}))}; });
  const L = await server();
  if (R) {
    console.log(`   plan ${R.planId} from ${R.from}${R.stale ? ", waits: " + R.stale : ""}; budgets ${JSON.stringify(R.budgets)}`);
    for (const s of R.steps) console.log(`   ${s.sec}/${s.act} ${s.t || ""} ${s.pr || ""} ${s.q ?? ""} => ${s.st} | ${s.why}`);
    for (const m of R.notes) console.log("   note:", m);
    check(`${name}: no step the bot doesn't know`, !R.steps.some(s => /doesn't know/.test(s.why)), R.steps.filter(s => /doesn't know/.test(s.why)).map(s => s.id).join(", "));
    check(`${name}: no failed step`, !R.steps.some(s => s.st === "failed"), R.steps.filter(s => s.st === "failed").map(s => `${s.id}: ${s.why}`).join("; "));
  }
  console.log("   game POSTs:", L.log.filter(x => x.m === "POST").map(x => x.cmd).join(", ") || "none");
  check(`${name}: no price command`, !L.log.some(x => x.m === "PRICE"));
  check(`${name}: no cancel link`, !L.log.some(x => /SPACE_CANCEL/i.test(x.q || "") || x.cmd === "SPACE_CANCEL"));
  check(`${name}: no page errors (game)`, !errs.length, errs.join("; "));
  check(`${name}: no page errors (calculator)`, !cerrs.length, cerrs.join("; "));
  await ctx.close();
}
await b.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
