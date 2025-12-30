(function () {
  var rules = [
    { path: "/collections/sell-price-tier-1", requiredTag: "tier-1" }
  ];

  var path = location.pathname.replace(/\/+$/, "");

  var rule = rules.find(function (r) {
    return path === r.path || path.indexOf(r.path + "/") === 0;
  });

  if (!rule) return;

  // Don't run on account pages
  if (path.indexOf("/account") === 0) return;

  var isLoggedIn = !!window.__customerLoggedIn;
  var tags = Array.isArray(window.__customerTags) ? window.__customerTags : [];

  if (!isLoggedIn) {
    location.href =
      "/account/login?return_url=" +
      encodeURIComponent(location.pathname + location.search);
    return;
  }

  var hasAccess = tags.indexOf(rule.requiredTag) !== -1;

  if (!hasAccess) {
    location.href = "/collections/all";
  }
})();
