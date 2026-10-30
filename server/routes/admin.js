// Admin API (all routes require a logged-in admin except /login).
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const { db, DATA_DIR, getSettings, saveSettings, productOut, J, logActivity } = require("../db");
const A = require("../lib/auth");
const C = require("../lib/commerce");
const pay = require("../lib/payments");
const { cancelOrder, markPaid } = require("./store");

const r = express.Router();
const IST = "'+5 hours', '+30 minutes'";
const NOT_CANCELLED = "status != 'cancelled'";
const act = (req, action, detail) => logActivity(req.admin?.email, action, detail);

/* =========================================================== auth */
r.post("/login", (req, res) => {
  const ip = req.ip;
  if (!A.loginAllowed(ip)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const a = db.prepare("SELECT * FROM admins WHERE email = ?").get(email);
  if (!a || !A.checkPassword(String(req.body?.password || ""), a.pass_hash)) {
    A.loginFailed(ip);
    return res.status(401).json({ error: "Wrong email or password" });
  }
  A.setSession(res, a.id);
  logActivity(a.email, "login");
  res.json({ ok: true });
});
r.post("/logout", (req, res) => { A.clearSession(res); res.json({ ok: true }); });

r.use(A.requireAdmin);

r.get("/me", (req, res) => res.json({ ...req.admin, payments: pay.mode() }));
r.post("/password", (req, res) => {
  const { current, next } = req.body || {};
  const a = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.admin.id);
  if (!A.checkPassword(String(current || ""), a.pass_hash)) return res.status(400).json({ error: "Current password is wrong" });
  if (String(next || "").length < 10) return res.status(400).json({ error: "Use at least 10 characters" });
  db.prepare("UPDATE admins SET pass_hash = ? WHERE id = ?").run(A.hashPassword(next), a.id);
  act(req, "password.changed");
  res.json({ ok: true });
});

