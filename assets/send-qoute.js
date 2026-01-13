(function () {
  var path = location.pathname.replace(/\/+$/, "");

  var isCartPage = path === "/cart";
  var isSavedCartPage = path.startsWith("/apps/cart-saved-data");

  if (!isCartPage && !isSavedCartPage) return;

  // ---------------- Helpers ----------------
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function text(el) {
    return el ? el.textContent.trim() : "";
  }
  function val(el) {
    if (!el) return "";
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")
      return (el.value || "").trim();
    return "";
  }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function moneyKeepDollar(raw) {
    raw = (raw || "").replace(/\b[A-Z]{3}\b/g, "").trim();
    if (raw.includes("$")) return raw;
    var n = raw.replace(/[^\d.,-]/g, "");
    return n ? "$" + n : "";
  }

  function getCartId() {
    return new URLSearchParams(location.search).get("cartId") || "";
  }

  function getTitle() {
    var h1 = document.querySelector("h1");
    return h1 ? h1.textContent.trim() : (isCartPage ? "Cart" : "Quote");
  }

  // ---------------- NEW: Find "Room / Note" dt/dd text ----------------
  function findRoomNoteFromDtDd(row) {
    // Looks for: <dt>Room / Note:</dt> <dd>...</dd>
    var dts = row.querySelectorAll("dt");
    for (var i = 0; i < dts.length; i++) {
      var dt = dts[i];
      var dtText = (dt.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

      // match "room / note" even if spacing or colon differs
      if (dtText.indexOf("room") !== -1 && dtText.indexOf("note") !== -1) {
        // usually dd is next sibling, but sometimes within same parent
        var dd = null;

        // direct nextElementSibling
        if (dt.nextElementSibling && dt.nextElementSibling.tagName === "DD") {
          dd = dt.nextElementSibling;
        } else {
          // try: find dd inside same container
          var parent = dt.parentElement;
          if (parent) dd = parent.querySelector("dd");
        }

        var value = text(dd);
        if (value) return value;
      }
    }
    return "";
  }

  // ---------------- Find "Assign to Room" / Room-Note value ----------------
  function findRoomValueInCartRow(row) {
    // 0) FIRST: rendered DT/DD "Room / Note"
    var fromDtDd = findRoomNoteFromDtDd(row);
    if (fromDtDd) return fromDtDd;

    // 1) Shopify line item properties input
    var propInput =
      row.querySelector('[name^="properties["][name*="Assign to Room"]') ||
      row.querySelector('[name^="properties["][name*="Room"]') ||
      row.querySelector('[name^="properties["][name*="Note"]');

    if (propInput) return val(propInput);

    // 2) last fallback: any input inside row
    var anyInput = row.querySelector("input, textarea, select");
    return val(anyInput);
  }

  function findRoomValueInSavedRow(row) {
    // 0) FIRST: rendered DT/DD "Room / Note"
    var fromDtDd = findRoomNoteFromDtDd(row);
    if (fromDtDd) return fromDtDd;

    // 1) If there are property inputs (less likely on saved cart)
    var propInput =
      row.querySelector('[name^="properties["][name*="Assign to Room"]') ||
      row.querySelector('[name^="properties["][name*="Room"]') ||
      row.querySelector('[name^="properties["][name*="Note"]');

    if (propInput) return val(propInput);

    // 2) If saved cart shows it as plain text somewhere custom
    var label =
      row.querySelector(".item-room") ||
      row.querySelector('[data-room]');

    if (label) return val(label) || text(label);

    // 3) last fallback: any input inside row
    return val(row.querySelector("input, textarea, select"));
  }

  // ---------------- Parse items (per page) ----------------
  function parseFromCartPage() {
    var items = [];

    $all("tr.cart-item").forEach(function (row) {
      var titleEl = row.querySelector(".cart-item__title");
      var qtyEl = row.querySelector("input.quantity__input");
      var unitEl = row.querySelector(".cart-item__price .price");
      var lineEl = row.querySelector(".cart-item__total");

      items.push({
        title: text(titleEl),
        room_note: findRoomValueInCartRow(row),
        quantity: qtyEl ? String(qtyEl.value || qtyEl.getAttribute("value") || "1") : "1",
        unit: moneyKeepDollar(text(unitEl)),
        line_total: moneyKeepDollar(text(lineEl))
      });
    });

    var grandTotal = moneyKeepDollar(text(document.querySelector(".totals__subtotal-value")));
    return { items: items, grandTotal: grandTotal };
  }

  function parseFromSavedCartPage() {
    var items = [];

    $all(".cart-item").forEach(function (row) {
      var t = row.querySelector(".item-title");
      var q = row.querySelector(".item-quantity");
      var u = row.querySelector(".item-price");
      var lt = row.querySelector(".item-total");

      function extractQty(txt) {
        var m = (txt || "").match(/Qty\s*:\s*(\d+)/i);
        return m ? m[1] : "1";
      }
      function extractLineTotal(txt) {
        var m = (txt || "").match(/Total\s*:\s*(.*)$/i);
        return moneyKeepDollar(m ? m[1] : txt);
      }

      items.push({
        title: text(t),
        room_note: findRoomValueInSavedRow(row),
        quantity: extractQty(text(q)),
        unit: moneyKeepDollar(text(u)),
        line_total: extractLineTotal(text(lt))
      });
    });

    var gtRow = document.querySelector(".cart-summary-row.cart-summary-total");
    var gt = "";
    if (gtRow) {
      var divs = gtRow.querySelectorAll("div");
      if (divs.length >= 2) gt = moneyKeepDollar(text(divs[1]));
    }

    return { items: items, grandTotal: gt };
  }

  function parseItems() {
    return isCartPage ? parseFromCartPage() : parseFromSavedCartPage();
  }

  // ---------------- Print HTML ----------------
  function buildPrintHtml(data) {
    var now = new Date();
    var dateStr = now.toLocaleString();
    var shopName = (window.Shopify && Shopify.shop) ? Shopify.shop : location.hostname;
    var cartId = getCartId();

    var rows = data.items
      .map(function (i) {
        return (
          "<tr>" +
          "<td class='item'>" + escapeHtml(i.title) + "</td>" +
          "<td class='room'>" + escapeHtml(i.room_note || "") + "</td>" +
          "<td class='qty'>" + escapeHtml(i.quantity) + "</td>" +
          "<td class='money'>" + escapeHtml(i.unit) + "</td>" +
          "<td class='money'>" + escapeHtml(i.line_total) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(getTitle())}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
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
  td.item { width: 40%; }
  td.room { width: 25%; }
  td.qty { width: 10%; text-align: center; white-space: nowrap; }
  td.money { width: 12.5%; text-align: right; white-space: nowrap; }
  .summary { display:flex; justify-content:flex-end; margin-top: 14px; }
  .summary-box { min-width: 280px; border: 1px solid #eee; border-radius: 10px; padding: 12px 14px; }
  .summary-row { display:flex; justify-content:space-between; font-size: 13px; padding: 6px 0; }
  .summary-row.total { font-weight: 700; font-size: 14px; border-top: 1px solid #eee; margin-top: 6px; padding-top: 10px; }
  .footnote { margin-top: 18px; font-size: 11px; color:#666; }

  @media print {
    @page { size: A4; margin: 12mm; }
    body { padding: 0; }
    .page { max-width: none; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1 class="title">${escapeHtml(getTitle())}</h1>
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
          <th style="text-align:left">Room / Note</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit</th>
          <th style="text-align:right">Line Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
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

  function openPrintWindow(html) {
    var w = window.open("", "_blank", "width=1000,height=800");
    if (!w) {
      alert("Popup blocked. Please allow popups to print.");
      return null;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    var tries = 0;
    var tick = setInterval(function () {
      tries++;
      try {
        if (w.document && w.document.readyState === "complete") {
          clearInterval(tick);
          w.focus();
          w.print();
        }
      } catch (e) {}
      if (tries > 40) {
        clearInterval(tick);
        try { w.focus(); w.print(); } catch (e2) {}
      }
    }, 100);

    return w;
  }

  function printPDF() {
    var data = parseItems();
    if (!data.items.length) return alert("No items found");
    openPrintWindow(buildPrintHtml(data));
  }

  // ---------------- Bind button ----------------
  function bind() {
    var btn = document.getElementById("printCartPdfButton") || document.getElementById("printQuoteBtn");
    if (!btn) return;

    if (btn.dataset.printBound === "1") return;
    btn.dataset.printBound = "1";

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      printPDF();
    });
  }

  bind();
  var t = setInterval(function () {
    bind();
    var btn = document.getElementById("printCartPdfButton") || document.getElementById("printQuoteBtn");
    if (btn && btn.dataset.printBound === "1") clearInterval(t);
  }, 250);
})();
