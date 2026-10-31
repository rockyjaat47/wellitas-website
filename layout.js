// Shared header, menu, cart drawer and footer for every page, plus the live catalogue, cart and analytics.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- API + live catalogue (falls back to data.js when no backend, e.g. GitHub Pages) ---------- */
const API = window.WELLITAS_API ?? "";
const api = (path, opts = {}) => fetch(API + path, {
  ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
}).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong"); return d; });

let STORE_CONFIG = null;
const CATALOG = Promise.all([
  api("/api/products").then(list => { PRODUCTS.splice(0, PRODUCTS.length, ...list); }),
  api("/api/config").then(c => { STORE_CONFIG = c; }),
]).then(() => ({ live: true }), () => ({ live: false }));

/* ---------- cart (localStorage) ---------- */
const CART_KEY = "wellitas_cart";
const Cart = {
  get: () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  set(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); renderCart(); },
  add(slug, qty = 1) {
    const items = Cart.get();
    const it = items.find(i => i.slug === slug);
    it ? (it.qty = Math.min(50, it.qty + qty)) : items.push({ slug, qty });
    Cart.set(items);
    const p = PRODUCTS.find(x => x.slug === slug);
    track("add_to_cart", { slug, value: p ? p.price * qty : undefined });
  },
  update(slug, qty) { Cart.set(Cart.get().map(i => (i.slug === slug ? { ...i, qty } : i)).filter(i => i.qty > 0)); },
  clear() { Cart.set([]); },
  count: () => Cart.get().reduce((a, i) => a + i.qty, 0),
};

const HEADER = `
<header class="header" id="header">
  <div class="announce" id="announce">Festive offer: 50% off all Green and Black Tea blends. Pour something good into the season.</div>
  <div class="header__bar">
    <a href="index.html" class="header__logo" aria-label="Wellitas home"><img src="assets/img/logo.png" alt="Wellitas – Refresh, Relax, Revive"></a>
    <nav class="header__nav" aria-label="Main">
      <a href="index.html">Home</a><a href="index.html#welcome">About</a><a href="shop.html">Shop</a><a href="shop.html?cat=gifts">Gifting</a><a href="index.html#journal">Blog</a><a href="#contact">Contact Us</a>
    </nav>
    <div class="header__icons">
      <a href="track.html" class="icon-btn" aria-label="Track your order" title="Track your order"><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg></a>
      <button class="icon-btn" id="cartOpen" aria-label="Open cart" title="Cart"><svg viewBox="0 0 24 24"><path d="M3 4h2.2l2.1 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.1"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/></svg><b id="cartCount"></b></button>
      <button class="icon-btn menu-toggle" id="menuOpen" aria-label="Open menu"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </div>
  </div>
</header>

<div class="menu" id="menu" aria-hidden="true">
  <div class="menu__panel">
    <div class="menu__top">
      <img class="menu__logo" src="assets/img/logo.png" alt="Wellitas">
      <button class="btn btn--light" id="menuClose">[Close menu]</button>
    </div>
    <div class="menu__groups">
      <div class="menu__group">
        <p class="menu__label">Wellitas world</p>
        <a href="index.html#welcome">About us</a><a href="index.html#garden">Garden to cup</a><a href="index.html#journal">Journal</a><a href="track.html">Track your order</a><a href="#contact">Contact us</a>
      </div>
      <div class="menu__group">
        <p class="menu__label">Teas</p>
        <a href="shop.html">Shop all</a><a href="shop.html?cat=green">Green tea</a><a href="shop.html?cat=black">Black tea</a><a href="shop.html?cat=herbal">Herbal blends</a><a href="shop.html?cat=ctc">SipAmrit CTC</a>
      </div>
      <div class="menu__group">
        <p class="menu__label">Pantry</p>
        <a href="shop.html?cat=seeds">Fruit &amp; seeds</a>
      </div>
      <div class="menu__group">
        <p class="menu__label">Gifting</p>
        <a href="shop.html?cat=gifts">Wellness gift hampers</a><a href="mailto:hello@wellitas.co.in?subject=Corporate%20gifting">Corporate orders</a>
      </div>
    </div>
    <div class="menu__bottom"><span>Wellitas Consumers Pvt. Ltd.</span><a href="#contact">Privacy</a></div>
  </div>
  <div class="menu__image"><img src="assets/img/hamper-closed.jpg" alt="Wellitas lavender gift box"></div>
</div>

<div class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer__shade" data-close></div>
  <aside class="drawer__panel" role="dialog" aria-label="Your cart">
    <div class="drawer__top"><p class="title">Your cart</p><button class="btn btn--light" data-close>[Close]</button></div>
    <div class="drawer__items" id="cartItems"></div>
    <div class="drawer__foot" id="cartFoot"></div>
  </aside>
</div>`;