/* =========================================================== dashboard */
function range(q) {
  const days = Math.min(366, Math.max(1, parseInt(q.days, 10) || 30));
  const to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : null;
  const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : null;
  if (from && to) return { from, to };
  const end = new Date(Date.now() + 5.5 * 3600e3);
  const start = new Date(end - (days - 1) * 86400e3);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
const inRange = col => `date(${col}, ${IST}) BETWEEN :from AND :to`;

function summary({ from, to }) {
  const o = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) gross, COALESCE(SUM(refunded),0) refunded,
      COALESCE(SUM(discount),0) discounts, COALESCE(SUM(shipping),0) shipping
    FROM orders WHERE ${NOT_CANCELLED} AND ${inRange("created_at")}`).get({ from, to });
  const sessions = db.prepare(`SELECT COUNT(DISTINCT session) n FROM events WHERE ${inRange("created_at")}`).get({ from, to }).n;
  const funnel = Object.fromEntries(["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"].map(t =>
    [t, db.prepare(`SELECT COUNT(DISTINCT session) n FROM events WHERE type = :t AND ${inRange("created_at")}`).get({ t, from, to }).n]));
  const net = o.gross - o.refunded;
  return { ...o, net, aov: o.orders ? Math.round(o.gross / o.orders) : 0, sessions,
    conversion: sessions ? +(100 * Math.min(funnel.purchase, sessions) / sessions).toFixed(2) : 0, funnel };
}

function dailySeries({ from, to }) {
  const rows = db.prepare(`SELECT date(created_at, ${IST}) d, COUNT(*) orders, SUM(total) sales FROM orders
    WHERE ${NOT_CANCELLED} AND ${inRange("created_at")} GROUP BY d`).all({ from, to });
  const visits = db.prepare(`SELECT date(created_at, ${IST}) d, COUNT(DISTINCT session) sessions FROM events
    WHERE ${inRange("created_at")} GROUP BY d`).all({ from, to });
  const map = Object.fromEntries(rows.map(x => [x.d, x]));
  const vmap = Object.fromEntries(visits.map(x => [x.d, x.sessions]));
  const out = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d = new Date(+d + 86400e3)) {
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, orders: map[k]?.orders || 0, sales: map[k]?.sales || 0, sessions: vmap[k] || 0 });
  }
  return out;
}

r.get("/dashboard", (req, res) => {
  const rg = range(req.query);
  const days = Math.round((new Date(rg.to) - new Date(rg.from)) / 86400e3) + 1;
  const prevTo = new Date(new Date(rg.from) - 86400e3).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(rg.from) - days * 86400e3).toISOString().slice(0, 10);
  res.json({
    range: rg, summary: summary(rg), previous: summary({ from: prevFrom, to: prevTo }), series: dailySeries(rg),
    topProducts: db.prepare(`SELECT i.name, i.size, i.slug, SUM(i.qty) units, SUM(i.qty * i.price) sales FROM order_items i
      JOIN orders o ON o.id = i.order_id WHERE o.${NOT_CANCELLED} AND ${inRange("o.created_at")}
      GROUP BY i.slug, i.size ORDER BY sales DESC LIMIT 5`).all(rg),
    recent: db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 6").all().map(listRow),
    todo: {
      toFulfil: db.prepare(`SELECT COUNT(*) n FROM orders WHERE status = 'open' AND fulfillment_status IN ('unfulfilled','packed')
        AND (payment_status = 'paid' OR payment_method = 'cod')`).get().n,
      unpaidOnline: db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'open' AND payment_method = 'online' AND payment_status = 'pending'").get().n,
      abandoned: db.prepare("SELECT COUNT(*) n FROM checkouts WHERE status = 'open' AND updated_at < datetime('now', '-1 hour') AND updated_at > datetime('now', '-14 days')").get().n,
      lowStock: db.prepare("SELECT COUNT(*) n FROM products WHERE track_stock = 1 AND status = 'active' AND stock <= low_stock").get().n,
    },
  });
});

/* =========================================================== orders */
function listRow(o) {
  return { number: o.number, createdAt: o.created_at, name: o.name, phone: o.phone, total: o.total, refunded: o.refunded,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status, fulfillmentStatus: o.fulfillment_status, status: o.status,
    items: db.prepare("SELECT COUNT(*) n, SUM(qty) q FROM order_items WHERE order_id = ?").get(o.id).q || 0,
    city: J(o.address, {}).city, source: o.source };
}

function orderFilters(q) {
  const where = [], p = {};
  if (q.status === "open") where.push("status = 'open'");
  if (q.status === "cancelled") where.push("status = 'cancelled'");
  if (q.status === "archived") where.push("status = 'archived'");
  if (q.payment) { where.push("payment_status = :pay"); p.pay = q.payment; }
  if (q.method) { where.push("payment_method = :method"); p.method = q.method; }
  if (q.fulfillment) { where.push("fulfillment_status = :ful"); p.ful = q.fulfillment; }
  if (q.q) { where.push("(number LIKE :q OR name LIKE :q OR phone LIKE :q OR email LIKE :q OR awb LIKE :q)"); p.q = `%${q.q}%`; }
  if (q.from) { where.push(`date(created_at, ${IST}) >= :from`); p.from = q.from; }
  if (q.to) { where.push(`date(created_at, ${IST}) <= :to`); p.to = q.to; }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", p };
}

r.get("/orders", (req, res) => {
  const { sql, p } = orderFilters(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), per = 25;
  const total = db.prepare(`SELECT COUNT(*) n FROM orders ${sql}`).get(p).n;
  const rows = db.prepare(`SELECT * FROM orders ${sql} ORDER BY id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`).all(p);
  res.json({ total, page, pages: Math.max(1, Math.ceil(total / per)), orders: rows.map(listRow) });
});

const getOrder = n => db.prepare("SELECT * FROM orders WHERE number = ?").get(n);
function withOrder(handler) {
  return (req, res) => {
    const o = getOrder(req.params.number);
    if (!o) return res.status(404).json({ error: "Order not found" });
    return handler(req, res, o);
  };
}
const sendOrder = (res, number) => res.json(detail(getOrder(number)));
function detail(o) {
  const out = C.orderOut(o, { admin: true });
  out.customer = o.customer_id ? db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id AND status != 'cancelled') orders,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE customer_id = c.id AND status != 'cancelled') spent FROM customers c WHERE id = ?`).get(o.customer_id) : null;
  out.couriers = Object.keys(C.COURIERS);
  return out;
}

r.get("/orders/:number", withOrder((req, res, o) => res.json(detail(o))));

r.patch("/orders/:number", withOrder((req, res, o) => {
  const { notes, tags } = req.body || {};
  db.prepare("UPDATE orders SET notes = COALESCE(?, notes), tags = COALESCE(?, tags), updated_at = datetime('now') WHERE id = ?")
    .run(notes ?? null, tags ?? null, o.id);
  if (notes != null) C.addEvent(o.id, "note", "Note updated", { by: req.admin.email });
  sendOrder(res, o.number);
}));

r.post("/orders/:number/comment", withOrder((req, res, o) => {
  const msg = String(req.body?.message || "").trim().slice(0, 1000);
  if (!msg) return res.status(400).json({ error: "Write a comment first" });
  C.addEvent(o.id, "comment", msg, { by: req.admin.email });
  sendOrder(res, o.number);
}));

