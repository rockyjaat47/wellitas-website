# Wellitas website

Static website for **Wellitas** (Wellitas Consumers Pvt. Ltd.) – green, black and herbal teas, SipAmrit CTC chai, fruit & seed mixes and wellness gift hampers. Plain HTML, CSS and JavaScript – no build step.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Home page: video hero, gift hampers, tea carousel, garden-to-cup, SipAmrit, categories, journal |
| `shop.html` | Full catalogue with category filters (`shop.html?cat=green`, `black`, `herbal`, `ctc`, `seeds`, `gifts`) |
| `product.html` | Product page template (`product.html?p=<slug>`), filled from `data.js` |

## Files

- `data.js` – the product catalogue (names, prices, sizes, codes, copy, images). Edit this to change products or prices.
- `layout.js` – shared header, menu and footer used by every page.
- `main.js` / `shop.js` / `product.js` – page-specific scripts.
- `styles.css` – all styles. Brand colours: Forest Brew `#1D2E1B`, Tea Mist `#C8D2A6`; fonts: Oranienbaum + DM Mono (Google Fonts).
- `assets/` – web-ready images and 1080p videos used by the site.
- `source/` – original material: content inventory (`.docx`), logo and branding, full-size product images.

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Ordering

There is no cart or payment yet. The product page's **Order on WhatsApp** button opens a prefilled message to +91 99109 73302.
