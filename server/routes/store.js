// Public storefront API: catalogue, config, cart quote, checkout, payment confirmation, tracking, newsletter, analytics.
const express = require("express");
const { db, getSettings, productOut, logActivity } = require("../db");
const pay = require("../lib/payments");
const C = require("../lib/commerce");

const r = express.Router();

r.get("/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE status = 'active' ORDER BY sort, id").all();
  res.json(rows.map(productOut).map(({ stock, lowStock, trackStock, status, sort, createdAt, updatedAt, hsn, weightG, ...p }) =>
    // Only reveal exact stock when it's low enough to show "Only N left".
    ({ ...p, left: trackStock && stock > 0 && stock <= 5 ? stock : undefined })));
});

r.get("/config", (req, res) => {
  const s = getSettings();
  res.json({
    announcement: s.marketing.announcement, ga4Id: s.marketing.ga4_id, metaPixelId: s.marketing.meta_pixel_id,
    whatsapp: s.store.whatsapp, phone: s.store.phone, email: s.store.email,
    shipping: { flatRate: s.shipping.flat_rate, freeAbove: s.shipping.free_above, deliveryDays: s.shipping.delivery_days },
    payments: {
      online: s.payments.online_enabled && pay.mode() !== "off", mode: pay.mode(), razorpayKey: pay.KEY_ID || null,
      cod: s.payments.cod_enabled, codFee: s.payments.cod_fee, codMax: s.payments.cod_max,
    },
    states: C.INDIAN_STATES,
  });
});

r.post("/cart/quote", (req, res) => res.json(C.quote(req.body || {})));

/* ---------- abandoned checkout capture ---------- */
r.post("/checkout/save", (req, res) => {
  const { token, name, email, phone, items = [] } = req.body || {};
  if (!token || typeof token !== "string" || token.length > 64) return res.status(400).json({ error: "Bad token" });
  if (!phone && !email) return res.json({ ok: true });
  const q = C.quote({ items });
  const cart = JSON.stringify(q.lines.map(l => ({ slug: l.slug, name: l.name, size: l.size, qty: l.qty, price: l.price })));
  db.prepare(`INSERT INTO checkouts (token, name, email, phone, cart, subtotal) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone,
      cart = excluded.cart, subtotal = excluded.subtotal, updated_at = datetime('now') WHERE status = 'open'`)
    .run(token, name || null, email || null, phone ? C.cleanPhone(phone) : null, cart, q.subtotal);
  res.json({ ok: true });
});