r.post("/orders/:number/fulfill", withOrder((req, res, o) => {
  if (o.status === "cancelled") return res.status(400).json({ error: "This order is cancelled" });
  const courier = String(req.body?.courier || "").slice(0, 60), awb = String(req.body?.awb || "").trim().slice(0, 60);
  if (!courier || !awb) return res.status(400).json({ error: "Choose a courier and enter the AWB / tracking number" });
  const url = String(req.body?.trackingUrl || "").trim() || C.trackingUrl(courier, awb);
  db.prepare("UPDATE orders SET courier = ?, awb = ?, tracking_url = ?, fulfillment_status = 'shipped', shipped_at = COALESCE(shipped_at, datetime('now')) WHERE id = ?")
    .run(courier, awb, url || null, o.id);
  C.addEvent(o.id, "shipped", `Shipped with ${courier} · AWB ${awb}`, { pub: true, by: req.admin.email });
  act(req, "order.shipped", o.number);
  sendOrder(res, o.number);
}));

r.post("/orders/:number/status", withOrder((req, res, o) => {
  const st = req.body?.fulfillment;
  if (!C.FULFILLMENT_LABELS[st]) return res.status(400).json({ error: "Unknown status" });
  if (o.status === "cancelled") return res.status(400).json({ error: "This order is cancelled" });
  db.prepare(`UPDATE orders SET fulfillment_status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
    shipped_at = CASE WHEN ? IN ('shipped','out_for_delivery','delivered') THEN COALESCE(shipped_at, datetime('now')) ELSE shipped_at END WHERE id = ?`).run(st, st, st, o.id);
  if (st === "delivered" && o.payment_method === "cod" && o.payment_status !== "paid") {
    markPaid(o, null, "cash collected on delivery");
  }
  if (st === "rto" || st === "returned") C.releaseOrder(o, req.admin.email, st === "rto" ? "RTO" : "Return");
  C.addEvent(o.id, st, String(req.body?.message || C.FULFILLMENT_LABELS[st]).slice(0, 300), { pub: true, by: req.admin.email });
  act(req, `order.${st}`, o.number);
  sendOrder(res, o.number);
}));

r.post("/orders/:number/mark-paid", withOrder((req, res, o) => {
  markPaid(o, null, `marked paid by ${req.admin.email}`);
  act(req, "order.marked_paid", o.number);
  sendOrder(res, o.number);
}));

r.post("/orders/:number/cancel", withOrder((req, res, o) => {
  if (o.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });
  if (o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered") return res.status(400).json({ error: "This order has shipped. Mark it as returned / RTO instead." });
  cancelOrder(o, `Cancelled by store${req.body?.reason ? ": " + String(req.body.reason).slice(0, 200) : ""}`);
  act(req, "order.cancelled", o.number);
  sendOrder(res, o.number);
}));

r.post("/orders/:number/refund", withOrder(async (req, res, o) => {
  const amount = Math.round(Number(req.body?.amount));
  const max = o.total - o.refunded;
  if (!(amount > 0 && amount <= max)) return res.status(400).json({ error: `Refund between ₹1 and ₹${max}` });
  if (o.payment_status !== "paid" && o.payment_status !== "partially_refunded") return res.status(400).json({ error: "Only paid orders can be refunded" });
  let via = "manual (bank / UPI transfer)";
  if (o.payment_method === "online" && o.rzp_payment_id && pay.configured() && !req.body?.manual) {
    try { await pay.refund(o.rzp_payment_id, amount, { order: o.number }); via = "Razorpay"; }
    catch (e) { return res.status(502).json({ error: "Razorpay refund failed: " + e.message }); }
  }
  const refunded = o.refunded + amount;
  db.prepare("UPDATE orders SET refunded = ?, payment_status = ? WHERE id = ?").run(refunded, refunded >= o.total ? "refunded" : "partially_refunded", o.id);
  C.addEvent(o.id, "refund", `Refunded ₹${amount} via ${via}${req.body?.reason ? " · " + String(req.body.reason).slice(0, 200) : ""}`, { pub: true, by: req.admin.email });
  act(req, "order.refunded", `${o.number} ₹${amount}`);
  sendOrder(res, o.number);
}));

r.post("/orders/:number/archive", withOrder((req, res, o) => {
  db.prepare("UPDATE orders SET status = CASE WHEN status = 'archived' THEN 'open' ELSE 'archived' END WHERE id = ? AND status != 'cancelled'").run(o.id);
  sendOrder(res, o.number);
}));

