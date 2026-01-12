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
    addBtn: ".add-item-button",
    image: ".item-image",
    variant: ".item-variant",
    meta: ".item-meta"
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
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  // onclick="addItemToCart('productId','variantId',qty)"
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
      var key =
        variantId ||
        productId ||
        text($(SELECTORS.title, row)) ||
        ("row_" + Math.random());

      var wrap = document.createElement("div");
      wrap.setAttribute("data-room-field", "1");
      wrap.style.cssText =
        "margin-top:10px;display:flex;flex-direction:column;gap:6px;max-width:320px;";

      wrap.innerHTML =
        '<label style="font-size:12px;opacity:.8">Assign to Room</label>' +
        '<input type="text" class="room-input" placeholder="e.g. Toddler Room / Blue set" ' +
        'style="padding:10px 12px;border:1px solid #ddd;border-radius:8px" />' +
        '<div class="room-saved" style="font-size:12px;opacity:.7;display:none">Saved</div>';

      var target =
        row.querySelector(".item-details") ||
        row.querySelector(".item-pricing") ||
        row;

      target.appendChild(wrap);

      var input = wrap.querySelector(".room-input");
      var saved = wrap.querySelector(".room-saved");

      input.value = map[key] || "";

      function save() {
        var map2 = readRoomMap(cartId);
        map2[key] = input.value.trim();
        writeRoomMap(cartId, map2);
        saved.style.display = "block";
        clearTimeout(saved._t);
        saved._t = setTimeout(function () {
          saved.style.display = "none";
        }, 900);
      }

      input.addEventListener("change", save);
      input.addEventListener("blur", save);

      // Intercept Add-to-Cart so it includes properties[Assign to Room]
      addBtn.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();

          var qty = extractQty(text($(SELECTORS.qtyText, row)));
          var roomVal = (input.value || "").trim();

          // If we can't find a variantId, fall back to original behavior
          if (!variantId) {
            // run original onclick by triggering it after removing our handler
            var oc = addBtn.getAttribute("onclick");
            if (oc) {
              try {
                // eslint-disable-next-line no-new-func
                new Function(oc).call(addBtn);
              } catch (err) {}
            }
            // still reload so your UX is consistent
            setTimeout(function () {
              location.reload();
            }, 350);
            return;
          }

          fetch("/cart/add.js", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            body: JSON.stringify({
              items: [
                {
                  id: parseInt(variantId, 10),
                  quantity: qty,
                  properties: roomVal ? { "Assign to Room": roomVal } : {}
                }
              ]
            })
          })
            .then(function (r) {
              if (!r.ok) throw new Error("Add to cart failed");
              return r.json();
            })
            .then(function () {
              // Force reload after add
              setTimeout(function () {
                location.reload();
              }, 250);
            })
            .catch(function () {
              alert("Could not add to cart. Please try again.");
            });
        },
        true
      );
    });
  }

  // ----------------- Extend PDF parse to include room -----------------
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
      var img = row.querySelector(SELECTORS.image);
      var variantEl = row.querySelector(SELECTORS.variant);

      // item-meta contains "SKU: ..." and "Vendor: ..."
      var sku = "";
      var vendor = "";
      var metaWrap = row.querySelector(SELECTORS.meta);
      if (metaWrap) {
        var spans = metaWrap.querySelectorAll("span");
        Array.prototype.forEach.call(spans, function (sp) {
          var t = text(sp);
          if (/^SKU\s*:/i.test(t)) sku = t.replace(/^SKU\s*:\s*/i, "").trim();
          if (/^Vendor\s*:/i.test(t)) vendor = t.replace(/^Vendor\s*:\s*/i, "").trim();
        });
      }

      items.push({
        title: text($(SELECTORS.title, row)),
        room: getRoomForRow(row),
        quantity: String(extractQty(text($(SELECTORS.qtyText, row)))),
        unit: moneyKeepDollar(text($(SELECTORS.unitPrice, row))),
        line_total: extractLineTotal(text($(SELECTORS.lineTotal, row))),

        // NEW:
        image: img ? img.getAttribute("src") : "",
        variant: variantEl ? text(variantEl) : "",
        sku: sku,
        vendor: vendor
      });
    });

    return { items: items, grandTotal: getGrandTotal() };
  }

  
function buildPrintHtml(data) {
  var rows = data.items.map(function (i) {
    return `<tr>
      <td style="width:70px">
        ${
          i.image
            ? `<img src="${escapeHtml(i.image)}" style="width:60px;height:auto;border:1px solid #eee;border-radius:6px" />`
            : ``
        }
      </td>
      <td>
        <div style="font-weight:600">${escapeHtml(i.title)}</div>
        ${
          i.variant
            ? `<div style="font-size:12px;opacity:.8;margin-top:2px">Variant: ${escapeHtml(i.variant)}</div>`
            : ``
        }
        <div style="font-size:12px;opacity:.8;margin-top:2px">
          ${i.sku ? `SKU: ${escapeHtml(i.sku)}` : ``}
          ${i.sku && i.vendor ? ` &nbsp;|&nbsp; ` : ``}
          ${i.vendor ? `Vendor: ${escapeHtml(i.vendor)}` : ``}
        </div>
        ${
          i.room
            ? `<div style="font-size:12px;opacity:.75;margin-top:4px">Room: ${escapeHtml(i.room)}</div>`
            : ``
        }
      </td>
      <td style="text-align:center;white-space:nowrap">${escapeHtml(i.quantity)}</td>
      <td style="text-align:right;white-space:nowrap">${escapeHtml(i.unit)}</td>
      <td style="text-align:right;white-space:nowrap">${escapeHtml(i.line_total)}</td>
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
th,td{border-bottom:1px solid #ddd;padding:10px;font-size:13px;vertical-align:top}
th{background:#f7f7f7;text-align:left}
.total{display:flex;justify-content:space-between;font-weight:bold;margin-top:16px}
</style>
</head>
<body>
<h2 style="margin:0 0 6px">Quote: ${escapeHtml(getCartName())}</h2>
<div style="opacity:.75;font-size:12px;margin-bottom:10px">Generated: ${escapeHtml(new Date().toLocaleString())}</div>

<table>
  <thead>
    <tr>
      <th style="width:70px"></th>
      <th>Item</th>
      <th style="text-align:center;width:70px">Qty</th>
      <th style="text-align:right;width:90px">Unit</th>
      <th style="text-align:right;width:110px">Line Total</th>
    </tr>
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
    setTimeout(function () {
      w.print();
    }, 400);
  }

  // ---------- UI (ONLY Print button) ----------
  function mountButtons() {
    var container = $(SELECTORS.cartContainer);
    if (!container || document.getElementById("quoteActions")) return;

    var wrap = document.createElement("div");
    wrap.id = "quoteActions";
    wrap.style.cssText =
      "display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px";

    wrap.innerHTML = `
      <button id="printQuoteBtn" style="padding:10px 14px;background:#111;color:#fff;border:0;border-radius:6px">Print / Save PDF</button>
    `;

    container.parentNode.insertBefore(wrap, container);
    document.getElementById("printQuoteBtn").onclick = printPDF;
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
