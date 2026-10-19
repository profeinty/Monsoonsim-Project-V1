// Stand-in MonsoonSIM game for the FF bot: dashboard, action menus, forms, POST handling, a request log.
// The B2B, Sales Order, allocate, Web Market and machine screens copy the real 12i game's HTML (game-notes/screens.md).
import http from "node:http";
import fs from "node:fs";
const PORT = +process.argv[2] || 8790, READER = process.argv[3];
const TIERS = [1000, 3000, 5000, 8000, 12000, 20000, 30000, 40000, 50000, 60000, 80000, 100000, 120000];
const PRICE = {P1: 10, P2: 13, P3: 16, P4: 1, P5: 0.6, P6: 3, P7: 5, P8: 8};
const NAMES = {P1: "Americano", P2: "Hot Chocolate", P3: "Bubble Milk Tea", P4: "Plastic Cup", P5: "Straw", P6: "Coffee", P7: "Chocolate", P8: "Milk Tea"};
const DIM = {P1: 0.005, P2: 0.005, P3: 0.005, P4: 0.05, P5: 0.0006, P6: 0.0005, P7: 0.0005, P8: 0.0008};
const MACH = {1: {name: "Machine A", price: 300000, cap: 10000, m2: 200, staff: 2}, 2: {name: "Machine B", price: 200000, cap: 6000, m2: 150, staff: 1}};
const PLACE = {11: "Berlin Retail", 13: "Hamburg Retail", 17: "Cologne Retail", 26: "Dusseldorf Warehouse", 27: "Cologne Warehouse"};
const KEYS = ["id", "batchid", "productCode", "from", "to", "qnt", "qntAlloc", "dayIn", "priority", "exp", "status"];
let S, log, REAL_CALC = false;
const so = (id, o) => ({id, product: "P1", qty: 1000, kind: "bid", maxBid: 15, each: null, minBidders: 1, due: 9, penalty: 6000, ourBid: null, bids: [], req: 2, result: 3, status: "Completed", allocated: 0, allocDay: null, delivered: null, offer: id - 11, ...o});
const reset = (o = {}) => {
  S = {day: 5, maxDay: 30, cash: +o.cash || 500000, od: 0,
    shops: {11: {name: "Berlin", rate: 52, area: 250, id: 501}, 13: {name: "Hamburg", rate: 48, area: 0}, 17: {name: "Cologne", rate: 45, area: 100, id: 502}},
    whs: {26: {name: "Dusseldorf", rate: 5, area: 1000, id: 601}, 27: {name: "Cologne", rate: 5, area: 0}},
    stock: {11: {P1: 2000, P2: 1000, P3: 500}, 13: {P1: 0, P2: 0, P3: 0}, 17: {P1: 100, P2: 100, P3: 100}}, wstock: {26: {}},
    mkt: {MA: {11: 5000, 13: 0, 17: 2000}, MB: {11: 0, 13: 0, 17: 0}}, offers: {12: "open", 13: "open", 14: "open"}, fail: o.fail || "",
    machines: [], prdline: "", posts: [], pos: [], draft: null, allocErr: [], nextBatch: 9000,
    web: [{id: 151, product: "P1", price: 9, qty: 500, days: 2, seller: "TGED"}, {id: 152, product: "P2", price: 12.5, qty: 300, days: 3, seller: "Bolo"},
      {id: 122, product: "P3", price: 99999999.99, qty: 500, days: 5, seller: "TGED"}, {id: 153, product: "P3", price: 15, qty: 200, days: 2, seller: "Neo"}],
    // the B2B Sales Order list: finished history (a win, a loss, a void, a tie lost, an old win) and, with ?so=1, two won orders to ship
    sos: [so(705, {product: "P1", qty: 3000, ourBid: 12, bids: [["FF", 12, 1], ["booyah", 12.4]], status: "Completed", allocated: 3000, allocDay: 3, delivered: 4, req: 1}),
      so(704, {product: "P3", qty: 9000, maxBid: 23, minBidders: 2, ourBid: 18, bids: [["FF", 18]], status: "Cancelled", req: 1}),
      so(703, {product: "P3", qty: 10000, maxBid: 22, ourBid: 20.5, bids: [["3 imut", 19.9, 1], ["FF", 20.5]], status: "Cancelled", req: 1}),
      so(706, {product: "P2", qty: 5000, maxBid: 16, ourBid: 15, bids: [["TGED", 15, 1], ["FF", 15]], status: "Cancelled", req: 1}),
      so(707, {product: "P1", qty: 2000, maxBid: 14, ourBid: 11.2, bids: [["FF", 11.2, 1], ["TGED", 13.1], ["Neo", 13.9]], status: "Completed", allocated: 2000, allocDay: 1, delivered: 2, req: 1}),
      so(708, {product: "P1", qty: 6000, maxBid: 12, ourBid: 11, bids: [["Neo", 10.5, 1], ["FF", 11]], status: "Cancelled", req: 1}),
      so(709, {product: "P3", qty: 8000, maxBid: 21, ourBid: 19.5, bids: [["FF", 19.5, 1]], status: "Completed", allocated: 8000, allocDay: 2, delivered: 3, req: 1})],
    wsos: [], soOn: !!o.so};
  if (o.so) {
    S.sos.unshift(so(701, {product: "P1", qty: 4000, due: 8, ourBid: 13.5, bids: [["FF", 13.5, 1], ["TGED", 14.2]], status: "In Progress", req: 3, result: 4}),
      so(702, {product: "P2", qty: 2000, kind: "fixed", maxBid: null, each: 14, due: 7, status: "In Progress", allocated: 500, req: 4, result: null}));
    S.wsos.push({id: 801, product: "P1", qty: 200, allocated: 0, buyer: "Web buyer"});
  }
  if (o.so || o.wfg) S.wstock[26] = {P1: 5000, P2: 1000};
  if (o.mach) { S.machines = [{id: 9001, mac: 1, lc: 26, setup: "P1", made: 10000}, {id: 9002, mac: 2, lc: 26, setup: "P2", made: 0}]; S.wstock[26] = {...S.wstock[26], P4: 30000, P5: 60000, P6: 20000}; }
  // the stock as batches, for the allocate screen: the warehouse's in two lots each, a store's in one
  S.batches = [];
  for (const [lc, st] of Object.entries(S.wstock)) for (const [pc, q] of Object.entries(st)) if (q > 0 && /^P[123]$/.test(pc)) {
    const a = Math.round(q*0.6); S.batches.push({id: S.nextBatch++, lc: +lc, pc: +pc.slice(1), batch: `b${lc}_${pc}_1`, qnt: a, dayIn: 2, priority: 0}, {id: S.nextBatch++, lc: +lc, pc: +pc.slice(1), batch: `b${lc}_${pc}_2`, qnt: q - a, dayIn: 4, priority: 0});
  }
  for (const [lc, st] of Object.entries(S.stock)) for (const [pc, q] of Object.entries(st)) if (q > 0) S.batches.push({id: S.nextBatch++, lc: +lc, pc: +pc.slice(1), batch: `b${lc}_${pc}`, qnt: q, dayIn: 1, priority: 1});
  log = [];
};
reset();
const page = body => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
const opts = (k, cur) => `<option value="">${NAMES[k]}</option>` + TIERS.map(t => `<option value="${t}"${cur == t ? " selected" : ""}>${t.toLocaleString("en")}</option>`).join("");
const used = lc => Math.round(Object.entries(S.wstock[lc] || {}).reduce((a, [k, q]) => a + q*DIM[k], 0) + S.machines.filter(m => m.lc == lc).reduce((a, m) => a + MACH[m.mac].m2, 0));
const dash = () => `<div id="KPI_DAY____">${S.day} / ${S.maxDay}</div>
<div>Cash in Bank</div><div>${Math.round(S.cash).toLocaleString("en")}</div><div>Overdraft Used</div><div>${S.od}</div><div>Delinquent Payouts</div><div>0</div>
<div>Cost - Americano</div><div>7.43</div><div>Cost - Hot Chocolate</div><div>12.52</div><div>Cost - Bubble Milk Te...</div><div>13.48</div>
<div id="RTL">${Object.entries(S.shops).filter(([, s]) => s.area > 0).map(([ac, s]) => `<div class="kpi_title">${s.name} Retail</div><ul>${["P1", "P2", "P3"].map(p => `<li>${NAMES[p]} @ 20 <span class="right">${S.stock[ac][p].toLocaleString("en")}</span></li>`).join("")}<li>Space utilization (40%) ${Math.round(Object.values(S.stock[ac]).reduce((a, b) => a + b, 0)*0.005)} / ${s.area}</li></ul>`).join("")}</div>
<div id="WHS">${Object.entries(S.wstock).filter(([lc, st]) => S.whs[lc].area > 0 && Object.values(st).some(q => q > 0)).map(([lc, st]) => `<div>${S.whs[lc].name} Warehouse</div>${Object.entries(st).filter(([, q]) => q > 0).map(([k, q]) => `<div>${NAMES[k]}</div><div>${q.toLocaleString("en")}</div>`).join("")}
<div>Machines</div><div>${S.machines.filter(m => m.lc == lc).length}</div><div>Space utilization (${Math.round(100*used(lc)/S.whs[lc].area)}%) ${used(lc).toLocaleString("en")} / ${S.whs[lc].area.toLocaleString("en")}</div>`).join("")}</div>`;
const menus = `<a id="MENU2_retail_location" href="m?x=retail_location">Retail Location</a> <a id="MENU2_whs_location" href="m?x=whs_location">Warehouse Location</a>
<a id="MENU2_retail_vendor" href="m?x=retail_vendor">Retail Vendor</a> <a id="MENU2_warehouse_vendor" href="m?x=warehouse_vendor">Warehouse Vendor</a>
<a id="MENU2_retail_media" href="m?x=retail_media">Media</a> <a id="MENU2_B2Bincm" href="m?x=b2b">B2B Offers</a> <a id="MENU2_B2Bsoxx" href="m?x=b2bso">B2B Sales Order 1</a>
<a id="MENU2_chart_rtl_forecast" href="m?x=forecast">Forecast</a> <a id="MENU2_MODE_RTL_SALES" href="m?x=rtl_sales">Retail Sales &amp; Price</a>
<a id="MENU2_PRDbuymach" href="m?x=buymach">Buy Machine</a> <a id="MENU2_PRDmach" href="m?x=mach">Machines List</a> <a id="MENU2_PRDdail" href="m?x=dail">Daily Production</a> <a id="MENU2_PRDpord" href="m?x=pord">Production Priority</a>
<a id="MENU2_web1" href="m?x=web1">Web Market</a> <a id="MENU2_web_pos" href="m?x=web_pos">Web Purchase Order</a> <a id="MENU2_web_sos" href="m?x=web_sos">Web Sales Order</a>`;
const GAME = page(`${menus}<div id="dash">${dash()}</div><script>
setInterval(async () => { document.getElementById("dash").innerHTML = await (await fetch("dash")).text(); }, 300);
</script>`);
const space = (list, kind) => Object.entries(list).map(([ac, s]) => `<div class="loc"><div><b>Location: ${s.name}</b></div><div>Specification</div><div>${kind} Rental:${s.rate} EUR/Day/m2 Overflow Fee:61 EUR/Day/m2</div>
${s.area ? `<div>${kind === "Warehouse" ? `Current Area: Current:${s.area} m2Contract:30 Day Auto Renew Day: 84` : `Current Area: ${s.area} m2 : 30-Day, Auto Renew Day: 92`}</div><a href="ms_sure_learner?cmd=SPACE_MANAGE&ac=${ac}&id=${s.id}&edit=1">Rental Manage</a> <a href="ms_sure_learner?cmd=SPACE_CANCEL&ac=${ac}&id=${s.id}">Cancel</a>`
  : `<a href="ms_sure_learner?cmd=SPACE_MANAGE&ac=${ac}">Rent ${kind} Space</a>`}</div>`).join("");
