/*
 * Moon motion layer: a starfield behind the home hero and sections that drift in
 * as they reach the viewport. Pairs with assets/moon-motion.css.
 * Uses the Web Animations API instead of classes so Preact re-renders (every
 * second, for the clocks) never fight it.
 */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Starfield ----------
  // Home hero only. One sparse, seamless tile of stars drawn once and repeated as a
  // background; it never moves or redraws. Twinkle and shooting stars are separate
  // elements animated with opacity and transform only, so the compositor runs them.
  function starfield(root) {
    const hero = root.querySelector('#top');
    if (!hero) return;
    const sky = document.createElement('div');
    sky.className = 'moon-stars';
    sky.setAttribute('aria-hidden', 'true');
    hero.prepend(sky);

    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const T = 640, cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(T * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    // Mostly faint pinpricks, a few brighter stars. Kept sparse so the page stays calm.
    const KINDS = [
      { n: 34, r: [0.5, 0.9], a: [0.25, 0.5] },
      { n: 12, r: [0.8, 1.3], a: [0.45, 0.75] },
      { n: 3, r: [1.3, 1.8], a: [0.75, 0.95] },
    ];
    for (const K of KINDS) {
      for (let i = 0; i < K.n; i++) {
        const x = Math.random() * T, y = Math.random() * T, r = rand(K.r[0], K.r[1]), al = rand(K.a[0], K.a[1]);
        // A few stars carry the cool blue from the season palette.
        const col = Math.random() < 0.12 ? '129,151,173' : '233,228,216';
        // Draw near-edge stars on the opposite edge too, so the tile repeats seamlessly.
        for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
          const px = x + dx, py = y + dy;
          if (px < -10 || px > T + 10 || py < -10 || py > T + 10) continue;
          c.fillStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
          c.beginPath(); c.arc(px, py, r, 0, 6.2832); c.fill();
          if (r > 1.3) {
            c.fillStyle = 'rgba(' + col + ',' + (al * 0.12).toFixed(3) + ')';
            c.beginPath(); c.arc(px, py, r * 4, 0, 6.2832); c.fill();
          }
        }
      }
    }
    const field = document.createElement('div');
    field.className = 'moon-starlayer';
    field.setAttribute('aria-hidden', 'true');
    field.style.backgroundSize = T + 'px ' + T + 'px';
    field.style.backgroundImage = 'url(' + cv.toDataURL('image/png') + ')';
    sky.appendChild(field);
    if (reduced) return;

    // Twinkling stars: two layers of glowing dots, each layer fading as a whole.
    for (let k = 0; k < 2; k++) {
      const layer = document.createElement('div');
      layer.className = 'moon-twinkle';
      layer.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i++) {
        const d = document.createElement('i');
        const size = rand(2.5, 5);
        d.style.cssText = 'left:' + rand(2, 98).toFixed(1) + '%;top:' + rand(2, 98).toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px';
        layer.appendChild(d);
      }
      sky.appendChild(layer);
    }

    // Shooting star every 12 to 24 seconds.
    const m = document.createElement('div');
    m.className = 'moon-meteor';
    m.setAttribute('aria-hidden', 'true');
    sky.appendChild(m);
    const shoot = () => {
      if (!document.hidden) {
        const ang = rand(150, 160), len = rand(260, 480);
        const w = sky.clientWidth, h = sky.clientHeight;
        const x = rand(w * 0.3, w * 1.05), y = rand(-20, h * 0.35);
        const rad = ang * Math.PI / 180, dx = Math.cos(rad) * len, dy = Math.sin(rad) * len;
        const at = (k, o) => ({ transform: 'translate(' + (x + dx * k).toFixed(0) + 'px,' + (y + dy * k).toFixed(0) + 'px) rotate(' + ang + 'deg)', opacity: o });
        m.animate([at(0, 0), at(0.25, 1), at(1, 0)], { duration: rand(900, 1400), easing: 'cubic-bezier(.3,0,.7,1)' });
      }
      setTimeout(shoot, rand(12000, 24000));
    };
    setTimeout(shoot, 3500);
  }

  // ---------- Mobile top bar: hide on scroll down, show on scroll up ----------
  function headroom(root) {
    const html = document.documentElement;
    const header = root.querySelector('header');
    if (!header) return;
    const mobile = window.matchMedia('(max-width: 720px)');
    let lastY = window.scrollY, queued = false;
    const update = () => {
      queued = false;
      const y = window.scrollY, dy = y - lastY;
      if (!mobile.matches || html.classList.contains('mm-menu-open') || y <= header.offsetHeight) {
        html.classList.remove('mm-head-hidden');
      } else if (Math.abs(dy) > 6) {
        // Ignore tiny moves so the bar doesn't flicker on jittery touch scrolls.
        html.classList.toggle('mm-head-hidden', dy > 0);
      } else {
        return;
      }
      lastY = y;
    };
    window.addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    mobile.addEventListener('change', update);
  }

  // ---------- Sections drift in ----------
  function reveal(root) {
    if (reduced || !('IntersectionObserver' in window)) return;
    // Leaf sections only; the first one on each page is the hero and gets a short lead-in.
    const sections = Array.from(root.querySelectorAll('section')).filter((s) => !s.querySelector('section'));
    const targets = [];
    sections.forEach((s, si) => {
      let kids = Array.from(s.children).filter((k) => !k.classList.contains('moon-stars'));
      if (kids.length === 1 && kids[0].tagName === 'DIV') kids = Array.from(kids[0].children);
      kids.forEach((el, i) => targets.push({ el, i, hero: si === 0 }));
    });
    const seen = new WeakSet();
    const play = (el, i, delay) => el.animate(
      [
        { opacity: 0, transform: 'translateY(28px) scale(.985)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 1000, delay: delay + Math.min(i, 6) * 90, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
    );
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || seen.has(e.target)) continue;
        seen.add(e.target); io.unobserve(e.target);
        const t = targets.find((x) => x.el === e.target);
        play(e.target, t ? t.i : 0, t && t.hero ? 250 : 0);
      }
    }, { rootMargin: '0px 0px 8% 0px', threshold: 0 });
    // Whatever is already on screen animates now, before the first paint, so it never flashes.
    const vh = window.innerHeight;
    targets.forEach((t) => {
      const r = t.el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { seen.add(t.el); play(t.el, t.i, t.hero ? 250 : 120); }
      else io.observe(t.el);
    });
  }

  // ---------- Mobile menu ----------
  // A two-line button that opens the main nav on small screens. State lives on
  // <html>, outside the Preact tree, so re-renders never reset it.
  function menu(root) {
    const html = document.documentElement;
    const nav = root.querySelector('header nav[aria-label="Main"]');
    const bar = nav && nav.parentElement;
    if (!bar) return;
    html.classList.add('mm-js');
    if (!nav.id) nav.id = 'mm-nav';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-burger';
    btn.setAttribute('aria-label', 'Menu');
    btn.setAttribute('aria-controls', nav.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span>';
    bar.appendChild(btn);
    // Blurred, dimmed backdrop behind the open menu; tapping it closes the menu.
    const scrim = document.createElement('div');
    scrim.className = 'mm-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    scrim.addEventListener('click', () => set(false));
    const set = (open) => {
      html.classList.toggle('mm-menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!html.classList.contains('mm-menu-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && html.classList.contains('mm-menu-open')) { set(false); btn.focus(); }
    });
    window.matchMedia('(max-width: 720px)').addEventListener('change', () => set(false));
  }

  // dc-lite renders synchronously when its deferred script runs, which is before this one,
  // so the page is already in the DOM here and nothing has been painted yet.
  function start() {
    const root = document.querySelector('[data-dc-root]');
    if (!root || !root.firstElementChild) return;
    starfield(root);
    menu(root);
    headroom(root);
    reveal(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
