// Product page template: product.html?p=<slug>, rendered from the live catalogue (or data.js offline).
const root = $("#product");
const slug = new URLSearchParams(location.search).get("p");

CATALOG.then(({ live }) => {
const p = PRODUCTS.find(x => x.slug === slug);
if (!p) {
  root.innerHTML = `
  <section class="section">
    <div class="bar bar--first"><span>404</span><span>Product not found</span><a href="shop.html">[Back to shop]</a></div>
    <div class="statement">
      <h1 class="display">We couldn’t find that tea</h1>
      <p class="mono sub">It may have moved or sold out</p>
      <a class="btn" href="shop.html">Shop the collection</a>
    </div>
  </section>`;
} else {
  render(p, live);
}
});

function render(p, live) {
  const soldOut = p.inStock === false;
  const lowLeft = live && p.left;
  const cat = p.cats[0];
  const isFood = !p.cats.includes("gifts");
  const views = [{ src: p.img, label: p.photo ? "Open" : "Front" }];
  if (p.back) views.push({ src: p.back, label: p.photo ? "Closed" : "Back" });
  const details = [["Brand", p.brand], ["Size", p.size], ["Code", p.code], ["Category", p.cats.map(catName).join(", ")], ["MRP", rupees(p.mrp)]].filter(d => d[1]);

  document.title = `${p.name} – ${p.size} | ${p.brand}`;
  $('meta[name="description"]').content = p.pitch;

  const related = [
    ...PRODUCTS.filter(x => x !== p && x.cats.includes(cat)),
    ...PRODUCTS.filter(x => x !== p && !x.cats.includes(cat)),
  ].slice(0, 4);

  root.innerHTML = `
  <section class="section">
    <div class="bar bar--first"><a href="shop.html" class="bar__start">[Shop]</a><span>${catName(cat)}</span><a href="shop.html?cat=${cat}">[Back to ${catName(cat).toLowerCase()}]</a></div>

    <div class="pdp">
      <div class="pdp__info reveal">
        <p class="mono">${esc(p.brand)}${p.code ? " · " + esc(p.code) : ""}</p>
        <h1 class="display pdp__name">${esc(p.name)}</h1>
        <p class="mono pdp__taste">${esc(p.taste)}</p>
        <p class="mono small">${esc(p.pitch)}</p>
      </div>

      <div class="pdp__stage">
        ${views.length > 1 ? `<button class="arrow arrow--prev" aria-label="Previous image"><svg viewBox="0 0 24 24"><path d="M20 12H4m6-6l-6 6 6 6"/></svg></button>` : ""}
        <div class="pdp__imgs ${p.photo ? "is-photo" : ""}">
          ${views.map((v, i) => `<img src="${imgSrc(v.src)}" alt="${p.name} – ${v.label}" class="${i === 0 ? "active" : ""}">`).join("")}
        </div>
        ${views.length > 1 ? `<button class="arrow arrow--next" aria-label="Next image"><svg viewBox="0 0 24 24"><path d="M4 12h16m-6-6l6 6-6 6"/></svg></button>` : ""}
        ${views.length > 1 ? `<div class="pdp__views">${views.map((v, i) => `<button class="mono ${i === 0 ? "on" : ""}" data-i="${i}">${v.label}</button>`).join("")}</div>` : ""}
      </div>

      <div class="pdp__buy reveal">
        ${p.tag ? `<span class="tag tag--inline">${p.tag}</span>` : ""}
        <p class="pdp__price">${rupees(p.price)} <s>${rupees(p.mrp)}</s></p>
        <p class="mono small">${offPct(p)}% off · inclusive of all taxes</p>
        <div class="pdp__row">
          <span class="mono">${p.size}</span>
          <div class="qty" aria-label="Quantity">
            <button data-q="-1" aria-label="Fewer">−</button><span id="qty">1</span><button data-q="1" aria-label="More">+</button>
          </div>
        </div>
        ${soldOut ? `<p class="mono stock-note">Sold out — back soon</p>` : lowLeft ? `<p class="mono stock-note">Only ${p.left} left</p>` : ""}
        ${live ? `<button class="btn btn--wide" id="addCart" ${soldOut ? "disabled" : ""}>[Add to cart]</button>
        <button class="btn btn--wide btn--ghost" id="buyNow" ${soldOut ? "disabled" : ""}>[Buy it now]</button>
        <a class="mono tiny wa-link" id="order" target="_blank" rel="noopener">Or order on WhatsApp →</a>`
        : `<a class="btn btn--wide" id="order" target="_blank" rel="noopener">[Order on WhatsApp]</a>
        <a class="btn btn--wide btn--ghost" href="tel:+919910973302">[Call +91 99109 73302]</a>`}
        <p class="mono tiny">Prepaid or cash on delivery · Dispatch Mon – Sat</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="bar"><span>002</span><span>${p.useTitle || "How to brew"}</span><span class="bar__end">[${p.brew.length} steps]</span></div>
    <ol class="steps${p.brew.length > 4 ? " steps--list" : ""}">
      ${p.brew.map((s, i) => `<li class="reveal"><span class="steps__n">${String(i + 1).padStart(2, "0")}</span><p class="mono">${s}</p></li>`).join("")}
    </ol>
  </section>

  <section class="section">
    <div class="bar"><span>003</span><span>${p.whyTitle || "Why you’ll like it"}</span><span class="bar__end"></span></div>
    <div class="statement statement--tight reveal">
      <h2 class="display">${p.why.join(". ")}.</h2>
    </div>
    <dl class="details reveal">
      ${details.map(([k, v]) => `<div><dt class="mono">${k}</dt><dd>${v}</dd></div>`).join("")}
    </dl>
    ${isFood ? `<p class="mono tiny center disclaimer">Not intended to diagnose, treat, cure or prevent any disease. Enjoy as part of a balanced diet.</p>` : ""}
  </section>

  <section class="section related">
    <div class="bar"><span>004</span><span>You may also like</span><a href="shop.html">[Shop all]</a></div>
    <div class="pgrid">${related.map(productCard).join("")}</div>
  </section>`;

  observeReveals(root);

  /* image views */
  const imgs = $$(".pdp__imgs img", root), tabs = $$(".pdp__views button", root);
  let cur = 0;
  const view = i => {
    i = (i + imgs.length) % imgs.length;
    imgs.forEach((im, k) => im.classList.toggle("active", k === i));
    tabs.forEach((t, k) => t.classList.toggle("on", k === i));
    cur = i;
  };
  $(".arrow--prev", root)?.addEventListener("click", () => view(cur - 1));
  $(".arrow--next", root)?.addEventListener("click", () => view(cur + 1));
  tabs.forEach(t => t.addEventListener("click", () => view(+t.dataset.i)));

  /* quantity + WhatsApp order link */
  let qty = 1;
  const order = $("#order");
  const update = () => {
    $("#qty").textContent = qty;
    const msg = `Hi Wellitas, I'd like to order ${qty} × ${p.name} (${p.size}) at ${rupees(p.price)} each.`;
    order.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
  };
  $$("[data-q]", root).forEach(b => b.addEventListener("click", () => { qty = Math.min(p.left || 50, Math.max(1, qty + +b.dataset.q)); update(); }));
  update();

  /* cart */
  $("#addCart")?.addEventListener("click", () => { Cart.add(p.slug, qty); toast(`Added ${qty} × ${p.short || p.name} to your cart`); setDrawer(true); });
  $("#buyNow")?.addEventListener("click", () => { Cart.add(p.slug, qty); location.href = "checkout.html"; });
  if (live) track("view_item", { slug: p.slug, value: p.price });
}