/* ---------- invoice / packing slip (printable HTML) ---------- */
r.get("/orders/:number/invoice", withOrder((req, res, o) => {
  const s = getSettings();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
  const addr = J(o.address, {});
  const slip = req.query.type === "slip";
  const rate = Number(s.payments.gst_rate) || 0;
  const intra = (s.store.state || "Madhya Pradesh") === addr.state;
  const taxable = Math.round((o.total / (1 + rate / 100)) * 100) / 100;
  const tax = Math.round((o.total - taxable) * 100) / 100;
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inr = n => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${slip ? "Packing slip" : "Invoice"} ${o.number}</title>
<style>body{font:13px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#1D2E1B;max-width:800px;margin:30px auto;padding:0 24px}
h1{font:400 30px Georgia,serif;margin:0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ccd}
th{background:#EBEFDD}td.r,th.r{text-align:right}.grid{display:flex;justify-content:space-between;gap:30px;margin-top:24px}.muted{color:#556}
.tot td{border:0;padding:4px 8px}.big{font-size:16px;font-weight:700}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 16px">Print</button>
<h1>${slip ? "Packing slip" : "Tax invoice"}</h1><p class="muted">${esc(s.store.legal_name)}${s.store.gstin ? " · GSTIN " + esc(s.store.gstin) : ""}<br>${esc(s.store.address)}<br>${esc(s.store.email)} · ${esc(s.store.phone)}</p>
<div class="grid"><div><b>Ship to</b><br>${esc(o.name)}<br>${esc(addr.line1)}${addr.line2 ? "<br>" + esc(addr.line2) : ""}${addr.landmark ? "<br>Landmark: " + esc(addr.landmark) : ""}<br>${esc(addr.city)}, ${esc(addr.state)} – ${esc(addr.pincode)}<br>Phone: +91 ${esc(o.phone)}</div>
<div style="text-align:right"><b>Order ${esc(o.number)}</b><br>Date: ${esc(o.created_at.slice(0, 10))}<br>Payment: ${o.payment_method === "cod" ? "Cash on delivery" : "Prepaid (online)"}${o.awb ? `<br>${esc(o.courier)} · AWB ${esc(o.awb)}` : ""}</div></div>
<table><tr><th>Item</th><th>SKU</th><th class="r">Qty</th>${slip ? "" : '<th class="r">Price</th><th class="r">Amount</th>'}</tr>
${items.map(i => `<tr><td>${esc(i.name)} – ${esc(i.size)}</td><td>${esc(i.sku || "")}</td><td class="r">${i.qty}</td>${slip ? "" : `<td class="r">${inr(i.price)}</td><td class="r">${inr(i.price * i.qty)}</td>`}</tr>`).join("")}</table>
${slip ? `<p>${o.customer_note ? "Customer note: " + esc(o.customer_note) : ""}</p>` : `<table class="tot">
<tr><td class="r">Subtotal</td><td class="r" style="width:140px">${inr(o.subtotal)}</td></tr>
${o.discount ? `<tr><td class="r">Discount ${esc(o.discount_code || "")}</td><td class="r">−${inr(o.discount)}</td></tr>` : ""}
<tr><td class="r">Shipping</td><td class="r">${inr(o.shipping)}</td></tr>${o.cod_fee ? `<tr><td class="r">COD fee</td><td class="r">${inr(o.cod_fee)}</td></tr>` : ""}
<tr><td class="r big">Total (incl. GST)</td><td class="r big">${inr(o.total)}</td></tr>
<tr><td class="r muted">Taxable value</td><td class="r muted">${inr(taxable)}</td></tr>
${intra ? `<tr><td class="r muted">CGST ${rate / 2}%</td><td class="r muted">${inr(tax / 2)}</td></tr><tr><td class="r muted">SGST ${rate / 2}%</td><td class="r muted">${inr(tax / 2)}</td></tr>`
    : `<tr><td class="r muted">IGST ${rate}%</td><td class="r muted">${inr(tax)}</td></tr>`}
${o.refunded ? `<tr><td class="r">Refunded</td><td class="r">−${inr(o.refunded)}</td></tr>` : ""}</table>
<p class="muted">GST shown at a single ${rate}% rate on the order total. Check rates per item (HSN) with your accountant before using this as a tax invoice.</p>`}
</body></html>`);
}));

/* =========================================================== products & inventory */
const PRODUCT_FIELDS = ["slug", "name", "short", "brand", "size", "code", "price", "mrp", "stock", "low_stock", "track_stock", "img", "back",
  "photo", "tag", "pitch", "taste", "use_title", "why_title", "hsn", "weight_g", "status", "sort"];
const JSON_FIELDS = ["cats", "brew", "why"];

function productInput(b, existing) {
  const v = {};
  const map = { lowStock: "low_stock", trackStock: "track_stock", useTitle: "use_title", whyTitle: "why_title", weightG: "weight_g" };
  for (const [k, val] of Object.entries(b || {})) {
    const col = map[k] || k;
    if (PRODUCT_FIELDS.includes(col)) v[col] = typeof val === "boolean" ? (val ? 1 : 0) : val === "" ? null : val;
    if (JSON_FIELDS.includes(col)) v[col] = JSON.stringify(Array.isArray(val) ? val.map(String).filter(Boolean) : []);
  }
  if (!existing || "slug" in v) v.slug = String(v.slug || b.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const k of ["price", "mrp", "stock", "low_stock", "sort", "weight_g"]) if (k in v && v[k] != null) v[k] = Math.round(Number(v[k]) || 0);
  if (!existing) { if (!v.name) throw new Error("Name is required"); if (!(v.price > 0)) throw new Error("Price is required"); }
  if ("mrp" in v && "price" in v && v.mrp < v.price) v.mrp = v.price;
  if ("status" in v && !["active", "draft"].includes(v.status)) v.status = "draft";
  return v;
}

r.get("/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY sort, id").all().map(productOut);
  const sold = Object.fromEntries(db.prepare(`SELECT i.product_id id, SUM(i.qty) n FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.${NOT_CANCELLED} AND o.created_at > datetime('now', '-30 days') GROUP BY i.product_id`).all().map(x => [x.id, x.n]));
  res.json(rows.map(p => ({ ...p, sold30: sold[p.id] || 0 })));
});
r.get("/products/:id", (req, res) => {
  const p = productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id));
  if (!p) return res.status(404).json({ error: "Not found" });
  p.log = db.prepare("SELECT * FROM inventory_log WHERE product_id = ? ORDER BY id DESC LIMIT 30").all(p.id);
  res.json(p);
});
r.post("/products", (req, res) => {
  try {
    const v = productInput(req.body);
    if (!v.cats) v.cats = "[]";
    const cols = Object.keys(v);
    const id = db.prepare(`INSERT INTO products (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...Object.values(v)).lastInsertRowid;
    if (v.stock) db.prepare("INSERT INTO inventory_log (product_id, change, reason, stock_after, by) VALUES (?, ?, 'Initial stock', ?, ?)").run(id, v.stock, v.stock, req.admin.email);
    act(req, "product.created", v.name);
    res.json(productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(id)));
  } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? "That URL handle is already used" : e.message }); }
});
r.put("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  try {
    const v = productInput(req.body, p);
    if ("stock" in v && v.stock !== p.stock) {
      C.adjustStock(p.id, v.stock - p.stock, "Edited in product form", req.admin.email);
      delete v.stock;
    }
    if (Object.keys(v).length) {
      db.prepare(`UPDATE products SET ${Object.keys(v).map(k => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(v), p.id);
    }
    act(req, "product.updated", p.name);
    res.json(productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(p.id)));
  } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? "That URL handle is already used" : e.message }); }
});
r.delete("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const sold = db.prepare("SELECT 1 FROM order_items WHERE product_id = ?").get(p.id);
  if (sold) { db.prepare("UPDATE products SET status = 'draft' WHERE id = ?").run(p.id); act(req, "product.hidden", p.name); return res.json({ hidden: true }); }
  db.prepare("DELETE FROM products WHERE id = ?").run(p.id);
  act(req, "product.deleted", p.name);
  res.json({ deleted: true });
});
r.post("/products/:id/stock", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  let change = Math.round(Number(req.body?.change) || 0);
  if (req.body?.set != null) change = Math.round(Number(req.body.set)) - p.stock;
  if (!change) return res.json(productOut(p));
  C.adjustStock(p.id, change, String(req.body?.reason || "Manual adjustment").slice(0, 120), req.admin.email);
  act(req, "inventory.adjusted", `${p.name} ${change > 0 ? "+" : ""}${change}`);
  res.json(productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(p.id)));
});
r.get("/inventory/log", (req, res) => {
  res.json(db.prepare(`SELECT l.*, p.name, p.size FROM inventory_log l JOIN products p ON p.id = l.product_id ORDER BY l.id DESC LIMIT 200`).all());
});

r.post("/upload", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "8mb" }), (req, res) => {
  const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[req.headers["content-type"]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Upload a PNG, JPG or WebP image under 8 MB" });
  const name = `${Date.now()}-${C.randomKey(5)}${ext}`;
  fs.writeFileSync(path.join(DATA_DIR, "uploads", name), req.body);
  act(req, "image.uploaded", name);
  res.json({ url: `/uploads/${name}` });
});

/* =========================================================== customers */
r.get("/customers", (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const rows = db.prepare(`SELECT c.*, COUNT(o.id) orders, COALESCE(SUM(o.total - o.refunded),0) spent, MAX(o.created_at) last_order,
      MAX(o.address) address
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled'
    ${q ? "WHERE c.name LIKE :q OR c.phone LIKE :q OR c.email LIKE :q" : ""}
    GROUP BY c.id ORDER BY ${req.query.sort === "spent" ? "spent DESC" : "c.id DESC"} LIMIT 500`).all(q ? { q } : {});
  res.json(rows.map(c => ({ ...c, city: J(c.address, {}).city, state: J(c.address, {}).state, address: undefined })));
});
r.get("/customers/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  c.orders = db.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC").all(c.id).map(listRow);
  c.spent = c.orders.filter(o => o.status !== "cancelled").reduce((a, o) => a + o.total - o.refunded, 0);
  res.json(c);
});
r.patch("/customers/:id", (req, res) => {
  const { notes, tags, accepts_marketing } = req.body || {};
  db.prepare("UPDATE customers SET notes = COALESCE(?, notes), tags = COALESCE(?, tags), accepts_marketing = COALESCE(?, accepts_marketing) WHERE id = ?")
    .run(notes ?? null, tags ?? null, accepts_marketing == null ? null : accepts_marketing ? 1 : 0, req.params.id);
  res.json(db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id));
});

/* =========================================================== abandoned checkouts */
r.get("/checkouts", (req, res) => {
  const rows = db.prepare(`SELECT * FROM checkouts WHERE status = 'open' AND updated_at < datetime('now', '-30 minutes')
    ORDER BY updated_at DESC LIMIT 200`).all();
  const recovered = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(o.total),0) v FROM checkouts c JOIN orders o ON o.id = c.order_id
    WHERE c.reminded_at IS NOT NULL AND c.status = 'converted'`).get();
  res.json({ checkouts: rows.map(c => ({ ...c, cart: J(c.cart, []) })), recovered });
});
r.post("/checkouts/:id/reminded", (req, res) => {
  db.prepare("UPDATE checkouts SET reminded_at = datetime('now') WHERE id = ?").run(req.params.id);
  act(req, "checkout.reminded", req.params.id);
  res.json({ ok: true });
});

