
(function () {
  var btn = document.getElementById('printCartPdfButton');
  if (!btn) return;

  btn.addEventListener('click', function () {
    var cart = document.querySelector('main-cart');
    if (!cart) return;

    var w = window.open('', 'PRINT', 'height=800,width=1000');
    w.document.write('<html><head><title>Cart</title>');
    w.document.write('<style>');
    w.document.write('body{font-family:Arial,sans-serif;padding:24px;}');
    w.document.write('table{width:100%;border-collapse:collapse;}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;}');
    w.document.write('.no-print{display:none !important;}');
    w.document.write('</style>');
    w.document.write('</head><body>');
    w.document.write('<h1>Cart Summary</h1>');
    w.document.write(cart.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    w.print();
    w.close();
  });
})();