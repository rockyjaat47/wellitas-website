// One-page checkout: contact, address, payment (Razorpay or cash on delivery), discount codes.
// Totals always come from the server's /api/cart/quote.
const box = $("#checkout");
const TOKEN_KEY = "wl_co_token", CUSTOMER_KEY = "wl_customer";
const token = localStorage[TOKEN_KEY] || (localStorage[TOKEN_KEY] = Math.random().toString(36).slice(2) + Date.now().toString(36));
let code = "", lastQuote = null, placing = false, pending = null; // pending: unpaid online order to retry

CATALOG.then(({ live }) => {
  const items = Cart.get();
  if (!live) return offline(items);
  if (!items.length) return empty();
  render();
  track("begin_checkout", { value: items.reduce((a, i) => a + (PRODUCTS.find(p => p.slug === i.slug)?.price || 0) * i.qty, 0) });
});

function empty() {
  box.innerHTML = `<div class="statement statement--tight"><h1 class="display">Your cart is empty</h1>
    <p class="mono sub">Find something good to brew</p><a class="btn" href="shop.html">Shop the collection</a></div>`;
}
function offline(items) {
  const lines = items.map(i => { const p = PRODUCTS.find(x => x.slug === i.slug); return p ? `${i.qty} × ${p.name} (${p.size})` : ""; }).filter(Boolean);
  const msg = `Hi Wellitas, I'd like to order:\n${lines.join("\n")}`;
  box.innerHTML = `<div class="statement statement--tight"><h1 class="display">Order on WhatsApp</h1>
    <p class="mono sub">Online checkout isn’t available on this copy of the site. Send us your cart and we’ll confirm your order.</p>
    <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}">[Send cart on WhatsApp]</a></div>`;
}

function render() {
  const cfg = STORE_CONFIG;
  const saved = (() => { try { return JSON.parse(localStorage[CUSTOMER_KEY] || "{}"); } catch { return {}; } })();
  const pay = cfg.payments;
  const defaultPay = pay.online ? "online" : "cod";
  box.innerHTML = `
  <form class="co" id="coForm" novalidate>
    <div class="co__form">
      <fieldset class="co__step">
        <legend><span>01</span> Contact</legend>
        <div class="fields">
          ${field("fullname", "Full name", saved.name, 'autocomplete="name" required minlength="2"')}
          ${field("phone", "Mobile number", saved.phone, 'type="tel" inputmode="numeric" autocomplete="tel-national" required pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit mobile"', "+91")}
          ${field("email", "Email (for your receipt)", saved.email, 'type="email" autocomplete="email"')}
        </div>
        <label class="check"><input type="checkbox" name="marketing" ${saved.marketing !== false ? "checked" : ""}> <span class="mono small">Send me brewing tips and offers</span></label>
      </fieldset>

      <fieldset class="co__step">
        <legend><span>02</span> Delivery address</legend>
        <div class="fields">
          ${field("line1", "House / flat, building, street", saved.line1, 'autocomplete="address-line1" required', "", "wide")}
          ${field("line2", "Area / locality (optional)", saved.line2, 'autocomplete="address-line2"', "", "wide")}
          ${field("landmark", "Landmark (optional)", saved.landmark, "")}
          ${field("pincode", "PIN code", saved.pincode, 'inputmode="numeric" autocomplete="postal-code" required pattern="[1-9][0-9]{5}" maxlength="6"')}
          ${field("city", "City / town", saved.city, 'autocomplete="address-level2" required')}
          <label class="field"><span class="mono">State</span>
            <select name="state" required autocomplete="address-level1"><option value="">Choose state</option>
              ${cfg.states.map(s => `<option ${s === saved.state ? "selected" : ""}>${esc(s)}</option>`).join("")}
            </select></label>
        </div>
        <p class="mono tiny">Usually delivered in ${esc(cfg.shipping.deliveryDays)} working days across India.</p>
      </fieldset>

      <fieldset class="co__step">
        <legend><span>03</span> Payment</legend>
        <div class="paylist">
          ${pay.online ? `<label class="payopt"><input type="radio" name="payment" value="online" ${defaultPay === "online" ? "checked" : ""}>
            <span><b>Pay online</b><span class="mono tiny">UPI, cards, net banking, wallets · secured by Razorpay${pay.mode === "demo" ? " (demo mode)" : pay.mode === "test" ? " (test mode)" : ""}</span></span></label>` : ""}
          ${pay.cod ? `<label class="payopt" id="codOpt"><input type="radio" name="payment" value="cod" ${defaultPay === "cod" ? "checked" : ""}>
            <span><b>Cash on delivery</b><span class="mono tiny">${pay.codFee ? `+${rupees(pay.codFee)} COD fee · ` : ""}Pay in cash or UPI when it arrives</span></span></label>` : ""}
        </div>
        <label class="field wide"><span class="mono">Order note (optional)</span><textarea name="note" rows="2" maxlength="500" placeholder="Gift message, delivery instructions…"></textarea></label>
      </fieldset>
    </div>

    <aside class="co__summary">
      <p class="mono label">Order summary</p>
      <div id="coLines"></div>
      <div class="code-row">
        <input name="code" placeholder="Discount code" aria-label="Discount code" autocomplete="off">
        <button type="button" class="btn btn--ghost" id="applyCode">[Apply]</button>
      </div>
      <p class="mono tiny code-msg" id="codeMsg"></p>
      <div id="coTotals"></div>
      <p class="mono tiny err" id="coError" role="alert"></p>
      <button class="btn btn--wide btn--big" id="placeOrder" type="submit">[Place order]</button>
      <p class="mono tiny center">Prices include all taxes. By placing your order you agree to our Terms and Return &amp; Refund Policy.</p>
    </aside>
  </form>`;

  const form = $("#coForm");
  form.addEventListener("change", e => { if (e.target.name === "payment") refresh(); });
  $("#applyCode").onclick = () => { code = form.code.value.trim(); refresh(true); };
  form.code.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#applyCode").click(); } });
  ["phone", "email", "fullname"].forEach(n => form[n].addEventListener("blur", saveCheckout));
  form.phone.addEventListener("input", () => (form.phone.value = form.phone.value.replace(/\D/g, "").slice(0, 10)));
  form.pincode.addEventListener("input", () => (form.pincode.value = form.pincode.value.replace(/\D/g, "").slice(0, 6)));
  form.addEventListener("submit", placeOrder);
  addEventListener("storage", e => e.key === CART_KEY && refresh());
  refresh();
}

