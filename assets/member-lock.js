(function () {
  var lockedPaths = [
    "/collections/sell-price-tier-1"
  ];

  var path = location.pathname.replace(/\/+$/, "");

  var isLocked = lockedPaths.some(function (p) {
    return path === p || path.indexOf(p + "/") === 0;
  });

  if (!isLocked) return;

  // HARD STOP: don't run on login pages (prevents dumb loops)
  if (path.indexOf("/account") === 0) return;

  // Only trust Liquid-injected truth
  var isLoggedIn = !!window.__customerLoggedIn;

  if (!isLoggedIn) {
    location.href =
      "/account/login?return_url=" +
      encodeURIComponent(location.pathname + location.search);
  }
})();