// a B2B offer card as the real game writes it: OFFER / number, then a Deal or Bid link, "We participated" or "Taken by others"
const offer = (id, client, p, qty, terms, link, extra = "") => `<div id="row${id}"><div><div><div><span>Items:</span><div><h6></h6><h6>OFFER</h6><b>${id}</b><ol><li><div> Client : ${client} <br> Product : <b>${NAMES[p]}</b> ${qty.toLocaleString("en")} Unit<br>${terms}<span>Expected Delivery Day : </span>9<br><span>Late penalty : </span>6000 EUR / Day <br><span>Terms of Payment : </span>Cash </div></li></ol></div></div>
  <div><span>Timetable:</span><div><ul><li><b>Timeline</b><span>Day</span></li><li>Requested<span>4</span></li>${extra}</ul></div></div><div><span>Status:</span><div><h6></h6>${S.offers[id] === "open" ? link : "<span>We participated</span>"}<span id="buttonrefresh${id}"></span></div></div></div></div></div>`;
// a B2B Sales Order row as the real game writes it: every team's bid, the allocation, the timeline, the status
const soRow = o => `<div id="row${o.id}"><div><div><div><span>Items:</span><div><h6></h6><h6>B2B SO</h6><b>${o.id}</b><ol><li><div><div> B2B ${o.kind === "bid" ? "Bid" : "Deal"} </div> Client : VIP Ltd <br> Product : <b>${NAMES[o.product]}</b> ${o.qty.toLocaleString("en")} Unit<br>
  ${o.kind === "bid" ? `<span>Max bid price allowed : </span>${o.maxBid} EUR<br><span>Minimum bidders : </span>${o.minBidders}<br>` : `<span>Each : </span>${o.each} EUR <br>`}<span>Expected Delivery Day : </span>${o.due}<br><span>Late penalty : </span>${o.penalty} EUR / Day <br><span>Terms of Payment : </span>Cash <br>Offer ID : ${o.offer}<br>
  ${o.kind === "bid" ? `<b> We Bid ${o.ourBid} EUR</b><br>Participant Bid : (EUR)<ul>${o.bids.map(([t, p, w]) => `<li>${t} ${p}${w ? " (<b>WINNER!</b>)" : ""}</li>`).join("")}</ul>` : ""}</div></li>
  ${o.status === "Cancelled" ? "" : `<div><div><span><strong>${o.allocated ? NAMES[o.product] + " " : ""}${o.allocated.toLocaleString("en")} / ${o.qty.toLocaleString("en")}</strong></span><span><meter value="${Math.round(100*o.allocated/o.qty)}"></meter></span></div></div>`}
  ${o.status === "In Progress" && o.allocated < o.qty ? `<a href="ms_sure_learner?cmd=B2BECM_SOS_ALLOC_FAST&id=${o.id}&tpe=B2B&unique=${o.id}"><span>Allocate, Pack, and Ship</span></a>` : ""}<br>Triggered By : Someone</ol></div></div>
  <div><span>Timetable:</span><div><ul><li>Total:<span>${Math.round(o.qty*(o.ourBid || o.each)).toLocaleString("en")} EUR</span></li></ul><br><ul><li><b>Timeline</b><span>Day</span></li><li>Requested<span>${o.req}</span></li><li>Approved<span>${o.req}</span></li>
  ${o.result ? `<li>Bid Result Day<span>${o.result}</span></li><li>Bid Awarded Day<span>${o.result}</span></li>` : ""}${o.allocDay ? `<li>Fully Allocated Day<span>${o.allocDay}</span></li>` : ""}<li>Delivered<span>${o.delivered || ""}</span></li></ul></div></div>
  <div><span>Status:</span><div><h6></h6><h6>${o.status}</h6><span id="buttonrefresh${o.id}"><span><i></i></span></span><span id="refresh_msg${o.id}"></span></div></div></div></div></div>`;
