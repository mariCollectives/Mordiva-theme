(function () {
  var path = location.pathname.replace(/\/+$/, "");
  var isCartPage = path === "/cart";
  if (!isCartPage) return;

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
    if (!raw) return "";
    if (raw.includes("$")) return raw;
    var n = raw.replace(/[^\d.,-]/g, "");
    return n ? "$" + n : "";
  }

  function moneyToNumber(raw) {
    var s = (raw || "").replace(/\b[A-Z]{3}\b/g, "").replace(/[^0-9.,-]/g, "").trim();
    if (!s) return NaN;
    // handle "1,234.56" vs "1234,56" loosely
    // If both comma and dot exist, assume comma is thousand sep
    if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) s = s.replace(/,/g, "");
    // If only comma exists, treat it as decimal separator
    else if (s.indexOf(",") !== -1 && s.indexOf(".") === -1) s = s.replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  function fmtMoney2(rawOrNumber) {
    var n = typeof rawOrNumber === "number" ? rawOrNumber : moneyToNumber(rawOrNumber);
    if (isNaN(n)) return moneyKeepDollar(String(rawOrNumber || "")) || "";
    return "$" + n.toFixed(2);
  }

  function fmtQty2(q) {
    var n = parseFloat(String(q || "0").replace(/[^\d.-]/g, ""));
    if (isNaN(n)) return "0.00";
    return n.toFixed(2);
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
        if (dt.nextElementSibling && dt.nextElementSibling.tagName === "DD") dd = dt.nextElementSibling;
        else {
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

    var propInput =
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
      document.querySelector('textarea#CartNote') ||
      document.querySelector('textarea.cart__note') ||
      document.querySelector('[name="note"]');

    var displayed =
      text(document.querySelector("[data-order-note]")) ||
      text(document.querySelector(".order-note")) ||
      text(document.querySelector(".cart-note"));

    return (val(noteEl) || displayed || "").trim();
  }

  // ---- Price extraction: regular vs discounted (per unit) ----
  function getUnitPricesFromRow(row) {
    // Try common Shopify/Dawn patterns first
    var regularEl =
      row.querySelector(".price__regular .price-item--regular") ||
      row.querySelector(".price__regular .price-item") ||
      row.querySelector(".price-item--regular");

    var saleEl =
      row.querySelector(".price__sale .price-item--sale") ||
      row.querySelector(".price__sale .price-item") ||
      row.querySelector(".price-item--sale") ||
      row.querySelector(".price-item--final");

    // Fallback: whatever price text is visible
    var anyPriceEl =
      row.querySelector(".cart-item__price .price") ||
      row.querySelector(".cart-item__prices .price") ||
      row.querySelector(".price");

    var regularTxt = moneyKeepDollar(text(regularEl));
    var saleTxt = moneyKeepDollar(text(saleEl));

    // If theme only shows one price, treat it as both
    if (!regularTxt && anyPriceEl) regularTxt = moneyKeepDollar(text(anyPriceEl));
    if (!saleTxt) saleTxt = regularTxt;

    // If both exist but regular missing $ formatting
    regularTxt = regularTxt || "";
    saleTxt = saleTxt || regularTxt;

    return { regular: regularTxt, discounted: saleTxt };
  }

  function parseFromCartPage() {
    var items = [];

    $all("tr.cart-item").forEach(function (row) {
      var titleEl = row.querySelector(".cart-item__title");
      var qtyEl = row.querySelector("input.quantity__input");

      // line total (usually discounted already)
      var lineEl = row.querySelector(".cart-item__total, td.cart-item__total span");

      // SKU
      var skuEl = row.querySelector(".cart-item__sku");
      var sku = skuEl ? (skuEl.getAttribute("data-sku") || text(skuEl)) : "";

      // Image
      var imgEl = row.querySelector(".cart-item__media img");
      var img = imgEl ? (imgEl.getAttribute("src") || "") : "";
      if (img && img.indexOf("//") === 0) img = "https:" + img;

      var qtyRaw = qtyEl ? String(qtyEl.value || qtyEl.getAttribute("value") || "1") : "1";

      // Unit prices
      var unitPrices = getUnitPricesFromRow(row);

      items.push({
        sku: sku,
        image: img,
        title: text(titleEl),
        room_note: findRoomValueInCartRow(row),
        quantity: qtyRaw,
        unit_regular: unitPrices.regular,      // Unit Price
        unit_discounted: unitPrices.discounted, // Disc Unit Pri
        line_total: moneyKeepDollar(text(lineEl))
      });
    });

    var grandTotal = moneyKeepDollar(text(document.querySelector(".totals__subtotal-value")));
    return { items: items, grandTotal: grandTotal };
  }

  function parseItems() {
    return parseFromCartPage();
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

    var logoUrl = "https://cdn.shopify.com/s/files/1/0845/4868/2025/files/CollectivePlay_Logo_Tagline_Green_5a0f9f08-4f68-42b7-bb5a-d1195ceceadb.png";

    var customerName =
      text(document.querySelector(".AddressInfo .customer-name")) ||
      text(document.querySelector(".customer-name")) ||
      text(document.querySelector("[data-customer-name]")) ||
      "Customer";

    var deliverTo =
      text(document.querySelector(".AddressInfo .customer-name")) ||
      text(document.querySelector(".delivery-name")) ||
      text(document.querySelector("[data-deliver-to]")) ||
      customerName;

    var deliverAddr1 =
      text(document.querySelector(".AddressInfo .ShippingAddress")) ||
      text(document.querySelector(".ShippingAddress")) ||
      text(document.querySelector("[data-delivery-address-line1]")) ||
      "";

    var a2 = text(document.querySelector(".AddressInfo .address2")) || text(document.querySelector(".address2"));
    var country = text(document.querySelector(".AddressInfo .defaultDeliveryCity")) || text(document.querySelector(".defaultDeliveryCity"));

    var deliverAddr2 =
      [a2, country].filter(Boolean).join(", ") ||
      text(document.querySelector("[data-delivery-address-line2]")) ||
      "";

    var customerType =
      text(document.querySelector(".AddressInfo .customerTypeValue")) ||
      text(document.querySelector(".customerTypeValue")) ||
      text(document.querySelector("[data-customer-type]")) ||
      "";

    var deliveryInstructions =
      getOrderNote() ||
      text(document.querySelector("[data-delivery-instructions]")) ||
      "";

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

    var rows = data.items
      .map(function (i, idx) {
        var desc = escapeHtml(i.title || "");

        var room = escapeHtml(i.room_note || "");
        var roomHtml = room ? ("<div class='subline'><b>Room / Note:</b> " + room + "</div>") : "";

        var sku = escapeHtml(i.sku || "—");

        var imgHtml = i.image
          ? ("<img class='thumb' src='" + escapeHtml(i.image) + "'/>")
          : "";

        var qty = fmtQty2(i.quantity);

        // Unit Price (regular) and Disc Unit Pri (discounted)
        var unitRegular = i.unit_regular ? fmtMoney2(i.unit_regular) : "";
        var unitDisc = i.unit_discounted ? fmtMoney2(i.unit_discounted) : unitRegular;

        // If identical, still display both columns like your screenshot
        var lineTotal = i.line_total ? fmtMoney2(i.line_total) : "";

        return (
          "<tr>" +
            "<td class='c-ln'>" + (idx + 1) + "</td>" +
            "<td class='c-code'>" + sku + "</td>" +
            "<td class='c-desc'>" + desc + roomHtml + "</td>" +
            "<td class='c-img'>" + imgHtml + "</td>" +
            "<td class='c-qty'>" + qty + "</td>" +
            "<td class='c-money'>" + escapeHtml(unitRegular) + "</td>" +
            "<td class='c-money'>" + escapeHtml(unitDisc) + "</td>" +
            "<td class='c-money'>" + escapeHtml(lineTotal) + "</td>" +
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

  .top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 2mm; }
  .logo { width: 260px; height: 90px; display:flex; align-items:center; }
  .logo img { max-width:100%; max-height:100%; object-fit:contain; }
  .docbox { text-align:right; }
  .docbox .title { font-size:22px; letter-spacing:.08em; font-weight:600; }
  .docbox .ref { font-weight:800; font-size:13px; margin-top:2px; }
  .docbox .meta { margin-top:6px; font-size:10.5px; line-height:1.5; color:#333; }

  .panel { margin-top: 2mm; }
  .panel-inner {
    background:#efefef;
    padding:10px 12px;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:8px 16px;
    font-size:11px;
  }
  .field { display:grid; grid-template-columns:150px 1fr; gap:8px; align-items:baseline; }
  .label { font-weight:700; text-align:right; color:#222; }
  .value { font-weight:500; color:#111; white-space: pre-wrap; }

  /* ====== TABLE LIKE YOUR SCREENSHOT ====== */
  table {
    width:100%;
    border-collapse:collapse;
    margin-top: 8mm;
    font-size:11px;
    table-layout: fixed;
  }
  thead th {
    font-weight:700;
    color:#111;
    padding:6px 6px;
    background: #f3f3f3;
    text-transform:none;
    letter-spacing:0;
     border-bottom: 1px solid #777;
  }
  tbody td {
    padding:3px 3px;
    border-bottom: 1px solid #777;
    vertical-align: top;
  }


  .c-ln { width: 34px; text-align:left; }
  .c-code { width: 92px; text-align:left; }
  .c-desc { width: auto; text-align:left; }
  .c-img { width: 54px; text-align:center; vertical-align: middle; }
  .c-qty { width: 62px; text-align:right; white-space:nowrap; }
  .c-money { width: 86px; text-align:right; white-space:nowrap; }

  .thumb {
    width: 32px;
    height: 32px;
    object-fit: contain;
    display: inline-block;
  }

  .subline { margin-top:3px; color:#444; font-size:10px; line-height:1.2; }

  .totals { margin-top:6mm; display:flex; justify-content:flex-end; }
  .totals-box { min-width:240px; font-size:12px; }
  .totals-row { display:flex; justify-content:space-between; padding:4px 0; }
  .totals-row.total { font-weight:800; border-top: 1px solid #111; padding-top:6px; }

  .footer { margin-top:12mm; padding-top:6mm; border-top:1px solid #e6e6e6; display:flex; justify-content:space-between; font-size:10px; color:#444; }
  .pagenum::after { content:"Page " counter(page) " of " counter(pages); }

  @media print {
    @page { size:A4; margin:0; }
    body { margin:0; }
    .page { page-break-after:always; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div class="logo">
        ${
          logoUrl
            ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(shopName)}">`
            : `<div style="font-weight:800;font-size:34px;line-height:1;">collective<br>play</div>`
        }
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
          <th class="c-ln">Ln</th>
          <th class="c-code">Product Code</th>
          <th class="c-desc">Product Description</th>
          <th class="c-img">Image</th>
          <th class="c-qty">Qty</th>
          <th class="c-money">Unit Price</th>
          <th class="c-money">Disc Unit Pri</th>
          <th class="c-money">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row total">
          <span>Total</span>
          <span>${escapeHtml(fmtMoney2(data.grandTotal || ""))}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <div>
        <div>www.collectiveplay.com.au</div>
        <div>Suite 2.13 - 21 Crombie Avenue Bundall, QLD 4217</div>
        <div>ABN: 52 653 111 472</div>
        <div>Private and Confidential &nbsp; hello@collectiveplay.com.au</div>
      </div>
      <div class="pagenum"></div>
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

  // ---------------- Inject button ----------------
  function ensurePrintButton() {
    var btn = document.getElementById("printCartPdfButton") || document.getElementById("printQuoteBtn");
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
    var btn = document.getElementById("printCartPdfButton") || document.getElementById("printQuoteBtn");
    if (btn && btn.dataset.printBound === "1") {
      clearInterval(stopCheck);
      try { mo.disconnect(); } catch (e) {}
    }
  }, 300);
})();
