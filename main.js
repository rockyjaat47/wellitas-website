// Home page only. Shared header/menu/footer live in layout.js, catalogue in data.js.
CATALOG.then(function init() {

/* ---------- hero: big words + pack, cycled with Previous / Next ---------- */
const HERO = [
  { slug: "himalayan-green-tea", w1: "himalayan", w2: "green tea", cap: "Himalayan tea" },
  { slug: "hibiscus-black-tea", w1: "hibiscus", w2: "black tea", cap: "hibiscus tea" },
  { slug: "mint-lemongrass-green-tea", w1: "zesty", w2: "green tea", cap: "mint & lemongrass" },
  { slug: "sipamrit-premium-ctc-250g", w1: "kadak", w2: "chai blend", cap: "SipAmrit chai" },
].map(h => ({ ...h, p: PRODUCTS.find(p => p.slug === h.slug) })).filter(h => h.p);
const hero = $("#hero");
let heroIdx = 0, heroTimer;
HERO.forEach(h => { new Image().src = imgSrc(h.p.img); });
function showHero(i) {
  heroIdx = (i + HERO.length) % HERO.length;
  const h = HERO[heroIdx];
  hero.classList.add("swap");
  setTimeout(() => {
    $("#heroW1").textContent = h.w1;
    $("#heroW2").textContent = h.w2;
    $("#heroPack").src = imgSrc(h.p.img);
    $("#heroPack").alt = `Wellitas ${h.p.name} pack`;
    $("#heroExplore").href = productUrl(h.p);
    $(".hero__videocap").innerHTML = `Explore the taste of<br>${esc(h.cap)} <i></i>`;
    fitHeroWords();
    hero.classList.remove("swap");
  }, 450);
  clearInterval(heroTimer);
  heroTimer = setInterval(() => showHero(heroIdx + 1), 6500);
}
// Long names ("himalayan", "chai blend") shrink so they never run into the text on the right.
function fitHeroWords() {
  [["#heroW1", 0.585], ["#heroW2", 0.97]].forEach(([sel, edge]) => {
    const el = $(sel);
    el.style.fontSize = "";
    if (innerWidth <= 900) return;
    const room = hero.clientWidth * edge - el.offsetLeft;
    if (el.offsetWidth > room) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * (room / el.offsetWidth) + "px";
  });
}
addEventListener("resize", fitHeroWords);
document.fonts.ready.then(fitHeroWords);
$("#heroPrev").onclick = () => showHero(heroIdx - 1);
$("#heroNext").onclick = () => showHero(heroIdx + 1);
if (HERO.length) { $("#heroExplore").href = productUrl(HERO[0].p); heroTimer = setInterval(() => showHero(heroIdx + 1), 6500); }
// The small video card plays the garden film further down the page.
$(".hero__video").addEventListener("click", () => setTimeout(() => $("#why video")?.play(), 600));

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
