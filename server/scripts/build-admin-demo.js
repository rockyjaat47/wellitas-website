// Builds the read-only admin demo for static hosting (GitHub Pages):
// runs the real server on a throwaway database, fills it with SAMPLE data (fake customers and orders),
// then saves every admin API response the panel needs to admin/demo/.
// Usage: node server/scripts/build-admin-demo.js
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wl-demo-"));
process.env.PORT = String(20000 + Math.floor(Math.random() * 20000));
process.env.PAYMENTS_DEMO = "1";
process.env.ADMIN_EMAIL = "demo@wellitas.co.in";
process.env.ADMIN_PASSWORD = "demo-build-only-" + Date.now();
delete process.env.RAZORPAY_KEY_ID;
delete process.env.NODE_ENV;

const OUT = path.join(__dirname, "..", "..", "admin", "demo");
const BASE = `http://localhost:${process.env.PORT}`;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // deterministic
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const NAMES = ["Aarav Sharma", "Priya Patel", "Rohan Mehta", "Ananya Iyer", "Vikram Singh", "Neha Gupta", "Arjun Reddy", "Kavya Nair", "Rahul Verma",
  "Isha Kapoor", "Siddharth Rao", "Meera Joshi", "Karan Malhotra", "Pooja Desai", "Aditya Kulkarni", "Sneha Pillai", "Manish Agarwal", "Ritu Chawla",
  "Nikhil Bansal", "Divya Menon", "Amit Tiwari", "Shreya Bose", "Harsh Vardhan", "Tanvi Shah", "Gaurav Saxena", "Nandini Rao"];
const PLACES = [["Mumbai", "Maharashtra", "400050"], ["Pune", "Maharashtra", "411001"], ["Bengaluru", "Karnataka", "560038"], ["New Delhi", "Delhi", "110017"],
  ["Bhopal", "Madhya Pradesh", "462016"], ["Indore", "Madhya Pradesh", "452001"], ["Hyderabad", "Telangana", "500034"], ["Chennai", "Tamil Nadu", "600040"],
  ["Jaipur", "Rajasthan", "302001"], ["Kolkata", "West Bengal", "700019"], ["Ahmedabad", "Gujarat", "380015"], ["Lucknow", "Uttar Pradesh", "226010"],
  ["Gurugram", "Haryana", "122002"], ["Kochi", "Kerala", "682020"], ["Itarsi", "Madhya Pradesh", "461111"]];
const SOURCES = [{ source: "instagram", medium: "bio", campaign: "diwali-2026" }, { source: "instagram", medium: "story", campaign: "diwali-2026" },
  { source: "whatsapp", medium: "broadcast", campaign: "festive-hampers" }, { source: "google", medium: "cpc", campaign: "green-tea" },
  { source: "facebook", medium: "paid", campaign: "diwali-2026" }, {}, {}, {}];
const SLUGS = ["himalayan-green-tea", "hibiscus-green-tea", "mint-lemongrass-green-tea", "hibiscus-black-tea", "mint-lemongrass-black-tea",
  "sipamrit-premium-ctc-250g", "sipamrit-delight-ctc-250g", "sipamrit-delight-ctc-850g", "pure-super-seeds-mix", "natural-dried-fruit-mix",
  "premium-wellness-gift-hamper", "signature-wellness-gift-hamper"];
const COURIERS = ["Delhivery", "Blue Dart", "DTDC", "Shiprocket", "India Post"];

