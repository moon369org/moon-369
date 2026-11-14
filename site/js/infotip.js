/* Info tooltips (the "i" next to the lit percentage): tap to open, tap anywhere to close,
   hover with a mouse. Some pages re-render many times a second and replace the element,
   so the open tooltip is remembered by id and the tap is caught on pointerdown. */
(function () {
  var openId = null, byHover = false, lastPointer = 0;
  function apply() {
    document.querySelectorAll('.mi').forEach(function (m) {
      var b = m.querySelector('.mi-b'), id = b && b.getAttribute('aria-describedby');
      var on = !!openId && id === openId;
      if (m.classList.contains('open') !== on) m.classList.toggle('open', on);
      if (b && b.getAttribute('aria-expanded') !== String(on)) b.setAttribute('aria-expanded', String(on));
    });
  }
  function set(id, hover) { openId = id; byHover = !!hover && !!id; apply(); }
  function btnOf(e) { return e.target && e.target.closest ? e.target.closest('.mi-b') : null; }
  function toggleFrom(b) { var id = b.getAttribute('aria-describedby'); set(openId === id && !byHover ? null : id); }

  document.addEventListener('pointerdown', function (e) {
    var b = btnOf(e);
    if (e.pointerType === 'mouse') { if (!b && openId) set(null); if (b) { lastPointer = Date.now(); set(b.getAttribute('aria-describedby')); } return; }
    lastPointer = Date.now();
    if (b) { e.preventDefault(); toggleFrom(b); } else if (openId) set(null);
  }, true);
  document.addEventListener('click', function (e) {
    var b = btnOf(e);
    if (b) { e.preventDefault(); if (Date.now() - lastPointer > 600) toggleFrom(b); }
  });
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var b = btnOf(e); if (b && (!openId || byHover)) set(b.getAttribute('aria-describedby'), true);
  });
  document.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse' || !byHover) return;
    var b = btnOf(e), to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.mi') : null;
    if (b && !to) set(null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openId) set(null); });
  new MutationObserver(function () { if (openId) apply(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
