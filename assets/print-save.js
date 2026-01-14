(function () {
  var path = location.pathname.replace(/\/+$/, "");
  var isCartPage = path === "/cart";
  if (!isCartPage) return;

  // ---------------- Helpers ----------------
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function text(el) {
    return el ? (el.textContent || "").trim() : "";
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

  // Convert //cdn... to https://cdn...
  function normalizeImgUrl(url) {
    url = (url || "").trim();
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    return url;
  }

  function getCartId() {
    return new URLSearchParams(location.search).get("cartId") || "";
  }

  function getTitle() {
    var h1 = document.querySelector("h1");
    return h1 ? h1.textContent.trim() : "Cart";
  }

  // ---- NEW: read shipping address written by Liquid into DOM ----
  function getShippingAddressFromDom() {
    var el = document.getElementById("cp-shipping-address");
    if (!el) return null;

    function d(name) {
      return (el.getAttribute("data-" + name) || "").trim();
    }

    var addr2 = d("address2");
    return {
      name: d("name"),
      address1: d("address1"),
      address2: addr2,
      city: d("city"),
      province: d("province"),
      zip: d("zip"),
      country: d("country")
    };
  }

  function findRoomNoteFromDtDd(row) {
    var dts = row.querySelectorAll("dt");
    for (var i = 0; i < dts.length; i++) {
      var dt = dts[i];
      var dtText = (dt.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (dtText.indexOf("room") !== -1 && dtText.indexOf("note") !== -1) {
        var dd = null;
        if (dt.nextElementSibling && dt.nextElementSibling.tagName === "DD") {
          dd = dt.nextElementSibling;
        } else {
          var parent = dt.parentElement;
          if (parent) dd = parent.querySelector("dd");
        }
        var value = text(dd);
        if (value) return value;
      }
    }
    return "";
  }

  function findRoomValueInCartRow(row) {
    var fromDtDd = findRoomNoteFromDtDd(row);
    if (fromDtDd) return fromDtDd;

    // Your custom input (Assign to Room)
    var propInput =
      row.querySelector(".line-prop-input") ||
      row.querySelector('[name^="properties["][name*="Assign to Room"]') ||
      row.querySelector('[name^="properties["][name*="Room"]') ||
      row.querySelector('[name^="properties["][name*="Note"]');

    if (propInput) return val(propInput);

    var anyInput = row.querySelector("input, textarea, select");
    return val(anyInput);
  }

  function getOrderNote() {
    var noteEl =
      document.querySelector('textarea[name="note"]') ||
      document.querySelector("textarea#CartNote") ||
      document.querySelector("textarea.cart__note") ||
      document.querySelector('[name="note"]');

    var displayed =
      text(document.querySelector("[data-order-note]")) ||
      text(document.querySelector(".order-note")) ||
      text(document.querySelector(".cart-note"));

    return (val(noteEl) || displayed || "").trim();
  }

  // ---------------- Money formatting (from cart.js cents) ----------------
  function currencySymbol(code) {
    // Add more if you need
    if (code === "PHP") return "₱";
    if (code === "AUD") return "$";
    if (code === "USD") return "$";
    return code ? code + " " : "$";
  }

  function formatCents(cents, currencyCode) {
    if (cents == null || cents === "") return "";
    var n = Number(cents);
    if (isNaN(n)) return "";
    var sym = currencySymbol(currencyCode);
    var amt = (n / 100).toFixed(2);
    // match your theme style: ₱100.00 PHP
    return sym + amt + (currencyCode ? " " + currencyCode : "");
  }

  // ---------------- Pull SKU + accurate prices from /cart.js ----------------
  async function fetchCartJs() {
    var res = await fetch("/cart.js", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load /cart.js");
    return await res.json();
  }

  // ---------------- Parse DOM (for room note + image + qty fallback) ----------------
  function parseDomCartRows() {
    var domItems = [];

    $all("tr.cart-item").forEach(function (row) {
      // Variant id is in your quantity input: data-quantity-variant-id="4828..."
      var qtyEl = row.querySelector("input.quantity__input");
      var variantId = qtyEl ? (qtyEl.getAttribute("data-quantity-variant-id") || "") : "";

      var titleEl = row.querySelector(".cart-item__title");
      var imgEl = row.querySelector(".cart-item__media img");
      var unitEl = row.querySelector(".cart-item__price .price, .cart-item__prices .price");
      var lineEl = row.querySelector(".cart-item__total, td.cart-item__total span");

      domItems.push({
        variant_id: variantId ? Number(variantId) : null,
        title: text(titleEl),
        room_note: findRoomValueInCartRow(row),
        quantity: qtyEl ? String(qtyEl.value || qtyEl.getAttribute("value") || "1") : "1",
        image: normalizeImgUrl(imgEl ? (imgEl.getAttribute("src") || "") : ""),
        unit_dom: text(unitEl),
        line_total_dom: text(lineEl)
      });
    });

    return domItems;
  }

  // Merge /cart.js with DOM info (room note + image)
  async function parseItems() {
    var domItems = parseDomCartRows();
    var cart = await fetchCartJs();

    // index cart items by variant_id
    var byVariant = {};
    (cart.items || []).forEach(function (it) {
      byVariant[it.variant_id] = it;
    });

    var items = domItems.map(function (d) {
      var it = d.variant_id ? byVariant[d.variant_id] : null;

      var sku = it && it.sku ? it.sku : ""; // Product Code
      var qty = Number(d.quantity || (it ? it.quantity : 1) || 1);

      // Unit (original) vs discounted
      var unitOriginal = it ? formatCents(it.price, cart.currency) : "";
      var unitDiscount = it ? formatCents(it.final_price, cart.currency) : "";

      // Total (final line)
      var lineTotal = it ? formatCents(it.final_line_price, cart.currency) : "";

      // Image: prefer DOM image first (matches your featured image), fallback to cart.js featured_image.url if present
      var img = d.image;
      if (!img && it && it.featured_image && it.featured_image.url) img = normalizeImgUrl(it.featured_image.url);

      return {
        sku: sku,
        title: d.title || (it ? it.product_title : ""),
        room_note: d.room_note || "",
        image: img || "",
        quantity: String(qty),
        unit: unitOriginal || "",
        disc_unit: unitDiscount || "", // Disc Pri
        line_total: lineTotal || ""
      };
    });

    var grandTotal = formatCents(cart.total_price, cart.currency);

    return { items: items, grandTotal: grandTotal };
  }

  // ---------------- Print HTML ----------------
  function buildPrintHtml(data) {
    var now = new Date();
    var quoteDate = now.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
    var expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    var expiryDate = expiry.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });

    var shopName = (window.Shopify && Shopify.shop) ? Shopify.shop : location.hostname;
    var cartId = getCartId();
    var refSeed = (cartId || String(Date.now()));
    var quoteRef = "SQ-" + refSeed.toString().slice(-8).padStart(8, "0");

    var logoUrl =
      "https://cdn.shopify.com/s/files/1/0845/4868/2025/files/CollectivePlay_Logo_Tagline_Green_5a0f9f08-4f68-42b7-bb5a-d1195ceceadb.png";

    // Existing fallbacks (UPDATED: pull from .AddressInfo first)
    var customerName =
      text(document.querySelector(".AddressInfo .customer-name")) ||
      text(document.querySelector(".customer-name")) ||
      text(document.querySelector("[data-customer-name]")) ||
      "Customer";

    var deliverTo =
      text(document.querySelector(".AddressInfo .customer-name")) || // <- deliver to = shipping name
      text(document.querySelector(".delivery-name")) ||
      text(document.querySelector("[data-deliver-to]")) ||
      customerName;

    var deliverAddr1 =
      text(document.querySelector(".AddressInfo .ShippingAddress")) ||
      text(document.querySelector(".ShippingAddress")) ||
      text(document.querySelector("[data-delivery-address-line1]")) ||
      "";

    // line2 = ".address2" + country (".defaultDeliveryCity")
    var a2 = text(document.querySelector(".AddressInfo .address2")) || text(document.querySelector(".address2"));
    var country = text(document.querySelector(".AddressInfo .defaultDeliveryCity")) || text(document.querySelector(".defaultDeliveryCity"));

    var deliverAddr2 =
      [a2, country].filter(Boolean).join(", ") ||
      text(document.querySelector("[data-delivery-address-line2]")) ||
      "";

    // Customer Type
    var customerType =
      text(document.querySelector(".AddressInfo .customerTypeValue")) ||
      text(document.querySelector(".customerTypeValue")) ||
      text(document.querySelector("[data-customer-type]")) ||
      "";

    var deliveryInstructions =
      getOrderNote() ||
      text(document.querySelector("[data-delivery-instructions]")) ||
      "";

    // Override with Shopify customer default address (Liquid -> DOM) if available
    var ship = getShippingAddressFromDom();
    if (ship) {
      deliverTo = ship.name || deliverTo;
      deliverAddr1 = ship.address1 || deliverAddr1;

      var line2Parts = [];
      if (ship.address2) line2Parts.push(ship.address2);
      var cityLine = [ship.city, ship.province, ship.zip].filter(Boolean).join(" ");
      if (cityLine) line2Parts.push(cityLine);
      if (ship.country) line2Parts.push(ship.country);

      deliverAddr2 = line2Parts.join(", ") || deliverAddr2;
      customerName = ship.name || customerName;
    }

    var rows = (data.items || [])
      .map(function (i, idx) {
        var desc = escapeHtml(i.title || "");
        var room = escapeHtml(i.room_note || "");
        var roomHtml = room ? ("<div class='subline'><strong>Room / Note:</strong> " + room + "</div>") : "";

        var sku = escapeHtml(i.sku || "—");

        var imgHtml = i.image
          ? ("<img class='thumb' src='" + escapeHtml(i.image) + "' alt='' />")
          : "—";

        return (
          "<tr>" +
            "<td class='ln'>" + (idx + 1) + "</td>" +
            "<td class='code'>" + sku + "</td>" +
            "<td class='desc'>" + desc + roomHtml + "</td>" +
            "<td class='imgcell'>" + imgHtml + "</td>" +
            "<td class='qty'>" + escapeHtml(i.quantity) + "</td>" +
            "<td class='money'>" + escapeHtml(i.unit) + "</td>" +
            "<td class='money'>" + escapeHtml(i.disc_unit || i.unit || "") + "</td>" +
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
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    margin: 0;
    color: #111;
    background: #fff;
  }
  .page { padding: 18mm 14mm 16mm; }
  .top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:0; }
  .brand { display:flex; align-items:flex-start; gap:12px; }
  .logo { width:265px; height:160px; display:flex; align-items:center; margin-top:-1em; }
  .logo img { max-width:100%; max-height:100%; object-fit:contain; }
  .docbox { padding:10px 12px; min-width:230px; text-align:right; }
  .docbox .title { font-size:23px; letter-spacing:.08em; font-weight:500; }
  .docbox .ref { font-weight:800; font-size:14px; margin-top:2px; }
  .docbox .meta { margin-top:6px; font-size:11px; line-height:1.5; color:#333; }
  .docbox .meta b { color:#111; font-weight:700; }

  .panel { border-top: 6px solid #efefef; margin-top: -27px; }
  .panel-inner { background:#efefef; padding:10px 12px; display:grid; grid-template-columns:1fr 1fr; gap:10px 18px; font-size:11px; color:#222; }
  .field { display:grid; grid-template-columns:150px 1fr; gap:8px; align-items:baseline; }
  .label { color:#333; font-weight:600; text-align:right; }
  .value { color:#111; font-weight:500; white-space: pre-wrap; }

  table { width:100%; border-collapse:collapse; margin-top:10mm; font-size:11px; }
  thead th { text-transform:uppercase; font-size:10px; letter-spacing:.08em; color:#333; border-bottom:1px solid #333; padding:6px 6px; }
  tbody td { border-bottom:1px solid #d9d9d9; padding:6px 6px; vertical-align:top; }

  .ln { width:36px; text-align:left; }
  .code { width:120px; text-align:left; }
  .imgcell { width:70px; }
  .qty { width:60px; text-align:right; white-space:nowrap; }
  .money { width:110px; text-align:right; white-space:nowrap; }

  .thumb { width:48px; height:48px; object-fit:cover; border-radius:6px; border:1px solid #e5e5e5; display:block; }

  .subline { margin-top:3px; color:#444; font-size:10px; line-height:1.3; }

  .totals { margin-top:8mm; display:flex; justify-content:flex-end; }
  .totals-box { min-width:260px; border-top:1px solid #333; padding-top:6px; font-size:12px; }
  .totals-row { display:flex; justify-content:space-between; padding:4px 0; }
  .totals-row.total { font-weight:800; }

  .footer { margin-top:14mm; padding-top:8mm; border-top:1px solid #e6e6e6; display:grid; grid-template-columns:1fr auto; gap:10px; font-size:10px; color:#444; align-items:end; }
  .footer .lines { line-height:1.4; }
  .footer .right { text-align:right; }

  @media print {
    @page { size:A4; margin:0; }
    body { margin:0; }
    .page { page-break-after:always; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; }
    .pagenum::after { content:"Page " counter(page) " of " counter(pages); }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div class="brand">
        <div class="logo">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(shopName)}">`
              : `<div style="font-weight:800;font-size:34px;line-height:1;">collective<br>play</div>`
          }
        </div>
      </div>
      <div class="docbox">
        <div class="title">SALES QUOTE</div>
        <div class="ref">${escapeHtml(quoteRef)}</div>
        <div class="meta">
          <div><b>Quote Date:</b> ${escapeHtml(quoteDate)}</div>
          <div><b>Quote Expiry Date:</b> ${escapeHtml(expiryDate)}</div>
          ${cartId ? `<div><b>Cart ID:</b> ${escapeHtml(cartId)}</div>` : ``}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-inner">
        <div class="field"><div class="label">Shipping Name:</div><div class="value">${escapeHtml(deliverTo)}</div></div>
        <div class="field"><div class="label">Customer Name:</div><div class="value">${escapeHtml(customerName)}</div></div>

        <div class="field"><div class="label">Shipping Address:</div><div class="value">${escapeHtml(deliverAddr1)}</div></div>
        <div class="field"><div class="label">City/State/ZIP, Country:</div><div class="value">${escapeHtml(deliverAddr2)}</div></div>

        <div class="field"><div class="label">Customer Type:</div><div class="value">${escapeHtml(customerType || "—")}</div></div>
        <div class="field"><div class="label">Delivery Method:</div><div class="value">—</div></div>

        <div class="field">
          <div class="label">Delivery Instructions:</div>
          <div class="value">${escapeHtml(deliveryInstructions || "—")}</div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align:left">Ln</th>
          <th style="text-align:left">Product Code</th>
          <th style="text-align:left">Product Description</th>
          <th style="text-align:left">Image</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Disc Pri</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row total">
          <span>Total</span>
          <span>${escapeHtml(data.grandTotal || "")}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="lines">
        <div>www.collectiveplay.com.au</div>
        <div>Suite 2.13 - 21 Crombie Avenue Bundall, QLD 4217</div>
        <div>ABN: 52 653 111 472</div>
        <div>Private and Confidential &nbsp; hello@collectiveplay.com.au</div>
      </div>
      <div class="right"><div class="pagenum"></div></div>
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

  async function printPDF() {
    try {
      var data = await parseItems();
      if (!data.items.length) return alert("No items found");
      openPrintWindow(buildPrintHtml(data));
    } catch (err) {
      console.error(err);
      alert("Could not generate PDF (failed to read cart data).");
    }
  }

  // ---------------- Inject button ----------------
  function ensurePrintButton() {
    var btn = document.getElementById("printCartPdfButton");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "printCartPdfButton";
    btn.className = "button button--secondary";
    btn.textContent = "Print / Save PDF";

    var h1 = document.querySelector("h1");
    if (h1 && h1.parentNode) {
      var wrap = document.createElement("div");
      wrap.style.margin = "12px 0 18px";
      wrap.style.display = "flex";
      wrap.style.gap = "10px";
      wrap.appendChild(btn);
      h1.parentNode.insertBefore(wrap, h1.nextSibling);
      return btn;
    }

    var container =
      document.querySelector(".cart-items-container") ||
      document.querySelector(".cart-items") ||
      document.querySelector("main");

    if (container && container.parentNode) {
      container.parentNode.insertBefore(btn, container);
      btn.style.margin = "12px 0 18px";
      return btn;
    }

    document.body.insertBefore(btn, document.body.firstChild);
    btn.style.margin = "12px";
    return btn;
  }

  function bind() {
    var btn = ensurePrintButton();
    if (!btn) return;

    if (btn.dataset.printBound === "1") return;
    btn.dataset.printBound = "1";

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      printPDF();
    });
  }

  bind();

  var mo = new MutationObserver(function () {
    bind();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  var stopCheck = setInterval(function () {
    var btn = document.getElementById("printCartPdfButton");
    if (btn && btn.dataset.printBound === "1") {
      clearInterval(stopCheck);
      try { mo.disconnect(); } catch (e) {}
    }
  }, 300);
})();
