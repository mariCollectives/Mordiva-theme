(function () {
  if (!location.pathname.startsWith("/apps/cart-saved-data")) return;

  var SELECTORS = {
    cartContainer: ".cart-items-container",
    itemRow: ".cart-item",
    title: ".item-title",
    qtyText: ".item-quantity",
    unitPrice: ".item-price",
    lineTotal: ".item-total",
    grandTotalRow: ".cart-summary-row.cart-summary-total",
    actions: ".item-actions",
    addBtn: ".add-item-button"
  };

  function $(sel, root) {
    root = root || document;
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
    var m = (txt || "").match(/Qty\s*:\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
  }
  function extractLineTotal(txt) {
    var m = (txt || "").match(/Total\s*:\s*(.*)$/i);
    return moneyKeepDollar(m ? m[1] : txt);
  }
  function getGrandTotal() {
    var row = $(SELECTORS.grandTotalRow);
    if (!row) return "";
    var divs = row.querySelectorAll("div");
    return divs.length >= 2 ? moneyKeepDollar(text(divs[1])) : "";
  }

  // ----------------- ROOM STORAGE (local only) -----------------
  function storageKey(cartId) {
    return "uncap_room_assignments__" + (cartId || "unknown");
  }
  function readRoomMap(cartId) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(cartId)) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function writeRoomMap(cartId, map) {
    try {
      localStorage.setItem(storageKey(cartId), JSON.stringify(map || {}));
    } catch (e) {}
  }

  // Try to extract the variantId from the existing onclick:
  // onclick="addItemToCart('9464908054825', '49193997074729', 1)"
  function getVariantIdFromOnclick(btn) {
    var oc = btn && btn.getAttribute("onclick");
    if (!oc) return "";
    var m = oc.match(/addItemToCart\(\s*'[^']+'\s*,\s*'([^']+)'/i);
    return m ? m[1] : "";
  }
  function getProductIdFromOnclick(btn) {
    var oc = btn && btn.getAttribute("onclick");
    if (!oc) return "";
    var m = oc.match(/addItemToCart\(\s*'([^']+)'/i);
    return m ? m[1] : "";
  }

  // ----------------- Inject field per item -----------------
  function mountRoomFields() {
    var cartId = getCartId();
    if (!cartId) return;

    var map = readRoomMap(cartId);

    $all(SELECTORS.itemRow).forEach(function (row) {
      if (row.querySelector("[data-room-field]")) return;

      var addBtn = $(SELECTORS.addBtn, row);
      if (!addBtn) return;

      var variantId = getVariantIdFromOnclick(addBtn);
      var productId = getProductIdFromOnclick(addBtn);
      var key = variantId || productId || text($(SELECTORS.title, row)) || ("row_" + Math.random());

      var wrap = document.createElement("div");
      wrap.setAttribute("data-room-field", "1");
      wrap.style.cssText = "margin-top:10px; display:flex; flex-direction:column; gap:6px; max-width:320px;";

      wrap.innerHTML =
        '<label style="font-size:12px;opacity:.8">Assign to Room</label>' +
        '<input type="text" class="room-input" placeholder="e.g. Toddler Room / Blue set" ' +
        'style="padding:10px 12px;border:1px solid #ddd;border-radius:8px" />' +
        '<div class="room-saved" style="font-size:12px;opacity:.7;display:none">Saved</div>';

      // Place it inside item-details if possible, otherwise under actions
      var target = row.querySelector(".item-details") || row.querySelector(".item-pricing") || row;
      target.appendChild(wrap);

      var input = wrap.querySelector(".room-input");
      var saved = wrap.querySelector(".room-saved");

      input.value = map[key] || "";

      var save = function () {
        var map2 = readRoomMap(cartId);
        map2[key] = input.value.trim();
        writeRoomMap(cartId, map2);
        saved.style.display = "block";
        clearTimeout(saved._t);
        saved._t = setTimeout(function(){ saved.style.display="none"; }, 900);
      };

      input.addEventListener("change", save);
      input.addEventListener("blur", save);

      // Intercept Add-to-Cart so it includes properties[Assign to Room]
      addBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        var qty = extractQty(text($(SELECTORS.qtyText, row)));
        var roomVal = (input.value || "").trim();

        // If no variantId, fall back to original behavior
        if (!variantId) {
          // Let original onclick run
          addBtn.removeAttribute("onclick");
          addBtn.click();
          return;
        }

        // Add to Shopify cart with line item properties
        fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            items: [{
              id: parseInt(variantId, 10),
              quantity: qty,
              properties: roomVal ? { "Assign to Room": roomVal } : {}
            }]
          })
        })
        .then(function (r) {
          if (!r.ok) throw new Error("Add to cart failed");
          return r.json();
        })
        .then(function () {
          // Optional: go to cart so they see it immediately
          // location.href = "/cart";
          addBtn.textContent = "Added";
          setTimeout(function(){ addBtn.textContent = "Add to Cart"; }, 1000);
        })
        .catch(function () {
          alert("Could not add to cart. Please try again.");
        });
      }, true);
    });
  }

  // ----------------- Extend your PDF/EMAIL parse to include room -----------------
  function getRoomForRow(row) {
    var cartId = getCartId();
    var map = readRoomMap(cartId);
    var addBtn = row.querySelector(SELECTORS.addBtn);
    var variantId = getVariantIdFromOnclick(addBtn);
    var productId = getProductIdFromOnclick(addBtn);
    var key = variantId || productId || text($(SELECTORS.title, row)) || "";
    return map[key] || "";
  }

  function parseItemsWithRoom() {
    var items = [];
    $all(SELECTORS.itemRow).forEach(function (row) {
      items.push({
        title: text($(SELECTORS.title, row)),
        room: getRoomForRow(row),
        quantity: String(extractQty(text($(SELECTORS.qtyText, row)))),
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
        <td>
          ${escapeHtml(i.title)}
          ${i.room ? `<div style="font-size:12px;opacity:.75;margin-top:4px">Room: ${escapeHtml(i.room)}</div>` : ``}
        </td>
        <td style="text-align:center">${escapeHtml(i.quantity)}</td>
        <td style="text-align:right">${escapeHtml(i.unit)}</td>
        <td style="text-align:right">${escapeHtml(i.line_total)}</td>
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
th,td{border-bottom:1px solid #ddd;padding:8px;font-size:13px;vertical-align:top}
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
<div class="total"><span>Total</span><span>${escapeHtml(data.grandTotal)}</span></div>
</body>
</html>`;
  }

  function printPDF() {
    var data = parseItemsWithRoom();
    if (!data.items.length) return alert("No items found");

    var w = window.open("", "_blank");
    w.document.write(buildPrintHtml(data));
    w.document.close();
    setTimeout(function(){ w.print(); }, 400);
  }

  // ---------- EMAIL ----------
  function sendEmail() {
    var data = parseItemsWithRoom();
    var body =
      `Quote: ${getCartName()}\n\n` +
      data.items.map(function(i){
        return `- ${i.title}` +
          (i.room ? ` (Room: ${i.room})` : ``) +
          ` | Qty: ${i.quantity} | Unit: ${i.unit} | Line: ${i.line_total}`;
      }).join("\n") +
      `\n\nGrand Total: ${data.grandTotal}`;

    location.href =
      "mailto:?subject=" + encodeURIComponent("Quote - " + getCartName()) +
      "&body=" + encodeURIComponent(body);
  }

  // ---------- UI (your existing buttons) ----------
  function mountButtons() {
    var container = $(SELECTORS.cartContainer);
    if (!container || document.getElementById("quoteActions")) return;

    var wrap = document.createElement("div");
    wrap.id = "quoteActions";
    wrap.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px";

    wrap.innerHTML = `
      <button id="printQuoteBtn" style="padding:10px 14px;background:#111;color:#fff;border:0;border-radius:6px">Print / Save PDF</button>
      <button id="emailQuoteBtn" style="padding:10px 14px;background:#fff;color:#111;border:1px solid #111;border-radius:6px">Email Quote</button>
    `;

    container.parentNode.insertBefore(wrap, container);
    document.getElementById("printQuoteBtn").onclick = printPDF;
    document.getElementById("emailQuoteBtn").onclick = sendEmail;
  }

  // ---------- Wait until page has items ----------
  var t = setInterval(function () {
    if ($(SELECTORS.cartContainer) && $all(SELECTORS.itemRow).length) {
      clearInterval(t);
      mountButtons();
      mountRoomFields();
    }
  }, 300);
})();
