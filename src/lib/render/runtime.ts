/**
 * The runtime script baked into every artifact.
 *
 * This is the whole of D8 in one file: "static" means no server rendered the
 * page, NOT that the page is inert. The HTML is a frozen file on disk that
 * never changes. This script gives it a working cart by calling the runtime API.
 *
 * A visitor adding to cart mutates `orders` in the database. The .html file's
 * checksum stays byte-identical — there is a test that asserts exactly that.
 *
 * It is deliberately dependency-free vanilla JS so an exported zip opened from
 * file:// still works.
 */
export function runtimeScript(opts: { runtimeApi: string; siteId: string; releaseId: string }) {
  const cfg = JSON.stringify({
    api: opts.runtimeApi,
    siteId: opts.siteId,
    releaseId: opts.releaseId,
  });

  return `
(function () {
  var CFG = ${cfg};
  var KEY = "cms.cart." + CFG.siteId;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function write(items) { localStorage.setItem(KEY, JSON.stringify(items)); paint(items); }
  function count(items) { return items.reduce(function (n, i) { return n + i.qty; }, 0); }
  function total(items) { return items.reduce(function (n, i) { return n + i.qty * i.priceCents; }, 0); }
  function money(c) { return "$" + (c / 100).toFixed(2); }

  function paint(items) {
    items = items || read();
    var n = count(items);
    var bar = document.getElementById("cms-cart");
    if (!bar) return;
    bar.style.transform = n > 0 ? "translateY(0)" : "translateY(140%)";
    document.getElementById("cms-cart-count").textContent = n + (n === 1 ? " item" : " items");
    document.getElementById("cms-cart-total").textContent = money(total(items));
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-cms-add-to-cart]") : null;
    if (btn) {
      var variantId = btn.getAttribute("data-cms-add-to-cart");
      if (!variantId) return;
      var items = read();
      var existing = items.filter(function (i) { return i.variantId === variantId; })[0];
      if (existing) existing.qty += 1;
      else items.push({
        variantId: variantId,
        qty: 1,
        title: btn.getAttribute("data-cms-title") || "",
        priceCents: parseInt(btn.getAttribute("data-cms-price") || "0", 10)
      });
      write(items);
      var label = btn.textContent;
      btn.textContent = "Added";
      setTimeout(function () { btn.textContent = label; }, 900);
      return;
    }

    var checkout = e.target.closest ? e.target.closest("#cms-cart-checkout") : null;
    if (checkout) {
      var items = read();
      if (!items.length) return;
      checkout.disabled = true;
      checkout.textContent = "Placing order…";
      // THE POINT: a static file on disk causing a real write to live data.
      fetch(CFG.api + "/api/runtime/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: CFG.siteId, releaseId: CFG.releaseId, items: items })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          checkout.disabled = false;
          checkout.textContent = "Checkout";
          if (res && res.ok) {
            write([]);
            var note = document.getElementById("cms-cart-note");
            note.textContent = "Order " + res.orderId.slice(0, 8) + " placed — written to the orders table.";
            note.style.display = "block";
            setTimeout(function () { note.style.display = "none"; }, 6000);
          }
        })
        .catch(function () {
          checkout.disabled = false;
          checkout.textContent = "Checkout";
        });
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { paint(); });
  else paint();
})();
`.trim();
}

/** Markup for the floating cart bar. Part of the frozen HTML; inert without JS. */
export function cartMarkup(tokens: { colorFg: string; colorBg: string; colorAccent: string; colorAccentFg: string; colorBorder: string; radius: string; fontBody: string }) {
  return `
<div id="cms-cart" style="position:fixed;left:50%;bottom:24px;transform:translateY(140%);transition:transform .28s cubic-bezier(.2,.8,.2,1);z-index:50;display:flex;align-items:center;gap:16px;background:${tokens.colorFg};color:${tokens.colorBg};padding:12px 12px 12px 22px;border-radius:999px;font-family:${tokens.fontBody};box-shadow:0 18px 40px -12px rgba(0,0,0,.45);margin-left:-190px;width:380px;box-sizing:border-box">
  <span id="cms-cart-count" style="font-size:14px;font-weight:500">0 items</span>
  <span id="cms-cart-total" style="font-size:14px;opacity:.65;margin-left:auto">$0.00</span>
  <button id="cms-cart-checkout" type="button" style="background:${tokens.colorAccent};color:${tokens.colorAccentFg};border:none;padding:10px 20px;border-radius:999px;font-family:inherit;font-weight:600;font-size:14px;cursor:pointer">Checkout</button>
</div>
<div id="cms-cart-note" style="display:none;position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:50;background:#0b7a4b;color:#fff;padding:10px 18px;border-radius:999px;font-family:${tokens.fontBody};font-size:13px;white-space:nowrap">order placed</div>
`.trim();
}