const FOOTER = `
<footer class="footer dark" id="contact">
  <div class="footer__top">
    <img class="footer__logo" src="assets/img/logo.png" alt="Wellitas">
    <a href="#top" class="btn btn--light">[Back to top]</a>
  </div>
  <div class="footer__mid">
    <div>
      <p class="mono label">Newsletter</p>
      <p class="display small-display">Get brewing tips, new blends and early access to offers.</p>
      <form class="news" id="news">
        <input type="email" required placeholder="your@email.com" aria-label="Email address">
        <button class="btn btn--light">[Sign up]</button>
      </form>
      <p class="mono tiny" id="newsMsg">No spam, unsubscribe anytime.</p>
    </div>
    <div class="footer__cols">
      <div><p class="mono label">Shop</p><a href="shop.html?cat=green">Green Tea</a><a href="shop.html?cat=black">Black Tea</a><a href="shop.html?cat=herbal">Herbal Tea</a><a href="shop.html?cat=ctc">SipAmrit CTC Tea</a><a href="shop.html?cat=seeds">Seeds</a><a href="shop.html?cat=gifts">Gifting</a></div>
      <div><p class="mono label">Help</p><a href="track.html">Track your order</a><a href="index.html#welcome">About Us</a><a href="#">FAQ</a><a href="#">Shipping Policy</a><a href="#">Return &amp; Refund Policy</a></div>
      <div><p class="mono label">Contact</p><a href="tel:+919910973302">+91 99109 73302</a><a href="mailto:hello@wellitas.co.in">hello@wellitas.co.in</a><span>Mon – Fri, 10:00 – 18:00 IST</span></div>
    </div>
  </div>
  <div class="footer__bottom">
    <div class="mono">Wellitas Consumers Pvt. Ltd.<br>© Wellitas 2026. All rights reserved</div>
    <div class="mono center">
      <svg class="leaf" viewBox="0 0 24 24"><path d="M12 21c0-6 1-11 9-16-1 8-4 12-9 12M12 21c0-5-1-8-8-11 1 6 3 9 8 9"/></svg>
      <p>Opp. Maa Narmada College, Ramnagar Mehragown, Itarsi, Hoshangabad – 461111, Madhya Pradesh</p>
      <p class="links"><a href="#">Privacy Policy</a><a href="#">Terms &amp; Conditions</a></p>
    </div>
    <div class="mono right"><a href="https://www.instagram.com/wellitas369_official" target="_blank" rel="noopener">Instagram</a><br><a href="https://www.facebook.com/profile.php?id=100064343972408" target="_blank" rel="noopener">Facebook</a></div>
  </div>
</footer>
<div class="toast" id="toast" role="status"></div>
<div class="cursor" id="cursor"></div>`;

document.body.insertAdjacentHTML("afterbegin", HEADER);
document.body.insertAdjacentHTML("beforeend", FOOTER);

/* ---------- current page in the nav ---------- */
$$(".header__nav a").forEach(a => {
  const u = new URL(a.href);
  if (u.pathname === location.pathname && !u.hash && (u.search === location.search || (!u.search && !location.search))) a.classList.add("on");
});

