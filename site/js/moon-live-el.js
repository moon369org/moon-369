/* <moon-live size="160" at="<unix ms>"></moon-live>: Moon's live moon. Today's phase and tilt, glowing and animated.
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
})();
