// Shared header, menu overlay and footer for every page.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const HEADER = `
<header class="header" id="header">
  <div class="announce">Festive offer: 50% off all Green and Black Tea blends. Pour something good into the season.</div>
  <div class="header__bar">
    <nav class="header__left">
      <a href="shop.html?cat=ctc" class="mono-link">SipAmrit CTC</a>
      <a href="shop.html" class="mono-link">Shop</a>
      <button class="btn btn--menu" id="menuOpen" aria-label="Open menu"><span class="burger"></span>Menu</button>
    </nav>
    <a href="index.html" class="header__logo" aria-label="Wellitas home"><img src="assets/img/logo.png" alt="Wellitas – Refresh, Relax, Revive"></a>
    <nav class="header__right">
      <a href="#contact" class="mono-link">[Contact us]</a>
      <span class="mono-link lang">EN <svg width="9" height="6" viewBox="0 0 9 6"><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" fill="none"/></svg></span>
    </nav>
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
        <a href="index.html#welcome">About us</a><a href="index.html#garden">Garden to cup</a><a href="index.html#journal">Journal</a><a href="#contact">Contact us</a>
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
      <div><p class="mono label">Information</p><a href="index.html#welcome">About Us</a><a href="#">FAQ</a><a href="#">Shipping Policy</a><a href="#">Return &amp; Refund Policy</a></div>
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
<div class="cursor" id="cursor"></div>`;

document.body.insertAdjacentHTML("afterbegin", HEADER);
document.body.insertAdjacentHTML("beforeend", FOOTER);

/* header on scroll (pages without a video hero keep the solid bar) */
const header = $("#header");
const solid = document.body.classList.contains("solid");
const onScroll = () => header.classList.toggle("scrolled", solid || scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* menu */
const menu = $("#menu");
const setMenu = open => { menu.classList.toggle("open", open); menu.setAttribute("aria-hidden", !open); document.body.style.overflow = open ? "hidden" : ""; };
$("#menuOpen").onclick = () => setMenu(true);
$("#menuClose").onclick = () => setMenu(false);
$$(".menu a").forEach(a => a.addEventListener("click", () => setMenu(false)));
addEventListener("keydown", e => e.key === "Escape" && setMenu(false));

/* reveal on scroll */
const revealIO = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
}), { threshold: 0.15 });
const observeReveals = (root = document) => $$(".reveal:not(.in)", root).forEach(el => revealIO.observe(el));
observeReveals();

/* cursor dot */
const cursor = $("#cursor");
addEventListener("pointermove", e => { cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });
document.addEventListener("pointerover", e => cursor.classList.toggle("big", !!e.target.closest("a, button, .post, .card")));

/* newsletter (front-end only) */
$("#news").addEventListener("submit", e => {
  e.preventDefault();
  $("#newsMsg").textContent = "Thank you. You’re on the list.";
  e.target.reset();
});

/* shared product card, used by the shop grid and "you may also like" */
function productCard(p, i) {
  const media = p.photo ? `<img class="photo" src="${imgSrc(p.img)}" alt="${p.name}">` : `<img src="${imgSrc(p.img)}" alt="${p.name}">`;
  return `
  <a class="card pcard reveal" href="${productUrl(p)}">
    <header><span>${String(i + 1).padStart(2, "0")}</span><span>${catName(p.cats[0])}</span></header>
    <div class="card__img">${p.tag ? `<span class="tag">${p.tag}</span>` : ""}${media}</div>
    <h3 class="pcard__name">${p.short || p.name}</h3>
    <p class="price">${rupees(p.price)} <s>${rupees(p.mrp)}</s></p>
    <footer><span>${p.size}</span><span>|</span><span>${p.brand}</span><span>|</span><span>${offPct(p)}% off</span></footer>
    <span class="btn">[View]</span>
  </a>`;
}
