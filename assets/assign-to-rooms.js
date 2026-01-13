(function () {
  // Run only on cart + saved-cart app pages
  var path = location.pathname.replace(/\/+$/, "");
  var isCart = path === "/cart";

  var isSaved = path.indexOf("/apps/cart-saved-data") === 0;
  var isSaveCartList = path === "/pages/save-cart" || path.indexOf("/pages/save-cart/") === 0;


if (!isCart && !isSaved && !isSaveCartList) return;

  // ---------------- Utilities ----------------
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function getParam(name) {
    try {
      return new URL(location.href).searchParams.get(name) || "";
    } catch (e) {
      return "";
    }
  }
  function norm(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  // ---------------- Storage Keying ----------------
  // Use cartId on saved page. On /cart, fall back to cart token if you inject it, else "cart".
  // (Optional improvement: inject cart token in liquid: window.__cartToken = "{{ cart.token }}";)
  var cartId = getParam("cartId");
  var cartToken = (window.__cartToken || "");
  var scope = (cartId || cartToken || "cart");

  // One map for all notes in this scope
  // Structure: { "<itemKey>": "Toddler room" }
  var STORE_KEY = "cp_assign_to_room__" + scope;

  function loadMap() {
    return safeJsonParse(localStorage.getItem(STORE_KEY) || "{}", {});
  }
  function saveMap(map) {
    localStorage.setItem(STORE_KEY, JSON.stringify(map || {}));
  }
  function setNote(itemKey, value) {
    var map = loadMap();
    if (!value) delete map[itemKey];
    else map[itemKey] = value;
    saveMap(map);
  }
  function getNote(itemKey) {
    var map = loadMap();
    return map[itemKey] || "";
  }

  // ---------------- Key Strategy ----------------
  // /cart has item.key already in your input (data-line-key).
  // Saved-cart app page likely doesn't. We'll build a key from SKU if present, else title.
  function buildSavedItemKey(row) {
    // Try to find SKU text like "SKU: EP123"
    var sku = "";
    var skuEl = qsa("*", row).find(function (el) {
      return el && el.textContent && el.textContent.indexOf("SKU:") !== -1;
    });
    if (skuEl) {
      var m = skuEl.textContent.match(/SKU:\s*([A-Za-z0-9._-]+)/);
      if (m && m[1]) sku = m[1];
    }

    // Title guess: first strong-ish text / link
    var titleEl = qs("a", row) || qs("h3, h4, .item-title, .product-title", row);
    var title = titleEl ? titleEl.textContent : row.textContent;

    // Prefer SKU because it’s stable
    if (sku) return "sku:" + norm(sku);
    return "title:" + norm(title).slice(0, 120);
  }

  // ---------------- PART A: /cart ----------------
  function initCartPage() {
    // Your input already exists on /cart:
    // <input class="line-prop-input" data-line-key="{{ item.key }}" ...>

    var inputs = qsa("input.line-prop-input[data-line-key]");
    if (!inputs.length) return;

    // Restore from cache
    inputs.forEach(function (inp) {
      var k = "linekey:" + inp.getAttribute("data-line-key");
      var cached = getNote(k);
      if (cached && !inp.value) inp.value = cached;
    });

    // Save as user types
    inputs.forEach(function (inp) {
      var handler = debounce(function () {
        var k = "linekey:" + inp.getAttribute("data-line-key");
        setNote(k, inp.value.trim());
      }, 250);

      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
      inp.addEventListener("blur", handler);
    });

    // ALSO: push cached values into Shopify line item properties (real cart data)
    // This is what makes it survive page refresh and go to checkout/order.
    syncCachedNotesIntoCartProperties().catch(function () { /* swallow */ });
  }

  async function syncCachedNotesIntoCartProperties() {
    // Pull current cart JSON
    var cartRes = await fetch("/cart.js", { credentials: "same-origin" });
    if (!cartRes.ok) return;
    var cart = await cartRes.json();

    var map = loadMap();
    if (!map || !Object.keys(map).length) return;

    // For each cart line, find a cached note.
    // Priority:
    // 1) match by line item key (we saved using data-line-key)
    // 2) match by SKU (if you also used saved-cart page injection)
    // 3) match by title (fallback)
    var updates = [];

    cart.items.forEach(function (item, idx) {
      var line = idx + 1;

      var lineKey = item.key ? ("linekey:" + item.key) : "";
      var skuKey = item.sku ? ("sku:" + norm(item.sku)) : "";
      var titleKey = item.product_title ? ("title:" + norm(item.product_title).slice(0, 120)) : "";

      var cached =
        (lineKey && map[lineKey]) ||
        (skuKey && map[skuKey]) ||
        (titleKey && map[titleKey]) ||
        "";

      if (!cached) return;

      var current = (item.properties && item.properties["Assign to Room"]) ? String(item.properties["Assign to Room"]) : "";
      if (norm(current) === norm(cached)) return;

      // Build properties object preserving existing properties
      var props = {};
      if (item.properties) {
        Object.keys(item.properties).forEach(function (p) {
          // Shopify sometimes returns null/empty; normalize
          if (item.properties[p] != null && item.properties[p] !== "") props[p] = item.properties[p];
        });
      }
      props["Assign to Room"] = cached;

      updates.push({ line: line, properties: props });
    });

    // Apply updates sequentially (Shopify is picky)
    for (var i = 0; i < updates.length; i++) {
      await fetch("/cart/change.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line: updates[i].line,
          quantity: cart.items[updates[i].line - 1].quantity,
          properties: updates[i].properties
        })
      });
    }
  }



  function initSavedCartPage() {
  var addButtons = qsa("button, a").filter(function (el) {
    return el && /add to cart/i.test(el.textContent || "");
  });

  if (!addButtons.length) return;

  addButtons.forEach(function (btn) {
    var row =
      btn.closest(".cart-item") ||
      btn.closest(".saved-cart-item") ||
      btn.closest("li") ||
      btn.closest("tr") ||
      btn.closest("div");

    if (!row) return;

    // Avoid double-inject
    if (qs(".cp-assign-room-wrap", row)) return;

    var itemKey = buildSavedItemKey(row);

    // Build UI (same as before)
    var wrap = document.createElement("div");
    wrap.className = "cp-assign-room-wrap";
    wrap.style.marginTop = "10px";
    wrap.style.maxWidth = "320px";

    var label = document.createElement("label");
    label.textContent = "Assign to Room";
    label.style.display = "block";
    label.style.fontSize = "12px";
    label.style.opacity = "0.8";
    label.style.marginBottom = "6px";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "e.g. Toddler Room / Blue set";
    input.value = getNote(itemKey);
    input.style.width = "100%";
    input.style.padding = "8px 10px";
    input.style.border = "1px solid rgba(0,0,0,.15)";
    input.style.borderRadius = "6px";

    var small = document.createElement("small");
    small.textContent = "Saved in this browser for this saved cart.";
    small.style.display = "block";
    small.style.marginTop = "6px";
    small.style.opacity = "0.7";

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(small);

    // ✅ INSERT LOCATION: right after .item-details (your HTML block)
    var itemDetails = qs(".item-details", row);

    if (itemDetails && itemDetails.parentNode) {
      // insert after itemDetails
      if (itemDetails.nextSibling) {
        itemDetails.parentNode.insertBefore(wrap, itemDetails.nextSibling);
      } else {
        itemDetails.parentNode.appendChild(wrap);
      }
    } else {
      // fallback: try after tag-items
      var tagItems = qs(".item-meta.tag-items", row);
      if (tagItems && tagItems.parentNode) {
        if (tagItems.nextSibling) {
          tagItems.parentNode.insertBefore(wrap, tagItems.nextSibling);
        } else {
          tagItems.parentNode.appendChild(wrap);
        }
      } else {
        // final fallback: end of row
        row.appendChild(wrap);
      }
    }




    // Save on change
    var handler = debounce(function () {
      setNote(itemKey, input.value.trim());
    }, 250);

    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
    input.addEventListener("blur", handler);

    // Ensure note saved on ADD TO CART click
    btn.addEventListener(
      "click",
      function () {
        setNote(itemKey, input.value.trim());
      },
      true
    );
  });
}