/* ---------- header on scroll (pages without a video hero keep the solid bar) ---------- */
const header = $("#header");
const solid = document.body.classList.contains("solid");
const onScroll = () => header.classList.toggle("scrolled", solid || scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- menu ---------- */
const menu = $("#menu");
const setMenu = open => { menu.classList.toggle("open", open); menu.setAttribute("aria-hidden", !open); document.body.style.overflow = open ? "hidden" : ""; };
$("#menuOpen").onclick = () => setMenu(true);
$("#menuClose").onclick = () => setMenu(false);
$$(".menu a").forEach(a => a.addEventListener("click", () => setMenu(false)));

/* ---------- cart drawer ---------- */
const drawer = $("#drawer");
const setDrawer = open => { drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); document.body.style.overflow = open ? "hidden" : ""; };
$("#cartOpen").onclick = () => setDrawer(true);
$$("[data-close]", drawer).forEach(b => (b.onclick = () => setDrawer(false)));
addEventListener("keydown", e => { if (e.key === "Escape") { setMenu(false); setDrawer(false); } });

function renderCart() {
  const items = Cart.get().map(i => ({ ...i, p: PRODUCTS.find(p => p.slug === i.slug) })).filter(i => i.p);
  $("#cartCount").textContent = items.reduce((a, i) => a + i.qty, 0) || "";
  const box = $("#cartItems"), foot = $("#cartFoot");
  if (!items.length) {
    box.innerHTML = `<div class="drawer__empty"><p class="display small-display">Your cart is empty</p><a href="shop.html" class="btn">Shop the collection</a></div>`;
    foot.innerHTML = "";
    return;
  }
  box.innerHTML = items.map(({ p, qty }) => `
    <div class="line">
      <a href="${productUrl(p)}" class="line__img ${p.photo ? "is-photo" : ""}"><img src="${imgSrc(p.img)}" alt=""></a>
      <div class="line__info">
        <a href="${productUrl(p)}" class="line__name">${esc(p.short || p.name)}</a>
        <p class="mono tiny">${esc(p.size)} · ${rupees(p.price)}</p>
        <div class="qty qty--sm"><button data-slug="${p.slug}" data-d="-1" aria-label="Fewer">−</button><span>${qty}</span><button data-slug="${p.slug}" data-d="1" aria-label="More">+</button></div>
      </div>
      <div class="line__price">${rupees(p.price * qty)}<button class="mono tiny line__rm" data-rm="${p.slug}">Remove</button></div>
    </div>`).join("");
  const sub = items.reduce((a, i) => a + i.p.price * i.qty, 0);
  const free = STORE_CONFIG?.shipping?.freeAbove;
  foot.innerHTML = `
    ${free ? `<p class="mono tiny ship-note">${sub >= free ? "You’ve unlocked free shipping" : `Add ${rupees(free - sub)} more for free shipping`}</p>
      <div class="ship-bar"><span style="width:${Math.min(100, (100 * sub) / free)}%"></span></div>` : ""}
    <div class="drawer__total"><span class="mono">Subtotal</span><span class="price">${rupees(sub)}</span></div>
    <p class="mono tiny">Shipping and discounts are calculated at checkout. Prices include taxes.</p>
    <a href="checkout.html" class="btn btn--wide">[Checkout]</a>`;
}
$("#cartItems").addEventListener("click", e => {
  const b = e.target.closest("[data-d]"), rm = e.target.closest("[data-rm]");
  if (b) { const it = Cart.get().find(i => i.slug === b.dataset.slug); if (it) Cart.update(it.slug, Math.min(50, it.qty + +b.dataset.d)); }
  if (rm) Cart.update(rm.dataset.rm, 0);
});
addEventListener("storage", e => e.key === CART_KEY && renderCart());

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2600);
}

/* ---------- reveal on scroll ---------- */
const revealIO = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
}), { threshold: 0.15 });
const observeReveals = (root = document) => $$(".reveal:not(.in)", root).forEach(el => revealIO.observe(el));
observeReveals();

