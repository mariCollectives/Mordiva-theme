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
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
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

  // ---------- PRINT ----------
  function buildPrintHtml(data) {
    var rows = data.items.map(function (i) {
      return `<tr>
        <td>${escapeHtml(i.title)}</td>
        <td style="text-align:center">${i.quantity}</td>
        <td style="text-align:right">${i.unit}</td>
        <td style="text-align:right">${i.line_total}</td>
      </tr>`;
    }).join("");

    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(getCartName())}</title>
<style>
body{font-family:Arial;padding:24px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #ddd;padding:8px;font-size:13px}
th{background:#f7f7f7}
.total{display:flex;justify-content:space-between;font-weight:bold;margin-top:16px}
</style>
</head>
<body>
<h2>Quote: ${escapeHtml(getCartName())}</h2>
<table>
<thead>
<tr><th>Item</th><th>Qty</th><th>Unit</th><th>Line Total</th></tr>
</thead>
<tbody>${rows}</tbody>
</table>
<div class="total"><span>Total</span><span>${data.grandTotal}</span></div>
</body>
</html>`;
  }

  function printPDF() {
    var data = parseItems();
    if (!data.items.length) return alert("No items found");

    var w = window.open("", "_blank");
    w.document.write(buildPrintHtml(data));
    w.document.close();
    setTimeout(function(){ w.print(); }, 400);
  }

  // ---------- EMAIL ----------
  function sendEmail() {
    var data = parseItems();
    var body = `Quote: ${getCartName()}\n\n` +
      data.items.map(i =>
        `- ${i.title} | Qty: ${i.quantity} | Unit: ${i.unit} | Line: ${i.line_total}`
      ).join("\n") +
      `\n\nGrand Total: ${data.grandTotal}`;

    location.href =
      "mailto:?subject=" + encodeURIComponent("Quote - " + getCartName()) +
      "&body=" + encodeURIComponent(body);
  }

  // ---------- UI ----------
  function mountButtons() {
    var container = $(SELECTORS.cartContainer);
    if (!container || document.getElementById("quoteActions")) return;

    var wrap = document.createElement("div");
    wrap.id = "quoteActions";
    wrap.style.cssText =
      "display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px";

    wrap.innerHTML = `
      <button id="printQuoteBtn" style="padding:10px 14px;background:#111;color:#fff;border:0;border-radius:6px">Print / Save PDF</button>
      <button id="emailQuoteBtn" style="padding:10px 14px;background:#fff;color:#111;border:1px solid #111;border-radius:6px">Email Quote</button>
    `;

    container.parentNode.insertBefore(wrap, container);

    document.getElementById("printQuoteBtn").onclick = printPDF;
    document.getElementById("emailQuoteBtn").onclick = sendEmail;
  }

  var t = setInterval(function () {
    if ($(SELECTORS.cartContainer)) {
      clearInterval(t);
      mountButtons();
    }
  }, 300);
})();