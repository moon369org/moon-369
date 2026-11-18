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

/* Inside the Home Screen app there's no browser bar. Any website page opened there gets an app bar:
   back on the left, the page's name, and a way home to the app on the right. Links to other sites
   open over the app (with Done to return) instead of replacing it. */
(function () {
  var sa = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!sa) return;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (/^https?:$/.test(u.protocol) && u.origin !== location.origin) { e.preventDefault(); window.open(u.href, '_blank', 'noopener'); }
  }, true);
  var html = document.documentElement;
  function bar() {
    if (html.classList.contains('mk-post') || document.querySelector('.apb')) return;   // moment pages have their own bar
    // Let the page reach under the clock and battery, then fill that strip solid so nothing scrolls behind it.
    var vp = document.querySelector('meta[name=viewport]'); if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';
    var st = document.createElement('style');
    st.textContent = 'body::before{content:"";position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);background:#000;z-index:2147482001;pointer-events:none}' + '.apb{position:sticky;top:0;z-index:2147482000;display:grid;grid-template-columns:52px 1fr 52px;align-items:center;height:calc(52px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 8px 0;background:#0B0B0D;border-bottom:1px solid #1C1D20;color:#E9E4D8;box-sizing:border-box}' +
      '.apb b{justify-self:center;font:700 16px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
      '.apb button,.apb a{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;background:none;border:0;color:#E9E4D8;padding:0}.apb a{justify-self:end}.apb svg{width:22px;height:22px}' +
      'html.apb-on header{position:static!important;transform:none!important;transition:none!important}';
    html.classList.add('apb-on');   // the site's own sliding header stays put under the app bar
    document.head.appendChild(st);
    var el = document.createElement('div'); el.className = 'apb';
    var name = (document.title || 'Moon').replace(/\s*·\s*Moon\s*$/, '') || 'Moon';
    el.innerHTML = '<button type="button" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<b></b><a href="/app" aria-label="Back to the app"><svg viewBox="-80 -52 160 104" aria-hidden="true"><circle cx="-30" cy="0" r="46" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="30" cy="0" r="46" fill="none" stroke="currentColor" stroke-width="10"/></svg></a>';
    el.querySelector('b').textContent = name;
    el.querySelector('button').onclick = function () {
      var same = false; try { same = document.referrer && new URL(document.referrer).origin === location.origin; } catch (x) {}
      if (same && history.length > 1) history.back(); else location.href = '/app';
    };
    document.body.insertBefore(el, document.body.firstChild);
  }
  if (document.body) bar(); else document.addEventListener('DOMContentLoaded', bar);
})();