let cookie = "";
async function call(method, p, body, admin) {
  const res = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json", ...(admin ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}
const admin = (m, p, b) => call(m, "/api/admin" + p, b, true);

(async () => {
  require("../server.js");
  await new Promise(r => setTimeout(r, 400));
  const { db } = require("../db");
  await call("POST", "/api/admin/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });

  for (const d of [
    { code: "DIWALI20", type: "percent", value: 20, min_subtotal: 300, description: "Diwali sale — Instagram & WhatsApp", ends_at: "2026-11-15 18:29:59" },
    { code: "FIRST10", type: "percent", value: 10, once_per_customer: true, description: "First order — website popup" },
    { code: "FREESHIP", type: "free_shipping", min_subtotal: 299, description: "Free shipping weekend" },
    { code: "PRIYA15", type: "percent", value: 15, usage_limit: 100, description: "Influencer — Priya (Instagram)" },
  ]) await admin("POST", "/discounts", { active: true, ...d });

  // Orders spread over the last 60 days, oldest first.
  const orders = [];
  for (let i = 0; i < 64; i++) {
    const name = NAMES[i % NAMES.length], [city, state, pincode] = pick(PLACES);
    const phone = "98" + String(10000000 + i * 7919).slice(-8);
    const items = Array.from({ length: between(1, 3) }, () => ({ slug: pick(SLUGS), qty: between(1, 2) }));
    const payment = rnd() < 0.62 ? "online" : "cod";
    const code = i > 40 && i % 4 === 0 ? "DIWALI20" : rnd() < 0.3 ? pick(["DIWALI20", "FIRST10", "FREESHIP", "PRIYA15"]) : undefined;
    const utm = pick(SOURCES);
    const body = { items, payment, marketing: rnd() < 0.6, utm, referrer: utm.source ? "" : pick(["", "", "www.google.com"]),
      customer: { name, phone, email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com" },
      address: { line1: `${between(1, 220)}, ${pick(["Shanti Nagar", "MG Road", "Lake View Apartments", "Sector " + between(4, 62), "Civil Lines", "Park Street"])}`, city, state, pincode } };
    let r = await call("POST", "/api/orders", { ...body, code });
    if (r.error) r = await call("POST", "/api/orders", body);
    if (r.error) continue;
    if (payment === "online" && i !== 62) await call("POST", `/api/orders/${r.number}/demo-pay`, { key: r.key });
    orders.push({ ...r, i, items, payment });
  }

  // Move each order back in time and walk it through fulfilment like a real week of work.
  const n = orders.length;
  for (const o of orders) {
    const daysAgo = Math.max(0, Math.round(60 * (1 - o.i / 64) ** 1.15) - (o.i > 60 ? 1 : 0)); // by attempt index: some attempts are skipped
    const hours = between(9, 22);
    const age = daysAgo;
    const steps = [];
    if (o.i === 62) {} // online payment still pending
    else if (o.i === 9 || o.i === 41) steps.push(["cancel"]);
    else if (age >= 7) steps.push(["packed"], ["ship"], ["out_for_delivery"], [o.i === 30 ? "rto" : "delivered"]);
    else if (age >= 4) steps.push(["packed"], ["ship"], ["out_for_delivery"]);
    else if (age >= 2) steps.push(["packed"], ["ship"]);
    else if (age >= 1) steps.push(["packed"]);
    for (const [s] of steps) {
      if (s === "cancel") await admin("POST", `/orders/${o.number}/cancel`, { reason: pick(["Customer changed their mind", "Payment not received"]) });
      else if (s === "ship") { const c = pick(COURIERS); await admin("POST", `/orders/${o.number}/fulfill`, { courier: c, awb: String(between(10000000, 99999999)) + String(between(1000, 9999)) }); }
      else await admin("POST", `/orders/${o.number}/status`, { fulfillment: s });
    }
    if (o.i === 44) await admin("POST", `/orders/${o.number}/refund`, { amount: 150, reason: "One pouch damaged in transit", manual: true });
    if (o.i === 50) await admin("POST", `/orders/${o.number}/comment`, { message: "Customer asked for a handwritten gift note — added." });
    if (o.i === 57) await admin("PATCH", `/orders/${o.number}`, { notes: "Corporate client — send invoice with GSTIN", tags: "corporate, priority" });
    const row = db.prepare("SELECT id FROM orders WHERE number = ?").get(o.number);
    const start = `datetime('now', '-${daysAgo} days', 'start of day', '+${hours - 5} hours', '+${between(0, 59)} minutes')`;
    db.prepare(`UPDATE orders SET created_at = ${start} WHERE id = ?`).run(row.id);
    const evs = db.prepare("SELECT id, type FROM order_events WHERE order_id = ? ORDER BY id").all(row.id);
    evs.forEach((e, k) => {
      const offset = e.type === "paid" ? "+2 minutes" : `+${k * between(14, 30)} hours`;
      db.prepare(`UPDATE order_events SET created_at = datetime((SELECT created_at FROM orders WHERE id = ?), ?) WHERE id = ?`).run(row.id, offset, e.id);
    });
    db.prepare(`UPDATE orders SET shipped_at = (SELECT created_at FROM order_events WHERE order_id = ? AND type = 'shipped'),
      delivered_at = (SELECT created_at FROM order_events WHERE order_id = ? AND type = 'delivered') WHERE id = ?`).run(row.id, row.id, row.id);
  }
  db.prepare("UPDATE customers SET created_at = (SELECT MIN(created_at) FROM orders WHERE customer_id = customers.id)").run();

  // Visitor sessions for the funnel and traffic reports (about 2.5% of visitors buy).
  const ins = db.prepare(`INSERT INTO events (session, type, path, slug, value, source, medium, campaign, referrer, device, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?, ?))`);
  db.exec("BEGIN");
  for (let s = 0; s < 2700; s++) {
    const utm = pick(SOURCES), dev = rnd() < 0.72 ? "mobile" : rnd() < 0.85 ? "desktop" : "tablet";
    const ago = `-${Math.floor(60 * rnd() ** 1.15)} days`, at = `+${between(0, 23)} hours`;
    const ref = utm.source ? null : pick([null, null, "www.google.com", "l.instagram.com"]);
    const slug = pick(SLUGS);
    const add = (type, p, v) => ins.run("s" + s, type, p, type === "page_view" ? null : slug, v ?? null, utm.source || null, utm.medium || null, utm.campaign || null, ref, dev, ago, at);
    add("page_view", pick(["/", "/", "/shop.html", "/product.html", "/shop.html"]));
    if (rnd() < 0.55) add("view_item", "/product.html", 250);
    else continue;
    if (rnd() < 0.22) add("add_to_cart", "/product.html", 250); else continue;
    if (rnd() < 0.55) add("begin_checkout", "/checkout.html", 500); else continue;
    if (rnd() < 0.62) add("purchase", "/checkout.html", 600);
  }
  db.exec("COMMIT");

  // Abandoned checkouts and newsletter subscribers.
  for (let k = 0; k < 6; k++) {
    const name = pick(["Rekha Sinha", "Varun Khanna", "Sakshi Arora", "Deepak Yadav", "Ankita Mishra", "Mohit Jain"]);
    await call("POST", "/api/checkout/save", { token: "demo-ab-" + k, name, phone: "97" + String(30000000 + k * 104729).slice(-8),
      email: k % 2 ? name.toLowerCase().replace(" ", ".") + "@example.com" : "", items: [{ slug: pick(SLUGS), qty: between(1, 2) }, ...(k % 3 ? [] : [{ slug: pick(SLUGS), qty: 1 }])] });
    db.prepare(`UPDATE checkouts SET updated_at = datetime('now', ?) WHERE token = ?`).run(`-${between(2, 200)} hours`, "demo-ab-" + k);
  }
  db.prepare("UPDATE checkouts SET reminded_at = datetime(updated_at, '+3 hours') WHERE token = 'demo-ab-1'").run();
  for (let k = 0; k < 18; k++) await call("POST", "/api/subscribe", { email: `reader${k + 1}@example.com`, source: k % 3 ? "footer" : "checkout" });
  db.prepare("UPDATE subscribers SET created_at = datetime('now', '-' || (id * 37 % 30) || ' days')").run();

  // A couple of products running low.
  await admin("POST", "/products/1/stock", { set: 6, reason: "Correction" });
  await admin("POST", "/products/9/stock", { set: 3, reason: "Damaged" });
  await admin("POST", "/products/12/stock", { change: 40, reason: "Received" });

  /* ---------- snapshot every response the panel reads ---------- */
  const F = {};
  const get = async p => (F[p] = await admin("GET", p));
  const me = await get("/me");
  F["/me"] = { ...me, id: 1, email: "demo@wellitas.co.in", name: "Demo owner", payments: "demo" };
  await get("/settings");
  for (const d of [1, 7, 30, 90]) await get(`/dashboard?days=${d}`);
  for (const d of [7, 30, 90, 365]) await get(`/reports?days=${d}`);
  const all = [];
  for (let page = 1; ; page++) { const r = await admin("GET", `/orders?page=${page}`); all.push(...r.orders); if (page >= r.pages) break; }
  F.allOrders = all;
  for (const o of all) await get(`/orders/${o.number}`);
  const products = await get("/products");
  for (const p of products) await get(`/products/${p.id}`);
  await get("/inventory/log");
  const customers = await get("/customers");
  F["/customers?sort=spent"] = await admin("GET", "/customers?sort=spent");
  for (const c of customers) await get(`/customers/${c.id}`);
  await get("/checkouts");
  await get("/discounts");
  await get("/subscribers");
  await get("/staff");
  F["/staff"] = F["/staff"].map(s => ({ ...s, email: "demo@wellitas.co.in", name: "Demo owner" }));
  await get("/activity");
  F["/activity"] = F["/activity"].map(a => ({ ...a, admin: a.admin === process.env.ADMIN_EMAIL ? "demo@wellitas.co.in" : a.admin }));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "invoices"), { recursive: true });
  for (const o of all) {
    for (const type of ["invoice", "slip"]) {
      const res = await fetch(`${BASE}/api/admin/orders/${o.number}/invoice${type === "slip" ? "?type=slip" : ""}`, { headers: { Cookie: cookie } });
      fs.writeFileSync(path.join(OUT, "invoices", `${o.number}-${type}.html`), await res.text());
    }
  }
  const json = JSON.stringify({ builtAt: new Date().toISOString(), F }).replaceAll(process.env.ADMIN_EMAIL, "demo@wellitas.co.in");
  fs.writeFileSync(path.join(OUT, "data.json"), json);
  console.log(`Admin demo: ${all.length} orders, ${customers.length} customers, ${(json.length / 1024).toFixed(0)} KB → admin/demo/`);
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