/* =========================================================== discounts */
function discountInput(b) {
  const type = ["percent", "fixed", "free_shipping"].includes(b.type) ? b.type : "percent";
  const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!code) throw new Error("Enter a code");
  const value = Math.round(Number(b.value) || 0);
  if (type === "percent" && !(value > 0 && value <= 100)) throw new Error("Percentage must be between 1 and 100");
  if (type === "fixed" && !(value > 0)) throw new Error("Enter an amount");
  return { code, type, value: type === "free_shipping" ? 0 : value, min_subtotal: Math.round(Number(b.min_subtotal) || 0),
    usage_limit: b.usage_limit === "" || b.usage_limit == null ? null : Math.round(Number(b.usage_limit)),
    once_per_customer: b.once_per_customer ? 1 : 0, starts_at: b.starts_at || null, ends_at: b.ends_at || null,
    active: b.active === false || b.active === 0 ? 0 : 1, description: b.description || null };
}
r.get("/discounts", (req, res) => {
  res.json(db.prepare(`SELECT d.*, (SELECT COALESCE(SUM(discount),0) FROM orders WHERE discount_code = d.code COLLATE NOCASE AND status != 'cancelled') given,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE discount_code = d.code COLLATE NOCASE AND status != 'cancelled') sales FROM discounts d ORDER BY id DESC`).all());
});
r.post("/discounts", (req, res) => {
  try {
    const v = discountInput(req.body || {});
    const cols = Object.keys(v);
    db.prepare(`INSERT INTO discounts (${cols}) VALUES (${cols.map(() => "?")})`).run(...Object.values(v));
    act(req, "discount.created", v.code);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? "That code already exists" : e.message }); }
});
r.put("/discounts/:id", (req, res) => {
  try {
    const v = discountInput(req.body || {});
    db.prepare(`UPDATE discounts SET ${Object.keys(v).map(k => `${k} = ?`)} WHERE id = ?`).run(...Object.values(v), req.params.id);
    act(req, "discount.updated", v.code);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: /UNIQUE/.test(e.message) ? "That code already exists" : e.message }); }
});
r.delete("/discounts/:id", (req, res) => {
  db.prepare("DELETE FROM discounts WHERE id = ?").run(req.params.id);
  act(req, "discount.deleted", req.params.id);
  res.json({ ok: true });
});

