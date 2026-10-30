// Home page only. Shared header/menu/footer live in layout.js, catalogue in data.js.
CATALOG.then(function init() {

/* ---------- product slider: the seven teas ---------- */
const TEAS = PRODUCTS.filter(p => p.cats.some(c => ["green", "black", "ctc"].includes(c)) && p.size !== "850 g");
const packs = $("#packs"), dots = $("#dots"), info = $(".slider__info");
TEAS.forEach((t, i) => {
  const img = new Image();
  img.src = imgSrc(t.img);
  img.alt = t.name;
  packs.append(img);
  const d = document.createElement("button");
  d.setAttribute("aria-label", t.name);
  d.onclick = () => go(i);
  dots.append(d);
});
let cur = -1;
function go(i) {
  i = (i + TEAS.length) % TEAS.length;
  if (i === cur) return;
  const imgs = $$("img", packs);
  imgs.forEach(im => im.classList.remove("out"));
  if (cur >= 0) { imgs[cur].classList.remove("active"); imgs[cur].classList.add("out"); }
  imgs[i].classList.add("active");
  $$("button", dots).forEach((d, k) => d.classList.toggle("on", k === i));
  const t = TEAS[i];
  const fill = () => {
    $('[data-f="num"]').textContent = String(i + 1).padStart(2, "0");
    $('[data-f="name"]').textContent = t.short || t.name;
    $('[data-f="desc"]').textContent = t.pitch;
    $('[data-f="price"]').innerHTML = `${rupees(t.price)} <s>${rupees(t.mrp)}</s>`;
    const cta = $('[data-f="cta"]');
    cta.textContent = `Shop ${(t.short || t.name).replace("SipAmrit ", "")}`;
    cta.href = productUrl(t);
    info.classList.remove("fade");
  };
  if (cur < 0) fill(); else { info.classList.add("fade"); setTimeout(fill, 300); }
  cur = i;
}
$(".arrow--prev").onclick = () => go(cur - 1);
$(".arrow--next").onclick = () => go(cur + 1);
go(0);
let autoplay = setInterval(() => go(cur + 1), 5000);
$("#slider").addEventListener("mouseenter", () => clearInterval(autoplay));
$("#slider").addEventListener("mouseleave", () => { autoplay = setInterval(() => go(cur + 1), 5000); });

/* ---------- fan cards open when they scroll into view ---------- */
const fanIO = new IntersectionObserver(([e]) => { if (e.isIntersecting) { e.target.classList.add("open"); fanIO.disconnect(); } }, { threshold: 0.2 });
fanIO.observe($("#fan"));

/* ---------- scroll-linked drifting words ---------- */
const drifters = $$("[data-drift]");
function drift() {
  const vh = innerHeight;
  drifters.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    const p = (vh - r.top) / (vh + r.height); // 0 → 1 as it crosses the viewport
    const span = el.firstElementChild;
    const speed = parseFloat(el.dataset.drift) || 0.35;
    const max = Math.max(0, span.scrollWidth - el.clientWidth);
    const x = el.classList.contains("giant") ? (0.5 - p) * speed * innerWidth : -p * Math.max(max, innerWidth * speed);
    span.style.transform = `translate3d(${x}px,0,0)`;
  });
  requestAnimationFrame(drift);
}
requestAnimationFrame(drift);

/* ---------- drag to scroll category cards ---------- */
const cardTrack = $("#courses");
let down = false, sx = 0, sl = 0, moved = false;
cardTrack.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") return; down = true; moved = false; sx = e.clientX; sl = cardTrack.scrollLeft; cardTrack.style.scrollSnapType = "none"; });
addEventListener("pointerup", () => { down = false; cardTrack.style.scrollSnapType = ""; });
cardTrack.addEventListener("pointermove", e => { if (!down) return; if (Math.abs(e.clientX - sx) > 5) moved = true; cardTrack.scrollLeft = sl - (e.clientX - sx); });
cardTrack.addEventListener("click", e => { if (moved) e.preventDefault(); }, true);
});
