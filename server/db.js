// SQLite database (Node's built-in node:sqlite): schema, default settings and first-run seed.
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, "wellitas.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, short TEXT, brand TEXT,
  cats TEXT NOT NULL DEFAULT '[]', size TEXT, code TEXT, price INTEGER NOT NULL, mrp INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0, low_stock INTEGER NOT NULL DEFAULT 10, track_stock INTEGER NOT NULL DEFAULT 1,
  img TEXT, back TEXT, photo INTEGER NOT NULL DEFAULT 0, tag TEXT, pitch TEXT, taste TEXT,
  use_title TEXT, brew TEXT NOT NULL DEFAULT '[]', why_title TEXT, why TEXT NOT NULL DEFAULT '[]',
  hsn TEXT, weight_g INTEGER, status TEXT NOT NULL DEFAULT 'active', sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_log (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change INTEGER NOT NULL, reason TEXT, stock_after INTEGER NOT NULL, by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, email TEXT, name TEXT,
  accepts_marketing INTEGER NOT NULL DEFAULT 0, tags TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id), name TEXT, email TEXT, phone TEXT, address TEXT NOT NULL,
  subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, discount_code TEXT,
  shipping INTEGER NOT NULL DEFAULT 0, cod_fee INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending',
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled', status TEXT NOT NULL DEFAULT 'open',
  courier TEXT, awb TEXT, tracking_url TEXT, shipped_at TEXT, delivered_at TEXT,
  rzp_order_id TEXT, rzp_payment_id TEXT,
  source TEXT, medium TEXT, campaign TEXT, referrer TEXT,
  customer_note TEXT, notes TEXT, tags TEXT, checkout_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, slug TEXT, name TEXT NOT NULL, size TEXT, sku TEXT, img TEXT,
  price INTEGER NOT NULL, mrp INTEGER NOT NULL, qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, message TEXT, public INTEGER NOT NULL DEFAULT 0, by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0,
  min_subtotal INTEGER NOT NULL DEFAULT 0, usage_limit INTEGER, used INTEGER NOT NULL DEFAULT 0,
  once_per_customer INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1,
  description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkouts (
  id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT, email TEXT, phone TEXT,
  cart TEXT NOT NULL DEFAULT '[]', subtotal INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open',
  order_id INTEGER, reminded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, session TEXT, type TEXT NOT NULL, path TEXT, slug TEXT, value INTEGER,
  source TEXT, medium TEXT, campaign TEXT, referrer TEXT, device TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_created ON events(created_at, type);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, admin TEXT, action TEXT NOT NULL, detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ---------- settings ---------- */
const DEFAULT_SETTINGS = {
  store: {
    name: "Wellitas", legal_name: "Wellitas Consumers Pvt. Ltd.", gstin: "",
    email: "hello@wellitas.co.in", phone: "+91 99109 73302", whatsapp: "919910973302",
    address: "Opp. Maa Narmada College, Ramnagar Mehragown, Itarsi, Hoshangabad – 461111, Madhya Pradesh",
    state: "Madhya Pradesh",
    order_prefix: "WEL", next_order: 1001,
  },
  shipping: { flat_rate: 60, free_above: 499, processing_days: "2–3", delivery_days: "5–12" },
  payments: { cod_enabled: true, cod_fee: 40, cod_max: 3000, online_enabled: true, gst_rate: 5 },
  marketing: {
    announcement: "Festive offer: 50% off all Green and Black Tea blends. Pour something good into the season.",
    ga4_id: "", meta_pixel_id: "",
  },
  inventory: { low_stock_default: 10 },
};

function getSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const { key, value } of db.prepare("SELECT key, value FROM settings").all()) {
    try { out[key] = { ...(out[key] || {}), ...JSON.parse(value) }; } catch {}
  }
  return out;
}
function saveSettings(section, value) {
  const merged = { ...(getSettings()[section] || {}), ...value };
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(section, JSON.stringify(merged));
  return merged;
}

/* ---------- row helpers ---------- */
const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

function productOut(r) {
  if (!r) return null;
  return {
    id: r.id, slug: r.slug, name: r.name, short: r.short || undefined, brand: r.brand, cats: J(r.cats, []),
    size: r.size, code: r.code || undefined, price: r.price, mrp: r.mrp,
    stock: r.stock, lowStock: r.low_stock, trackStock: !!r.track_stock,
    inStock: !r.track_stock || r.stock > 0,
    img: r.img, back: r.back || undefined, photo: !!r.photo, tag: r.tag || undefined,
    pitch: r.pitch, taste: r.taste, useTitle: r.use_title || undefined, brew: J(r.brew, []),
    whyTitle: r.why_title || undefined, why: J(r.why, []),
    hsn: r.hsn || "", weightG: r.weight_g || null, status: r.status, sort: r.sort,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/* ---------- first-run seed from the storefront catalogue (data.js) ---------- */
function seedProducts() {
  const n = db.prepare("SELECT COUNT(*) n FROM products").get().n;
  if (n > 0) return;
  const src = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + "\n;this.PRODUCTS = PRODUCTS;", ctx);
  const ins = db.prepare(`INSERT INTO products
    (slug, name, short, brand, cats, size, code, price, mrp, stock, img, back, photo, tag, pitch, taste,
     use_title, brew, why_title, why, hsn, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  ctx.PRODUCTS.forEach((p, i) => {
    const hsn = p.cats.includes("gifts") ? "" : p.cats.includes("seeds") ? "1207" : "0902";
    ins.run(p.slug, p.name, p.short || null, p.brand, JSON.stringify(p.cats), p.size, p.code || null,
      p.price, p.mrp, 50, p.img, p.back || null, p.photo ? 1 : 0, p.tag || null, p.pitch, p.taste,
      p.useTitle || null, JSON.stringify(p.brew), p.whyTitle || null, JSON.stringify(p.why), hsn, i);
  });
  console.log(`Seeded ${ctx.PRODUCTS.length} products from data.js (50 in stock each).`);
}
seedProducts();

function logActivity(admin, action, detail) {
  db.prepare("INSERT INTO activity (admin, action, detail) VALUES (?, ?, ?)").run(admin || "system", action, detail || null);
}

module.exports = { db, DATA_DIR, getSettings, saveSettings, productOut, J, logActivity };
