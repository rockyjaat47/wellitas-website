// Run with: npm test   (uses a throwaway database and fake Razorpay secrets)
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wl-test-"));
process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET = "test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";

const pay = require("../lib/payments");
const C = require("../lib/commerce");
const { db } = require("../db");

test("Razorpay payment signature is verified with the key secret", () => {
  const sig = crypto.createHmac("sha256", "test_secret").update("order_1|pay_1").digest("hex");
  assert.ok(pay.verifyPayment("order_1", "pay_1", sig));
  assert.ok(!pay.verifyPayment("order_1", "pay_2", sig), "a different payment id must fail");
  assert.ok(!pay.verifyPayment("order_1", "pay_1", "forged"), "a forged signature must fail");
});

test("Razorpay webhook signature uses the webhook secret over the raw body", () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const sig = crypto.createHmac("sha256", "hook_secret").update(body).digest("hex");
  assert.ok(pay.verifyWebhook(body, sig));
  assert.ok(!pay.verifyWebhook(Buffer.from('{"event":"x"}'), sig));
  assert.equal(pay.mode(), "test");
});

test("quote uses database prices, shipping threshold and COD fee", () => {
  const q = C.quote({ items: [{ slug: "himalayan-green-tea", qty: 2, price: 1 }], payment: "cod" });
  assert.equal(q.subtotal, 370, "browser-sent price is ignored");
  assert.equal(q.shipping, 60);
  assert.equal(q.codFee, 40);
  assert.equal(q.total, 470);
  const big = C.quote({ items: [{ slug: "signature-wellness-gift-hamper", qty: 1 }], payment: "online" });
  assert.equal(big.shipping, 0, "free shipping above ₹499");
  assert.equal(big.codFee, 0);
});

test("discount codes: percent, minimum order, expiry and stock limits", () => {
  db.prepare("INSERT INTO discounts (code, type, value, min_subtotal) VALUES ('TEN', 'percent', 10, 300)").run();
  db.prepare("INSERT INTO discounts (code, type, value, ends_at) VALUES ('OLD', 'fixed', 50, '2020-01-01 00:00:00')").run();
  const ok = C.quote({ items: [{ slug: "himalayan-green-tea", qty: 2 }], code: "ten" });
  assert.equal(ok.discount, 37);
  assert.equal(ok.code, "TEN");
  const small = C.quote({ items: [{ slug: "himalayan-green-tea", qty: 1 }], code: "TEN" });
  assert.match(small.codeError, /₹300/);
  assert.match(C.quote({ items: [{ slug: "himalayan-green-tea", qty: 1 }], code: "OLD" }).codeError, /expired/);
  db.prepare("UPDATE products SET stock = 3 WHERE slug = 'hibiscus-black-tea'").run();
  assert.match(C.quote({ items: [{ slug: "hibiscus-black-tea", qty: 5 }] }).errors[0], /Only 3 left/);
});

test("phone numbers are normalised to 10 digits", () => {
  assert.equal(C.cleanPhone("+91 98765 43210"), "9876543210");
  assert.equal(C.cleanPhone("09876543210"), "9876543210");
  assert.ok(C.validPhone("9876543210"));
  assert.ok(!C.validPhone("1234567890"));
});