function field(name, label, value = "", attrs = "", prefix = "", cls = "") {
  return `<label class="field ${cls}"><span class="mono">${label}</span>
    <span class="input ${prefix ? "has-prefix" : ""}">${prefix ? `<i>${prefix}</i>` : ""}<input name="${name}" value="${esc(value || "")}" ${attrs}></span></label>`;
}

async function refresh(fromCode) {
  const form = $("#coForm");
  const items = Cart.get();
  if (!items.length) return empty();
  const q = await api("/api/cart/quote", { method: "POST", body: { items, code, payment: form.payment.value, phone: form.phone.value } }).catch(e => ({ error: e.message }));
  if (q.error) { $("#coError").textContent = q.error; return; }
  lastQuote = q;
  $("#coLines").innerHTML = q.lines.map(l => `
    <div class="co-line">
      <span class="co-line__img ${l.photo ? "is-photo" : ""}"><img src="${imgSrc(l.img)}" alt=""><b>${l.qty}</b></span>
      <span class="co-line__name">${esc(l.short || l.name)}<span class="mono tiny">${esc(l.size)}</span></span>
      <span>${rupees(l.lineTotal)}</span>
    </div>`).join("");
  const codOpt = $("#codOpt");
  if (codOpt) codOpt.classList.toggle("is-off", !q.codAllowed);
  $("#codeMsg").textContent = code ? (q.codeError || `Code ${q.code} applied`) : "";
  $("#codeMsg").classList.toggle("bad", !!q.codeError);
  if (fromCode && q.codeError) code = "";
  const row = (k, v, cls = "") => `<div class="co-row ${cls}"><span class="mono">${k}</span><span>${v}</span></div>`;
  $("#coTotals").innerHTML =
    row("Subtotal", rupees(q.subtotal)) +
    (q.discount ? row(`Discount (${esc(q.code)})`, "−" + rupees(q.discount), "good") : "") +
    row("Shipping", q.shipping ? rupees(q.shipping) : "Free") +
    (q.codFee ? row("COD fee", rupees(q.codFee)) : "") +
    row("Total", rupees(q.total), "total") +
    (q.mrpTotal > q.total ? `<p class="mono tiny good">You save ${rupees(q.mrpTotal - q.total)} on MRP</p>` : "") +
    (q.shipping && q.freeShippingAbove ? `<p class="mono tiny">Free shipping on orders above ${rupees(q.freeShippingAbove)}</p>` : "");
  $("#coError").textContent = q.errors[0] || "";
  $("#placeOrder").textContent = `[Place order · ${rupees(q.total)}]`;
}

