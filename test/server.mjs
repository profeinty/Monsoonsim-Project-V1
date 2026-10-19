// Stand-in MonsoonSIM game for the FF bot: dashboard, action menus, forms, POST handling, a request log.
import http from "node:http";
import fs from "node:fs";
const PORT = +process.argv[2] || 8790, READER = process.argv[3];
const TIERS = [1000, 3000, 5000, 8000, 12000, 20000, 30000, 40000, 50000, 60000, 80000, 100000, 120000];
const PRICE = {P1: 10, P2: 13, P3: 16, P4: 1, P5: 0.6, P6: 3, P7: 5, P8: 8};
const NAMES = {P1: "Americano", P2: "Hot Chocolate", P3: "Bubble Milk Tea", P4: "Plastic Cup", P5: "Straw", P6: "Coffee", P7: "Chocolate", P8: "Milk Tea"};
let S, log;
const reset = (o = {}) => {
  S = {day: 5, maxDay: 30, cash: 500000, od: 0,
    shops: {11: {name: "Berlin", rate: 52, area: 250, id: 501}, 13: {name: "Hamburg", rate: 48, area: 0}, 17: {name: "Cologne", rate: 45, area: 100, id: 502}},
    whs: {26: {name: "Dusseldorf", rate: 5, area: 1000, id: 601}, 27: {name: "Cologne", rate: 5, area: 0}},
    stock: {11: {P1: 2000, P2: 1000, P3: 500}, 13: {P1: 0, P2: 0, P3: 0}, 17: {P1: 100, P2: 100, P3: 100}}, wstock: {26: {}},
    mkt: {MA: {11: 5000, 13: 0, 17: 2000}, MB: {11: 0, 13: 0, 17: 0}}, offers: {12: "open", 13: "open", 14: "open"}, fail: o.fail || ""};
  log = [];
};
reset();
const page = body => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
const opts = (k, cur) => `<option value="">${NAMES[k]}</option>` + TIERS.map(t => `<option value="${t}"${cur == t ? " selected" : ""}>${t.toLocaleString("en")}</option>`).join("");
const dash = () => `<div id="KPI_DAY____">${S.day} / ${S.maxDay}</div>
<div>Cash in Bank</div><div>${Math.round(S.cash).toLocaleString("en")}</div><div>Overdraft Used</div><div>${S.od}</div><div>Delinquent Payouts</div><div>0</div>
<div>Cost - Americano</div><div>7.43</div><div>Cost - Hot Chocolate</div><div>12.52</div><div>Cost - Bubble Milk Te...</div><div>13.48</div>
<div id="RTL">${Object.entries(S.shops).filter(([, s]) => s.area > 0).map(([ac, s]) => `<div class="kpi_title">${s.name} Retail</div><ul>${["P1", "P2", "P3"].map(p => `<li>${NAMES[p]} @ 20 <span class="right">${S.stock[ac][p].toLocaleString("en")}</span></li>`).join("")}<li>Space utilization (40%) ${Math.round(Object.values(S.stock[ac]).reduce((a, b) => a + b, 0)*0.005)} / ${s.area}</li></ul>`).join("")}</div>`;
const menus = `<a id="MENU2_retail_location" href="m?x=retail_location">Retail Location</a> <a id="MENU2_whs_location" href="m?x=whs_location">Warehouse Location</a>
<a id="MENU2_retail_vendor" href="m?x=retail_vendor">Retail Vendor</a> <a id="MENU2_warehouse_vendor" href="m?x=warehouse_vendor">Warehouse Vendor</a>
<a id="MENU2_retail_media" href="m?x=retail_media">Media</a> <a id="MENU2_B2Bincm" href="m?x=b2b">B2B Offers</a> <a id="MENU2_chart_rtl_forecast" href="m?x=forecast">Forecast</a>`;
const GAME = page(`${menus}<div id="dash">${dash()}</div><script>
setInterval(async () => { document.getElementById("dash").innerHTML = await (await fetch("dash")).text(); }, 300);
</script>`);
const space = (list, kind) => Object.entries(list).map(([ac, s]) => `<div class="loc"><div><b>Location: ${s.name}</b></div><div>Specification</div><div>${kind} Rental:${s.rate} EUR/Day/m2 Overflow Fee:61 EUR/Day/m2</div>
${s.area ? `<div>Current Area: ${s.area} m2 : 30-Day, Auto Renew Day: 92</div><a href="ms_sure_learner?cmd=SPACE_MANAGE&ac=${ac}&id=${s.id}&edit=1">Rental Manage</a> <a href="ms_sure_learner?cmd=SPACE_CANCEL&ac=${ac}&id=${s.id}">Cancel</a>`
  : `<a href="ms_sure_learner?cmd=SPACE_MANAGE&ac=${ac}">Rent ${kind} Space</a>`}</div>`).join("");
