# Wellitas store — setup guide

The store has three parts, all served by one small Node.js server in `server/`:

| Part | URL | What it does |
| --- | --- | --- |
| Website | `/` | Home, shop, product pages, cart, checkout, order tracking (`/track.html`) |
| Store API | `/api/...` | Prices, stock, discount codes, orders, Razorpay, analytics |
| Admin panel | `/admin` | Orders, shipping, products, inventory, customers, abandoned carts, discounts, marketing, reports, settings, staff |

Data is kept in one SQLite file (`DATA_DIR/wellitas.db`) plus uploaded images in `DATA_DIR/uploads`. No separate database server is needed.

> GitHub Pages can only host the static website. Checkout, tracking and admin need the Node server below. On GitHub Pages the site falls back to "Order on WhatsApp".

---

## 1. Run it on your computer

Needs **Node.js 22.13 or newer** (`node -v`).

```bash
cd server
npm install
npm start
```

Open http://localhost:3000 for the store and http://localhost:3000/admin for the admin panel.

**First login:** on the first start the server creates the owner account and saves a one-time password to `server/data/FIRST-LOGIN.txt`. Log in, change the password in **Settings → Your account**, then delete that file. (Or set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start.)

To try online payments without Razorpay keys, start with demo payments (no real money):

```bash
PAYMENTS_DEMO=1 npm start
```

Run the automated tests with `npm test`.

---

## 2. Connect Razorpay (UPI, cards, net banking, wallets)

1. Create an account at https://dashboard.razorpay.com and complete KYC (business PAN, GST, bank account).
2. **Settings → API Keys → Generate key.** Start with **Test mode** keys (`rzp_test_…`), then switch to **Live** keys (`rzp_live_…`) when KYC is approved.
3. **Settings → Webhooks → Add new webhook**
   - URL: `https://YOUR-DOMAIN/api/razorpay/webhook`
   - Secret: any long random text (you'll also put it in the server settings)
   - Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`
4. Put the three values in the server's environment (see `.env.example`):
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
5. Restart the server. The admin banner disappears when live keys are active.

Keys are only read from the environment — they are never saved in the database or shown in the admin panel.

---

## 3. Put it online

You need a host that runs Node.js **and keeps files on disk** (for the database and uploaded images).

### Option A — Render (easiest, about $7/month)
1. Push this repo to GitHub (already done: `rockyjaat47/wellitas-website`).
2. On https://render.com → **New → Blueprint** → pick the repo. It reads `render.yaml`, which creates the web service with a 1 GB persistent disk.
3. In the service's **Environment** tab, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and the three Razorpay values.
4. **Settings → Custom domain** → add `wellitas.co.in` and follow the DNS instructions at your domain registrar.

Railway (https://railway.app) also works: add a volume mounted at `/data` and set `DATA_DIR=/data`.

### Option B — Your own VPS (Hostinger, DigitalOcean, AWS Lightsail…)
```bash
# on the server (Ubuntu), after installing Node.js 22+
git clone https://github.com/rockyjaat47/wellitas-website.git && cd wellitas-website/server
npm install --omit=dev
cp ../.env.example .env   # fill in the values
npm install -g pm2
pm2 start server.js --name wellitas --node-args="--env-file=.env" && pm2 save && pm2 startup
```
Then put Nginx (or Caddy) in front with an HTTPS certificate (`certbot --nginx`) and proxy to `localhost:3000`.

### Always
- Set `NODE_ENV=production` (secure cookies).
- Use **HTTPS** — Razorpay and browsers require it.
- **Back up `DATA_DIR` daily** (the `.db` file and `uploads/`). On Render, use the disk snapshot feature; on a VPS, a nightly `cp` or `rclone` to Google Drive/S3.

---

## 4. Daily workflow in the admin panel

1. **Home** shows what needs attention: orders to pack, unpaid online orders, abandoned carts, low stock.
2. **Orders → Unfulfilled** → open an order → *Mark as packed* → print the **Packing slip** → book the courier (Shiprocket, Delhivery, India Post…) → *Ship order* and enter the courier + AWB. The customer's tracking page updates automatically; press **Send update on WhatsApp** to notify them.
3. When the courier delivers, *Mark delivered*. COD orders are marked paid at the same time.
4. Refunds: open the order → **Refund**. Online payments are refunded through Razorpay; COD refunds are recorded and you transfer the money yourself.
5. **Abandoned carts**: send a WhatsApp or email reminder with one click.
6. **Discounts**: create codes for festivals, first orders or influencers (one code per influencer shows who sells).
7. **Marketing**: build campaign links (UTM), change the announcement bar, add GA4 / Meta Pixel IDs, export subscribers.
8. **Reports**: sales by day, product, category, state, city, payment method, source and campaign; new vs returning customers; CSV exports.

---

## 5. Not included yet (good next steps)

- **Automatic emails / SMS** (order confirmation, shipped). Today, updates are sent from the admin with one click on WhatsApp. Adding an email service (Brevo, Amazon SES, Resend) is a small change.
- **Courier API booking** (Shiprocket / Delhivery): today you book on the courier's site and paste the AWB.
- **Product reviews**, customer accounts with login, wishlists and multi-variant products (e.g. 100 g / 250 g in one product — today each size is its own product).
- **Legal pages**: Privacy Policy, Terms, Shipping and Returns pages need final text from a lawyer.
- **GST**: invoices use one GST rate on the order total (default 5%, the usual rate for tea). Confirm HSN codes and rates with your accountant, and add your GSTIN in Settings.
