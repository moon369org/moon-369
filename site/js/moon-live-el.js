/* <moon-live size="160" at="<unix ms>"></moon-live>: Moon's live moon. Today's phase and tilt, glowing and animated.
   <moon-clock size="56"></moon-clock>: the live moon beside the ticking Moon time, linked to moon369.org.
   Needs MoonPhase (moon-phase.js) and the moonglow loop (moonglow.js), which draws every canvas.hm-moonglow. */
(function () {
  if (typeof window === 'undefined' || !window.customElements || customElements.get('moon-live')) return;
  class MoonLive extends HTMLElement {
    static get observedAttributes() { return ['size', 'at']; }
    connectedCallback() { this.draw(); }
    attributeChangedCallback() { if (this.cv) this.draw(); }
    draw() {
      var n = Math.max(16, Math.min(2000, parseInt(this.getAttribute('size'), 10) || 160)), at = this.getAttribute('at');
      this.style.display = 'inline-block'; this.style.position = 'relative'; this.style.width = n + 'px'; this.style.height = n + 'px'; this.style.verticalAlign = 'middle';
      if (!this.getAttribute('role')) { this.setAttribute('role', 'img'); this.setAttribute('aria-label', 'The Moon'); }
      if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.className = 'hm-moonglow'; this.cv.setAttribute('aria-hidden', 'true'); this.appendChild(this.cv); }
      var w = n * 1.9;   // room for the glow to fade out
      this.cv.style.cssText = 'position:absolute;left:50%;top:50%;width:' + w + 'px;height:' + w + 'px;margin:' + (-w / 2) + 'px 0 0 ' + (-w / 2) + 'px;pointer-events:none;display:block';
      if (at) this.cv.setAttribute('data-at', at); else this.cv.removeAttribute('data-at');
    }
  }
  customElements.define('moon-live', MoonLive);

  // Moon time, ticking: cycle.moon.lune and the hour, beside the live moon. Inherits the page's text color.
  var EPOCH = -62165308562978.61, SEC = 1000 * 1.0403730490216803, p = function (n) { return String(n).padStart(2, '0'); };
  function mark(ms) {
    var t = ms - EPOCH, w = Math.floor(t / SEC), da = Math.floor(w / 86400), y = Math.floor(da / 369), dy = da - y * 369;
    var mi = Math.floor(dy * 13 / 369), d = dy - Math.ceil(mi * 369 / 13) + 1, sd = w - da * 86400;
    return [y + '.' + p(mi + 1) + '.' + p(d), p(Math.floor(sd / 3600)) + ':' + p(Math.floor(sd % 3600 / 60)) + ':' + p(sd % 60)];
  }
  class MoonClock extends HTMLElement {
    connectedCallback() {
      if (this.built) return; this.built = true;
      var n = Math.max(24, Math.min(400, parseInt(this.getAttribute('size'), 10) || 56));
      this.style.display = 'inline-flex'; this.style.alignItems = 'center'; this.style.gap = Math.round(n * 0.3) + 'px';
      this.setAttribute('role', 'timer'); this.setAttribute('aria-label', 'Moon time');
      var mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      this.innerHTML = '<moon-live size="' + n + '"></moon-live><a href="https://moon369.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:' + Math.round(n * 0.06) + 'px;line-height:1">' +
        '<span data-d style="font:' + Math.round(n * 0.3) + 'px ' + mono + ';letter-spacing:.02em"></span>' +
        '<span data-t style="font:' + Math.round(n * 0.42) + 'px ' + mono + ';font-variant-numeric:tabular-nums"></span>' +
        '<span style="font:' + Math.max(9, Math.round(n * 0.17)) + 'px ' + mono + ';letter-spacing:.22em;opacity:.6">MOON TIME</span></a>';
      var d = this.querySelector('[data-d]'), t = this.querySelector('[data-t]'), self = this;
      var tick = function () { var m = mark(Date.now()); if (d.textContent !== m[0]) d.textContent = m[0]; t.textContent = m[1]; };
      tick(); this.iv = setInterval(tick, 250);
    }
    disconnectedCallback() { clearInterval(this.iv); this.built = false; }
  }
  if (!customElements.get('moon-clock')) customElements.define('moon-clock', MoonClock);
})();