/* ---------- place order ---------- */
r.post("/orders", async (req, res) => {
  const b = req.body || {};
  const c = b.customer || {}, a = b.address || {};
  const phone = C.cleanPhone(c.phone);
  const fail = msg => res.status(400).json({ error: msg });

  if (!c.name || String(c.name).trim().length < 2) return fail("Please enter your full name");
  if (!C.validPhone(phone)) return fail("Please enter a valid 10-digit mobile number");
  if (!C.validEmail(c.email)) return fail("Please enter a valid email address");
  if (!a.line1 || !a.city || !a.state) return fail("Please complete your delivery address");
  if (!/^[1-9]\d{5}$/.test(String(a.pincode || ""))) return fail("Please enter a valid 6-digit PIN code");
  if (!C.INDIAN_STATES.includes(a.state)) return fail("Please choose your state");
  if (!["cod", "online"].includes(b.payment)) return fail("Please choose a payment method");

  const s = getSettings();
  if (b.payment === "online" && (!s.payments.online_enabled || pay.mode() === "off")) return fail("Online payment isn’t available right now");
  if (b.payment === "cod" && !s.payments.cod_enabled) return fail("Cash on delivery isn’t available right now");

  const q = C.quote({ items: b.items, code: b.code, payment: b.payment, phone });
  if (!q.lines.length) return fail("Your cart is empty");
  if (q.errors.length) return fail(q.errors[0]);
  if (b.code && q.codeError) return fail(q.codeError);

  const address = {
    line1: String(a.line1).slice(0, 200), line2: String(a.line2 || "").slice(0, 200), landmark: String(a.landmark || "").slice(0, 120),
    city: String(a.city).slice(0, 80), state: a.state, pincode: String(a.pincode),
  };
  const utm = b.utm || {};
  let order;
  db.exec("BEGIN");
  try {
    let cust = db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
    if (!cust) {
      const id = db.prepare("INSERT INTO customers (phone, email, name, accepts_marketing) VALUES (?, ?, ?, ?)")
        .run(phone, c.email || null, String(c.name).trim(), b.marketing ? 1 : 0).lastInsertRowid;
      cust = { id };
    } else {
      db.prepare("UPDATE customers SET name = ?, email = COALESCE(?, email), accepts_marketing = MAX(accepts_marketing, ?) WHERE id = ?")
        .run(String(c.name).trim(), c.email || null, b.marketing ? 1 : 0, cust.id);
    }
    if (b.marketing && c.email) db.prepare("INSERT OR IGNORE INTO subscribers (email, source) VALUES (?, 'checkout')").run(c.email.toLowerCase());

    const number = C.nextOrderNumber();
    const id = db.prepare(`INSERT INTO orders (number, public_key, customer_id, name, email, phone, address, subtotal, discount, discount_code,
        shipping, cod_fee, total, payment_method, source, medium, campaign, referrer, customer_note, checkout_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(number, C.randomKey(), cust.id, String(c.name).trim(), c.email || null, phone, JSON.stringify(address),
        q.subtotal, q.discount, q.code, q.shipping, q.codFee, q.total, b.payment,
        str(utm.source), str(utm.medium), str(utm.campaign), str(b.referrer), str(b.note, 500), str(b.checkoutToken)).lastInsertRowid;
    const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, size, sku, img, price, mrp, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const l of q.lines) {
      insItem.run(id, l.productId, l.slug, l.name, l.size, l.sku || null, l.img, l.price, l.mrp, l.qty);
      C.adjustStock(l.productId, -l.qty, `Order ${number}`, "checkout");
    }
    if (q.code) db.prepare("UPDATE discounts SET used = used + 1 WHERE code = ? COLLATE NOCASE").run(q.code);
    if (b.checkoutToken) db.prepare("UPDATE checkouts SET status = 'converted', order_id = ? WHERE token = ?").run(id, b.checkoutToken);
    C.addEvent(id, "placed", b.payment === "cod" ? "Order placed · Cash on delivery" : "Order placed · awaiting online payment", { pub: true, by: "customer" });
    db.exec("COMMIT");
    order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: "Couldn’t place your order. Please try again." });
  }

  const result = { number: order.number, key: order.public_key, total: order.total, payment: order.payment_method };
  if (b.payment === "online") {
    if (pay.mode() === "demo") return res.json({ ...result, demo: true });
    try {
      const ro = await pay.createOrder(order.total, order.number, { order: order.number });
      db.prepare("UPDATE orders SET rzp_order_id = ? WHERE id = ?").run(ro.id, order.id);
      result.razorpay = { key: pay.KEY_ID, orderId: ro.id, amount: ro.amount, currency: "INR",
        name: s.store.name, prefill: { name: order.name, email: order.email || "", contact: "+91" + order.phone } };
    } catch (e) {
      cancelOrder(order, "Payment could not be started");
      return res.status(502).json({ error: "Couldn’t start the payment. Please try again or choose cash on delivery." });
    }
  }
  res.json(result);
});

function cancelOrder(o, reason) {
  db.prepare("UPDATE orders SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'pending' THEN 'failed' ELSE payment_status END WHERE id = ?").run(o.id);
  C.releaseOrder(o, "system", "Cancelled");
  C.addEvent(o.id, "cancelled", reason, { pub: true });
}

function markPaid(o, paymentId, via) {
  if (o.payment_status === "paid") return;
  db.prepare("UPDATE orders SET payment_status = 'paid', rzp_payment_id = COALESCE(?, rzp_payment_id) WHERE id = ?").run(paymentId || null, o.id);
  C.addEvent(o.id, "paid", `Payment received ₹${o.total} (${via})`, { pub: true });
}

/* ---------- confirm Razorpay payment from the browser ---------- */
r.post("/orders/:number/verify", (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE number = ? AND public_key = ?").get(req.params.number, String(req.body?.key || ""));
  if (!o) return res.status(404).json({ error: "Order not found" });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (razorpay_order_id !== o.rzp_order_id || !pay.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    C.addEvent(o.id, "payment_failed", "Payment signature check failed");
    return res.status(400).json({ error: "We couldn’t confirm this payment. If money was deducted, contact us with your order number." });
  }
  if (o.status === "cancelled") {
    C.addEvent(o.id, "note", `Payment ${razorpay_payment_id} arrived after the order was cancelled — refund or reinstate it`);
    return res.status(409).json({ error: "This order had expired. We’ll refund or reinstate it — please contact us." });
  }
  markPaid(o, razorpay_payment_id, "Razorpay");
  res.json({ ok: true });
});

// Demo mode only (PAYMENTS_DEMO=1 with no Razorpay keys): simulate a successful online payment.
r.post("/orders/:number/demo-pay", (req, res) => {
  if (!pay.isDemo()) return res.status(404).end();
  const o = db.prepare("SELECT * FROM orders WHERE number = ? AND public_key = ?").get(req.params.number, String(req.body?.key || ""));
  if (!o || o.status === "cancelled") return res.status(404).json({ error: "Order not found" });
  markPaid(o, "demo_" + C.randomKey(6), "demo payment");
  res.json({ ok: true });
});

/* ---------- Razorpay webhook (raw body, mounted in server.js) ---------- */
function webhook(req, res) {
  if (!pay.verifyWebhook(req.body, req.headers["x-razorpay-signature"])) return res.status(400).end();
  const evt = JSON.parse(req.body.toString());
  const p = evt.payload?.payment?.entity;
  const rf = evt.payload?.refund?.entity;
  const o = p?.order_id && db.prepare("SELECT * FROM orders WHERE rzp_order_id = ?").get(p.order_id);
  if (o && (evt.event === "payment.captured" || evt.event === "order.paid") && o.status !== "cancelled") markPaid(o, p.id, "Razorpay webhook");
  if (o && evt.event === "payment.failed") C.addEvent(o.id, "payment_failed", `Payment failed: ${p.error_description || "unknown reason"}`);
  if (rf && evt.event === "refund.processed") {
    const ro = db.prepare("SELECT * FROM orders WHERE rzp_payment_id = ?").get(rf.payment_id);
    if (ro) C.addEvent(ro.id, "refund", `Refund ₹${rf.amount / 100} processed by Razorpay`, { pub: true });
  }
  res.json({ ok: true });
}

/* ---------- order status & tracking ---------- */
r.get("/orders/:number", (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE number = ? AND public_key = ?").get(req.params.number, String(req.query.k || ""));
  if (!o) return res.status(404).json({ error: "Order not found" });
  res.json(C.orderOut(o));
});

r.post("/track", (req, res) => {
  const number = String(req.body?.number || "").trim().toUpperCase();
  const contact = String(req.body?.contact || "").trim().toLowerCase();
  const o = db.prepare("SELECT * FROM orders WHERE number = ?").get(number);
  const ok = o && (C.cleanPhone(contact) === o.phone || (o.email && contact === o.email.toLowerCase()));
  if (!ok) return res.status(404).json({ error: "We couldn’t find an order with those details" });
  res.json({ ...C.orderOut(o), key: o.public_key });
});

/* ---------- newsletter ---------- */
r.post("/subscribe", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!C.validEmail(email) || !email) return res.status(400).json({ error: "Please enter a valid email" });
  db.prepare("INSERT OR IGNORE INTO subscribers (email, source) VALUES (?, ?)").run(email, str(req.body?.source) || "footer");
  res.json({ ok: true });
});

/* ---------- analytics events ---------- */
const EVENT_TYPES = new Set(["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"]);
r.post("/events", express.text({ type: "*/*", limit: "32kb" }), (req, res) => {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { return res.status(204).end(); } }
  const ins = db.prepare("INSERT INTO events (session, type, path, slug, value, source, medium, campaign, referrer, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const ua = String(req.headers["user-agent"] || "");
  const device = /mobile|android|iphone/i.test(ua) ? "mobile" : /ipad|tablet/i.test(ua) ? "tablet" : "desktop";
  for (const e of (b?.events || []).slice(0, 20)) {
    if (!EVENT_TYPES.has(e.type)) continue;
    ins.run(str(b.session, 40), e.type, str(e.path, 200), str(e.slug, 80), Number.isFinite(+e.value) ? Math.round(+e.value) : null,
      str(b.utm?.source), str(b.utm?.medium), str(b.utm?.campaign), str(b.referrer, 200), device);
  }
  res.status(204).end();
});

const str = (v, n = 120) => (v == null || v === "" ? null : String(v).slice(0, n));

// Expire unpaid online orders after 45 minutes so their stock goes back on sale.
setInterval(() => {
  const stale = db.prepare(`SELECT * FROM orders WHERE payment_method = 'online' AND payment_status = 'pending' AND status = 'open'
    AND created_at < datetime('now', '-45 minutes')`).all();
  for (const o of stale) { cancelOrder(o, "Payment not completed — order expired"); logActivity("system", "order.expired", o.number); }
}, 5 * 60 * 1000).unref();

module.exports = { router: r, webhook, cancelOrder, markPaid };
