// Pricing, discounts, stock and order helpers shared by the store and admin APIs.
// All money is whole rupees. Prices always come from the database, never from the browser.
const crypto = require("node:crypto");
const { db, getSettings, J } = require("../db");

const COURIERS = {
  "Delhivery": "https://www.delhivery.com/track/package/{awb}",
  "Blue Dart": "https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={awb}",
  "DTDC": "https://www.dtdc.in/trace.asp?strCnno={awb}",
  "Shiprocket": "https://shiprocket.co/tracking/{awb}",
  "India Post": "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx",
  "Ekart": "https://ekartlogistics.com/shipmenttrack/{awb}",
  "Xpressbees": "https://www.xpressbees.com/shipment/tracking?awbNo={awb}",
  "Ecom Express": "https://ecomexpress.in/tracking/?awb_field={awb}",
  "Other": "",
};
const trackingUrl = (courier, awb) => (COURIERS[courier] || "").replace("{awb}", encodeURIComponent(awb || ""));

const FULFILLMENT_STEPS = ["unfulfilled", "packed", "shipped", "out_for_delivery", "delivered"];
const FULFILLMENT_LABELS = {
  unfulfilled: "Order placed", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery",
  delivered: "Delivered", rto: "Returned to origin", returned: "Returned",
};

const INDIAN_STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

