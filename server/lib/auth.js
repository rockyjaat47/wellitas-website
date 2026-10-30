// Admin auth: scrypt password hashes + HMAC-signed session cookie. No external dependencies.
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { db, DATA_DIR } = require("../db");

// Session secret: env var in production, otherwise a random one persisted in the data folder.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, ".session-secret");
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(f, "utf8").trim();
}
const SECRET = loadSecret();
const COOKIE = "wl_admin";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split("$");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

const sign = data => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
function makeToken(adminId) {
  const body = Buffer.from(JSON.stringify({ id: adminId, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}
function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=").map(decodeURIComponent)).filter(p => p[0]));
}
function setSession(res, adminId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${makeToken(adminId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}${secure}`);
}
function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function requireAdmin(req, res, next) {
  const data = readToken(cookies(req)[COOKIE]);
  const admin = data && db.prepare("SELECT id, email, name, role FROM admins WHERE id = ?").get(data.id);
  if (!admin) return res.status(401).json({ error: "Please log in" });
  req.admin = admin;
  next();
}
function requireOwner(req, res, next) {
  if (req.admin.role !== "owner") return res.status(403).json({ error: "Only the store owner can do this" });
  next();
}

// Simple in-memory login throttle: 8 failed attempts per IP per 15 minutes.
const fails = new Map();
function loginAllowed(ip) {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) return true;
  return f.count < 8;
}
function loginFailed(ip) {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) fails.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 });
  else f.count++;
}

// First run: create the owner account from env vars, or a one-time random password printed to the console.
function ensureOwner() {
  if (db.prepare("SELECT COUNT(*) n FROM admins").get().n > 0) return;
  const email = (process.env.ADMIN_EMAIL || "admin@wellitas.co.in").toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  db.prepare("INSERT INTO admins (email, name, pass_hash, role) VALUES (?, ?, ?, 'owner')").run(email, "Owner", hashPassword(pw));
  if (!process.env.ADMIN_PASSWORD) {
    const f = path.join(DATA_DIR, "FIRST-LOGIN.txt");
    fs.writeFileSync(f, `Admin login for /admin\nEmail: ${email}\nPassword: ${pw}\n\nChange this password in Settings → Staff after logging in, then delete this file.\n`, { mode: 0o600 });
    console.log(`\nCreated admin account ${email}. One-time password saved to ${f}\n`);
  } else {
    console.log(`Created admin account ${email} from ADMIN_EMAIL / ADMIN_PASSWORD.`);
  }
}

module.exports = { hashPassword, checkPassword, setSession, clearSession, requireAdmin, requireOwner, loginAllowed, loginFailed, ensureOwner };
