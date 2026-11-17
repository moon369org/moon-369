/* /widgets: copy buttons for the code samples. */
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-copy]'); if (!b) return;
  var code = b.parentNode.querySelector('.wg-code'); if (!code) return;
  var t = code.textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'COPIED'; setTimeout(function () { b.textContent = 'COPY'; }, 1500); }, function () { window.prompt('Copy this code', t); });
});