let saveT;
function saveCheckout() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const f = $("#coForm");
    api("/api/checkout/save", { method: "POST", body: { token, name: f.fullname.value, email: f.email.value, phone: f.phone.value, items: Cart.get() } }).catch(() => {});
  }, 400);
}

async function placeOrder(e) {
  e.preventDefault();
  if (placing) return;
  const f = $("#coForm"), err = $("#coError");
  const firstBad = [...f.elements].find(el => el.willValidate && !el.checkValidity());
  if (firstBad) {
    firstBad.focus();
    const label = firstBad.closest(".field")?.querySelector(".mono")?.textContent || "this field";
    err.textContent = `Please check ${label.toLowerCase()}`;
    return;
  }
  if (!f.payment.value) { err.textContent = "Please choose a payment method"; return; }
  placing = true;
  const btn = $("#placeOrder");
  btn.disabled = true;
  btn.textContent = "[Placing your order…]";
  err.textContent = "";
  const body = {
    items: Cart.get(), code, payment: f.payment.value, note: f.note.value, marketing: f.marketing.checked, checkoutToken: token,
    customer: { name: f.fullname.value.trim(), phone: f.phone.value, email: f.email.value.trim() },
    address: { line1: f.line1.value, line2: f.line2.value, landmark: f.landmark.value, city: f.city.value, state: f.state.value, pincode: f.pincode.value },
    utm: UTM, referrer: REFERRER,
  };
  const sig = JSON.stringify([body.items, code, body.payment]);
  try {
    // Retrying a dismissed online payment reopens the same order instead of creating a new one.
    const res = pending && pending.sig === sig ? pending.res : await api("/api/orders", { method: "POST", body });
    if (res.razorpay || res.demo) pending = { sig, res };
    localStorage[CUSTOMER_KEY] = JSON.stringify({ ...body.customer, ...body.address, marketing: body.marketing });
    if (res.razorpay) await payRazorpay(res);
    else if (res.demo) await payDemo(res);
    else done(res);
  } catch (ex) {
    err.textContent = ex.message.replace(" — place it again to retry", " — press Place order to retry");
  } finally {
    placing = false;
    btn.disabled = false;
    if (lastQuote) btn.textContent = `[Place order · ${rupees(lastQuote.total)}]`;
  }
}

function done(res) {
  track("purchase", { value: res.total });
  Cart.clear();
  localStorage.removeItem(TOKEN_KEY);
  location.href = `track.html?n=${encodeURIComponent(res.number)}&k=${encodeURIComponent(res.key)}&new=1`;
}

function loadScript(src) {
  return new Promise((ok, bad) => {
    if ($(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn’t load the payment window. Check your connection and try again."));
    document.head.append(s);
  });
}

async function payRazorpay(res) {
  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: res.razorpay.key, order_id: res.razorpay.orderId, amount: res.razorpay.amount, currency: "INR",
      name: res.razorpay.name, description: `Order ${res.number}`, image: new URL("assets/img/logo.png", location.href).href,
      prefill: res.razorpay.prefill, theme: { color: "#1D2E1B" },
      handler: async r => {
        try { await api(`/api/orders/${res.number}/verify`, { method: "POST", body: { key: res.key, ...r } }); done(res); resolve(); }
        catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new Error(`Payment wasn’t completed. Your order ${res.number} is held for 45 minutes — place it again to retry, or choose cash on delivery.`)) },
    });
    rzp.on("payment.failed", r => reject(new Error(r.error?.description || "Payment failed. Please try again.")));
    rzp.open();
  });
}

function payDemo(res) {
  const m = $("#demoPay");
  m.hidden = false;
  return new Promise((resolve, reject) => {
    m.onclick = async e => {
      const b = e.target.closest("[data-demo]");
      if (!b) return;
      m.hidden = true;
      if (b.dataset.demo === "cancel") return reject(new Error(`Payment wasn’t completed. Order ${res.number} is held for 45 minutes.`));
      try { await api(`/api/orders/${res.number}/demo-pay`, { method: "POST", body: { key: res.key } }); done(res); resolve(); }
      catch (ex) { reject(ex); }
    };
  });
}
