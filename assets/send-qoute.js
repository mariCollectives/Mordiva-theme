(function () {
  if (!location.pathname.startsWith("/apps/cart-saved-data")) return;

  var SELECTORS = {
    buttonMountPoints: [
      ".page-width header",
      "main header",
      ".cart-items-container", // ✅ your app wrapper
      "main",
      "body"
    ],

    // ✅ Your real DOM structure
    itemRows: [".cart-item"],
    title: [".item-title"],
    qtyText: [".item-quantity"],
    unitPrice: [".item-price"],
    lineTotal: [".item-total"],
    grandTotalRow: ".cart-summary-row.cart-summary-total"
  };

  function $(selectors, root) {
    root = root || document;
    if (typeof selectors === "string") return root.querySelector(selectors);
    for (var i = 0; i < selectors.length; i++) {
      var el = root.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function $all(selectors, root) {
    root = root || document;
    for (var i = 0; i < selectors.length; i++) {
      var els = root.querySelectorAll(selectors[i]);
      if (els && els.length) return Array.prototype.slice.call(els);
    }
    return [];
  }

  function text(el) {
    if (!el) return "";
    return (el.value != null ? el.value : el.textContent || "").trim();
  }

  function moneyKeepDollar(raw) {
    raw = (raw || "").trim();
    raw = raw.replace(/\b[A-Z]{3}\b/g, "").trim(); // remove currency codes only
    if (raw.indexOf("$") !== -1) return raw.replace(/\s+/g, " ").trim();
    var num = raw.replace(/[^\d.,-]/g, "").trim();
    return num ? ("$" + num) : "";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCartId() {
    var params = new URLSearchParams(location.search);
    return params.get("cartId") || "";
  }

  function getCartName() {
    var h1 = document.querySelector("h1");
    return (h1 ? h1.textContent : document.title || "Saved Cart").trim();
  }

  function extractQtyFromText(qtyRaw) {
    // "Qty: 3" -> 3
    var m = (qtyRaw || "").match(/Qty\s*:\s*(\d+)/i);
    return (m && m[1]) ? m[1] : "1";
  }

  function extractLineTotal(totalRaw) {
    // "Total: $59.97" -> "$59.97"
    var m = (totalRaw || "").match(/Total\s*:\s*(.*)$/i);
    return moneyKeepDollar(m && m[1] ? m[1] : totalRaw);
  }

  function getGrandTotal() {
    var row = $(SELECTORS.grandTotalRow);
    if (!row) return "";
    var divs = row.querySelectorAll("div");
    if (divs && divs.length >= 2) return moneyKeepDollar(text(divs[1]));
    return moneyKeepDollar(text(row.lastElementChild));
  }

  function parseItemsFromDOM() {
    var rows = $all(SELECTORS.itemRows);
    var items = [];

    rows.forEach(function (row) {
      var title = text($(SELECTORS.title, row));
      if (!title) return;

      var qty = extractQtyFromText(text($(SELECTORS.qtyText, row)));
      var unit = moneyKeepDollar(text($(SELECTORS.unitPrice, row)));
      var lineTotal = extractLineTotal(text($(SELECTORS.lineTotal, row)));

      items.push({
        title: title,
        quantity: qty,
        unit: unit,
        line_total: lineTotal
      });
    });

    return { items: items, grandTotal: getGrandTotal() };
  }

  // -------- PRINT (Save as PDF) --------
  function buildPrintHtml(data) {
    var cartName = getCartName();
    var cartId = getCartId();
    var now = new Date().toLocaleString();

    var rowsHtml = data.items.map(function (it) {
      return (
        "<tr>" +
          "<td class='title'>" + escapeHtml(it.title) + "</td>" +
          "<td class='qty'>" + escapeHtml(it.quantity) + "</td>" +
          "<td class='money'>" + escapeHtml(it.unit || "") + "</td>" +
          "<td class='money'>" + escapeHtml(it.line_total || "") + "</td>" +
        "</tr>"
      );
    }).join("");

    var totalHtml = data.grandTotal
      ? "<div class='total'><span>Total</span><span>" + escapeHtml(data.grandTotal) + "</span></div>"
      : "";

    return (
      "<!doctype html><html><head>" +
        "<meta charset='utf-8' />" +
        "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
        "<title>" + escapeHtml(cartName) + "</title>" +
        "<style>" +
          "body{font-family:Arial,sans-serif;padding:28px;color:#111;}" +
          "h1{margin:0 0 6px;font-size:22px;}" +
          ".meta{font-size:12px;opacity:.8;margin:6px 0 0;}" +
          "table{width:100%;border-collapse:collapse;margin-top:16px;}" +
          "th,td{border-bottom:1px solid #e6e6e6;padding:10px 8px;font-size:13px;vertical-align:top;}" +
          "th{background:#fafafa;font-weight:700;}" +
          "td.qty{width:70px;text-align:center;}" +
          "td.money{width:130px;text-align:right;white-space:nowrap;}" +
          ".total{display:flex;justify-content:space-between;gap:12px;margin-top:16px;font-size:16px;font-weight:700;}" +
          "@media print{body{padding:0}}" +
        "</style>" +
      "</head><body>" +
        "<h1>Quote: " + escapeHtml(cartName) + "</h1>" +
        "<div class='meta'>Generated: " + escapeHtml(now) + "</div>" +
        (cartId ? "<div class='meta'>Cart ID: " + escapeHtml(cartId) + "</div>" : "") +
        "<div class='meta'>Link: " + escapeHtml(location.href) + "</div>" +
        "<table>" +
          "<thead><tr>" +
            "<th>Item</th>" +
            "<th style='text-align:center;'>Qty</th>" +
            "<th style='text-align:right;'>Unit</th>" +
            "<th style='text-align:right;'>Line Total</th>" +
          "</tr></thead>" +
          "<tbody>" + rowsHtml + "</tbody>" +
        "</table>" +
        totalHtml +
      "</body></html>"
    );
  }

  function printQuotePDF() {
    var data = parseItemsFromDOM();
    if (!data.items.length) {
      alert("No cart items found to print. Check selectors.");
      return;
    }

    var w = window.open("", "_blank");
    if (!w) {
      alert("Popup blocked. Allow popups to print / save as PDF.");
      return;
    }

    w.document.open();
    w.document.write(buildPrintHtml(data));
    w.document.close();

    w.focus();
    setTimeout(function () {
      try { w.print(); } catch (e) {}
    }, 400);
  }

  // -------- EMAIL --------
  function buildEmailBody(data) {
    var cartId = getCartId();
    var cartName = getCartName();
    var url = location.href;

    var lines = [];
    lines.push("Quote: " + cartName);
    if (cartId) lines.push("Cart ID: " + cartId);
    lines.push("Link: " + url);
    lines.push("");
    lines.push("Items:");
    lines.push("----------------------------------------");

    data.items.forEach(function (it) {
      var line = "- " + it.title + " | Qty: " + it.quantity;
      if (it.unit) line += " | Unit: " + it.unit;
      if (it.line_total) line += " | Line Total: " + it.line_total;
      lines.push(line);
    });

    lines.push("----------------------------------------");
    if (data.grandTotal) lines.push("Grand Total: " + data.grandTotal);
    lines.push("");
    lines.push("Generated: " + new Date().toLocaleString());

    return lines.join("\n");
  }

  function sendQuoteEmail() {
    var data = parseItemsFromDOM();
    if (!data.items.length) {
      alert("No cart items found to email. Check selectors.");
      return;
    }

    var subject = "Quote - " + getCartName();
    var body = buildEmailBody(data);

    var to = ""; // optional: set default recipient email
    location.href =
      "mailto:" + encodeURIComponent(to) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  // -------- UI --------
  function mountButtons() {
    var mount = $(SELECTORS.buttonMountPoints) || document.body;
    if (document.getElementById("printQuoteBtn") || document.getElementById("emailQuoteBtn")) return;

    var wrap = document.createElement("div");
    wrap.className = "no-print";
    wrap.style.cssText =
      "display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin:12px 0;";

    var printBtn = document.createElement("button");
    printBtn.id = "printQuoteBtn";
    printBtn.type = "button";
    printBtn.textContent = "Print / Save PDF";
    printBtn.style.cssText =
      "padding:10px 14px; border:1px solid #111; background:#111; color:#fff; border-radius:6px; cursor:pointer;";

    var emailBtn = document.createElement("button");
    emailBtn.id = "emailQuoteBtn";
    emailBtn.type = "button";
    emailBtn.textContent = "Email Quote";
    emailBtn.style.cssText =
      "padding:10px 14px; border:1px solid #111; background:#fff; color:#111; border-radius:6px; cursor:pointer;";

    printBtn.addEventListener("click", printQuotePDF);
    emailBtn.addEventListener("click", sendQuoteEmail);

    wrap.appendChild(printBtn);
    wrap.appendChild(emailBtn);
    mount.insertBefore(wrap, mount.firstChild);
  }

  // Wait for app content to render
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var rows = $all(SELECTORS.itemRows);
    var hasTotal = !!$(SELECTORS.grandTotalRow);
    if ((rows.length && hasTotal) || tries > 40) {
      clearInterval(timer);
      mountButtons();
    }
  }, 300);
})();