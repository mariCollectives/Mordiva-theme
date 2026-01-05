(function () {
  // Only run on the saved cart page
  if (!location.pathname.startsWith("/apps/cart-saved-data")) return;

  // --- CONFIG: adjust selectors to match your page ---
  var SELECTORS = {
    buttonMountPoints: [
      ".page-width header",
      "main header",
      "main .page-width",
      "main",
      "body"
    ],
    itemRows: [
      ".cart-items .cart-item",
      ".CartItems .CartItem",
      "table tbody tr",
      ".cart-item",
      "[data-cart-item]"
    ],
    title: [
      ".cart-item__name",
      ".product-title",
      "a[href*='/products/']",
      "td:nth-child(2)",
      "[data-title]"
    ],
    qty: [
      ".cart-item__quantity input",
      "input[name*='quantity']",
      "[data-qty]"
    ],
    price: [
      ".cart-item__price",
      ".price",
      "[data-price]",
      "td:nth-child(4)"
    ],
    lineTotal: [
      ".cart-item__total",
      ".line-total",
      "[data-line-total]",
      "td:nth-child(5)"
    ],
    grandTotal: [
      ".totals__total-value",
      ".cart-total",
      "[data-cart-total]",
      "strong"
    ]
  };

  // Helper: first matching element by selector list
  function $(selectors, root) {
    root = root || document;
    for (var i = 0; i < selectors.length; i++) {
      var el = root.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  // Helper: all rows by selector list
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

  function cleanMoney(s) {
    return (s || "").replace(/[^\d.,-]/g, "").trim();
  }

  function getCartId() {
    var params = new URLSearchParams(location.search);
    return params.get("cartId") || "";
  }

  function getCartName() {
    var h1 = document.querySelector("h1");
    return (h1 ? h1.textContent : document.title || "Saved Cart").trim();
  }

  function parseItemsFromDOM() {
    var rows = $all(SELECTORS.itemRows);
    var items = [];

    rows.forEach(function (row) {
      var titleEl = $(SELECTORS.title, row);
      var qtyEl   = $(SELECTORS.qty, row);
      var priceEl = $(SELECTORS.price, row);
      var totalEl = $(SELECTORS.lineTotal, row);

      var title = text(titleEl);
      var qty   = text(qtyEl);
      var price = cleanMoney(text(priceEl));
      var lineTotal = cleanMoney(text(totalEl));

      if (!title || /add to cart|remove/i.test(title)) return;

      // Normalize qty (handles "Qty: 1")
      qty = (qty || "").replace(/[^0-9]/g, "") || qty;

      items.push({
        title: title,
        quantity: qty || "1",
        price: price,
        line_total: lineTotal
      });
    });

    var totalEl = $(SELECTORS.grandTotal);
    var grandTotal = cleanMoney(text(totalEl));

    return { items: items, grandTotal: grandTotal };
  }

  function downloadPDFPrint() {
    var cartName = getCartName();

    var w = window.open("", "_blank", "width=900,height=650");
    if (!w) {
      alert("Popup blocked. Allow popups to export PDF.");
      return;
    }

    var main = document.querySelector("main") || document.body;

    w.document.open();
    w.document.write(
      "<!doctype html><html><head><title>" + cartName + "</title>" +
      "<meta charset='utf-8' />" +
      "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
      "<style>" +
        "body{font-family:Arial, sans-serif; padding:24px;}" +
        "button, .no-print{display:none !important;}" +
        "img{max-width:80px; height:auto;}" +
        "a{color:inherit; text-decoration:none;}" +
        "@media print{ body{padding:0;} }" +
      "</style>" +
      "</head><body>" +
      "<h1 style='margin:0 0 8px;'>" + cartName + "</h1>" +
      "<div style='opacity:.75; margin-bottom:16px; font-size:12px;'>" +
        "Generated: " + new Date().toLocaleString() +
      "</div>" +
      main.innerHTML +
      "</body></html>"
    );
    w.document.close();

    w.focus();
    setTimeout(function () {
      w.print();
    }, 350);
  }

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
      if (it.price) line += " | Unit: " + it.price;
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
      alert("No cart items found to email. (Update selectors in the script.)");
      return;
    }

    // You CAN'T send email from JS without a backend.
    // This opens the user's email client with prefilled content.
    var subject = "Quote - " + getCartName();
    var body = buildEmailBody(data);

    // If you want it to go to a specific email by default, put it here:
    // var to = "orders@yourdomain.com";
    var to = "";

    var mailto =
      "mailto:" + encodeURIComponent(to) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    // Use location.href so it works in more browsers
    location.href = mailto;
  }

  function mountButtons() {
    var mount = $(SELECTORS.buttonMountPoints) || document.body;

    // Avoid duplicates if script runs twice
    if (document.getElementById("exportPdfBtn") || document.getElementById("emailQuoteBtn")) return;

    var wrap = document.createElement("div");
    wrap.className = "no-print";
    wrap.style.cssText =
      "display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin:12px 0;";

    var pdfBtn = document.createElement("button");
    pdfBtn.id = "exportPdfBtn";
    pdfBtn.type = "button";
    pdfBtn.textContent = "Download PDF";
    pdfBtn.style.cssText =
      "padding:10px 14px; border:1px solid #111; background:#111; color:#fff; border-radius:6px; cursor:pointer;";

    var emailBtn = document.createElement("button");
    emailBtn.id = "emailQuoteBtn";
    emailBtn.type = "button";
    emailBtn.textContent = "Email Quote";
    emailBtn.style.cssText =
      "padding:10px 14px; border:1px solid #111; background:#fff; color:#111; border-radius:6px; cursor:pointer;";

    pdfBtn.addEventListener("click", downloadPDFPrint);
    emailBtn.addEventListener("click", sendQuoteEmail);

    wrap.appendChild(pdfBtn);
    wrap.appendChild(emailBtn);

    mount.insertBefore(wrap, mount.firstChild);
  }

  // Wait for content to exist (some apps render after load)
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var rows = $all(SELECTORS.itemRows);
    if (rows.length || tries > 20) {
      clearInterval(timer);
      mountButtons();
    }
  }, 300);
})();
