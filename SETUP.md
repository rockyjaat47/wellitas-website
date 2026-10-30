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

## 1. Test it on your computer

1. Install **Node.js 22.13 or newer** (LTS) from https://nodejs.org — nothing else is needed.
2. Download the code: `git clone https://github.com/rockyjaat47/wellitas-website.git` (or GitHub → **Code → Download ZIP** and unzip).
3. Start it:
   - **Mac:** double-click `start-mac.command`. If macOS blocks it, right-click → **Open** → **Open**.
   - **Windows:** double-click `start-windows.bat`.
   - **Terminal:** `cd server && npm install && npm start`
4. The store opens at http://localhost:3000 and the admin panel at http://localhost:3000/admin.

**First login:** on the first start the server creates the owner account and saves a one-time password to `server/data/FIRST-LOGIN.txt`. Log in, change the password in **Settings → Your account**, then delete that file. (Or put `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` before the first start.)

While no Razorpay keys are set, the start scripts turn on **demo payments**: "Pay online" shows a test screen and no real money moves. Cash on delivery works normally.

**Settings file:** copy `.env.example` to `server/.env` and fill in what you need (admin login, Razorpay keys). The server reads it on every start. `server/.env` and `server/data/` are never uploaded to GitHub.

**Start fresh:** stop the server and delete the `server/data` folder — all test orders, customers and uploads are removed and the catalogue is re-created from `data.js` on the next start.

Run the automated tests with `cd server && npm test`.

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

## 3. Put it on your own hosting

Your host must run **Node.js 22.13+** and keep files on disk (the database and uploaded images live in `server/data`).
Plain PHP-only shared hosting can still show the website, but not checkout or the admin panel.

### Option A — cPanel / Hostinger hosting with "Node.js App"
Many business hosting plans (Hostinger, GoDaddy, Bluehost cPanel with *Setup Node.js App*) support this:
1. Upload the repository (Git Version Control in cPanel, or upload the ZIP and extract) e.g. to `~/wellitas`.
2. **Setup Node.js App → Create application**: Node version 22 or newer, application root `wellitas/server`, startup file `server.js`, URL = your domain.
3. Click **Run NPM Install**.
4. Create `wellitas/server/.env` from `.env.example` (File Manager), set `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and your Razorpay keys.
5. **Restart** the app and open `https://your-domain/admin`.

### Option B — VPS (Hostinger VPS, DigitalOcean, AWS Lightsail…)
```bash
# Ubuntu, after installing Node.js 22+ (https://nodejs.org or nodesource)
git clone https://github.com/rockyjaat47/wellitas-website.git && cd wellitas-website/server
npm install --omit=dev
cp ../.env.example .env && nano .env          # set NODE_ENV=production, admin login, Razorpay keys
sudo npm install -g pm2
pm2 start server.js --name wellitas && pm2 save && pm2 startup
```
Then put Nginx in front with HTTPS (`sudo certbot --nginx`) and proxy your domain to `localhost:3000`.
To update later: `git pull && npm install --omit=dev && pm2 restart wellitas`.

### Before going live
- `NODE_ENV=production` in `server/.env` and the site served over **HTTPS** (Razorpay requires it).
- Delete the test data from your computer's testing — the live server starts with a fresh `server/data`.
- Real Razorpay **live** keys and the webhook pointing to `https://your-domain/api/razorpay/webhook`.
- **Back up `server/data` daily** (the `wellitas.db` file and `uploads/`), e.g. a nightly copy to Google Drive or S3.

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
