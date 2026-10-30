// Razorpay over its REST API (no SDK). Keys come from env vars only — never stored in the database.
const crypto = require("node:crypto");

const KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
// Local demo only: simulates successful online payments when no Razorpay keys are set.
const DEMO = process.env.PAYMENTS_DEMO === "1" && !KEY_ID;

const configured = () => !!(KEY_ID && KEY_SECRET);
const mode = () => (configured() ? (KEY_ID.startsWith("rzp_live_") ? "live" : "test") : DEMO ? "demo" : "off");

async function rzp(method, path, body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64") },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
  return data;
}

// Amounts in rupees in our DB; Razorpay wants paise.
const createOrder = (amountRupees, receipt, notes) =>
  rzp("POST", "/orders", { amount: amountRupees * 100, currency: "INR", receipt, notes });

const refund = (paymentId, amountRupees, notes) =>
  rzp("POST", `/payments/${paymentId}/refund`, { amount: amountRupees * 100, notes });

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function verifyPayment(rzpOrderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(`${rzpOrderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}
function verifyWebhook(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

module.exports = { KEY_ID, configured, mode, createOrder, refund, verifyPayment, verifyWebhook, isDemo: () => DEMO };
