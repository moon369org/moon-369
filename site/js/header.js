/* Desktop: once you scroll past the top, the header slides down and stays pinned. */
(function () {
  var mq = window.matchMedia ? window.matchMedia('(min-width: 721px)') : { matches: true };
  var hdr = null, h = 0, stuck = false;
  function find() { hdr = document.querySelector('body header'); return !!hdr; }
  function set(on) {
    if (on === stuck || !hdr) return;
    stuck = on;
    if (on) {
      h = hdr.offsetHeight;
      document.documentElement.style.setProperty('--hd-h', h + 'px');
      document.body.style.paddingTop = h + 'px';
      hdr.classList.add('hd-stuck');
    } else {
      hdr.classList.remove('hd-stuck');
      document.body.style.paddingTop = '';
      document.documentElement.style.setProperty('--hd-h', '0px');
    }
  }
  function tick() {
    if (!hdr && !find()) return;
    set(mq.matches && window.scrollY > hdr.offsetHeight + 80);
  }
  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', tick);
  var t = 0, iv = setInterval(function () { if (find() || ++t > 80) { clearInterval(iv); tick(); } }, 100);
})();
