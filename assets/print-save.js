(function () {
  if (!location.pathname.startsWith("/apps/cart-saved-data")) return;

  var SELECTORS = {
    cartContainer: ".cart-items-container",

    itemRows: [".cart-item"],
    title: [".item-title"],
    qtyText: [".item-quantity"],
    unitPrice: [".item-price"],
    lineTotal: [".item-total"],
    grandTotalRow: ".cart-summary-row.cart-summary-total"
  };

  function $(sel, root) {
    root = root || document;
    if (Array.isArray(sel)) {
      for (var i = 0; i < sel.length; i++) {
        var el = root.querySelector(sel[i]);
        if (el) return el;
      }
      return null;
    }
    return root.querySelector(sel);
  }

  function $all(sel, root) {
    root = root || document;
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }

  function text(el) {
    return el ? el.textContent.trim() : "";
  }

  function moneyKeepDollar(raw) {
    raw = (raw || "").replace(/\b[A-Z]{3}\b/g, "").trim();
    if (raw.includes("$")) return raw;
    var n = raw.replace(/[^\d.,-]/g, "");
    return n ? "$" + n : "";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCartName() {
    var h1 = document.querySelector("h1");
    return h1 ? h1.textContent.trim() : "Quote";
  }

  function getCartId() {
    return new URLSearchParams(location.search).get("cartId") || "";
  }

  function extractQty(txt) {
    var m = txt.match(/Qty\s*:\s*(\d+)/i);
    return m ? m[1] : "1";
  }

  function extractLineTotal(txt) {
    var m = txt.match(/Total\s*:\s*(.*)$/i);
    return moneyKeepDollar(m ? m[1] : txt);
  }

  function getGrandTotal() {
    var row = $(SELECTORS.grandTotalRow);
    if (!row) return "";
    var divs = row.querySelectorAll("div");
    return divs.length >= 2 ? moneyKeepDollar(text(divs[1])) : "";
  }

  function parseItems() {
    var items = [];

    $all(".cart-item").forEach(function (row) {
      items.push({
        title: text($(SELECTORS.title, row)),
        quantity: extractQty(text($(SELECTORS.qtyText, row))),
        unit: moneyKeepDollar(text($(SELECTORS.unitPrice, row))),
        line_total: extractLineTotal(text($(SELECTORS.lineTotal, row)))
      });
    });

    return { items: items, grandTotal: getGrandTotal() };
  }

  // ---------- PRINT (CLEAN) ----------
  function buildPrintHtml(data) {
    var now = new Date();
    var dateStr = now.toLocaleString();

    var rows = data.items
      .map(function (i) {
        return (
          "<tr>" +
          "<td class='item'>" + escapeHtml(i.title) + "</td>" +
          "<td class='qty'>" + escapeHtml(i.quantity) + "</td>" +
          "<td class='money'>" + escapeHtml(i.unit) + "</td>" +
          "<td class='money'>" + escapeHtml(i.line_total) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var shopName = (window.Shopify && Shopify.shop) ? Shopify.shop : location.hostname;
    var cartId = getCartId();

    return (
`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(getCartName())}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
  /* Screen preview in print window */
  :root { color-scheme: light; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; padding: 24px; color: #111; }
  .page { max-width: 900px; margin: 0 auto; }
  .header { display:flex; justify-content:space-between; gap: 16px; align-items:flex-start; border-bottom: 1px solid #e5e5e5; padding-bottom: 14px; margin-bottom: 16px; }
  .title { margin: 0; font-size: 22px; letter-spacing: .2px; }
  .meta { font-size: 12px; color:#444; line-height: 1.5; text-align:right; }
  .meta strong { color:#111; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
  th { text-transform: uppercase; letter-spacing: .06em; font-size: 11px; color:#444; background: #fafafa; }
  td.item { width: 55%; }
  td.qty { width: 10%; text-align: center; white-space: nowrap; }
  td.money { width: 17.5%; text-align: right; white-space: nowrap; }
  .summary { display:flex; justify-content:flex-end; margin-top: 14px; }
  .summary-box { min-width: 280px; border: 1px solid #eee; border-radius: 10px; padding: 12px 14px; }
  .summary-row { display:flex; justify-content:space-between; font-size: 13px; padding: 6px 0; }
  .summary-row.total { font-weight: 700; font-size: 14px; border-top: 1px solid #eee; margin-top: 6px; padding-top: 10px; }
  .footnote { margin-top: 18px; font-size: 11px; color:#666; }

  /* Print rules */
  @media print {
    @page { size: A4; margin: 12mm; }
    body { padding: 0; }
    .page { max-width: none; }
    .header { break-inside: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; break-after: auto; }
    thead { display: table-header-group; }
  }
</style>
</head>

<body>
  <div class="page">
    <div class="header">
      <div>
        <h1 class="title">${escapeHtml(getCartName())}</h1>
        <div class="meta" style="text-align:left">
          <div><strong>Store:</strong> ${escapeHtml(shopName)}</div>
        </div>
      </div>
      <div class="meta">
        <div><strong>Date:</strong> ${escapeHtml(dateStr)}</div>
        ${cartId ? `<div><strong>Cart ID:</strong> ${escapeHtml(cartId)}</div>` : ``}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit</th>
          <th style="text-align:right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-box">
        <div class="summary-row total">
          <span>Total</span>
          <span>${escapeHtml(data.grandTotal || "")}</span>
        </div>
      </div>
    </div>

    <div class="footnote">
      Generated from cart preview. Totals may exclude shipping/taxes until checkout.
    </div>
  </div>
</body>
</html>`
    );
  }

  function printPDF() {
    var data = parseItems();
    if (!data.items.length) return alert("No items found");

    var w = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!w) return alert("Popup blocked. Please allow popups to print.");

    w.document.open();
    w.document.write(buildPrintHtml(data));
    w.document.close();

    // Print when ready (more reliable than arbitrary timeouts)
    w.onload = function () {
      try { w.focus(); w.print(); } catch (e) {}
    };
  }

  // ---------- EMAIL (unchanged) ----------
  function sendEmail() {
    var data = parseItems();
    var body =
      "Quote: " + getCartName() + "\n\n" +
      data.items.map(function (i) {
        return "- " + i.title + " | Qty: " + i.quantity + " | Unit: " + i.unit + " | Line: " + i.line_total;
      }).join("\n") +
      "\n\nGrand Total: " + data.grandTotal;

    location.href =
      "mailto:?subject=" + encodeURIComponent("Quote - " + getCartName()) +
      "&body=" + encodeURIComponent(body);
  }

  // ---------- UI (THEME-FRIENDLY) ----------
  function injectStylesOnce() {
    if (document.getElementById("quoteActionsStyles")) return;
    var style = document.createElement("style");
    style.id = "quoteActionsStyles";
    style.textContent = `
      #quoteActions {
        display:flex;
        gap:10px;
        justify-content:flex-end;
        margin: 0 0 16px;
        flex-wrap: wrap;
      }
      #quoteActions .btn, #quoteActions .button {
        min-height: 44px;
      }
    `;
    document.head.appendChild(style);
  }

  function mountButtons() {
    var container = $(SELECTORS.cartContainer);
    if (!container || document.getElementById("quoteActions")) return;

    injectStylesOnce();

    var wrap = document.createElement("div");
    wrap.id = "quoteActions";

    // Try to match theme classes (fall back if missing)
    var primaryClass = document.querySelector(".btn.btn--primary") ? "btn btn--primary" : "button button--primary";
    var secondaryClass = document.querySelector(".btn") ? "btn" : "button button--secondary";

    wrap.innerHTML = `
      <button type="button" id="printQuoteBtn" class="${primaryClass}">Print / Save PDF</button>
      <button type="button" id="emailQuoteBtn" class="${secondaryClass}">Email Quote</button>
    `;

    container.parentNode.insertBefore(wrap, container);

    document.getElementById("printQuoteBtn").addEventListener("click", printPDF);
    document.getElementById("emailQuoteBtn").addEventListener("click", sendEmail);
  }

  var t = setInterval(function () {
    if ($(SELECTORS.cartContainer)) {
      clearInterval(t);
      mountButtons();
    }
  }, 300);
})();