const soPage = (from, to) => `${S.sos.slice(from, to).map(soRow).join("")}${S.sos.length > to ? `<div id="content5${to}"><div><a id="loadmore" href="table_record?cmd=LIST&amp;latestPage=${to}&amp;cmd=LIST&amp;mode=MODE_TRANSACTION&amp;tpe=B2BSOS">Load More (${S.sos.length - to} to go)</a></div></div>` : ""}`;
// the allocate screen: its script carries the order (prodData) and every batch of that product (oriData), as the real one
const allocForm = (q, o, to) => {
  const pc = +o.product.slice(1), docks = [26, 27, 11, 13, 17], bs = S.batches.filter(b => b.pc === pc);
  const js = v => JSON.stringify(v).replace(/"(\w+)":/g, "$1:").replace(/"/g, "'");
  return `<form id="myfaceboxstatus" method="post" action="ms_sure_learner?submit=1&step=GET_INPUT&cmd=B2BECM_SOS_ALLOC_FAST&id=${o.id}&tpe=${q.get("tpe")}&unique=${o.id}" style="width:700px"><h2>Allocate</h2>
  <table><tr><th>Sales Order ID</th><th>Buyer</th><th>Product</th><th>Quantity</th><th>Need Day</th><th>Allocated</th></tr><tr><th>${o.id}</th><td>VIP Ltd</td><td>${NAMES[o.product]}</td><td>${o.qty.toLocaleString("en")} Unit</td><td>${o.due || 8}</td><td><span id="pd${pc}">${o.allocated}</span></td></tr></table>
  <input type="hidden" id="hidBatchData" name="hidBatchData" value=""><div>Click the icon to allocate.</div><div id="t${to}"><ul>${docks.map(lc => `<li><a href="#t${to}-${lc}">${PLACE[lc]}</a></li>`).join("")}</ul>
  ${docks.map(lc => `<div id="t${to}-${lc}"><div class="all-area"><div class="drag-area${lc} drag-area" id="sourceDock${lc}" lc="${lc}"><div class="area${lc}">${PLACE[lc]}</div></div></div></div>`).join("")}</div>
  <input type="button" value="Reset" id="btnMoveStkReset"><i id="submit_button"><input type="submit" value="Allocate" id="dbutton"></i></form>
  <script>$(document).ready(function() { const prodDataOri = ${js({pc, qntNeed: o.qty, qntAlloc: o.allocated, name: NAMES[o.product], color: "#d9fcde"})}; const prodData = ${js({pc, qntNeed: o.qty, qntAlloc: o.allocated, name: NAMES[o.product], color: "#d9fcde"})};
  const locData = [${docks.join(",")}]; const oriData = ${js(bs.map(b => ({id: b.id, lc: b.lc, pc: b.pc, name: NAMES["P" + b.pc], batch: b.batch, status: 0, qnt: b.qnt, qntAlloc: 0, exp: 999, dayIn: b.dayIn, priority: b.priority, color: "#d9fcde"})))};
  const fmcg = 'N'; let updateData = []; //default set
  let allowPartialMove = 1;
  function addBatchData(id, batchid, prodCode, from, to, qnt, qntAlloc, exp, dayIn, priority, status) { let newUpdData = {}; newUpdData.id = id; return newUpdData; }
  $('.boxMove').on('click', function (event) { let box = $(this).closest('.box'); let loc = box.parent().attr('lc'); updateData.push(addBatchData(boxId, batch, pc, loc, '${to}', qnt, qnt, exp, dayIn, priority, status)); });
  $('#dbutton').click(function() { $('#hidBatchData').val(JSON.stringify(updateData)); }); });</script>`;
};
const webRow = w => `<div id="row${w.id}"><div><div><h6>WTS</h6> ID: <span><b>${w.id}</b><ol><li><div><b>${NAMES[w.product]}<div></div><br></b><ul><li><b>Price: </b><span>${w.price.toLocaleString("en", {minimumFractionDigits: 2})} EUR</span></li><li><b>Quantity: </b><span>${w.qty} Unit</span></li><li><b>Shipment: </b><span>${w.days} day</span></li><li><b>Seller: </b><span>${w.seller}</span></li><li><b>Rating: </b><span></span></li></ul></div></li></ol>
  ${w.seller === "FF" ? "" : `<span><a href="ms_sure_learner?cmd=TOBUY_ECM&amp;id=${w.id}&amp;unique=&amp;prc=${w.price.toFixed(2)}"><span>We buy</span></a></span>`}</span></div></div></div>`;
const dailyRows = () => [4, 3].map(d => `<tr><td>${d}</td><td><div>${S.machines.map(m => `<div><div>${m.id}</div><div>${NAMES[m.setup]}</div><div></div>${["P1", "P2", "P3"].map(p => `<div>${p === m.setup ? m.made : 0}</div>`).join("")}</div>`).join("")}</div></td></tr>`).join("");
const MENU = {
  retail_location: () => space(S.shops, "Retail"), whs_location: () => space(S.whs, "Warehouse"),
  retail_vendor: () => `<div class="vendor-box"><div>VFG1 Vendor 1</div><div>Americano 10 EUR Hot Chocolate 13 EUR Bubble Milk Tea 16 EUR Lead time 1 day</div><a href="ms_sure_learner?cmd=BUY_FG&loctype=RTL&vc=1">Procure Finished Goods</a></div>
    <div class="vendor-box"><div>VFG2 Vendor 2</div><div>Americano 11 EUR Hot Chocolate 14 EUR Bubble Milk Tea 17 EUR Lead time 1 day</div><a href="ms_sure_learner?cmd=BUY_FG&loctype=RTL&vc=2">Procure Finished Goods</a></div>`,
  warehouse_vendor: () => `<div class="vendor-box"><div>VRM3 Vendor 3</div><div>Plastic Cup 1 EUR Straw 0.6 EUR Coffee 3 EUR Chocolate 5 EUR Milk Tea 8 EUR</div><a href="ms_sure_learner?cmd=BUY_RM&loctype=WHS&vc=3">Procure Raw Materials</a></div>`,
  retail_media: () => `<div class="ag"><div>MA Media A</div><a href="ms_sure_learner?cmd=INVEST_MKT&ma=MA">Set Marketing Expense</a></div><div class="ag"><div>MB Media B</div><a href="ms_sure_learner?cmd=INVEST_MKT&ma=MB">Set Marketing Expense</a></div>`,
  b2b: () => `<div id="SlideTableMODE_TRANSACTIONB2B_IN">${offer(12, "Cafe X", "P1", 3000, "<span>Each : </span>14 EUR <br>", `<a href="ms_sure_learner?cmd=B2B_DEAL&amp;id=12&amp;ret=row12"><span>Deal</span></a>`)}
    ${offer(13, "Hotel Y", "P2", 2000, "<span>Max bid price allowed : </span>15.5 EUR<br><span>Minimum bidders : </span>2<br>", `<a href="ms_sure_learner?cmd=B2B_BID&amp;id=13&amp;ret=row13"><span>Bid</span></a>`, "<li>Bid Result Day<span><b>7</b></span></li>")}
    ${offer(14, "Shop Z", "P1", 1000, "<span>Each : </span>13 EUR <br>", `<a href="ms_sure_learner?cmd=B2B_DEAL&amp;id=14&amp;ret=row14"><span>Deal</span></a>`)}
    <div id="row15"><div><div><div><span>Items:</span><div><h6></h6><h6>OFFER</h6><b>15</b><ol><li><div> Client : Main Inc <br> Product : <b>Bubble Milk Tea</b> 4,000 Unit<br><span>Each : </span>15 EUR <br></div></li></ol></div></div><div><span>Status:</span><div><h6></h6>Taken by others</div></div></div></div></div></div>`,
  b2bso: () => `<h2>B2B Sales Order</h2><div id="SlideTableMODE_TRANSACTIONB2BSOS">${soPage(0, 5)}</div>`,
  forecast: () => `<script>var c = {series: [{name: 'Berlin-Americano', data: [${Array.from({length: 30}, (_, i) => `[${i + 1},300]`).join(",")}]}, {name: 'Berlin-Hot Chocolate', data: [${Array.from({length: 30}, (_, i) => `[${i + 1},400]`).join(",")}]}]};</script>`,
  rtl_sales: () => `<h2>Retail Sales &amp; Price</h2>${["P1", "P2", "P3"].map((p, i) => `<div>${NAMES[p]} Price <input type="text" name="price" value="20"> <a href="ms_sure_learner?cmd=CHANGE_RTL_PRC&p=${i + 1}">Change</a> <a href="ms_sure_learner?cmd=TRIGGER_RTL_PRICE&p=${i + 1}">Set</a></div>`).join("")}`,
  buymach: () => `<h2>Investor</h2><div>${Object.entries(MACH).map(([k, m]) => `<div><div><div><h6>Machines</h6></div><div><div><span> M${k}</span></div><div> ${m.name} </div></div><br><div><div> Costs </div><div> : ${m.price.toLocaleString("en")} EUR </div><div> Capacity </div><div> : ${m.cap.toLocaleString("en")}&nbsp;Unit/Day </div><div> Area </div><div> : ${m.m2} m2 </div><div> Staff Required </div><div> : ${m.staff} </div></div><div></div><hr><a href="ms_sure_learner?cmd=PRD_MACHINE_BUY&amp;mac=${k}"><span>Buy Machines</span></a></div></div>`).join("")}</div>`,
  mach: () => S.machines.map(m => `<div>Asset ID ${m.id} Type : ${MACH[m.mac].name} Age : 3 day Current Production capacity : ${MACH[m.mac].cap.toLocaleString("en")} Unit Setup for : ${NAMES[m.setup]} Timetable</div>`).join("") || "<div>No machine yet.</div>",
  dail: () => `<h2>Daily Production</h2><div><br>${["P1", "P2", "P3"].map(p => `Total Unit Produced ${NAMES[p]} : ${(2*S.machines.filter(m => m.setup === p).reduce((a, m) => a + m.made, 0)).toLocaleString("en")} (Unit)<br>`).join("")}Total Unit Produced : ${(2*S.machines.reduce((a, m) => a + m.made, 0)).toLocaleString("en")} (Unit)</div>
    <div><table id="table-2"><tbody><tr><td><b>Day</b></td><td><b><div><div><div>Machine</div><div>Machine setup for..</div><div></div><div>Produce Americano (unit)</div><div>Produce Hot Chocolate (unit)</div><div>Produce Bubble Milk Tea (unit)</div></div></div></b></td></tr>${dailyRows()}</tbody></table></div>`,
  pord: () => `<h2>Production Priority</h2><div><a href="ms_sure_learner?cmd=PRD_PRODUCT_ORDER"><span>Production Priority</span></a></div><div>${S.prdline ? "Order: " + S.prdline : "You have not set up which product to produce first."}</div>`,
  web1: () => `<h2>Web Market</h2><div><a href="ms_search?mode=MODE_ECM_RTL&amp;ret=MENU2_web_retail"><span>Search</span></a><a href="ms_sure_learner?cmd=WEB_POST&amp;ret=MENU2_web_retail"><span>+ Post</span></a></div><div id="SlideTableECM">${S.web.map(webRow).join("")}</div>`,
  web_pos: () => S.pos.map(p => `<div id="row${p.id}"><div>Web Purchase Order Seller : ${p.seller}, Product : ${NAMES[p.product]} ${p.qty} (Each) ${p.price} For ${PLACE[p.dest]}</div><div><span>Status:</span><div>In Escrow</div></div></div>`).join(""),
  web_sos: () => S.wsos.map(w => `<div id="row${w.id}"><div>Web Sales Order Buyer : ${w.buyer}, Product : ${NAMES[w.product]} ${w.qty} (Each) 20</div>${w.allocated < w.qty ? `<a href="ms_sure_learner?cmd=B2BECM_SOS_ALLOC_FAST&amp;id=${w.id}&amp;tpe=ECM&amp;unique=${w.id}"><span>Allocate, Pack, and Ship</span></a>` : ""}<div><span>Status:</span><div>${w.allocated < w.qty ? "In Progress" : "Shipped"}</div></div></div>`).join(""),
};
const form = (q, inner, btn = "dbutton") => `<form method="post" action="ms_sure_learner?submit=1&step=GET_INPUT&cmd=${q.get("cmd")}${[...q].filter(([k]) => k !== "cmd").map(([k, v]) => `&${k}=${v}`).join("")}"><input type="hidden" name="cmd" value="${q.get("cmd")}">${inner}<input type="submit" ${btn ? `id="${btn}" ` : ""}value="Submit"></form>`;
const bare = (action, inner, btn = `<input type="submit" id="dbutton" value="Submit">`) => `<form method="post" action="${action}">${inner}${btn}</form>`;   // a form as the real game writes it: no hidden cmd
const rented = () => [...Object.entries(S.whs).filter(([, w]) => w.area > 0).map(([lc]) => lc), ...Object.entries(S.shops).filter(([, s]) => s.area > 0).map(([ac]) => ac)];
const FORM = {
  SPACE_MANAGE: q => { const ac = q.get("ac"), s = S.shops[ac] || S.whs[ac];
    return form(q, `<p>Area needed (m2) <input type="text" name="rent${ac}" value="${s.area}"> <button type="button">+</button></p><p>Terms <select name="terms${ac}"><option value="1">Daily (no discount)</option><option value="7">7-Day (20% discount)</option><option value="30" selected>30-Day (60% discount)</option></select></p>`); },
  BUY_FG: q => form(q, `<p>Destination <select name="destination_rtl"><option value="">Destination</option><option value="11">Ship to : Berlin Retail</option><option value="13">Ship to : Hamburg Retail</option><option value="17">Ship to : Cologne Retail</option></select></p>
    ${["P1", "P2", "P3"].map(k => `<p><select name="${k}">${opts(k)}</select></p>`).join("")}<p><select name="prtype"><option value="NormalC">Immediate delivery, cash on delivery</option></select></p>`, q.get("vc") === "1" ? "submit_button" : "dbutton"),
  BUY_RM: q => form(q, `<p><select name="destination_whs"><option value="">Destination</option><option value="27">Ship to : Cologne Warehouse</option><option value="26">Ship to : Dusseldorf Warehouse</option></select></p>
    ${["P4", "P5", "P6", "P7", "P8"].map(k => `<p><select name="${k}">${opts(k)}</select></p>`).join("")}<p><select name="prtype"><option value="NormalC">Immediate delivery</option></select></p>`),
  INVEST_MKT: q => form(q, `<table>${Object.entries(S.mkt[q.get("ma")]).map(([id, v]) => `<tr><td><button type="button">-</button> <input type="text" name="invest${id}" value="${v}"> <button type="button">+</button></td></tr>`).join("")}</table><p>Amounts in EUR per day. Spending cannot be refunded.</p>`),
  B2B_DEAL: q => bare(`ms_sure_learner?submit=1&step=&cmd=B2B_DEAL&id=${q.get("id")}&ret=row${q.get("id")}`, `<p>Deal Buyer Cafe X Product Americano Quantity 3000 Total 42,000 EUR Expected Delivery Day 9</p>`, `<input type="submit" id="dbutton" value="Deal">`),
  B2B_BID: q => bare(`ms_sure_learner?submit=1&step=&cmd=B2B_BID&id=${q.get("id")}&ret=row${q.get("id")}`, `<p>Bid Buyer Hotel Y Product Hot Chocolate Quantity 2000 Max bid price allowed 15.5 Expected Delivery Day 9 Bid Price <input type="number" name="bidprice" value=""> <input type="range" value="1550"></p>`),
  B2BECM_SOS_ALLOC_FAST: q => { const ecm = q.get("tpe") === "ECM", o = ecm ? S.wsos.find(w => w.id == q.get("id")) : S.sos.find(x => x.id == q.get("id")); return o ? allocForm(q, o, ecm ? "ECM" : "B2B") : "<div>Nothing to allocate.</div>"; },
  TOBUY_ECM: q => bare(`ms_sure_learner?submit=1&step=&cmd=TOBUY_ECM&id=${q.get("id")}&unique=&prc=${q.get("prc")}`, `<p>We buy Seller ... Looks like a good one</p><p>Ship to <select name="destination" id="destination">${rented().map(lc => `<option value="${lc}">${PLACE[lc]}</option>`).join("")}</select></p>`, `<input type="submit" id="dbutton" value="Buy">`),
  WEB_POST: () => bare("ms_sure_learner?submit=1&step=NEED_PRODUCT&cmd=WEB_POST&ret=MENU2_web_retail", `<p>Are you sure? Please Select One <select name="BS_____"><option value="B">Post to Buy</option><option value="S">Post to Sell</option></select></p><p>Product <select name="pcode"><option value="p1">Americano</option><option value="p2">Hot Chocolate</option><option value="p3">Bubble Milk Tea</option></select></p>`, `<input type="submit" value="Submit">`),
  PRD_MACHINE_BUY: q => bare(`ms_sure_learner?submit=1&step=&cmd=PRD_MACHINE_BUY&mac=${q.get("mac")}`, `<p>Buy Machine Purchase ${MACH[q.get("mac")].name}</p><p>Warehouse <select name="lc">${Object.entries(S.whs).filter(([, w]) => w.area > 0).map(([lc]) => `<option value="${lc}">${PLACE[lc]}</option>`).join("")}</select></p>`, `<input type="submit" value="Submit">`),
  PRD_PRODUCT_ORDER: () => bare("ms_sure_learner?submit=1&step=&cmd=PRD_PRODUCT_ORDER", `<p>Production Priority Set <select name="PRDLINE"><option value="">Please Select One</option>${["1,2,3", "2,1,3", "1,3,2", "3,1,2", "2,3,1", "3,2,1"].map(v => `<option value="${v}">${v.split(",").map(i => NAMES["P" + i]).join(" - ")}</option>`).join("")}</select></p>`, `<input type="submit" value="Submit">`),
};
const STEP2 = bare("ms_sure_learner?submit=1&step=NEED_OPTION&cmd=WEB_POST&ret=MENU2_web_retail", `<p>Are you sure? We sell</p><p>Quantity(Unit) <button type="button">-</button><input type="text" name="qnt" value="500"><button type="button">+</button></p>
  <p>Price(Each) (EUR) <input type="text" name="PRC____" id="PRC____" value=""></p><p>Estimated Shipment (Day) <button type="button">-</button><input type="text" name="VD__DVT" value="1"><button type="button">+</button></p>
  <p>Type <select name="TPE____" id="TPE____"><option value="ONE">One Time Only</option><option value="REP">Post Until Paused</option></select></p>`);
const allocate = (q, b) => {   // checks hidBatchData as strictly as the game's own page would build it
  const ecm = q.get("tpe") === "ECM", o = ecm ? S.wsos.find(w => w.id == q.get("id")) : S.sos.find(x => x.id == q.get("id")), bad = m => { S.allocErr.push(m); return "Error: invalid batch data (" + m + ")"; };
  if (!o) return "Error: no such order";
  let list; try { list = JSON.parse(b.get("hidBatchData") || ""); } catch (e) { return bad("not JSON"); }
  if (!Array.isArray(list) || !list.length) return bad("empty");
  let tot = 0;
  for (const x of list) {
    if (Object.keys(x).join() !== KEYS.join()) return bad("keys " + Object.keys(x).join());
    const t = {id: "string", batchid: "string", productCode: "string", from: "string", to: "string", qnt: "number", qntAlloc: "number", dayIn: "number", priority: "string", exp: "number", status: "number"};
    for (const k of KEYS) if (typeof x[k] !== t[k]) return bad(`${k} is ${typeof x[k]}`);
    const bt = S.batches.find(y => String(y.id) === x.id);
    if (!bt || bt.batch !== x.batchid || String(bt.lc) !== x.from || String(bt.pc) !== x.productCode || String(bt.priority) !== x.priority || bt.qnt !== x.qnt) return bad("batch " + x.id + " doesn't match");
    if (x.to !== (ecm ? "ECM" : "B2B")) return bad("to " + x.to);
    if ("P" + bt.pc !== o.product || !(x.qntAlloc > 0) || x.qntAlloc > bt.qnt) return bad("amount " + x.qntAlloc);
    tot += x.qntAlloc;
  }
  if (o.allocated + tot > o.qty) return bad("more than the order needs");
  for (const x of list) { const bt = S.batches.find(y => String(y.id) === x.id); bt.qnt -= x.qntAlloc; const st = bt.priority ? S.stock[bt.lc] : S.wstock[bt.lc]; st["P" + bt.pc] -= x.qntAlloc; }
  o.allocated += tot; if (o.allocated === o.qty) o.allocDay = S.day;
  return `Allocated ${tot}.`;
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
  if (cmd === "B2B_DEAL" || cmd === "B2B_BID") { const id = q.get("id"); S.offers[id] = "in";
    if (cmd === "B2B_DEAL" && S.soOn) S.sos.unshift({...so(710 + S.sos.length, {product: "P1", qty: 3000, kind: "fixed", maxBid: null, each: 14, status: "In Progress", req: S.day, result: null}), offer: +id});
    return `Thank you. ${cmd === "B2B_BID" ? "Bid " + b.get("bidprice") + " received" : "Offer accepted"}.`; }
  if (cmd === "B2BECM_SOS_ALLOC_FAST") return allocate(q, b);
  if (cmd === "TOBUY_ECM") { const w = S.web.find(x => x.id == q.get("id")); if (!w) return "Sorry, this item is no longer available.";
    const dest = b.get("destination"); if (!PLACE[dest]) return "Error: choose a destination";
    S.cash -= w.price*w.qty; const st = S.whs[dest] ? (S.wstock[dest] = S.wstock[dest] || {}) : S.stock[dest]; st[w.product] = (st[w.product] || 0) + w.qty;
    S.web = S.web.filter(x => x !== w); S.pos.push({id: 300 + S.pos.length, seller: w.seller, product: w.product, qty: w.qty, price: w.price, dest: +dest}); return "Funds are in escrow until the goods arrive."; }
  if (cmd === "WEB_POST") {
    if (q.get("step") === "NEED_PRODUCT") { S.draft = {bs: b.get("BS_____"), pcode: b.get("pcode")}; return null; }   // the second screen
    if (!S.draft) return "Error: start the post again";
    const p = {...S.draft, qnt: b.get("qnt"), price: b.get("PRC____"), days: b.get("VD__DVT"), type: b.get("TPE____")}; S.posts.push(p); S.draft = null;
    S.web.push({id: 400 + S.posts.length, product: "P" + p.pcode.slice(1), price: +p.price, qty: +p.qnt, days: +p.days, seller: "FF"}); return "Your post is now on the Web Market."; }
  if (cmd === "PRD_MACHINE_BUY") { const m = MACH[q.get("mac")], lc = b.get("lc"); if (!m || !S.whs[lc]) return "Error: choose a warehouse";
    S.cash -= m.price; S.machines.push({id: 9100 + S.machines.length, mac: +q.get("mac"), lc: +lc, setup: "P1", made: 0}); return "Machine purchased."; }
  if (cmd === "PRD_PRODUCT_ORDER") { if (!b.get("PRDLINE")) return "Error: please select one"; S.prdline = b.get("PRDLINE"); return "Production priority saved."; }
  return "Unknown action";
};
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), q = u.searchParams; let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const send = (t, type = "text/html; charset=utf-8") => { res.writeHead(200, {"Content-Type": type, "Cache-Control": "no-store"}); res.end(t); };
    if (/PRC|PRICE/i.test([...q.getAll("cmd"), ...new URLSearchParams(body).getAll("cmd")].join(" "))) log.push({t: Date.now(), m: "PRICE", q: u.search});   // must never happen
    if (u.pathname === "/reader.js") return send(fs.readFileSync(READER, "utf8"), "text/javascript; charset=utf-8");
    if (u.pathname === "/game.html") return send(GAME);
    if (u.pathname === "/dash") return send(dash());
    if (u.pathname === "/calc/") return send(fs.readFileSync(new URL(REAL_CALC ? "../calc/index.html" : "./calc-stub.html", import.meta.url), "utf8"));   // /reset?calc=real: the real calculator
    if (u.pathname === "/reset") { REAL_CALC = q.get("calc") === "real"; reset({fail: q.get("fail") || "", so: q.get("so") === "1", wfg: q.get("wfg") === "1", mach: q.get("mach") === "1", cash: q.get("cash")}); return send("ok"); }
    if (u.pathname === "/log") return send(JSON.stringify({log, S}), "application/json");
    if (u.pathname === "/day") { S.day = +q.get("d"); return send("ok"); }
    if (u.pathname === "/m") { log.push({t: Date.now(), m: "GET", x: q.get("x")}); return send(page(MENU[q.get("x")]())); }
    if (u.pathname === "/table_record") { log.push({t: Date.now(), m: "GET", x: "list:" + q.get("tpe"), q: u.search}); const from = +q.get("latestPage") || 0; return send(page(soPage(from, from + 5))); }
    if (u.pathname === "/ms_sure_learner") {
      const cmd = q.get("cmd");
      if (req.method === "POST") { const b = new URLSearchParams(body), r = apply(q, b); log.push({t: Date.now(), m: "POST", cmd, q: u.search, body, r});
        if (S.fail === "E500:" + cmd) { res.writeHead(500); return res.end("server error"); }   // the order went through, the answer didn't
        return send(page(r === null ? STEP2 : `<div class="msg">${r}</div>`)); }
      log.push({t: Date.now(), m: "GET", cmd, q: u.search});
      if (cmd === "SPACE_CANCEL") return send(page("<div>Rental cancelled.</div>"));
      return send(page(FORM[cmd] ? FORM[cmd](q) : "Unknown"));
    }
    res.writeHead(404); res.end("nope");
  });
}).listen(PORT, () => console.log("game on " + PORT));
