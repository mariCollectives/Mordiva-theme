(function () {
  var path = location.pathname.replace(/\/+$/, "");
  var isCartPage = path === "/cart";
  var isSavedCartPage = path.startsWith("/apps/cart-saved-data");
  if (!isCartPage && !isSavedCartPage) return;

  /* ---------------- Helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function text(el) { return el ? el.textContent.trim() : ""; }
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(raw) {
    raw = (raw || "").replace(/\b[A-Z]{3}\b/g, "").trim();
    if (raw.includes("$")) return raw;
    var n = raw.replace(/[^\d.,-]/g, "");
    return n ? "$" + n : "";
  }

  function customerAvatar() { return (window.__customerAvatarUrl || "").trim(); }
  function customerName() { return (window.__customerName || "").trim(); }

  function getCartId() {
    return new URLSearchParams(location.search).get("cartId") || "";
  }

  function getTitle() {
    var h1 = document.querySelector("h1");
    return h1 ? h1.textContent.trim() : (isCartPage ? "Cart" : "Quote");
  }

  /* ---------------- Parse Items ---------------- */
  function parseCart() {
    var items = [];
    $all("tr.cart-item").forEach(function (row) {
      items.push({
        title: text(row.querySelector(".cart-item__title")),
        qty: row.querySelector("input.quantity__input")?.value || "1",
        unit: money(text(row.querySelector(".cart-item__price .price"))),
        total: money(text(row.querySelector(".cart-item__total")))
      });
    });
    return {
      items: items,
      grand: money(text(document.querySelector(".totals__subtotal-value")))
    };
  }

  function parseSaved() {
    var items = [];
    $all(".cart-item").forEach(function (row) {
      var q = (text(row.querySelector(".item-quantity")).match(/\d+/) || ["1"])[0];
      items.push({
        title: text(row.querySelector(".item-title")),
        qty: q,
        unit: money(text(row.querySelector(".item-price"))),
        total: money(text(row.querySelector(".item-total")))
      });
    });

    var gt = "";
    var r = $(".cart-summary-row.cart-summary-total");
    if (r) gt = money(text(r.querySelector("div:last-child")));

    return { items: items, grand: gt };
  }

  function parse() {
    return isCartPage ? parseCart() : parseSaved();
  }

  /* ---------------- Print HTML ---------------- */
  function buildHTML(data) {
    var rows = data.items.map(function (i) {
      return `
        <tr>
          <td>${esc(i.title)}</td>
          <td style="text-align:center">${esc(i.qty)}</td>
          <td style="text-align:right">${esc(i.unit)}</td>
          <td style="text-align:right">${esc(i.total)}</td>
        </tr>`;
    }).join("");

    var logo = customerAvatar();
    var cname = customerName();

    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(getTitle())}</title>
<style>
body{font-family:system-ui;margin:0;padding:24px}
.header{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:12px}
.left{display:flex;gap:12px}
.logo{width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #ddd}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #eee;padding:8px;font-size:13px}
th{text-transform:uppercase;font-size:11px;color:#555;background:#fafafa}
.total{font-weight:700}
</style>
</head>
<body>
<div class="header">
  <div class="left">
    ${logo ? `<img class="logo" src="${esc(logo)}">` : ``}
    <div>
      <h2>${esc(getTitle())}</h2>
      ${cname ? `<div><strong>Customer:</strong> ${esc(cname)}</div>` : ``}
    </div>
  </div>
  <div>
    <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
    ${getCartId() ? `<div><strong>Cart ID:</strong> ${esc(getCartId())}</div>` : ``}
  </div>
</div>

<table>
<thead>
<tr>
  <th>Item</th>
  <th>Qty</th>
  <th>Unit</th>
  <th>Total</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>

<div style="margin-top:16px;text-align:right">
  <strong>Total: ${esc(data.grand)}</strong>
</div>
</body>
</html>`;
  }

  function print() {
    var data = parse();
    if (!data.items.length) return alert("No items");
    var w = window.open("", "_blank");
    w.document.write(buildHTML(data));
    w.document.close();
    w.focus();
    w.print();
  }

  /* ---------------- Bind ---------------- */
  function bind() {
    var btn = $("#printCartPdfButton") || $("#printQuoteBtn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.onclick = function (e) {
      e.preventDefault();
      print();
    };
  }

  bind();
  setInterval(bind, 300);
})();
