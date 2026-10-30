// Wellitas store server: serves the website, the /api for the store and admin, and the /admin panel.
const path = require("node:path");
const express = require("express");
const { DATA_DIR } = require("./db");
const { ensureOwner } = require("./lib/auth");
const pay = require("./lib/payments");
const store = require("./routes/store");
const admin = require("./routes/admin");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Razorpay webhook needs the raw body for its signature check, so it goes before the JSON parser.
app.post("/api/razorpay/webhook", express.raw({ type: "*/*", limit: "1mb" }), store.webhook);
app.use("/api", express.json({ limit: "200kb" }));
app.use("/api/admin", admin);
app.use("/api", store.router);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Never serve the server code, database, source files or git metadata.
app.use((req, res, next) => {
  if (/^\/(server|source|node_modules|\.git)(\/|$)|\/\.[^/]+$/i.test(req.path)) return res.status(404).end();
  next();
});
app.use("/uploads", express.static(path.join(DATA_DIR, "uploads"), { maxAge: "30d" }));
app.use(express.static(ROOT, { extensions: ["html"], maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : "Something went wrong" });
});

ensureOwner();
app.listen(PORT, () => {
  console.log(`Wellitas store running on http://localhost:${PORT}  (admin: /admin, payments: ${pay.mode()})`);
});