/* =========================================================== marketing */
r.get("/subscribers", (req, res) => res.json(db.prepare("SELECT * FROM subscribers ORDER BY id DESC").all()));
r.delete("/subscribers/:id", (req, res) => { db.prepare("DELETE FROM subscribers WHERE id = ?").run(req.params.id); res.json({ ok: true }); });

/* =========================================================== reports */
r.get("/reports", (req, res) => {
  const rg = range(req.query);
  const q = (sql) => db.prepare(sql).all(rg);
  const base = `FROM orders o WHERE o.${NOT_CANCELLED} AND ${inRange("o.created_at")}`;
  res.json({
    range: rg, summary: summary(rg), series: dailySeries(rg),
    byProduct: q(`SELECT i.name, i.size, i.sku, SUM(i.qty) units, SUM(i.qty * i.price) sales, COUNT(DISTINCT o.id) orders
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.${NOT_CANCELLED} AND ${inRange("o.created_at")}
      GROUP BY i.slug, i.size ORDER BY sales DESC`),
    byCategory: (() => {
      const rows = q(`SELECT p.cats, SUM(i.qty) units, SUM(i.qty * i.price) sales FROM order_items i JOIN orders o ON o.id = i.order_id
        LEFT JOIN products p ON p.id = i.product_id WHERE o.${NOT_CANCELLED} AND ${inRange("o.created_at")} GROUP BY i.product_id`);
      const acc = {};
      for (const r of rows) { const c = J(r.cats, ["other"])[0] || "other"; acc[c] = acc[c] || { category: c, units: 0, sales: 0 }; acc[c].units += r.units; acc[c].sales += r.sales; }
      return Object.values(acc).sort((a, b) => b.sales - a.sales);
    })(),
    byPayment: q(`SELECT payment_method method, payment_status status, COUNT(*) orders, SUM(total) sales ${base} GROUP BY method, status`),
    byState: q(`SELECT json_extract(address, '$.state') state, COUNT(*) orders, SUM(total) sales ${base} GROUP BY state ORDER BY sales DESC`),
    byCity: q(`SELECT json_extract(address, '$.city') city, json_extract(address, '$.state') state, COUNT(*) orders, SUM(total) sales ${base} GROUP BY lower(city) ORDER BY sales DESC LIMIT 20`),
    bySource: q(`SELECT COALESCE(source, CASE WHEN referrer IS NULL OR referrer = '' THEN '(direct)' ELSE referrer END) source,
      COALESCE(medium, '') medium, COALESCE(campaign, '') campaign, COUNT(*) orders, SUM(total) sales ${base} GROUP BY 1, 2, 3 ORDER BY sales DESC`),
    trafficSources: q(`SELECT COALESCE(source, CASE WHEN referrer IS NULL OR referrer = '' THEN '(direct)' ELSE referrer END) source,
      COALESCE(medium, '') medium, COUNT(DISTINCT session) sessions FROM events WHERE ${inRange("created_at")} GROUP BY 1, 2 ORDER BY sessions DESC LIMIT 20`),
    devices: q(`SELECT device, COUNT(DISTINCT session) sessions FROM events WHERE ${inRange("created_at")} GROUP BY device`),
    topPages: q(`SELECT path, COUNT(*) views FROM events WHERE type = 'page_view' AND ${inRange("created_at")} GROUP BY path ORDER BY views DESC LIMIT 15`),
    discounts: q(`SELECT discount_code code, COUNT(*) orders, SUM(discount) given, SUM(total) sales ${base} AND discount_code IS NOT NULL GROUP BY code ORDER BY orders DESC`),
    customers: db.prepare(`SELECT SUM(CASE WHEN first = 1 THEN 1 ELSE 0 END) new_customers, SUM(CASE WHEN first = 0 THEN 1 ELSE 0 END) returning_customers FROM (
      SELECT o.customer_id, CASE WHEN EXISTS (SELECT 1 FROM orders p WHERE p.customer_id = o.customer_id AND p.id < o.id AND p.status != 'cancelled') THEN 0 ELSE 1 END first
      ${base})`).get(rg),
    fulfillment: q(`SELECT fulfillment_status status, COUNT(*) orders ${base} GROUP BY status`),
    refunds: db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(refunded),0) amount FROM orders o WHERE refunded > 0 AND ${inRange("o.created_at")}`).get(rg),
    cancelled: db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) amount FROM orders o WHERE status = 'cancelled' AND ${inRange("o.created_at")}`).get(rg),
  });
});