/* ---------- cursor dot ---------- */
const cursor = $("#cursor");
addEventListener("pointermove", e => { cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });
document.addEventListener("pointerover", e => cursor.classList.toggle("big", !!e.target.closest("a, button, .post, .card")));

/* ---------- newsletter ---------- */
$("#news").addEventListener("submit", async e => {
  e.preventDefault();
  const email = e.target.querySelector("input").value;
  try { await api("/api/subscribe", { method: "POST", body: { email, source: "footer" } }); } catch {}
  $("#newsMsg").textContent = "Thank you. You’re on the list.";
  e.target.reset();
});

/* ---------- analytics: first-party events + optional GA4 / Meta Pixel ---------- */
const SESSION = sessionStorage.wl_s || (sessionStorage.wl_s = Math.random().toString(36).slice(2) + Date.now().toString(36));
const UTM = (() => {
  const q = new URLSearchParams(location.search);
  const fresh = ["source", "medium", "campaign"].reduce((o, k) => (q.get("utm_" + k) ? { ...o, [k]: q.get("utm_" + k) } : o), {});
  if (q.get("fbclid") && !fresh.source) Object.assign(fresh, { source: "facebook", medium: "paid" });
  if (q.get("gclid") && !fresh.source) Object.assign(fresh, { source: "google", medium: "cpc" });
  if (Object.keys(fresh).length) localStorage.wl_utm = JSON.stringify(fresh);
  try { return JSON.parse(localStorage.wl_utm || "{}"); } catch { return {}; }
})();
const REFERRER = (() => {
  try { const r = new URL(document.referrer); if (r.host !== location.host) localStorage.wl_ref = r.host; } catch {}
  return localStorage.wl_ref || "";
})();

function track(type, data = {}) {
  const payload = JSON.stringify({ session: SESSION, utm: UTM, referrer: REFERRER, events: [{ type, path: location.pathname, ...data }] });
  if (navigator.sendBeacon) navigator.sendBeacon(API + "/api/events", new Blob([payload], { type: "text/plain" }));
  else fetch(API + "/api/events", { method: "POST", body: payload, keepalive: true }).catch(() => {});
  if (window.gtag) gtag("event", type, data.value ? { value: data.value, currency: "INR" } : {});
  if (window.fbq) {
    const map = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" };
    if (map[type]) fbq("track", map[type], data.value ? { value: data.value, currency: "INR" } : {});
  }
}

CATALOG.then(({ live }) => {
  renderCart();
  if (!live) return;
  if (STORE_CONFIG.announcement) $("#announce").textContent = STORE_CONFIG.announcement;
  else $("#announce").remove();
  if (STORE_CONFIG.ga4Id) {
    const s = document.createElement("script");
    s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(STORE_CONFIG.ga4Id)}`;
    document.head.append(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date()); gtag("config", STORE_CONFIG.ga4Id);
  }
  if (STORE_CONFIG.metaPixelId) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", STORE_CONFIG.metaPixelId); fbq("track", "PageView");
  }
  track("page_view");
});

/* ---------- shared product card, used by the shop grid and "you may also like" ---------- */
function productCard(p, i) {
  const media = p.photo ? `<img class="photo" src="${imgSrc(p.img)}" alt="${esc(p.name)}">` : `<img src="${imgSrc(p.img)}" alt="${esc(p.name)}">`;
  const soldOut = p.inStock === false;
  return `
  <a class="card pcard reveal ${soldOut ? "is-soldout" : ""}" href="${productUrl(p)}">
    <header><span>${String(i + 1).padStart(2, "0")}</span><span>${catName(p.cats[0])}</span></header>
    <div class="card__img">${soldOut ? `<span class="tag">Sold out</span>` : p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}${media}</div>
    <h3 class="pcard__name">${esc(p.short || p.name)}</h3>
    <p class="price">${rupees(p.price)} <s>${rupees(p.mrp)}</s></p>
    <footer><span>${esc(p.size)}</span><span>|</span><span>${esc(p.brand)}</span><span>|</span><span>${offPct(p)}% off</span></footer>
    <span class="btn">[View]</span>
  </a>`;
}
