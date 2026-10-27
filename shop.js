// Shop page: category chips + product grid, driven by data.js. ?cat=<id> preselects a category.
const grid = $("#grid"), chips = $("#chips");
const DEFAULT_BLURB = $("#shopBlurb").innerHTML;
const inCat =id => PRODUCTS.filter(p => id === "all" || p.cats.includes(id));

chips.innerHTML = [{ id: "all", name: "All" }, ...CATEGORIES]
  .map(c => `<button class="chip-btn" data-cat="${c.id}">${c.name} <sup>${inCat(c.id).length}</sup></button>`)
  .join("");

function show(cat) {
  if (cat !== "all" && !CATEGORIES.some(c => c.id === cat)) cat = "all";
  const list = inCat(cat);
  const c = CATEGORIES.find(c => c.id === cat);
  $$(".chip-btn", chips).forEach(b => b.classList.toggle("on", b.dataset.cat === cat));
  $("#shopTitle").textContent = c ? c.name : "The collection";
  $("#count").textContent = `[${list.length} products]`;
  $("#shopBlurb").innerHTML = c ? c.blurb : DEFAULT_BLURB;
  document.title = `${c ? c.name : "Shop the collection"} – Wellitas`;
  grid.innerHTML = list.map(productCard).join("");
  $$(".pcard", grid).forEach((el, i) => (el.style.transitionDelay = `${(i % 4) * 60}ms`));
  observeReveals(grid);
  const url = new URL(location);
  cat === "all" ? url.searchParams.delete("cat") : url.searchParams.set("cat", cat);
  history.replaceState(null, "", url);
}

chips.addEventListener("click", e => {
  const b = e.target.closest(".chip-btn");
  if (b) show(b.dataset.cat);
});
show(new URLSearchParams(location.search).get("cat") || "all");
