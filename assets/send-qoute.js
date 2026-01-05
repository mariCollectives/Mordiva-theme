(function () {
  if (!location.pathname.startsWith("/apps/cart-saved-data")) return;

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
      ".cart-item",
      "[data-cart-item]",
      "table tbody tr"
    ],
    title: [
      ".cart-item__name",
      ".product-title",
      "a[href*='/products/']",
      "h3",
      "td:nth-child(2)",
      "[data-title]"
    ],
    qtyInput: [
      ".cart-item__quantity input",
      "input[name*='quantity']",
      "[data-qty]"
    ],
    qtyText: [
      ".cart-item__quantity",
      ".qty",
      "[data-quantity]"
    ],
    price: [
      ".cart-item__price",
      ".price",
      "[data-price]"
    ],
    lineTotal: [
      ".cart-item__total",
      ".line-total",
      "[data-line-total]"
    ],

    // ✅ FIXED: your exact grand total row
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
    raw = raw.replace(/\b[A-Z]{3}\b/g, "").trim(); // strip currency code
    if (raw.indexOf("$") !== -1) return raw.replace(/\s+/g, " ").trim();
    var num = raw.replace(/[^\d.,-]/g, "").trim();
    return num ? ("$" + num) : "";
  }

  function getCartId() {
    var params = new URLSearchParams(location.search);
    return params.get("cartId") || "";
  }

  function getCartName() {
    var h1 = document.querySelector("h1");
    return (h1 ? h1.textContent : document.title || "Saved Cart").trim();
  }

  function extractQty(row) {
    // 1) input
    var qtyInputEl = $(SELECTORS.qtyInput, row);
    var v = text(qtyInputEl);
    if (v) {
      v = v.replace(/[^0-9]/g, "");
      if (v) return v;
    }

    // 2) "Qty: 1" text
    var qtyTextEl = $(SELECTORS.qtyText, row) || row;
    var t = text(qtyTextEl);
    var m = t.match(/Qty\s*:\s*(\d+)/i);
    if (m && m[1]) return m[1];

    return "1";
  }

  function getGrandTotal() {
    // ✅ Pull EXACTLY from the row you showed
    var row = $(SELECTORS.grandTotalRow);
    if (row) {
      var divs = row.querySelectorAll("div");
      if (divs && divs.length >= 2) {
        return moneyKeepDollar(text(divs[1]));
      }
      // fallback: last child
      return moneyKeepDollar(text(row.lastElementChild));
    }
    return "";
  }

  function parseItemsFromDOM() {
    var rows = $all(SELECTORS.itemRows);
    var items = [];

    rows.forEach(function (row) {
      var titleEl = $(SELECTORS.title, row);
      var priceEl = $(SELECTORS.price, row);
      var totalEl = $(SELECTORS.lineTotal, row);

      var title = text(titleEl);
      if (!title) return;
      if (/add to cart|remove|options|share/i.test(title)) return;

      items.push({
        title: title,
        quantity: extractQty(row),
        price: moneyKeepDollar(text(priceEl)),
        line_total: moneyKeepDollar(text(totalEl))
      });
    });

    return { items: items, grandTotal: getGrandTotal() };
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
      alert("No cart items found to email. Update selectors in the script.");
      return;
    }

    var subject = "Quote - " + getCartName();
    var body = buildEmailBody(data);

    // Optional default recipient
    // var to = "orders@yourdomain.com";
    var to = "";

    location.href =
      "mailto:" + encodeURIComponent(to) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  function mountButtons() {
    var mount = $(SELECTORS.buttonMountPoints) || document.body;
    if (document.getElementById("emailQuoteBtn")) return;

    var wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin:12px 0;";

    var emailBtn = document.createElement("button");
    emailBtn.id = "emailQuoteBtn";
    emailBtn.type = "button";
    emailBtn.textContent = "Email Quote";
    emailBtn.style.cssText =
      "padding:10px 14px; border:1px solid #111; background:#111; color:#fff; border-radius:6px; cursor:pointer;";

    emailBtn.addEventListener("click", sendQuoteEmail);

    wrap.appendChild(emailBtn);
    mount.insertBefore(wrap, mount.firstChild);
  }

  // Wait for app content to render
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var hasTotal = !!$(SELECTORS.grandTotalRow);
    var rows = $all(SELECTORS.itemRows);
    if ((rows.length && hasTotal) || tries > 40) {
      clearInterval(timer);
      mountButtons();
    }
  }, 300);
})();