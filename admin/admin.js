// Wellitas admin panel — single-page app over /api/admin. Hash routes: #/orders, #/products/12, …
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const img = f => (!f ? "" : /^(\/|https?:)/.test(f) ? f : `../assets/img/${f}`);
const when = s => { if (!s) return ""; const d = new Date(s.replace(" ", "T") + "Z"); return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); };
const day = s => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const view = $("#view");
let ME = null, SETTINGS = null;

async function api(path, opts = {}) {
  const res = await fetch("/api/admin" + path, {
    method: opts.method || "GET", credentials: "same-origin",
    headers: opts.raw ? { "Content-Type": opts.type } : { "Content-Type": "application/json" },
    body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("Please log in"); }
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast on" + (bad ? " bad" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 2800);
}
const fail = e => toast(e.message, true);
const crumbs = (...parts) => ($("#crumbs").innerHTML = parts.map((p, i) => (Array.isArray(p) ? `<a href="${p[1]}">${h(p[0])}</a>` : h(p))).join(" › "));

/* ---------- status badges ---------- */
const PAY = { pending: ["Payment pending", "warn"], paid: ["Paid", "good"], failed: ["Failed", "bad"], refunded: ["Refunded", "info"], partially_refunded: ["Partly refunded", "info"] };
const FUL = { unfulfilled: ["Unfulfilled", "warn"], packed: ["Packed", "info"], shipped: ["Shipped", "info"], out_for_delivery: ["Out for delivery", "info"], delivered: ["Delivered", "good"], rto: ["RTO", "bad"], returned: ["Returned", "bad"] };
const badge = (map, k, extra) => { const [l, c] = map[k] || [k, ""]; return `<span class="badge ${c}">${h(l)}${extra ? " · " + h(extra) : ""}</span>`; };
const payBadge = o => (o.status === "cancelled" ? `<span class="badge bad">Cancelled</span>` : badge(PAY, o.paymentStatus, o.paymentMethod === "cod" && o.paymentStatus === "pending" ? "COD" : ""));

/* ---------- modal form helper ---------- */
function modal(html, onSubmit) {
  const m = $("#modal"), box = $("#modalBox");
  box.innerHTML = `<form class="form" id="mForm">${html}<p class="err" id="mErr"></p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="b" data-x>Cancel</button><button class="b b--primary">Save</button></div></form>`;
  m.hidden = false;
  const close = () => (m.hidden = true);
  $("[data-x]", box).onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  $("#mForm").onsubmit = async e => {
    e.preventDefault();
    const btn = $("button.b--primary", box); btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(e.target)), e.target); close(); }
    catch (ex) { $("#mErr").textContent = ex.message; }
    finally { btn.disabled = false; }
  };
  $("input, select, textarea", box)?.focus();
}

