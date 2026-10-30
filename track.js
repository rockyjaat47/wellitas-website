// Order status page: thank-you page after checkout (?n=&k=&new=1) and lookup by order number + phone/email.
const el = $("#track");
const q = new URLSearchParams(location.search);
const STEPS = [["unfulfilled", "Placed"], ["packed", "Packed"], ["shipped", "Shipped"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"]];
const fmtDate = s => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

CATALOG.then(({ live }) => {
  if (!live) {
    el.innerHTML = `<div class="statement statement--tight"><h1 class="display">Track your order</h1>
      <p class="mono sub">Order tracking isn’t available on this copy of the site. Message us your order number and we’ll update you.</p>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}">[WhatsApp us]</a></div>`;
    return;
  }
  if (q.get("n") && q.get("k")) {
    api(`/api/orders/${encodeURIComponent(q.get("n"))}?k=${encodeURIComponent(q.get("k"))}`).then(showOrder, () => lookup("That link has expired. Enter your details to find your order."));
  } else lookup();
});

function lookup(msg = "") {
  el.innerHTML = `
  <div class="statement statement--tight">
    <h1 class="display">Where’s my tea?</h1>
    <p class="mono sub">Enter your order number and the mobile number or email you used at checkout</p>
  </div>
  <form class="track-form" id="trackForm">
    <label class="field"><span class="mono">Order number</span><span class="input"><input name="number" placeholder="WEL1001" required autocomplete="off"></span></label>
    <label class="field"><span class="mono">Mobile or email</span><span class="input"><input name="contact" required autocomplete="tel"></span></label>
    <button class="btn btn--big">[Track order]</button>
    <p class="mono tiny err" id="trackErr" role="alert">${esc(msg)}</p>
  </form>`;
  $("#trackForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const o = await api("/api/track", { method: "POST", body: { number: f.number.value, contact: f.contact.value } });
      history.replaceState(null, "", `track.html?n=${encodeURIComponent(o.number)}&k=${encodeURIComponent(o.key)}`);
      showOrder(o);
    } catch (ex) { $("#trackErr").textContent = ex.message; }
  });
}

function showOrder(o) {
  const isNew = q.get("new") === "1";
  const cancelled = o.status === "cancelled";
  const stepIdx = STEPS.findIndex(s => s[0] === o.fulfillmentStatus);
  const a = o.address || {};
  const payLabel = o.paymentMethod === "cod"
    ? (o.paymentStatus === "paid" ? "Cash on delivery · paid" : `Cash on delivery · pay ${rupees(o.total)} on arrival`)
    : { paid: "Paid online", pending: "Payment pending", failed: "Payment failed", refunded: "Refunded", partially_refunded: "Partly refunded" }[o.paymentStatus] || o.paymentStatus;

  el.innerHTML = `
  <div class="statement statement--tight">
    <p class="mono">${isNew ? "Thank you, " + esc((o.name || "").split(" ")[0]) : "Order"} · ${esc(o.number)}</p>
    <h1 class="display">${cancelled ? "This order was cancelled" : isNew ? "Your order is confirmed" : esc(o.fulfillmentLabel)}</h1>
    <p class="mono sub">${cancelled ? "If you were charged, the refund goes back to your original payment method in 5–7 business days."
      : isNew ? "We’ll pack it within 2–3 working days and send you a tracking link as soon as it ships. Save this page to check on it any time."
      : o.fulfillmentStatus === "delivered" ? "Delivered. Enjoy every cup." : "We’ll keep this page updated as your order moves."}</p>
  </div>

  ${cancelled || ["rto", "returned"].includes(o.fulfillmentStatus) ? "" : `
  <ol class="progress">${STEPS.map(([k, label], i) => `<li class="${i <= stepIdx ? "done" : ""} ${i === stepIdx ? "now" : ""}"><span></span><p class="mono">${label}</p></li>`).join("")}</ol>`}

  ${o.awb ? `<div class="ship-card"><div><p class="mono label">Shipped with</p><p class="title">${esc(o.courier)}</p><p class="mono small">AWB ${esc(o.awb)}</p></div>
    ${o.trackingUrl ? `<a class="btn" target="_blank" rel="noopener" href="${esc(o.trackingUrl)}">[Track on ${esc(o.courier)}]</a>` : ""}</div>` : ""}

  <div class="order-grid">
    <div>
      <p class="mono label">Items</p>
      ${o.items.map(i => `<div class="co-line"><span class="co-line__img"><img src="${imgSrc(i.img)}" alt=""><b>${i.qty}</b></span>
        <span class="co-line__name">${esc(i.name)}<span class="mono tiny">${esc(i.size)}</span></span><span>${rupees(i.price * i.qty)}</span></div>`).join("")}
      <div class="co-row"><span class="mono">Subtotal</span><span>${rupees(o.subtotal)}</span></div>
      ${o.discount ? `<div class="co-row good"><span class="mono">Discount ${esc(o.discountCode || "")}</span><span>−${rupees(o.discount)}</span></div>` : ""}
      <div class="co-row"><span class="mono">Shipping</span><span>${o.shipping ? rupees(o.shipping) : "Free"}</span></div>
      ${o.codFee ? `<div class="co-row"><span class="mono">COD fee</span><span>${rupees(o.codFee)}</span></div>` : ""}
      <div class="co-row total"><span class="mono">Total</span><span>${rupees(o.total)}</span></div>
      ${o.refunded ? `<div class="co-row"><span class="mono">Refunded</span><span>−${rupees(o.refunded)}</span></div>` : ""}
    </div>
    <div>
      <p class="mono label">Delivering to</p>
      <p class="mono small">${esc(o.name)}<br>${esc(a.line1)}${a.line2 ? "<br>" + esc(a.line2) : ""}<br>${esc(a.city)}, ${esc(a.state)} – ${esc(a.pincode)}</p>
      <p class="mono label" style="margin-top:28px">Payment</p>
      <p class="mono small">${esc(payLabel)}</p>
      <p class="mono label" style="margin-top:28px">Updates</p>
      <ul class="timeline">${o.events.slice().reverse().map(e => `<li><span class="mono tiny">${fmtDate(e.created_at)}</span><p class="mono small">${esc(e.message)}</p></li>`).join("")}</ul>
    </div>
  </div>
  <div class="center" style="margin:60px 0 40px"><a class="btn" href="shop.html">[Continue shopping]</a>
    <a class="btn btn--ghost" target="_blank" rel="noopener" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi Wellitas, I have a question about order " + o.number)}">[Ask about this order]</a></div>`;
}