const cleanPhone = p => String(p || "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
const validPhone = p => /^[6-9]\d{9}$/.test(cleanPhone(p));
const validEmail = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/* ---------- discount lookup ---------- */
function findDiscount(code, subtotal, phone) {
  if (!code) return { discount: null };
  const d = db.prepare("SELECT * FROM discounts WHERE code = ? COLLATE NOCASE").get(String(code).trim());
  const now = nowSql();
  if (!d || !d.active) return { error: "This code isn’t valid" };
  if (d.starts_at && d.starts_at > now) return { error: "This code isn’t active yet" };
  if (d.ends_at && d.ends_at < now) return { error: "This code has expired" };
  if (d.usage_limit != null && d.used >= d.usage_limit) return { error: "This code has been fully used" };
  if (subtotal < d.min_subtotal) return { error: `Add items worth ₹${d.min_subtotal} to use this code` };
  if (d.once_per_customer && phone) {
    const used = db.prepare("SELECT 1 FROM orders WHERE discount_code = ? COLLATE NOCASE AND phone = ? AND status != 'cancelled'").get(d.code, cleanPhone(phone));
    if (used) return { error: "You’ve already used this code" };
  }
  return { discount: d };
}

/* ---------- quote: the single source of truth for cart totals ---------- */
function quote({ items = [], code, payment, phone } = {}) {
  const s = getSettings();
  const errors = [];
  const lines = [];
  for (const it of items.slice(0, 50)) {
    const qty = Math.max(1, Math.min(50, parseInt(it.qty, 10) || 1));
    const p = db.prepare("SELECT * FROM products WHERE slug = ? AND status = 'active'").get(String(it.slug));
    if (!p) { errors.push(`An item in your cart is no longer available`); continue; }
    if (p.track_stock && p.stock < qty) {
      errors.push(p.stock <= 0 ? `${p.name} is out of stock` : `Only ${p.stock} left of ${p.name}`);
    }
    lines.push({ productId: p.id, slug: p.slug, name: p.name, short: p.short, size: p.size, sku: p.code, img: p.img,
      photo: !!p.photo, price: p.price, mrp: p.mrp, qty, lineTotal: p.price * qty, available: p.track_stock ? p.stock : null });
  }
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const mrpTotal = lines.reduce((a, l) => a + l.mrp * l.qty, 0);

  let discount = 0, freeShipping = false, codeError = null, appliedCode = null;
  if (code) {
    const r = findDiscount(code, subtotal, phone);
    if (r.error) codeError = r.error;
    else {
      const d = r.discount;
      appliedCode = d.code;
      if (d.type === "percent") discount = Math.round(subtotal * Math.min(100, d.value) / 100);
      else if (d.type === "fixed") discount = Math.min(subtotal, d.value);
      else if (d.type === "free_shipping") freeShipping = true;
    }
  }
  const afterDiscount = subtotal - discount;
  const shipping = !lines.length || freeShipping || (s.shipping.free_above && afterDiscount >= s.shipping.free_above) ? 0 : s.shipping.flat_rate;
  const codAllowed = s.payments.cod_enabled && (!s.payments.cod_max || afterDiscount + shipping <= s.payments.cod_max);
  const codFee = payment === "cod" && codAllowed ? s.payments.cod_fee : 0;
  if (payment === "cod" && !codAllowed) errors.push(`Cash on delivery is available on orders up to ₹${s.payments.cod_max}`);
  const total = afterDiscount + shipping + codFee;

  return { lines, subtotal, mrpTotal, discount, code: appliedCode, codeError, shipping, codFee, codAllowed, total,
    freeShippingAbove: s.shipping.free_above, errors };
}

/* ---------- stock ---------- */
function adjustStock(productId, change, reason, by) {
  const p = db.prepare("SELECT stock, track_stock FROM products WHERE id = ?").get(productId);
  if (!p) return;
  const after = p.stock + change;
  db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(after, productId);
  db.prepare("INSERT INTO inventory_log (product_id, change, reason, stock_after, by) VALUES (?, ?, ?, ?, ?)").run(productId, change, reason, after, by || "system");
}

/* ---------- order helpers ---------- */
function nextOrderNumber() {
  const s = getSettings().store;
  let n = Number(s.next_order) || 1001;
  const prefix = s.order_prefix || "WEL";
  while (db.prepare("SELECT 1 FROM orders WHERE number = ?").get(prefix + n)) n++;
  db.prepare("INSERT INTO settings (key, value) VALUES ('store', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ ...s, next_order: n + 1 }));
  return prefix + n;
}

function addEvent(orderId, type, message, { pub = false, by = "system" } = {}) {
  db.prepare("INSERT INTO order_events (order_id, type, message, public, by) VALUES (?, ?, ?, ?, ?)").run(orderId, type, message, pub ? 1 : 0, by);
  db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(orderId);
}

function orderOut(o, { admin = false } = {}) {
  if (!o) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id);
  const events = db.prepare(`SELECT type, message, by, created_at FROM order_events WHERE order_id = ? ${admin ? "" : "AND public = 1"} ORDER BY id`).all(o.id);
  const out = {
    number: o.number, createdAt: o.created_at, status: o.status,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status, fulfillmentStatus: o.fulfillment_status,
    fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment_status] || o.fulfillment_status,
    items: items.map(i => ({ slug: i.slug, name: i.name, size: i.size, sku: i.sku, img: i.img, price: i.price, mrp: i.mrp, qty: i.qty })),
    subtotal: o.subtotal, discount: o.discount, discountCode: o.discount_code, shipping: o.shipping, codFee: o.cod_fee,
    total: o.total, refunded: o.refunded,
    courier: o.courier, awb: o.awb, trackingUrl: o.tracking_url, shippedAt: o.shipped_at, deliveredAt: o.delivered_at,
    name: o.name, address: J(o.address, {}), events,
  };
  if (admin) Object.assign(out, {
    id: o.id, email: o.email, phone: o.phone, customerId: o.customer_id, publicKey: o.public_key,
    rzpOrderId: o.rzp_order_id, rzpPaymentId: o.rzp_payment_id, source: o.source, medium: o.medium,
    campaign: o.campaign, referrer: o.referrer, customerNote: o.customer_note, notes: o.notes, tags: o.tags, updatedAt: o.updated_at,
  });
  return out;
}

// Puts stock back and frees the discount use for a cancelled or expired order.
function releaseOrder(o, by, reason) {
  for (const i of db.prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?").all(o.id)) {
    if (i.product_id) adjustStock(i.product_id, i.qty, `${reason} ${o.number}`, by);
  }
  if (o.discount_code) db.prepare("UPDATE discounts SET used = MAX(0, used - 1) WHERE code = ? COLLATE NOCASE").run(o.discount_code);
}

const randomKey = (n = 18) => crypto.randomBytes(n).toString("base64url");

module.exports = {
  COURIERS, trackingUrl, FULFILLMENT_STEPS, FULFILLMENT_LABELS, INDIAN_STATES,
  cleanPhone, validPhone, validEmail, quote, adjustStock, nextOrderNumber, addEvent, orderOut, releaseOrder, randomKey, nowSql,
};
