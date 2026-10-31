# Wellitas website

Website and online store for **Wellitas** (Wellitas Consumers Pvt. Ltd.) – green, black and herbal teas, SipAmrit CTC chai, fruit & seed mixes and wellness gift hampers. Plain HTML, CSS and JavaScript for the front end (no build step) and a small Node.js server for checkout and admin.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home page: video hero, gift hampers, tea carousel, garden-to-cup, SipAmrit, categories, journal |
| `shop.html` | Full catalogue with category filters (`shop.html?cat=green`, `black`, `herbal`, `ctc`, `seeds`, `gifts`) |
| `product.html` | Product page template (`product.html?p=<slug>`) with add to cart / buy now |
| `checkout.html` | One-page checkout: address, discount codes, Razorpay or cash on delivery |
| `track.html` | Order confirmation and order tracking |
| `admin/` | Admin panel (orders, products, inventory, customers, discounts, marketing, reports, settings) |
| `server/` | Node.js backend: store API, Razorpay, admin API, SQLite database |

## Files

- `data.js` – the starting catalogue. On first run the server copies it into the database; after that, edit products in the admin panel.
- `layout.js` – shared header, menu and footer used by every page.
- `main.js` / `shop.js` / `product.js` – page-specific scripts.
- `styles.css` – all styles. Brand colours: Forest Brew `#1D2E1B`, Tea Mist `#C8D2A6`; fonts: Oranienbaum + DM Mono (Google Fonts).
- `assets/` – web-ready images and 1080p videos used by the site.
- `source/` – original material: content inventory (`.docx`), logo and branding, full-size product images.

## Run locally

Install Node.js 22.13+ from https://nodejs.org, then double-click **`start-mac.command`** (Mac) or **`start-windows.bat`** (Windows) — or run `cd server && npm install && npm start`.

Then open http://localhost:3000 (store) and http://localhost:3000/admin (admin). See **[SETUP.md](SETUP.md)** for first login, Razorpay and going live.

Opened without the server (e.g. on GitHub Pages), the site still works as a catalogue and falls back to ordering on WhatsApp.

**Admin demo:** on GitHub Pages, `/admin` opens a read-only demo with **sample data** (made-up customers and orders, nothing is saved) so you can try every screen. On your own server the demo switches off and the real login appears. Rebuild the sample data with `node server/scripts/build-admin-demo.js`.