const MENU = {
  retail_location: () => space(S.shops, "Retail"), whs_location: () => space(S.whs, "Warehouse"),
  retail_vendor: () => `<div class="vendor-box"><div>VFG1 Vendor 1</div><div>Americano 10 EUR Hot Chocolate 13 EUR Bubble Milk Tea 16 EUR Lead time 1 day</div><a href="ms_sure_learner?cmd=BUY_FG&loctype=RTL&vc=1">Procure Finished Goods</a></div>
    <div class="vendor-box"><div>VFG2 Vendor 2</div><div>Americano 11 EUR Hot Chocolate 14 EUR Bubble Milk Tea 17 EUR Lead time 1 day</div><a href="ms_sure_learner?cmd=BUY_FG&loctype=RTL&vc=2">Procure Finished Goods</a></div>`,
  warehouse_vendor: () => `<div class="vendor-box"><div>VRM3 Vendor 3</div><div>Plastic Cup 1 EUR Straw 0.6 EUR Coffee 3 EUR Chocolate 5 EUR Milk Tea 8 EUR</div><a href="ms_sure_learner?cmd=BUY_RM&loctype=WHS&vc=3">Procure Raw Materials</a></div>`,
  retail_media: () => `<div class="ag"><div>MA Media A</div><a href="ms_sure_learner?cmd=INVEST_MKT&ma=MA">Set Marketing Expense</a></div><div class="ag"><div>MB Media B</div><a href="ms_sure_learner?cmd=INVEST_MKT&ma=MB">Set Marketing Expense</a></div>`,
  b2b: () => `<div class="card"><div>OFFER</div><div>OFFER 12</div><div>Client : Cafe X Product : Americano 3,000 Unit</div><div>Each : 14 EUR</div>${S.offers[12] === "open" ? `<a href="ms_sure_learner?cmd=B2B_ACCEPT&id=12">Accept</a>` : "<div>We participated</div>"}</div>
    <div class="card"><div>OFFER</div><div>OFFER 13</div><div>Client : Hotel Y Product : Hot Chocolate 2,000 Unit</div><div>Max bid price allowed : 15.5</div><div>Minimum bidders : 2</div>${S.offers[13] === "open" ? `<a href="ms_sure_learner?cmd=B2B_BID&id=13">Bid</a>` : "<div>We participated</div>"}</div>
    <div class="card"><div>OFFER</div><div>OFFER 14</div><div>Client : Shop Z Product : Americano 1,000 Unit</div><div>Each : 13 EUR</div>${S.offers[14] === "open" ? `<a href="ms_sure_learner?cmd=B2B_ACCEPT&id=14">Accept</a>` : "<div>We participated</div>"}</div>`,
  forecast: () => `<script>var c = {series: [{name: 'Berlin-Americano', data: [${Array.from({length: 30}, (_, i) => `[${i + 1},300]`).join(",")}]}, {name: 'Berlin-Hot Chocolate', data: [${Array.from({length: 30}, (_, i) => `[${i + 1},400]`).join(",")}]}]};</script>`,
};
const form = (q, inner, btn = "dbutton") => `<form method="post" action="ms_sure_learner?submit=1&step=GET_INPUT&cmd=${q.get("cmd")}${[...q].filter(([k]) => k !== "cmd").map(([k, v]) => `&${k}=${v}`).join("")}"><input type="hidden" name="cmd" value="${q.get("cmd")}">${inner}<input type="submit" id="${btn}" value="Submit"></form>`;
const FORM = {
  SPACE_MANAGE: q => { const ac = q.get("ac"), s = S.shops[ac] || S.whs[ac];
    return form(q, `<p>Area needed (m2) <input type="text" name="rent${ac}" value="${s.area}"> <button type="button">+</button></p><p>Terms <select name="terms${ac}"><option value="1">Daily (no discount)</option><option value="7">7-Day (20% discount)</option><option value="30" selected>30-Day (60% discount)</option></select></p>`); },
  BUY_FG: q => form(q, `<p>Destination <select name="destination_rtl"><option value="">Destination</option><option value="11">Berlin Retail</option><option value="13">Hamburg Retail</option><option value="17">Cologne Retail</option></select></p>
    ${["P1", "P2", "P3"].map(k => `<p><select name="${k}">${opts(k)}</select></p>`).join("")}<p><select name="prtype"><option value="NormalC">Immediate delivery, cash on delivery</option></select></p>`, q.get("vc") === "1" ? "submit_button" : "dbutton"),
  BUY_RM: q => form(q, `<p><select name="destination_whs"><option value="">Destination</option><option value="27">Cologne Warehouse</option><option value="26">Dusseldorf Warehouse</option></select></p>
    ${["P4", "P5", "P6", "P7", "P8"].map(k => `<p><select name="${k}">${opts(k)}</select></p>`).join("")}<p><select name="prtype"><option value="NormalC">Immediate delivery</option></select></p>`),
  INVEST_MKT: q => form(q, `<table>${Object.entries(S.mkt[q.get("ma")]).map(([id, v]) => `<tr><td>${S.shops[id].name}</td><td><input type="text" name="invest${id}" value="${v}"></td></tr>`).join("")}</table><p>Amounts in EUR per day. Spending cannot be refunded.</p>`),
  B2B_ACCEPT: q => form(q, `<p>Accept offer ${q.get("id")}?</p><input type="hidden" name="id" value="${q.get("id")}">`),
  B2B_BID: q => form(q, `<p>Your bid price per unit <input type="text" name="bidprice" value=""></p><input type="hidden" name="id" value="${q.get("id")}">`),
};
const apply = (q, b) => {
  const cmd = q.get("cmd");
  if (S.fail === cmd) return "Error: not enough cash for this order";
  if (cmd === "SPACE_MANAGE") { const ac = q.get("ac"), s = S.shops[ac] || S.whs[ac], want = +b.get("rent" + ac), term = +b.get("terms" + ac);
    if (S.shops[ac] ? want % 50 : want % 500) return "Error: invalid area";
    S.cash -= s.rate*Math.max(0, want - s.area)*term*(term === 30 ? 0.4 : term === 7 ? 0.8 : 1); s.area = want; s.id = s.id || 900 + +ac; return "Rental updated."; }
  if (cmd === "BUY_FG" || cmd === "BUY_RM") { const dest = b.get(cmd === "BUY_FG" ? "destination_rtl" : "destination_whs"); if (!dest) return "Error: choose a destination";
    let cost = 0; for (const [k, v] of b) if (/^P\d$/.test(k) && v) { if (!TIERS.includes(+v)) return "Error: invalid quantity"; cost += +v*PRICE[k]; const st = cmd === "BUY_FG" ? S.stock[dest] : (S.wstock[dest] = S.wstock[dest] || {}); st[k] = (st[k] || 0) + +v; }
    if (S.fail !== "COD") S.cash -= cost; return "Order placed."; }
  if (cmd === "INVEST_MKT") { for (const [k, v] of b) if (/^invest\d+$/.test(k)) S.mkt[q.get("ma")][k.slice(6)] = +v; return "Marketing expense saved."; }
  if (cmd === "B2B_ACCEPT" || cmd === "B2B_BID") { S.offers[b.get("id")] = "in"; return `Thank you. ${cmd === "B2B_BID" ? "Bid " + b.get("bidprice") + " received" : "Offer accepted"}.`; }
  return "Unknown action";
};
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), q = u.searchParams; let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const send = (t, type = "text/html; charset=utf-8") => { res.writeHead(200, {"Content-Type": type, "Cache-Control": "no-store"}); res.end(t); };
    if (u.pathname === "/reader.js") return send(fs.readFileSync(READER, "utf8"), "text/javascript; charset=utf-8");
    if (u.pathname === "/game.html") return send(GAME);
    if (u.pathname === "/dash") return send(dash());
    if (u.pathname === "/calc/") return send(fs.readFileSync(new URL("./calc-stub.html", import.meta.url), "utf8"));
    if (u.pathname === "/reset") { reset({fail: q.get("fail") || ""}); return send("ok"); }
    if (u.pathname === "/log") return send(JSON.stringify({log, S}), "application/json");
    if (u.pathname === "/day") { S.day = +q.get("d"); return send("ok"); }
    if (u.pathname === "/m") { log.push({t: Date.now(), m: "GET", x: q.get("x")}); return send(page(MENU[q.get("x")]())); }
    if (u.pathname === "/ms_sure_learner") {
      const cmd = q.get("cmd");
      if (req.method === "POST") { const b = new URLSearchParams(body), r = apply(q, b); log.push({t: Date.now(), m: "POST", cmd, q: u.search, body, r});
        if (S.fail === "E500:" + cmd) { res.writeHead(500); return res.end("server error"); }   // the order went through, the answer didn't
        return send(page(`<div class="msg">${r}</div>`)); }
      log.push({t: Date.now(), m: "GET", cmd, q: u.search});
      if (cmd === "SPACE_CANCEL") return send(page("<div>Rental cancelled.</div>"));
      return send(page(FORM[cmd] ? FORM[cmd](q) : "Unknown"));
    }
    res.writeHead(404); res.end("nope");
  });
}).listen(PORT, () => console.log("game on " + PORT));
