(function () {
  var path = location.pathname.replace(/\/+$/, "");

  // ✅ Run on BOTH the app page AND the save quotes page
  var isQuoteUI =
    path.startsWith("/apps/cart-saved-data") ||
    path === "/pages/save-cart" ||
    path.startsWith("/pages/save-cart/");

  if (!isQuoteUI) return;

  var SELECTORS = {
    cartContainer: ".cart-items-container",
    itemRow: ".cart-item",
    title: ".item-title",
    qtyText: ".item-quantity",
    unitPrice: ".item-price",
    lineTotal: ".item-total",
    grandTotalRow: ".cart-summary-row.cart-summary-total",
    addBtn: ".add-item-button"
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
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
    // Works for both /apps/... and pages (if cartId is in querystring)
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

  // More robust variant/product id extraction
  function getVariantId(btn) {
    if (!btn) return "";

    // 1) onclick="addItemToCart('productId','variantId',qty)"
    var oc = btn.getAttribute("onclick") || "";
    var m = oc.match(/addItemToCart\(\s*'[^']+'\s*,\s*'([^']+)'/i);
    if (m && m[1]) return m[1];

    // 2) data attributes
    var ds = btn.dataset || {};
    return (
      ds.variantId ||
      ds.variant ||
      ds.id || // some themes/apps use data-id
      ""
    );
  }

  function getProductId(btn) {
    if (!btn) return "";
    var oc = btn.getAttribute("onclick") || "";
    var m = oc.match(/addItemToCart\(\s*'([^']+)'/i);
    if (m && m[1]) return m[1];
    var ds = btn.dataset || {};
    return ds.productId || ds.product || "";
  }

  function itemKeyForRow(row) {
    var btn = $(SELECTORS.addBtn, row);
    var variantId = getVariantId(btn);
    var productId = getProductId(btn);
    return variantId || productId || text($(SELECTORS.title, row)) || "";
  }

  // ----------------- Inject field per item -----------------
  function mountRoomFields(root) {
    root = root || document;

    var cartId = getCartId();
    // If you're on /pages/save-cart and cartId isn't in URL,
    // room values still work per-quote only when you navigate to /apps/... with cartId.
    // (That’s a limitation of localStorage-keying by cartId.)
    var map = readRoomMap(cartId);

    $all(SELECTORS.itemRow, root).forEach(function (row) {
      var btn = $(SELECTORS.addBtn, row);
      if (!btn) return;

      // prevent duplicate binding
      if (btn.dataset.roomBound === "1") return;
      btn.dataset.roomBound = "1";

      // mount field once
      if (!row.querySelector("[data-room-field]")) {
        var key = itemKeyForRow(row) || ("row_" + Math.random());

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
          var cartId2 = getCartId();
          var key2 = itemKeyForRow(row) || key;

          var map2 = readRoomMap(cartId2);
          map2[key2] = input.value.trim();
          writeRoomMap(cartId2, map2);

          saved.style.display = "block";
          clearTimeout(saved._t);
          saved._t = setTimeout(function () {
            saved.style.display = "none";
          }, 900);
        }

        input.addEventListener("change", save);
        input.addEventListener("blur", save);
      }

      // Intercept Add-to-Cart so it includes properties[Assign to Room]
      btn.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();

          var qty = extractQty(text($(SELECTORS.qtyText, row)));
          var input = row.querySelector(".room-input");
          var roomVal = (input && input.value ? input.value : "").trim();

          var variantId = getVariantId(btn);

          // If we can't find variantId, fall back to original onclick behavior
          if (!variantId) {
            var oc = btn.getAttribute("onclick");
            if (oc) {
              try {
                // eslint-disable-next-line no-new-func
                new Function(oc).call(btn);
              } catch (err) {}
            }
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

  // ----------------- PRINT (keeps your room in PDF) -----------------
  function getRoomForRow(row) {
    var cartId = getCartId();
    var map = readRoomMap(cartId);
    var key = itemKeyForRow(row);
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

  function buildPrintHtml(data) {
    var rows = data.items
      .map(function (i) {
        return `<tr>
          <td>
            ${escapeHtml(i.title)}
            ${
              i.room
                ? `<div style="font-size:12px;opacity:.75;margin-top:4px">Room: ${escapeHtml(
                    i.room
                  )}</div>`
                : ``
            }
          </td>
          <td style="text-align:center">${escapeHtml(i.quantity)}</td>
          <td style="text-align:right">${escapeHtml(i.unit)}</td>
          <td style="text-align:right">${escapeHtml(i.line_total)}</td>
        </tr>`;
      })
      .join("");

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
<div class="total"><span>Total</span><span>${escapeHtml(
      data.grandTotal
    )}</span></div>
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

  function mountButtons() {
    var container = $(SELECTORS.cartContainer);
    if (!container || document.getElementById("quoteActions")) return;

    var wrap = document.createElement("div");
    wrap.id = "quoteActions";
    wrap.style.cssText =
      "display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px";

    wrap.innerHTML = `
      <button id="printQuoteBtn" style="padding:10px 14px;background:#111;color:#fff;border:0;border-radius:6px">
        Print / Save PDF
      </button>
    `;

    container.parentNode.insertBefore(wrap, container);
    document.getElementById("printQuoteBtn").onclick = printPDF;
  }

  // ✅ Run once + re-run whenever the quote UI changes (LOAD/VIEW)
  function hydrate() {
    mountButtons();
    mountRoomFields(document);
  }

  hydrate();

  // MutationObserver: catches LOAD QUOTES / VIEW QUOTES rendering
  var obs = new MutationObserver(function () {
    // Only hydrate if cart UI exists
    if ($(SELECTORS.cartContainer) && $all(SELECTORS.itemRow).length) hydrate();
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
