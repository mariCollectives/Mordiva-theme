(function () {
  function syncSavedCartUI() {
    var cartsList = document.getElementById("carts-list");
    var emptyState = document.getElementById("empty-state");
    var pagination = document.getElementById("pagination-controls");
    var container = document.getElementById("saved-carts-container");

    if (!cartsList || !emptyState) return;

    var items = cartsList.querySelectorAll(".saved-cart-item");

    if (items.length === 0) {
      cartsList.style.display = "none";
      if (pagination) pagination.style.display = "none";
      emptyState.style.display = "block";

      // OPTIONAL: hide entire block to prevent layout jump
      // container.style.display = "none";
    } else {
      cartsList.style.display = "block";
      emptyState.style.display = "none";
      if (pagination) pagination.style.display = "flex";
      // container.style.display = "block";
    }
  }

  // Initial run
  syncSavedCartUI();

  // Watch for delete / async DOM updates (this is the key)
  var observer = new MutationObserver(function () {
    syncSavedCartUI();
  });

  observer.observe(document.getElementById("saved-carts-list"), {
    childList: true,
    subtree: true
  });
})();