function initSaveCartListPage() {
  // We’ll capture clicks on VIEW CART / LOAD CART and copy notes to the target cartId scope
  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target.closest("a,button");
      if (!btn) return;

      var txt = (btn.textContent || "").trim().toLowerCase();
      if (txt !== "view cart" && txt !== "load cart") return;

      // Try to find a link containing the destination cartId
      // Many implementations use <a href="/apps/cart-saved-data?cartId=123">
      var href = btn.getAttribute("href") || "";

      // If it’s a <button> that navigates via JS, try nearest <a>
      if (!href) {
        var a = btn.closest("a");
        if (a) href = a.getAttribute("href") || "";
      }

      // If still empty, try row container for any link
      if (!href) {
        var row = btn.closest("tr, .saved-cart-row, .saved-cart-item, li, div");
        if (row) {
          var link = row.querySelector('a[href*="cartId="]');
          if (link) href = link.getAttribute("href") || "";
        }
      }

      // Extract destination cartId
      var destCartId = "";
      try {
        // Support relative URLs
        var u = new URL(href, location.origin);
        destCartId = u.searchParams.get("cartId") || "";
      } catch (err) {
        // ignore
      }

      if (!destCartId) return; // nothing to map to

      // Source scope: if you already came from a detail page, current cartId exists.
      // On list page, we can’t know which saved cart without reading the row’s data,
      // but we can: look for a link in the SAME ROW that contains cartId and use that.
      var row2 = btn.closest("tr, .saved-cart-row, .saved-cart-item, li, div");
      var srcCartId = "";
      if (row2) {
        var anyLink = row2.querySelector('a[href*="cartId="]');
        if (anyLink) {
          try {
            var u2 = new URL(anyLink.getAttribute("href"), location.origin);
            srcCartId = u2.searchParams.get("cartId") || "";
          } catch (err2) {}
        }
      }

      // If we STILL can’t determine srcCartId, do nothing (we refuse to guess wrong).
      if (!srcCartId) return;

      // Copy map
      var srcKey = "cp_assign_to_room__" + srcCartId;
      var destKey = "cp_assign_to_room__" + destCartId;

      try {
        var srcMap = safeJsonParse(localStorage.getItem(srcKey) || "{}", {});
        localStorage.setItem(destKey, JSON.stringify(srcMap || {}));
      } catch (err3) {
        // ignore
      }
    },
    true
  );
}



  if (isCart) initCartPage();
  if (isSaved) initSavedCartPage();
  if (isSaveCartList) initSaveCartListPage();

})();