/* =========================================================== CSV exports */
function csv(res, name, rows, cols) {
  const cell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + [cols.map(c => c[0]).join(","), ...rows.map(r => cols.map(c => cell(typeof c[1] === "function" ? c[1](r) : r[c[1]])).join(","))].join("\n"));
}
r.get("/export/orders.csv", (req, res) => {
  const { sql, p } = orderFilters(req.query);
  const rows = db.prepare(`SELECT o.*, (SELECT group_concat(name || ' ' || size || ' x' || qty, '; ') FROM order_items WHERE order_id = o.id) items FROM orders o ${sql} ORDER BY id DESC`).all(p);
  csv(res, "orders", rows, [["Order", "number"], ["Date", "created_at"], ["Name", "name"], ["Phone", "phone"], ["Email", "email"],
    ["Address", o => { const a = J(o.address, {}); return [a.line1, a.line2, a.landmark].filter(Boolean).join(", "); }],
    ["City", o => J(o.address, {}).city], ["State", o => J(o.address, {}).state], ["PIN", o => J(o.address, {}).pincode],
    ["Items", "items"], ["Subtotal", "subtotal"], ["Discount", "discount"], ["Code", "discount_code"], ["Shipping", "shipping"], ["COD fee", "cod_fee"],
    ["Total", "total"], ["Refunded", "refunded"], ["Payment", "payment_method"], ["Payment status", "payment_status"],
    ["Fulfilment", "fulfillment_status"], ["Status", "status"], ["Courier", "courier"], ["AWB", "awb"], ["Source", "source"], ["Medium", "medium"], ["Campaign", "campaign"]]);
});
r.get("/export/customers.csv", (req, res) => {
  const rows = db.prepare(`SELECT c.*, COUNT(o.id) orders, COALESCE(SUM(o.total - o.refunded),0) spent FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled' GROUP BY c.id ORDER BY c.id`).all();
  csv(res, "customers", rows, [["Name", "name"], ["Phone", "phone"], ["Email", "email"], ["Accepts marketing", r => (r.accepts_marketing ? "yes" : "no")],
    ["Orders", "orders"], ["Total spent", "spent"], ["Tags", "tags"], ["Since", "created_at"]]);
});
r.get("/export/subscribers.csv", (req, res) => {
  csv(res, "subscribers", db.prepare("SELECT * FROM subscribers ORDER BY id").all(), [["Email", "email"], ["Source", "source"], ["Subscribed", "created_at"]]);
});
r.get("/export/products.csv", (req, res) => {
  csv(res, "products", db.prepare("SELECT * FROM products ORDER BY sort, id").all(), [["Handle", "slug"], ["Name", "name"], ["Brand", "brand"],
    ["Categories", r => J(r.cats, []).join("|")], ["Size", "size"], ["SKU", "code"], ["HSN", "hsn"], ["Price", "price"], ["MRP", "mrp"], ["Stock", "stock"], ["Status", "status"]]);
});
r.get("/export/checkouts.csv", (req, res) => {
  csv(res, "abandoned-checkouts", db.prepare("SELECT * FROM checkouts WHERE status = 'open' ORDER BY id DESC").all(),
    [["Name", "name"], ["Phone", "phone"], ["Email", "email"], ["Cart", r => J(r.cart, []).map(i => `${i.name} x${i.qty}`).join("; ")], ["Value", "subtotal"], ["Updated", "updated_at"]]);
});