/* ---------- SVG bar chart ---------- */
function barChart(series, key = "sales", fmt = inr) {
  const W = 800, H = 220, P = { l: 52, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...series.map(d => d[key]));
  const bw = (W - P.l - P.r) / Math.max(1, series.length);
  const y = v => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = [0, .5, 1].map(f => Math.round(max * f));
  const every = Math.ceil(series.length / 10);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${key} by day">
    ${ticks.map(t => `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${P.l - 6}" y="${y(t) + 3}" text-anchor="end">${fmt(t)}</text>`).join("")}
    ${series.map((d, i) => `<rect class="bar" x="${P.l + i * bw + bw * .15}" y="${y(d[key])}" width="${bw * .7}" height="${Math.max(0, H - P.b - y(d[key]))}" rx="2"><title>${day(d.date)}: ${fmt(d[key])} · ${d.orders} orders</title></rect>
      ${i % every === 0 ? `<text class="axis" x="${P.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${day(d.date)}</text>` : ""}`).join("")}
  </svg>`;
}
const hbars = (rows, label, val, fmt = inr) => {
  const max = Math.max(1, ...rows.map(r => r[val]));
  return rows.length ? rows.map(r => `<div class="hbar"><div><div class="small">${label(r)}</div><i><b style="width:${(100 * r[val]) / max}%"></b></i></div><div class="right nowrap">${fmt(r[val])}</div></div>`).join("")
    : `<p class="muted small">No data yet</p>`;
};
const delta = (now, prev) => {
  if (!prev) return now ? `<em class="up">new</em>` : `<em class="muted">—</em>`;
  const d = Math.round((100 * (now - prev)) / prev);
  return `<em class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}%</em> <em class="muted">vs previous</em>`;
};

/* =============================================================== router */
const ROUTES = [
  [/^\/?$/, home], [/^\/orders$/, orders], [/^\/orders\/([\w-]+)$/, order], [/^\/products$/, products], [/^\/products\/(new|\d+)$/, productEdit],
  [/^\/inventory$/, inventory], [/^\/customers$/, customers], [/^\/customers\/(\d+)$/, customer], [/^\/checkouts$/, checkouts],
  [/^\/discounts$/, discounts], [/^\/marketing$/, marketing], [/^\/reports$/, reports], [/^\/settings$/, settings],
];
async function route() {
  if (!ME) return;
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const params = new URLSearchParams(qs || "");
  const sec = path.split("/")[1] || "home";
  $$(".side__nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === sec));
  $("#side").classList.remove("open");
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      view.innerHTML = `<p class="muted">Loading…</p>`;
      try { await fn(params, ...m.slice(1)); } catch (e) { if (e.message !== "Please log in") view.innerHTML = `<div class="card err">${h(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  view.innerHTML = `<div class="card">Page not found</div>`;
}
addEventListener("hashchange", route);
const go = (path, params) => { const q = params && new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString(); location.hash = path + (q ? "?" + q : ""); };

/* =============================================================== auth */
function showLogin() { ME = null; $("#app").hidden = true; $("#login").hidden = false; }
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  try { await api("/login", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); await boot(); }
  catch (ex) { $("#loginErr").textContent = ex.message; }
};
$("#logout").onclick = async () => { await api("/logout", { method: "POST" }).catch(() => {}); showLogin(); };
$("#sideToggle").onclick = () => $("#side").classList.toggle("open");

async function boot() {
  try { ME = await api("/me"); } catch { return showLogin(); }
  SETTINGS = await api("/settings");
  $("#login").hidden = true; $("#app").hidden = false;
  $("#meName").textContent = ME.name || ME.email;
  const mode = ME.payments;
  const pb = $("#payBanner");
  pb.hidden = mode === "live";
  pb.innerHTML = { demo: "Online payments are in <b>demo mode</b> — no real money is collected. Add your Razorpay keys to go live (see the setup guide).",
    test: "Razorpay is in <b>test mode</b> — payments are simulated. Switch to live keys before launch.",
    off: "Online payments are <b>off</b> — customers can only use cash on delivery. Add Razorpay keys to accept UPI and cards." }[mode] || "";
  refreshCounts();
  route();
}
async function refreshCounts() {
  const d = await api("/dashboard?days=1").catch(() => null);
  if (!d) return;
  $("#navOrders").textContent = d.todo.toFulfil || "";
  $("#navStock").textContent = d.todo.lowStock || "";
  $("#navAbandoned").textContent = d.todo.abandoned || "";
}

/* =============================================================== home */
async function home(p) {
  const days = p.get("days") || "30";
  crumbs("Home");
  const d = await api(`/dashboard?days=${days}`);
  const s = d.summary, pv = d.previous;
  const f = s.funnel, fmax = Math.max(1, f.page_view);
  view.innerHTML = `
  <div class="head"><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</h1>
    <div class="row">${[["1", "Today"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"]].map(([v, l]) => `<a class="b b--sm ${v === days ? "b--primary" : ""}" href="#/?days=${v}">${l}</a>`).join("")}</div></div>
  <div class="kpis">
    <div class="kpi"><p>Total sales</p><strong>${inr(s.gross)}</strong>${delta(s.gross, pv.gross)}</div>
    <div class="kpi"><p>Orders</p><strong>${s.orders}</strong>${delta(s.orders, pv.orders)}</div>
    <div class="kpi"><p>Average order value</p><strong>${inr(s.aov)}</strong>${delta(s.aov, pv.aov)}</div>
    <div class="kpi"><p>Store visitors</p><strong>${s.sessions}</strong>${delta(s.sessions, pv.sessions)}</div>
    <div class="kpi"><p>Conversion rate</p><strong>${s.conversion}%</strong><em class="muted">visitors who bought</em></div>
  </div>
  <div class="grid2">
    <div>
      <div class="card"><div class="spread"><h2>Sales over time</h2><a class="link" href="#/reports?days=${days}">View report</a></div>${barChart(d.series)}</div>
      <div class="card card--flush"><div class="spread" style="padding:14px 16px"><h2>Recent orders</h2><a class="link" href="#/orders">All orders</a></div>${orderTable(d.recent)}</div>
    </div>
    <div>
      <div class="card"><h2>To do</h2><div class="todo">
        <a href="#/orders?tab=unfulfilled"><span>Orders to pack &amp; ship</span><b>${d.todo.toFulfil}</b></a>
        <a href="#/orders?tab=unpaid"><span>Online orders awaiting payment</span><b>${d.todo.unpaidOnline}</b></a>
        <a href="#/checkouts"><span>Abandoned checkouts (14 days)</span><b>${d.todo.abandoned}</b></a>
        <a href="#/inventory?low=1"><span>Products low on stock</span><b>${d.todo.lowStock}</b></a>
      </div></div>
      <div class="card"><h2>Conversion funnel</h2><div class="funnel">
        ${[["Visited store", f.page_view], ["Viewed a product", f.view_item], ["Added to cart", f.add_to_cart], ["Reached checkout", f.begin_checkout], ["Purchased", f.purchase]]
          .map(([l, n]) => `<div><span>${l}</span><i style="width:${(100 * n) / fmax}%"></i><span class="right">${n} · ${Math.round((100 * n) / fmax)}%</span></div>`).join("")}
      </div></div>
      <div class="card"><h2>Top products</h2>${hbars(d.topProducts, r => `${h(r.name)} <span class="muted">${h(r.size)} · ${r.units} sold</span>`, "sales")}</div>
    </div>
  </div>`;
}

/* =============================================================== orders */
function orderTable(rows) {
  if (!rows.length) return `<div class="empty">No orders yet</div>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th class="num">Total</th><th>Payment</th><th>Fulfilment</th><th class="num">Items</th></tr></thead><tbody>
    ${rows.map(o => `<tr class="click" data-href="#/orders/${h(o.number)}"><td><b>${h(o.number)}</b></td><td class="nowrap muted">${when(o.createdAt)}</td>
      <td>${h(o.name)}<div class="small muted">${h(o.city || "")}</div></td><td class="num">${inr(o.total)}</td><td>${payBadge(o)}</td>
      <td>${o.status === "cancelled" ? "" : badge(FUL, o.fulfillmentStatus)}</td><td class="num">${o.items}</td></tr>`).join("")}
  </tbody></table></div>`;
}
document.addEventListener("click", e => { const tr = e.target.closest("tr[data-href]"); if (tr && !e.target.closest("a, button, input")) location.hash = tr.dataset.href; });

const ORDER_TABS = {
  all: {}, unfulfilled: { status: "open", fulfillment: "unfulfilled" }, unpaid: { status: "open", payment: "pending" },
  shipped: { status: "open", fulfillment: "shipped" }, delivered: { fulfillment: "delivered" }, cod: { method: "cod", status: "open" },
  cancelled: { status: "cancelled" }, archived: { status: "archived" },
};
async function orders(p) {
  crumbs("Orders");
  const tab = p.get("tab") || "all";
  const filters = { ...ORDER_TABS[tab], q: p.get("q") || "", from: p.get("from") || "", to: p.get("to") || "", page: p.get("page") || 1 };
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const d = await api(`/orders?${qs}`);
  view.innerHTML = `
  <div class="head"><h1>Orders</h1><div class="row"><a class="b" href="/api/admin/export/orders.csv?${qs}">Export CSV</a></div></div>
  <div class="card card--flush">
    <nav class="tabs">${Object.keys(ORDER_TABS).map(t => `<a href="#/orders?tab=${t}" class="${t === tab ? "on" : ""}">${t === "cod" ? "COD" : t[0].toUpperCase() + t.slice(1)}</a>`).join("")}</nav>
    <form class="toolbar" id="of"><input type="search" name="q" placeholder="Search order number, name, phone, email or AWB" value="${h(filters.q)}">
      <input type="date" name="from" value="${h(filters.from)}" style="width:auto"><input type="date" name="to" value="${h(filters.to)}" style="width:auto"><button class="b">Filter</button></form>
    ${orderTable(d.orders)}
    <div class="pager"><span>${d.total} orders</span><span class="row">${d.page > 1 ? `<a class="b b--sm" href="#/orders?${new URLSearchParams({ ...Object.fromEntries(p), page: d.page - 1 })}">‹ Prev</a>` : ""}
      Page ${d.page} of ${d.pages} ${d.page < d.pages ? `<a class="b b--sm" href="#/orders?${new URLSearchParams({ ...Object.fromEntries(p), page: d.page + 1 })}">Next ›</a>` : ""}</span></div>
  </div>`;
  $("#of").onsubmit = e => { e.preventDefault(); go("/orders", { tab, ...Object.fromEntries(new FormData(e.target)) }); };
}

function waLink(phone, text) { return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`; }
function customerMessage(o) {
  const first = (o.name || "").split(" ")[0];
  const link = `${location.origin}/track.html?n=${o.number}&k=${o.publicKey}`;
  if (o.status === "cancelled") return `Hi ${first}, your Wellitas order ${o.number} has been cancelled. Any payment will be refunded in 5–7 business days.`;
  if (o.fulfillmentStatus === "shipped") return `Hi ${first}, your Wellitas order ${o.number} has shipped with ${o.courier} (AWB ${o.awb}). Track it here: ${link}`;
  if (o.fulfillmentStatus === "out_for_delivery") return `Hi ${first}, your Wellitas order ${o.number} is out for delivery today!${o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? ` Please keep ₹${o.total} ready (cash or UPI).` : ""}`;
  if (o.fulfillmentStatus === "delivered") return `Hi ${first}, your Wellitas order ${o.number} has been delivered. Hope you enjoy every cup! We'd love your feedback.`;
  return `Hi ${first}, thank you for your Wellitas order ${o.number} (₹${o.total}). We'll pack it within 2–3 working days. Track it here: ${link}`;
}

async function order(p, number) {
  crumbs(["Orders", "#/orders"], number);
  const o = await api(`/orders/${number}`);
  const a = o.address || {};
  const open = o.status !== "cancelled";
  const steps = ["unfulfilled", "packed", "shipped", "out_for_delivery", "delivered"];
  const si = steps.indexOf(o.fulfillmentStatus);
  const due = o.total - o.refunded;
  view.innerHTML = `
  <div class="head"><div><h1>${h(o.number)}</h1><div class="row" style="margin-top:6px">${payBadge(o)} ${open ? badge(FUL, o.fulfillmentStatus) : ""}
      ${o.status === "archived" ? `<span class="badge">Archived</span>` : ""}<span class="muted small">${when(o.createdAt)} · ${o.paymentMethod === "cod" ? "Cash on delivery" : "Online payment"}</span></div></div>
    <div class="row"><a class="b" target="_blank" href="/api/admin/orders/${h(o.number)}/invoice">Invoice</a><a class="b" target="_blank" href="/api/admin/orders/${h(o.number)}/invoice?type=slip">Packing slip</a>
      <a class="b" target="_blank" href="../track.html?n=${h(o.number)}&k=${h(o.publicKey)}">Customer view</a>
      ${open ? `<button class="b" data-act="archive">${o.status === "archived" ? "Unarchive" : "Archive"}</button>` : ""}
      ${open && !["shipped", "out_for_delivery", "delivered", "rto", "returned"].includes(o.fulfillmentStatus) ? `<button class="b b--danger" data-act="cancel">Cancel order</button>` : ""}</div></div>
  <div class="grid2">
    <div>
      <div class="card">
        <div class="spread"><h2>${open ? (FUL[o.fulfillmentStatus] || [o.fulfillmentStatus])[0] : "Items"}</h2>${o.awb ? `<span class="small">${h(o.courier)} · AWB <b>${h(o.awb)}</b> ${o.trackingUrl ? `<a class="link" target="_blank" rel="noopener" href="${h(o.trackingUrl)}">Track</a>` : ""}</span>` : ""}</div>
        ${open && si >= 0 ? `<div class="steps">${["Placed", "Packed", "Shipped", "Out for delivery", "Delivered"].map((l, i) => `<span class="${i <= si ? "done" : ""}">${l}</span>`).join("")}</div>` : ""}
        <div class="items">${o.items.map(i => `<div class="it"><img src="${img(i.img)}" alt=""><div>${h(i.name)}<div class="small muted">${h(i.size)}${i.sku ? " · SKU " + h(i.sku) : ""}</div></div>
          <div class="small muted nowrap">${inr(i.price)} × ${i.qty}</div><div class="nowrap">${inr(i.price * i.qty)}</div></div>`).join("")}</div>
        ${open ? `<div class="row" style="margin-top:12px;justify-content:flex-end">
          ${o.fulfillmentStatus === "unfulfilled" ? `<button class="b" data-ful="packed">Mark as packed</button>` : ""}
          ${["unfulfilled", "packed"].includes(o.fulfillmentStatus) ? `<button class="b b--primary" data-act="ship">Ship order</button>` : ""}
          ${o.fulfillmentStatus === "shipped" ? `<button class="b" data-act="ship">Edit tracking</button><button class="b" data-ful="out_for_delivery">Out for delivery</button>` : ""}
          ${["shipped", "out_for_delivery"].includes(o.fulfillmentStatus) ? `<button class="b b--primary" data-ful="delivered">Mark delivered</button><button class="b b--danger" data-ful="rto">RTO</button>` : ""}
          ${o.fulfillmentStatus === "delivered" ? `<button class="b b--danger" data-ful="returned">Mark returned</button>` : ""}
        </div>` : ""}
      </div>
      <div class="card"><div class="spread"><h2>Payment</h2>${payBadge(o)}</div>
        <div class="sum" style="margin-top:10px">
          <div><span>Subtotal · ${o.items.reduce((a, i) => a + i.qty, 0)} items</span><span>${inr(o.subtotal)}</span></div>
          ${o.discount ? `<div><span>Discount <span class="badge">${h(o.discountCode)}</span></span><span>−${inr(o.discount)}</span></div>` : ""}
          <div><span>Shipping</span><span>${o.shipping ? inr(o.shipping) : "Free"}</span></div>
          ${o.codFee ? `<div><span>COD fee</span><span>${inr(o.codFee)}</span></div>` : ""}
          <div class="tot"><span>Total</span><span>${inr(o.total)}</span></div>
          ${o.refunded ? `<div><span>Refunded</span><span>−${inr(o.refunded)}</span></div><div class="tot"><span>Net</span><span>${inr(due)}</span></div>` : ""}
          ${o.rzpPaymentId ? `<div class="small muted"><span>Razorpay payment</span><span class="mono">${h(o.rzpPaymentId)}</span></div>` : ""}
        </div>
        <div class="row" style="margin-top:12px;justify-content:flex-end">
          ${open && o.paymentStatus === "pending" ? `<button class="b" data-act="paid">Mark as paid</button>` : ""}
          ${["paid", "partially_refunded"].includes(o.paymentStatus) ? `<button class="b" data-act="refund">Refund</button>` : ""}
        </div>
      </div>
      <div class="card"><h2>Timeline</h2>
        <form class="row" id="cmt" style="margin-bottom:14px"><input name="message" placeholder="Leave a comment for your team…" style="flex:1"><button class="b">Post</button></form>
        <ul class="tl">${o.events.slice().reverse().map(e => `<li class="${["placed", "paid", "shipped", "out_for_delivery", "delivered", "cancelled", "refund", "packed", "rto", "returned"].includes(e.type) ? "pub" : ""}">
          <time>${when(e.created_at)} · ${h(e.by || "")}</time>${h(e.message)}</li>`).join("")}</ul>
        <p class="small muted">Dark dots are visible to the customer on their tracking page.</p>
      </div>
    </div>
    <div>
      <div class="card"><h2>Customer</h2><div class="kv">
        ${o.customer ? `<a href="#/customers/${o.customer.id}"><b>${h(o.name)}</b></a><span class="muted small">${o.customer.orders} order${o.customer.orders === 1 ? "" : "s"} · ${inr(o.customer.spent)} spent</span>` : `<b>${h(o.name)}</b>`}
        <a href="tel:+91${h(o.phone)}">+91 ${h(o.phone)}</a>${o.email ? `<a href="mailto:${h(o.email)}">${h(o.email)}</a>` : `<span class="muted small">No email</span>`}
      </div>
      <a class="b" style="margin-top:12px" target="_blank" rel="noopener" href="${waLink(o.phone, customerMessage(o))}">Send update on WhatsApp</a></div>
      <div class="card"><div class="spread"><h2>Shipping address</h2><button class="link" id="copyAddr">Copy</button></div>
        <div class="kv" id="addr">${h(o.name)}<br>${h(a.line1)}${a.line2 ? "<br>" + h(a.line2) : ""}${a.landmark ? "<br>Landmark: " + h(a.landmark) : ""}<br>${h(a.city)}, ${h(a.state)} ${h(a.pincode)}<br>+91 ${h(o.phone)}</div></div>
      ${o.customerNote ? `<div class="card"><h2>Customer note</h2><p>${h(o.customerNote)}</p></div>` : ""}
      <div class="card"><h2>Notes &amp; tags</h2><form class="form" id="notes">
        <textarea name="notes" placeholder="Private notes for your team">${h(o.notes || "")}</textarea>
        <input name="tags" placeholder="Tags, comma separated (e.g. gift, priority)" value="${h(o.tags || "")}">
        <button class="b" style="justify-self:end">Save</button></form></div>
      <div class="card"><h2>Conversion</h2><div class="kv small">
        <span>Source: <b>${h(o.source || (o.referrer ? o.referrer : "Direct"))}</b></span>${o.medium ? `<span>Medium: ${h(o.medium)}</span>` : ""}${o.campaign ? `<span>Campaign: ${h(o.campaign)}</span>` : ""}
        ${o.referrer && o.source ? `<span>Referrer: ${h(o.referrer)}</span>` : ""}</div></div>
    </div>
  </div>`;

  const reload = () => order(p, number);
  const post = (path, body) => api(`/orders/${number}${path}`, { method: "POST", body }).then(() => { toast("Saved"); refreshCounts(); reload(); }, fail);
  $$("[data-ful]").forEach(b => (b.onclick = () => {
    const st = b.dataset.ful;
    if ((st === "rto" || st === "returned") && !confirm("Mark as " + st.toUpperCase() + "? Stock will be added back.")) return;
    post("/status", { fulfillment: st });
  }));
  $$("[data-act]").forEach(b => (b.onclick = () => ({
    archive: () => post("/archive"),
    cancel: () => modal(`<h2>Cancel ${h(number)}</h2><p class="small muted">Stock goes back on sale. ${o.paymentStatus === "paid" ? "This order is paid — refund it after cancelling." : ""}</p>
      <label>Reason<select name="reason"><option>Customer changed their mind</option><option>Payment not received</option><option>Out of stock</option><option>Fraud or test order</option><option>Other</option></select></label>`,
      v => api(`/orders/${number}/cancel`, { method: "POST", body: v }).then(() => { toast("Order cancelled"); refreshCounts(); reload(); })),
    ship: () => modal(`<h2>Ship ${h(number)}</h2>
      <label>Courier<select name="courier">${o.couriers.map(c => `<option ${c === o.courier ? "selected" : ""}>${h(c)}</option>`).join("")}</select></label>
      <label>AWB / tracking number<input name="awb" required value="${h(o.awb || "")}"></label>
      <label>Tracking link <span class="hint">(optional — filled in automatically for listed couriers)</span><input name="trackingUrl" type="url" value=""></label>`,
      v => api(`/orders/${number}/fulfill`, { method: "POST", body: v }).then(() => { toast("Marked as shipped"); refreshCounts(); reload(); })),
    paid: () => confirm(`Mark ${number} as paid (${inr(o.total)})?`) && post("/mark-paid"),
    refund: () => modal(`<h2>Refund ${h(number)}</h2>
      <label>Amount (max ${inr(due)})<input name="amount" type="number" min="1" max="${due}" value="${due}" required></label>
      <label>Reason<input name="reason" placeholder="e.g. damaged in transit"></label>
      ${o.paymentMethod === "online" && o.rzpPaymentId ? `<label class="check"><input type="checkbox" name="manual"> Already refunded outside Razorpay (don't send money again)</label>
        <p class="small muted">Otherwise the refund is sent through Razorpay to the customer's original payment method.</p>`
        : `<p class="small muted">This records a manual refund — send the money by bank transfer or UPI yourself.</p>`}`,
      v => api(`/orders/${number}/refund`, { method: "POST", body: { ...v, manual: !!v.manual } }).then(() => { toast("Refund recorded"); reload(); })),
  })[b.dataset.act]()));
  $("#cmt").onsubmit = e => { e.preventDefault(); post("/comment", { message: e.target.message.value }); };
  $("#notes").onsubmit = e => { e.preventDefault(); api(`/orders/${number}`, { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) }).then(() => toast("Saved"), fail); };
  $("#copyAddr").onclick = () => navigator.clipboard.writeText($("#addr").innerText).then(() => toast("Address copied"));
}

/* =============================================================== products */
const CATS = [["green", "Green tea"], ["black", "Black tea"], ["herbal", "Herbal blends"], ["ctc", "SipAmrit CTC"], ["seeds", "Fruit & seeds"], ["gifts", "Gift hampers"]];
async function products(p) {
  crumbs("Products");
  const list = await api("/products");
  const q = (p.get("q") || "").toLowerCase(), st = p.get("status") || "";
  const rows = list.filter(x => (!q || (x.name + x.size + (x.code || "")).toLowerCase().includes(q)) && (!st || x.status === st));
  view.innerHTML = `
  <div class="head"><h1>Products</h1><div class="row"><a class="b" href="/api/admin/export/products.csv">Export CSV</a><a class="b b--primary" href="#/products/new">Add product</a></div></div>
  <div class="card card--flush">
    <nav class="tabs">${[["", "All"], ["active", "Active"], ["draft", "Draft"]].map(([v, l]) => `<a href="#/products?status=${v}" class="${v === st ? "on" : ""}">${l}</a>`).join("")}</nav>
    <form class="toolbar" id="pf"><input type="search" name="q" placeholder="Search products" value="${h(q)}"><button class="b">Search</button></form>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Status</th><th class="num">Inventory</th><th class="num">Price</th><th class="num">Sold (30d)</th><th>Category</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="click" data-href="#/products/${x.id}"><td><img class="thumb" src="${img(x.img)}" alt=""></td>
      <td><b>${h(x.name)}</b><div class="small muted">${h(x.size)}${x.code ? " · " + h(x.code) : ""}</div></td>
      <td>${x.status === "active" ? `<span class="badge good">Active</span>` : `<span class="badge">Draft</span>`}</td>
      <td class="num ${x.trackStock && x.stock <= x.lowStock ? "down" : ""}">${x.trackStock ? `${x.stock} in stock` : "Not tracked"}</td>
      <td class="num">${inr(x.price)}<div class="small muted"><s>${inr(x.mrp)}</s></div></td><td class="num">${x.sold30}</td>
      <td class="small">${x.cats.map(c => (CATS.find(k => k[0] === c) || [, c])[1]).join(", ")}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No products</td></tr>`}
    </tbody></table></div>
  </div>`;
  $("#pf").onsubmit = e => { e.preventDefault(); go("/products", { status: st, q: e.target.q.value }); };
}

async function productEdit(p, id) {
  const isNew = id === "new";
  const x = isNew ? { cats: [], brew: [], why: [], status: "draft", trackStock: true, stock: 0, lowStock: SETTINGS.inventory.low_stock_default, brand: "Wellitas" } : await api(`/products/${id}`);
  crumbs(["Products", "#/products"], isNew ? "Add product" : x.name);
  const lines = a => (a || []).join("\n");
  view.innerHTML = `
  <div class="head"><h1>${isNew ? "Add product" : h(x.name)}</h1>${isNew ? "" : `<div class="row"><a class="b" target="_blank" href="../product.html?p=${h(x.slug)}">View on store</a></div>`}</div>
  <form class="grid2" id="prod">
    <div>
      <div class="card form">
        <label>Title<input name="name" required value="${h(x.name || "")}"></label>
        <div class="two"><label>Short name <span class="hint">(cards &amp; cart)</span><input name="short" value="${h(x.short || "")}"></label>
          <label>Taste notes<input name="taste" value="${h(x.taste || "")}" placeholder="Clean · vegetal · delicate aroma"></label></div>
        <label>Description<textarea name="pitch" rows="4">${h(x.pitch || "")}</textarea></label>
      </div>
      <div class="card form"><h2>Images</h2>
        <div class="two">${["img", "back"].map((k, i) => `<div><span class="small">${i ? "Second image (back / closed)" : "Main image"}</span>
          <div class="imgpick"><img src="${img(x[k]) || "data:,"}" id="pv_${k}" alt=""><div class="stack"><input type="hidden" name="${k}" value="${h(x[k] || "")}">
          <input type="file" accept="image/png,image/jpeg,image/webp" data-up="${k}"><button type="button" class="link" data-clear="${k}">Remove</button></div></div></div>`).join("")}</div>
        <label class="check"><input type="checkbox" name="photo" ${x.photo ? "checked" : ""}> These are photos (fill the frame) rather than cut-out pack shots</label>
      </div>
      <div class="card form"><h2>Product page sections</h2>
        <div class="two"><label>Steps heading<input name="useTitle" value="${h(x.useTitle || "")}" placeholder="How to brew"></label>
          <label>List heading<input name="whyTitle" value="${h(x.whyTitle || "")}" placeholder="Why you’ll like it"></label></div>
        <div class="two"><label>Steps <span class="hint">(one per line)</span><textarea name="brew" rows="5">${h(lines(x.brew))}</textarea></label>
          <label>Points <span class="hint">(one per line)</span><textarea name="why" rows="5">${h(lines(x.why))}</textarea></label></div>
      </div>
      <div class="card form"><h2>Pricing</h2>
        <div class="three"><label>Price (₹)<input name="price" type="number" min="1" required value="${x.price ?? ""}"></label>
          <label>MRP (₹)<input name="mrp" type="number" min="1" value="${x.mrp ?? ""}"></label>
          <label>Tax (HSN code)<input name="hsn" value="${h(x.hsn || "")}" placeholder="0902"></label></div>
        <p class="small muted">Prices include GST. Customers see the MRP struck through and the % off.</p>
      </div>
      <div class="card form"><h2>Inventory</h2>
        <div class="three"><label>SKU / code<input name="code" value="${h(x.code || "")}"></label>
          <label>Quantity in stock<input name="stock" type="number" value="${x.stock ?? 0}"></label>
          <label>Low-stock alert at<input name="lowStock" type="number" min="0" value="${x.lowStock ?? 10}"></label></div>
        <div class="two"><label class="check"><input type="checkbox" name="trackStock" ${x.trackStock ? "checked" : ""}> Track quantity (stop selling at 0)</label>
          <label>Weight (grams, for shipping)<input name="weightG" type="number" min="0" value="${x.weightG ?? ""}"></label></div>
        ${x.log?.length ? `<details><summary class="small">Stock history</summary><table class="tbl small">${x.log.map(l => `<tr><td>${when(l.created_at)}</td><td>${h(l.reason)}</td><td class="num ${l.change < 0 ? "down" : "up"}">${l.change > 0 ? "+" : ""}${l.change}</td><td class="num">${l.stock_after}</td></tr>`).join("")}</table></details>` : ""}
      </div>
    </div>
    <div>
      <div class="card form"><h2>Status</h2><select name="status"><option value="active" ${x.status === "active" ? "selected" : ""}>Active — visible in store</option><option value="draft" ${x.status === "draft" ? "selected" : ""}>Draft — hidden</option></select></div>
      <div class="card form"><h2>Organisation</h2>
        <label>Brand<input name="brand" value="${h(x.brand || "")}"></label>
        <div><span class="small">Categories</span><div class="chips" style="margin-top:6px">${CATS.map(([k, l]) => `<label><input type="checkbox" name="cat_${k}" ${x.cats.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
        <label>Size<input name="size" value="${h(x.size || "")}" placeholder="100 g"></label>
        <label>Badge <span class="hint">(e.g. Value pack)</span><input name="tag" value="${h(x.tag || "")}"></label>
        <label>URL handle<input name="slug" value="${h(x.slug || "")}" placeholder="auto from title"></label>
        <label>Sort order<input name="sort" type="number" value="${x.sort ?? 0}"></label>
      </div>
    </div>
    <div class="savebar" style="grid-column:1/-1">${isNew ? "" : `<button type="button" class="b b--danger" id="del">Delete</button>`}<a class="b" href="#/products">Cancel</a><button class="b b--primary">Save</button></div>
  </form>`;

  $$("[data-up]").forEach(inp => (inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const r = await api("/upload", { method: "POST", raw: f, type: f.type });
      $(`input[name=${inp.dataset.up}]`).value = r.url;
      $(`#pv_${inp.dataset.up}`).src = r.url;
      toast("Image uploaded");
    } catch (e) { fail(e); }
  }));
  $$("[data-clear]").forEach(b => (b.onclick = () => { $(`input[name=${b.dataset.clear}]`).value = ""; $(`#pv_${b.dataset.clear}`).src = "data:,"; }));
  $("#del")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${x.name}? Products that have orders are hidden instead.`)) return;
    const r = await api(`/products/${x.id}`, { method: "DELETE" }).catch(fail);
    if (r) { toast(r.hidden ? "Product hidden (it has orders)" : "Product deleted"); go("/products"); }
  });
  $("#prod").onsubmit = async e => {
    e.preventDefault();
    const f = e.target, v = Object.fromEntries(new FormData(f));
    const body = { ...v, cats: CATS.map(c => c[0]).filter(k => v["cat_" + k]), brew: v.brew.split("\n").map(s => s.trim()).filter(Boolean),
      why: v.why.split("\n").map(s => s.trim()).filter(Boolean), photo: !!v.photo, trackStock: !!v.trackStock };
    CATS.forEach(c => delete body["cat_" + c[0]]);
    if (!body.slug) delete body.slug;
    try {
      const r = await api(isNew ? "/products" : `/products/${x.id}`, { method: isNew ? "POST" : "PUT", body });
      toast("Product saved");
      if (isNew) go(`/products/${r.id}`); else productEdit(p, x.id);
    } catch (ex) { fail(ex); }
  };
}

/* =============================================================== inventory */
async function inventory(p) {
  crumbs("Inventory");
  const [list, log] = await Promise.all([api("/products"), api("/inventory/log")]);
  const low = p.get("low") === "1";
  const rows = list.filter(x => !low || (x.trackStock && x.stock <= x.lowStock));
  view.innerHTML = `
  <div class="head"><h1>Inventory</h1><div class="row"><a class="b ${low ? "" : "b--primary"} b--sm" href="#/inventory">All</a><a class="b ${low ? "b--primary" : ""} b--sm" href="#/inventory?low=1">Low stock</a></div></div>
  <div class="grid2"><div class="card card--flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Product</th><th class="num">Sold (30d)</th><th class="num">Available</th><th>Adjust</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><img class="thumb" src="${img(x.img)}" alt=""></td><td><a href="#/products/${x.id}"><b>${h(x.name)}</b></a><div class="small muted">${h(x.size)} · ${h(x.code || "")}</div></td>
      <td class="num">${x.sold30}</td><td class="num"><b class="${x.stock <= x.lowStock ? "down" : ""}">${x.trackStock ? x.stock : "∞"}</b>${x.trackStock && x.stock <= x.lowStock ? `<div class="small down">Low</div>` : ""}</td>
      <td><form class="row adj" data-id="${x.id}"><input name="change" type="number" placeholder="+/−" style="width:76px" required>
        <select name="reason" style="width:auto"><option>Received</option><option>Correction</option><option>Damaged</option><option>Sample / gift</option><option>Returned to stock</option></select><button class="b b--sm">Apply</button></form></td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nothing low on stock</td></tr>`}
  </tbody></table></div></div>
  <div class="card"><h2>Recent adjustments</h2><table class="tbl small">${log.slice(0, 40).map(l => `<tr><td>${h(l.name)} <span class="muted">${h(l.size)}</span><div class="muted">${h(l.reason)} · ${when(l.created_at)}</div></td>
    <td class="num ${l.change < 0 ? "down" : "up"}">${l.change > 0 ? "+" : ""}${l.change}</td><td class="num">${l.stock_after}</td></tr>`).join("") || `<tr><td class="muted">No adjustments yet</td></tr>`}</table></div></div>`;
  $$("form.adj").forEach(f => (f.onsubmit = async e => {
    e.preventDefault();
    try { await api(`/products/${f.dataset.id}/stock`, { method: "POST", body: Object.fromEntries(new FormData(f)) }); toast("Stock updated"); refreshCounts(); inventory(p); } catch (ex) { fail(ex); }
  }));
}

/* =============================================================== customers */
async function customers(p) {
  crumbs("Customers");
  const q = p.get("q") || "", sort = p.get("sort") || "";
  const list = await api(`/customers?q=${encodeURIComponent(q)}&sort=${sort}`);
  view.innerHTML = `
  <div class="head"><h1>Customers</h1><a class="b" href="/api/admin/export/customers.csv">Export CSV</a></div>
  <div class="card card--flush">
    <form class="toolbar" id="cf"><input type="search" name="q" placeholder="Search name, phone or email" value="${h(q)}">
      <select name="sort" style="width:auto"><option value="">Newest</option><option value="spent" ${sort === "spent" ? "selected" : ""}>Top spenders</option></select><button class="b">Apply</button></form>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Phone</th><th>Location</th><th class="num">Orders</th><th class="num">Spent</th><th>Marketing</th></tr></thead><tbody>
    ${list.map(c => `<tr class="click" data-href="#/customers/${c.id}"><td><b>${h(c.name)}</b><div class="small muted">${h(c.email || "")}</div></td><td>+91 ${h(c.phone)}</td>
      <td class="small">${h([c.city, c.state].filter(Boolean).join(", "))}</td><td class="num">${c.orders}</td><td class="num">${inr(c.spent)}</td>
      <td>${c.accepts_marketing ? `<span class="badge good">Subscribed</span>` : `<span class="badge">No</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">No customers yet</td></tr>`}
    </tbody></table></div></div>`;
  $("#cf").onsubmit = e => { e.preventDefault(); go("/customers", Object.fromEntries(new FormData(e.target))); };
}
async function customer(p, id) {
  const c = await api(`/customers/${id}`);
  crumbs(["Customers", "#/customers"], c.name);
  view.innerHTML = `
  <div class="head"><h1>${h(c.name)}</h1><div class="row"><a class="b" target="_blank" rel="noopener" href="${waLink(c.phone, `Hi ${(c.name || "").split(" ")[0]}, `)}">WhatsApp</a>${c.email ? `<a class="b" href="mailto:${h(c.email)}">Email</a>` : ""}</div></div>
  <div class="kpis"><div class="kpi"><p>Amount spent</p><strong>${inr(c.spent)}</strong></div><div class="kpi"><p>Orders</p><strong>${c.orders.length}</strong></div>
    <div class="kpi"><p>Average order</p><strong>${inr(c.orders.length ? c.spent / c.orders.length : 0)}</strong></div><div class="kpi"><p>Customer since</p><strong style="font-size:20px">${when(c.created_at)}</strong></div></div>
  <div class="grid2"><div class="card card--flush"><h2 style="padding:14px 16px">Orders</h2>${orderTable(c.orders)}</div>
    <div><div class="card"><h2>Contact</h2><div class="kv"><a href="tel:+91${h(c.phone)}">+91 ${h(c.phone)}</a>${c.email ? `<a href="mailto:${h(c.email)}">${h(c.email)}</a>` : ""}</div></div>
    <div class="card"><h2>Notes &amp; tags</h2><form class="form" id="cn"><textarea name="notes">${h(c.notes || "")}</textarea><input name="tags" value="${h(c.tags || "")}" placeholder="Tags (e.g. wholesale, VIP)">
      <label class="check"><input type="checkbox" name="accepts_marketing" ${c.accepts_marketing ? "checked" : ""}> Agreed to receive marketing</label><button class="b" style="justify-self:end">Save</button></form></div></div></div>`;
  $("#cn").onsubmit = e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); api(`/customers/${id}`, { method: "PATCH", body: { ...v, accepts_marketing: !!v.accepts_marketing } }).then(() => toast("Saved"), fail); };
}

/* =============================================================== abandoned checkouts */
async function checkouts() {
  crumbs("Abandoned checkouts");
  const d = await api("/checkouts");
  const shop = `${location.origin}/shop.html`;
  view.innerHTML = `
  <div class="head"><h1>Abandoned checkouts</h1><a class="b" href="/api/admin/export/checkouts.csv">Export CSV</a></div>
  <div class="kpis"><div class="kpi"><p>Open carts</p><strong>${d.checkouts.length}</strong></div><div class="kpi"><p>Value left in carts</p><strong>${inr(d.checkouts.reduce((a, c) => a + c.subtotal, 0))}</strong></div>
    <div class="kpi"><p>Recovered after reminder</p><strong>${d.recovered.n}</strong><em class="muted">${inr(d.recovered.v)} in sales</em></div></div>
  <div class="card card--flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Last active</th><th>Customer</th><th>Cart</th><th class="num">Value</th><th>Recover</th></tr></thead><tbody>
    ${d.checkouts.map(c => `<tr><td class="nowrap muted">${when(c.updated_at)}</td><td><b>${h(c.name || "—")}</b><div class="small muted">${c.phone ? "+91 " + h(c.phone) : ""} ${h(c.email || "")}</div></td>
      <td class="small">${c.cart.map(i => `${h(i.name)} × ${i.qty}`).join("<br>")}</td><td class="num">${inr(c.subtotal)}</td>
      <td class="nowrap">${c.phone ? `<a class="b b--sm" target="_blank" rel="noopener" data-remind="${c.id}" href="${waLink(c.phone, `Hi ${(c.name || "").split(" ")[0]}, you left some Wellitas tea in your cart! Complete your order here: ${shop} — reply if you need any help.`)}">WhatsApp</a>` : ""}
        ${c.email ? `<a class="b b--sm" data-remind="${c.id}" href="mailto:${h(c.email)}?subject=${encodeURIComponent("You left something in your cart")}&body=${encodeURIComponent(`Hi ${(c.name || "").split(" ")[0]},\n\nYou left ${c.cart.map(i => i.name).join(", ")} in your cart. Complete your order here: ${shop}\n\nTeam Wellitas`)}">Email</a>` : ""}
        ${c.reminded_at ? `<div class="small muted">Reminded ${when(c.reminded_at)}</div>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">No abandoned checkouts. Carts appear here 30 minutes after a customer enters their phone or email and leaves.</td></tr>`}
  </tbody></table></div></div>`;
  $$("[data-remind]").forEach(a => a.addEventListener("click", () => api(`/checkouts/${a.dataset.remind}/reminded`, { method: "POST" }).then(() => setTimeout(checkouts, 500))));
}

/* =============================================================== discounts */
async function discounts() {
  crumbs("Discounts");
  const list = await api("/discounts");
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const state = d => !d.active ? `<span class="badge">Off</span>` : d.ends_at && d.ends_at < now ? `<span class="badge bad">Expired</span>`
    : d.starts_at && d.starts_at > now ? `<span class="badge info">Scheduled</span>` : d.usage_limit != null && d.used >= d.usage_limit ? `<span class="badge warn">Used up</span>` : `<span class="badge good">Active</span>`;
  const desc = d => (d.type === "percent" ? `${d.value}% off` : d.type === "fixed" ? `${inr(d.value)} off` : "Free shipping") + (d.min_subtotal ? ` · orders over ${inr(d.min_subtotal)}` : "");
  view.innerHTML = `
  <div class="head"><h1>Discounts</h1><button class="b b--primary" id="newD">Create discount</button></div>
  <div class="card card--flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Offer</th><th>Status</th><th class="num">Used</th><th class="num">Discount given</th><th class="num">Sales</th><th></th></tr></thead><tbody>
    ${list.map(d => `<tr><td><b class="mono" style="font-size:13px">${h(d.code)}</b><div class="small muted">${h(d.description || "")}</div></td><td>${desc(d)}${d.once_per_customer ? `<div class="small muted">Once per customer</div>` : ""}</td>
      <td>${state(d)}${d.ends_at ? `<div class="small muted">until ${h(d.ends_at.slice(0, 10))}</div>` : ""}</td><td class="num">${d.used}${d.usage_limit != null ? " / " + d.usage_limit : ""}</td>
      <td class="num">${inr(d.given)}</td><td class="num">${inr(d.sales)}</td><td class="nowrap"><button class="b b--sm" data-edit="${d.id}">Edit</button> <button class="b b--sm b--danger" data-del="${d.id}">Delete</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">No discount codes yet. Create one for a festival sale, a first-order offer or an influencer campaign.</td></tr>`}
  </tbody></table></div></div>`;
  const form = (d = { type: "percent", active: 1 }) => modal(`<h2>${d.id ? "Edit" : "Create"} discount</h2>
    <label>Code<div class="row"><input name="code" required value="${h(d.code || "")}" style="flex:1;text-transform:uppercase" placeholder="DIWALI20"><button type="button" class="b b--sm" id="gen">Generate</button></div></label>
    <label>Internal note<input name="description" value="${h(d.description || "")}" placeholder="e.g. Instagram influencer — Priya"></label>
    <div class="two"><label>Type<select name="type"><option value="percent">Percentage off</option><option value="fixed">Fixed amount off</option><option value="free_shipping">Free shipping</option></select></label>
      <label>Value<input name="value" type="number" min="0" value="${d.value ?? ""}" placeholder="% or ₹"></label></div>
    <div class="two"><label>Minimum order (₹)<input name="min_subtotal" type="number" min="0" value="${d.min_subtotal || ""}"></label>
      <label>Total uses allowed<input name="usage_limit" type="number" min="1" value="${d.usage_limit ?? ""}" placeholder="Unlimited"></label></div>
    <div class="two"><label>Starts<input name="starts_at" type="datetime-local" value="${h((d.starts_at || "").replace(" ", "T").slice(0, 16))}"></label>
      <label>Ends<input name="ends_at" type="datetime-local" value="${h((d.ends_at || "").replace(" ", "T").slice(0, 16))}"></label></div>
    <label class="check"><input type="checkbox" name="once_per_customer" ${d.once_per_customer ? "checked" : ""}> Limit to one use per customer (by phone)</label>
    <label class="check"><input type="checkbox" name="active" ${d.active ? "checked" : ""}> Active</label>`,
    async v => {
      const toSql = s => (s ? new Date(s).toISOString().replace("T", " ").slice(0, 19) : null);
      const body = { ...v, once_per_customer: !!v.once_per_customer, active: !!v.active, starts_at: toSql(v.starts_at), ends_at: toSql(v.ends_at) };
      await api(d.id ? `/discounts/${d.id}` : "/discounts", { method: d.id ? "PUT" : "POST", body });
      toast("Discount saved"); discounts();
    });
  $("#newD").onclick = () => { form(); wireGen(); };
  const wireGen = () => { const g = $("#gen"); if (g) g.onclick = () => ($("input[name=code]").value = "WELL" + Math.random().toString(36).slice(2, 7).toUpperCase()); };
  $$("[data-edit]").forEach(b => (b.onclick = () => { const d = list.find(x => x.id == b.dataset.edit); form(d); $("select[name=type]").value = d.type; wireGen(); }));
  $$("[data-del]").forEach(b => (b.onclick = () => confirm("Delete this discount code?") && api(`/discounts/${b.dataset.del}`, { method: "DELETE" }).then(discounts, fail)));
}

/* =============================================================== marketing */
async function marketing() {
  crumbs("Marketing");
  const [subs, rep] = await Promise.all([api("/subscribers"), api("/reports?days=30")]);
  const m = SETTINGS.marketing;
  view.innerHTML = `
  <div class="head"><h1>Marketing</h1></div>
  <div class="kpis"><div class="kpi"><p>Email subscribers</p><strong>${subs.length}</strong></div><div class="kpi"><p>Visitors (30 days)</p><strong>${rep.summary.sessions}</strong></div>
    <div class="kpi"><p>Orders from campaigns (30d)</p><strong>${rep.bySource.filter(s => s.campaign).reduce((a, s) => a + s.orders, 0)}</strong></div>
    <div class="kpi"><p>Discount sales (30d)</p><strong>${inr(rep.discounts.reduce((a, d) => a + d.sales, 0))}</strong></div></div>
  <div class="grid2"><div>
    <div class="card"><h2>Campaign link builder</h2><p class="small muted" style="margin-bottom:10px">Use these links in Instagram bio, WhatsApp broadcasts, ads and influencer posts. Sales are attributed to the campaign in Reports.</p>
      <form class="form" id="utm"><div class="two"><label>Page<select name="page"><option value="">Home</option><option value="shop.html">Shop</option><option value="shop.html?cat=gifts">Gift hampers</option><option value="shop.html?cat=green">Green tea</option><option value="shop.html?cat=ctc">SipAmrit CTC</option></select></label>
        <label>Source<input name="source" placeholder="instagram, whatsapp, google" required></label></div>
        <div class="two"><label>Medium<input name="medium" placeholder="bio, story, broadcast, cpc"></label><label>Campaign<input name="campaign" placeholder="diwali-2026"></label></div>
        <div class="row"><input id="utmOut" readonly placeholder="Your link appears here" style="flex:1"><button class="b">Build</button><button type="button" class="b" id="utmCopy">Copy</button></div></form></div>
    <div class="card"><h2>Where your sales come from (30 days)</h2>
      <table class="tbl small"><thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th class="num">Orders</th><th class="num">Sales</th></tr></thead>
      ${rep.bySource.map(s => `<tr><td>${h(s.source)}</td><td>${h(s.medium)}</td><td>${h(s.campaign)}</td><td class="num">${s.orders}</td><td class="num">${inr(s.sales)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No orders yet</td></tr>`}</table></div>
    <div class="card card--flush"><div class="spread" style="padding:14px 16px"><h2>Email subscribers</h2><a class="b b--sm" href="/api/admin/export/subscribers.csv">Export CSV</a></div>
      <div class="tbl-wrap" style="max-height:360px;overflow-y:auto"><table class="tbl small"><thead><tr><th>Email</th><th>Source</th><th>Joined</th><th></th></tr></thead>
      ${subs.map(s => `<tr><td>${h(s.email)}</td><td>${h(s.source)}</td><td>${when(s.created_at)}</td><td><button class="link" data-unsub="${s.id}">Remove</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">No subscribers yet</td></tr>`}</table></div>
      <p class="small muted" style="padding:10px 16px">Export to Mailchimp, Klaviyo or Brevo to send newsletters.</p></div>
  </div><div>
    <div class="card"><h2>Announcement bar</h2><form class="form" id="ann"><textarea name="announcement" rows="3" placeholder="Leave empty to hide">${h(m.announcement)}</textarea><button class="b" style="justify-self:end">Save</button></form></div>
    <div class="card"><h2>Tracking pixels</h2><form class="form" id="px">
      <label>Google Analytics 4 ID<input name="ga4_id" value="${h(m.ga4_id)}" placeholder="G-XXXXXXXXXX"></label>
      <label>Meta (Facebook/Instagram) Pixel ID<input name="meta_pixel_id" value="${h(m.meta_pixel_id)}" placeholder="123456789012345"></label>
      <p class="small muted">Page views, product views, add-to-cart, checkout and purchases are sent automatically for ads and remarketing.</p>
      <button class="b" style="justify-self:end">Save</button></form></div>
    <div class="card"><h2>Ideas that work for tea brands</h2><ul class="small" style="padding-left:18px;display:grid;gap:6px">
      <li>First-order code (e.g. 10% off) in your Instagram bio link</li><li>Free shipping threshold just above your average order (${inr(rep.summary.aov)})</li>
      <li>WhatsApp reminders for abandoned carts — check daily</li><li>Festival hamper codes with an end date for urgency</li><li>One code per influencer to see who actually sells</li></ul></div>
  </div></div>`;
  const base = location.origin + "/";
  $("#utm").onsubmit = e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const u = new URL(v.page || "", base);
    ["source", "medium", "campaign"].forEach(k => v[k] && u.searchParams.set("utm_" + k, v[k].trim().toLowerCase().replace(/\s+/g, "-")));
    $("#utmOut").value = u.href;
  };
  $("#utmCopy").onclick = () => $("#utmOut").value && navigator.clipboard.writeText($("#utmOut").value).then(() => toast("Link copied"));
  const saveM = (form) => api("/settings/marketing", { method: "PUT", body: Object.fromEntries(new FormData(form)) }).then(r => { SETTINGS.marketing = r; toast("Saved"); }, fail);
  $("#ann").onsubmit = e => { e.preventDefault(); saveM(e.target); };
  $("#px").onsubmit = e => { e.preventDefault(); saveM(e.target); };
  $$("[data-unsub]").forEach(b => (b.onclick = () => confirm("Remove this subscriber?") && api(`/subscribers/${b.dataset.unsub}`, { method: "DELETE" }).then(marketing, fail)));
}

/* =============================================================== reports */
async function reports(p) {
  crumbs("Reports");
  const days = p.get("days") || (p.get("from") ? "" : "30");
  const qs = p.get("from") && p.get("to") ? `from=${p.get("from")}&to=${p.get("to")}` : `days=${days}`;
  const r = await api(`/reports?${qs}`);
  const s = r.summary;
  const catName = Object.fromEntries(CATS);
  const tbl = (head, rows, cells) => `<table class="tbl small"><thead><tr>${head.map(x => `<th class="${x.startsWith("#") ? "num" : ""}">${x.replace("#", "")}</th>`).join("")}</tr></thead>
    ${rows.map(row => `<tr>${cells(row).map((c, i) => `<td class="${head[i].startsWith("#") ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="muted">No data for this period</td></tr>`}</table>`;
  view.innerHTML = `
  <div class="head"><h1>Reports</h1>
    <form class="row" id="rf">${[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["365", "12 months"]].map(([v, l]) => `<a class="b b--sm ${v === days ? "b--primary" : ""}" href="#/reports?days=${v}">${l}</a>`).join("")}
      <input type="date" name="from" value="${r.range.from}" style="width:auto"><input type="date" name="to" value="${r.range.to}" style="width:auto"><button class="b b--sm">Apply</button>
      <a class="b b--sm" href="/api/admin/export/orders.csv?from=${r.range.from}&to=${r.range.to}">Export orders</a></form></div>
  <div class="kpis">
    <div class="kpi"><p>Gross sales</p><strong>${inr(s.gross)}</strong></div><div class="kpi"><p>Net sales <span class="muted">(after refunds)</span></p><strong>${inr(s.net)}</strong></div>
    <div class="kpi"><p>Orders</p><strong>${s.orders}</strong></div><div class="kpi"><p>Average order value</p><strong>${inr(s.aov)}</strong></div>
    <div class="kpi"><p>Discounts given</p><strong>${inr(s.discounts)}</strong></div><div class="kpi"><p>Shipping collected</p><strong>${inr(s.shipping)}</strong></div>
    <div class="kpi"><p>Visitors</p><strong>${s.sessions}</strong></div><div class="kpi"><p>Conversion rate</p><strong>${s.conversion}%</strong></div>
  </div>
  <div class="card"><h2>Sales by day</h2>${barChart(r.series)}</div>
  <div class="cols" style="margin-top:14px">
    <div class="card"><h2>Sales by product</h2>${tbl(["Product", "#Units", "#Orders", "#Sales"], r.byProduct, x => [`${h(x.name)} <span class="muted">${h(x.size)}</span>`, x.units, x.orders, inr(x.sales)])}</div>
    <div class="card"><h2>Sales by category</h2>${hbars(r.byCategory, x => h(catName[x.category] || x.category) + ` <span class="muted">${x.units} units</span>`, "sales")}</div>
    <div class="card"><h2>Payment methods</h2>${tbl(["Method", "Status", "#Orders", "#Sales"], r.byPayment, x => [x.method === "cod" ? "Cash on delivery" : "Online", badge(PAY, x.status), x.orders, inr(x.sales)])}</div>
    <div class="card"><h2>Sales by state</h2>${hbars(r.byState, x => `${h(x.state)} <span class="muted">${x.orders} orders</span>`, "sales")}</div>
    <div class="card"><h2>Top cities</h2>${tbl(["City", "#Orders", "#Sales"], r.byCity, x => [`${h(x.city)} <span class="muted">${h(x.state)}</span>`, x.orders, inr(x.sales)])}</div>
    <div class="card"><h2>Customers</h2>${hbars([{ l: "New customers", n: r.customers.new_customers || 0 }, { l: "Returning customers", n: r.customers.returning_customers || 0 }], x => x.l, "n", n => n + " orders")}</div>
    <div class="card"><h2>Sales by source</h2>${tbl(["Source", "Campaign", "#Orders", "#Sales"], r.bySource, x => [`${h(x.source)}${x.medium ? ` <span class="muted">/ ${h(x.medium)}</span>` : ""}`, h(x.campaign), x.orders, inr(x.sales)])}</div>
    <div class="card"><h2>Visitors by source</h2>${tbl(["Source", "#Visitors"], r.trafficSources, x => [`${h(x.source)}${x.medium ? ` <span class="muted">/ ${h(x.medium)}</span>` : ""}`, x.sessions])}</div>
    <div class="card"><h2>Devices</h2>${hbars(r.devices, x => h(x.device), "sessions", n => n + " visitors")}</div>
    <div class="card"><h2>Top pages</h2>${tbl(["Page", "#Views"], r.topPages, x => [h(x.path), x.views])}</div>
    <div class="card"><h2>Discount codes</h2>${tbl(["Code", "#Orders", "#Given", "#Sales"], r.discounts, x => [`<span class="mono">${h(x.code)}</span>`, x.orders, inr(x.given), inr(x.sales)])}</div>
    <div class="card"><h2>Fulfilment &amp; returns</h2>${tbl(["Status", "#Orders"], r.fulfillment, x => [badge(FUL, x.status), x.orders])}
      <p class="small" style="margin-top:10px">Refunds: <b>${r.refunds.orders}</b> orders · ${inr(r.refunds.amount)}<br>Cancelled: <b>${r.cancelled.orders}</b> orders · ${inr(r.cancelled.amount)}</p></div>
  </div>`;
  $("#rf").onsubmit = e => { e.preventDefault(); go("/reports", Object.fromEntries(new FormData(e.target))); };
}

/* =============================================================== settings */
async function settings() {
  crumbs("Settings");
  SETTINGS = await api("/settings");
  const [staff, activity] = await Promise.all([api("/staff"), api("/activity")]);
  const s = SETTINGS, owner = ME.role === "owner";
  const rz = s.razorpay;
  const sec = (id, title, body, note = "") => `<div class="card"><h2>${title}</h2>${note}<form class="form" data-sec="${id}" style="margin-top:10px">${body}${owner ? `<button class="b b--primary" style="justify-self:end">Save</button>` : `<p class="small muted">Only the owner can change this.</p>`}</form></div>`;
  view.innerHTML = `
  <div class="head"><h1>Settings</h1></div>
  <div class="grid2"><div>
    ${sec("store", "Store details", `<div class="two"><label>Store name<input name="name" value="${h(s.store.name)}"></label><label>Legal name<input name="legal_name" value="${h(s.store.legal_name)}"></label></div>
      <div class="two"><label>GSTIN<input name="gstin" value="${h(s.store.gstin)}" placeholder="23ABCDE1234F1Z5"></label><label>Order number prefix<input name="order_prefix" value="${h(s.store.order_prefix)}"></label></div>
      <div class="three"><label>Email<input name="email" value="${h(s.store.email)}"></label><label>Phone<input name="phone" value="${h(s.store.phone)}"></label><label>WhatsApp (with 91)<input name="whatsapp" value="${h(s.store.whatsapp)}"></label></div>
      <label>Address (for invoices)<textarea name="address" rows="2">${h(s.store.address)}</textarea></label>
      <label>State (for CGST/SGST vs IGST)<select name="state">${s.states.map(x => `<option ${x === (s.store.state || "Madhya Pradesh") ? "selected" : ""}>${h(x)}</option>`).join("")}</select></label>`)}
    ${sec("shipping", "Shipping", `<div class="two"><label>Flat shipping rate (₹)<input name="flat_rate" type="number" min="0" value="${s.shipping.flat_rate}"></label>
      <label>Free shipping on orders from (₹) <span class="hint">0 = never</span><input name="free_above" type="number" min="0" value="${s.shipping.free_above}"></label></div>
      <div class="two"><label>Processing time (days)<input name="processing_days" value="${h(s.shipping.processing_days)}"></label><label>Delivery time (days)<input name="delivery_days" value="${h(s.shipping.delivery_days)}"></label></div>`)}
    ${sec("payments", "Payments", `
      <div class="card" style="background:var(--mist-pale)"><b>Razorpay (UPI, cards, net banking, wallets)</b><p class="small" style="margin-top:4px">Status: ${{ live: '<span class="badge good">Live</span>', test: '<span class="badge info">Test mode</span>', demo: '<span class="badge warn">Demo — not real</span>', off: '<span class="badge">Not connected</span>' }[rz.mode]} ${rz.keyId ? `<span class="mono">${h(rz.keyId)}</span>` : ""}</p>
        <p class="small muted" style="margin-top:6px">Keys are set on the server as RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET (never stored here). See SETUP.md.</p></div>
      <label class="check"><input type="checkbox" name="online_enabled" ${s.payments.online_enabled ? "checked" : ""}> Accept online payments</label>
      <label class="check"><input type="checkbox" name="cod_enabled" ${s.payments.cod_enabled ? "checked" : ""}> Accept cash on delivery</label>
      <div class="three"><label>COD fee (₹)<input name="cod_fee" type="number" min="0" value="${s.payments.cod_fee}"></label><label>COD max order (₹) <span class="hint">0 = no limit</span><input name="cod_max" type="number" min="0" value="${s.payments.cod_max}"></label>
        <label>GST rate on invoices (%)<input name="gst_rate" type="number" min="0" step="0.5" value="${s.payments.gst_rate}"></label></div>`)}
    ${sec("inventory", "Inventory", `<label>Default low-stock alert level<input name="low_stock_default" type="number" min="0" value="${s.inventory.low_stock_default}"></label>`)}
  </div><div>
    <div class="card"><h2>Your account</h2><form class="form" id="pw"><label>Current password<input name="current" type="password" required autocomplete="current-password"></label>
      <label>New password <span class="hint">(10+ characters)</span><input name="next" type="password" required minlength="10" autocomplete="new-password"></label><button class="b" style="justify-self:end">Change password</button></form></div>
    <div class="card"><div class="spread"><h2>Staff</h2>${owner ? `<button class="b b--sm" id="addStaff">Add staff</button>` : ""}</div>
      <table class="tbl small" style="margin-top:8px">${staff.map(a => `<tr><td>${h(a.name || a.email)}<div class="muted">${h(a.email)}</div></td><td><span class="badge ${a.role === "owner" ? "good" : ""}">${h(a.role)}</span></td>
        <td>${owner && a.id !== ME.id ? `<button class="link" data-rm="${a.id}">Remove</button>` : ""}</td></tr>`).join("")}</table>
      <p class="small muted" style="margin-top:8px">Staff can manage orders, products and customers. Only owners change settings and staff.</p></div>
    <div class="card"><h2>Activity log</h2><div style="max-height:420px;overflow-y:auto"><table class="tbl small">${activity.map(a => `<tr><td>${h(a.action)}${a.detail ? ` <span class="muted">${h(a.detail)}</span>` : ""}<div class="muted">${h(a.admin)} · ${when(a.created_at)}</div></td></tr>`).join("")}</table></div></div>
  </div></div>`;
  $$("form[data-sec]").forEach(f => (f.onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    $$("input[type=checkbox]", f).forEach(c => (v[c.name] = c.checked));
    try { SETTINGS[f.dataset.sec] = await api(`/settings/${f.dataset.sec}`, { method: "PUT", body: v }); toast("Settings saved"); } catch (ex) { fail(ex); }
  }));
  $("#pw").onsubmit = e => { e.preventDefault(); api("/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }).then(() => { toast("Password changed"); e.target.reset(); }, fail); };
  $("#addStaff")?.addEventListener("click", () => modal(`<h2>Add staff</h2><label>Name<input name="name"></label><label>Email<input name="email" type="email" required></label>
    <label>Temporary password <span class="hint">(10+ characters — share it privately)</span><input name="password" required minlength="10"></label>
    <label>Role<select name="role"><option value="staff">Staff</option><option value="owner">Owner</option></select></label>`,
    v => api("/staff", { method: "POST", body: v }).then(() => { toast("Staff added"); settings(); })));
  $$("[data-rm]").forEach(b => (b.onclick = () => confirm("Remove this staff account?") && api(`/staff/${b.dataset.rm}`, { method: "DELETE" }).then(settings, fail)));
}

boot();