/* =========================================================== settings, staff, activity */
r.get("/settings", (req, res) => res.json({ ...getSettings(), razorpay: { mode: pay.mode(), keyId: pay.KEY_ID ? pay.KEY_ID.slice(0, 12) + "…" : "" },
  couriers: Object.keys(C.COURIERS), states: C.INDIAN_STATES }));
r.put("/settings/:section", A.requireOwner, (req, res) => {
  const allowed = { store: ["name", "legal_name", "gstin", "email", "phone", "whatsapp", "address", "state", "order_prefix"],
    shipping: ["flat_rate", "free_above", "processing_days", "delivery_days"],
    payments: ["cod_enabled", "cod_fee", "cod_max", "online_enabled", "gst_rate"],
    marketing: ["announcement", "ga4_id", "meta_pixel_id"], inventory: ["low_stock_default"] }[req.params.section];
  if (!allowed) return res.status(404).json({ error: "Unknown section" });
  const v = {};
  for (const k of allowed) if (k in (req.body || {})) v[k] = req.body[k];
  for (const k of ["flat_rate", "free_above", "cod_fee", "cod_max", "gst_rate", "low_stock_default"]) if (k in v) v[k] = Math.max(0, Number(v[k]) || 0);
  if ("ga4_id" in v && v.ga4_id && !/^G-[A-Z0-9]{4,}$/i.test(v.ga4_id)) return res.status(400).json({ error: "GA4 ID looks like G-XXXXXXX" });
  if ("meta_pixel_id" in v && v.meta_pixel_id && !/^\d{6,20}$/.test(v.meta_pixel_id)) return res.status(400).json({ error: "Meta Pixel ID is a number" });
  const out = saveSettings(req.params.section, v);
  act(req, `settings.${req.params.section}`);
  res.json(out);
});

r.get("/staff", (req, res) => res.json(db.prepare("SELECT id, email, name, role, created_at FROM admins ORDER BY id").all()));
r.post("/staff", A.requireOwner, (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const pw = String(req.body?.password || "");
  if (!C.validEmail(email) || !email) return res.status(400).json({ error: "Enter a valid email" });
  if (pw.length < 10) return res.status(400).json({ error: "Password needs at least 10 characters" });
  try {
    db.prepare("INSERT INTO admins (email, name, pass_hash, role) VALUES (?, ?, ?, ?)").run(email, req.body?.name || null, A.hashPassword(pw), req.body?.role === "owner" ? "owner" : "staff");
  } catch { return res.status(400).json({ error: "That email already has an account" }); }
  act(req, "staff.added", email);
  res.json({ ok: true });
});
r.delete("/staff/:id", A.requireOwner, (req, res) => {
  if (+req.params.id === req.admin.id) return res.status(400).json({ error: "You can’t remove yourself" });
  db.prepare("DELETE FROM admins WHERE id = ?").run(req.params.id);
  act(req, "staff.removed", req.params.id);
  res.json({ ok: true });
});
r.get("/activity", (req, res) => res.json(db.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 200").all()));

module.exports = r;
