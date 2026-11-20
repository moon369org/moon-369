/* Moon's languages. English is the source text; each other language maps English to its own words.
   MoonT(english, vars) translates one string ({name} placeholders are filled from vars).
   Any text node or label that exactly matches an English string is translated as the page draws,
   so static text needs no markup. Moonmarks, numbers and brand names (Moon, Moonmark, Lune) stay as they are.
   The language follows the phone; moonLang in local storage overrides it. */
(function (root) {
  if (root.MoonI18n) return;
  // Every language Moon speaks, in its own name. Each has a file in /js/i18n/ (English needs none).
  var LANGS = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'],
    ['ca', 'Català'], ['da', 'Dansk'], ['sv', 'Svenska'], ['no', 'Norsk'], ['fi', 'Suomi'], ['et', 'Eesti'], ['lt', 'Lietuvių'], ['pl', 'Polski'], ['cs', 'Čeština'],
    ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['hr', 'Hrvatski'], ['hu', 'Magyar'], ['ro', 'Română'], ['el', 'Ελληνικά'], ['he', 'עברית'], ['ar', 'العربية'],
    ['ja', '日本語'], ['ko', '한국어'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['th', 'ไทย']];
  // Languages whose files are finished; the others stay out of the pickers until they are.
  var READY = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl'];
  LANGS = LANGS.filter(function (l) { return READY.indexOf(l[0]) >= 0; });
  var HAS = {}; LANGS.forEach(function (l) { HAS[l[0]] = 1; });
  function pick(code) {
    code = String(code || '').toLowerCase();
    if (/^(nb|nn)\b/.test(code)) return 'no';
    if (code.indexOf('zh') === 0) return /tw|hk|mo|hant/.test(code) ? 'zh-TW' : 'zh-CN';
    if (code.indexOf('iw') === 0) return 'he';
    var two = code.slice(0, 2); return HAS[two] ? two : null;
  }
  var lang = 'en';
  try { var o = localStorage.getItem('moonLang'); lang = o && HAS[o] ? o : (pick(navigator.language) || 'en'); } catch (e) {}
  var D = {};
  var norm = function (x) { return String(x).replace(/\s+/g, ' ').trim(); };
  var BASE = (document.currentScript && document.currentScript.src || '/js/i18n.js').replace(/i18n\.js.*$/, 'i18n/');
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : s; }
  function T(s, v) { var x = D[norm(s)]; return fill(x != null ? x : s, v); }
  // Translate whole text nodes and labels that exactly match an English string.
  var ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
  function node(n) {
    if (n.nodeType === 3) {
      var p = n.parentElement; if (p && p.closest('code,pre,textarea,[translate="no"]')) return;
      var t = n.nodeValue, k = norm(t); if (k && D[k] != null && D[k] !== k) { var lead = /^\s*/.exec(t)[0], tail = /\s*$/.exec(t)[0]; n.nodeValue = lead + D[k] + tail; } return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA|TEMPLATE)$/.test(n.tagName)) return;
    // Labels on controls and images only: pages style and find their landmarks (nav, header, sections) by aria-label.
    var ctl = /^(BUTTON|INPUT|TEXTAREA|SELECT|IMG|CANVAS|SVG|svg)$/.test(n.tagName);
    ATTRS.forEach(function (a) { if (a === 'aria-label' && !ctl) return; var v = n.getAttribute && n.getAttribute(a); if (v && D[norm(v)] != null) n.setAttribute(a, D[norm(v)]); });
    for (var c = n.firstChild; c; c = c.nextSibling) node(c);
  }
  function apply(rootEl) { if (lang === 'en') return; node(rootEl || document.body); }
  // Load the keys and this language's file, then translate the page and keep translating whatever gets drawn.
  function load(src) { return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); }); }
  if (lang !== 'en') {
    document.documentElement.lang = lang;
    Promise.all([root.MOON_I18N_APP_KEYS ? 0 : load(BASE + 'app-keys.js'), load(BASE + lang + '.js')]).then(function () {
      var pk = (root.MOON_I18N_PACK || {})[lang] || {}, keys = root.MOON_I18N_APP_KEYS || [];
      keys.forEach(function (k, i) { if (pk.app && pk.app[i] != null && pk.app[i] !== '') D[norm(k)] = pk.app[i]; });
      var site = pk.site || {}; for (var k in site) D[norm(k)] = site[k];
      var start = function () {
        apply(document.body);
        new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') node(m.target); else m.addedNodes.forEach(node); }); })
          .observe(document.body, { childList: true, subtree: true, characterData: true });
        try { root.dispatchEvent(new Event('moon:lang')); } catch (e) {}
      };
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    });
  }
  function set(l) { try { if (l === 'auto') localStorage.removeItem('moonLang'); else localStorage.setItem('moonLang', l); } catch (e) {} location.reload(); }
  // The website's picker: a globe in the header (the app has its own).
  function sitePicker() {
    if (document.querySelector('[data-lang-open]')) return;
    var chosen = null; try { chosen = localStorage.getItem('moonLang'); } catch (e) {}
    if (!document.getElementById('mlp-css')) {
      var st = document.createElement('style'); st.id = 'mlp-css';
      st.textContent = '.mlp-g{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;background:none;border:0;color:#8A8B8F;cursor:pointer;opacity:.85}.mlp-g:hover{color:#E9E4D8;opacity:1}.mlp-g svg{width:18px;height:18px}.mlp-g span{display:none}' +
        '.mlp-m{position:fixed;z-index:2147483000;min-width:220px;max-height:min(70vh,560px);overflow:auto;background:#0E0E11;border:1px solid #2E3035;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:6px}.mlp-m button{display:flex;justify-content:space-between;gap:16px;width:100%;min-height:44px;padding:0 12px;background:none;border:0;color:#E9E4D8;font:14px "JetBrains Mono",monospace;text-align:left;cursor:pointer}.mlp-m button:hover{background:#17181B}.mlp-m button[aria-current="true"]::after{content:"\u2713"}' +
        '.mlp-f{display:flex;justify-content:center;padding:18px 0 6px}';
      document.head.appendChild(st);
    }
    var label = function () { return (LANGS.filter(function (l) { return l[0] === lang; })[0] || LANGS[0])[1]; };
    var GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.4"/><ellipse cx="12" cy="12" rx="4.2" ry="9.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 12h18M4.6 7.2h14.8M4.6 16.8h14.8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
    var make = function () { var b = document.createElement('button'); b.type = 'button'; b.className = 'mlp-g'; b.setAttribute('aria-label', 'Language'); b.setAttribute('translate', 'no'); b.innerHTML = GLOBE + '<span>' + label().toUpperCase() + '</span>'; b.onclick = function (e) { e.stopPropagation(); open(b); }; return b; };
    function open(b) {
      var old = document.querySelector('.mlp-m'); if (old) { old.remove(); return; }
      var m = document.createElement('div'); m.className = 'mlp-m'; m.setAttribute('translate', 'no');
      m.innerHTML = [['auto', T('Automatic')]].concat(LANGS).map(function (l) { var on = l[0] === 'auto' ? !chosen : chosen === l[0]; return '<button type="button" data-l="' + l[0] + '" aria-current="' + on + '">' + l[1] + '</button>'; }).join('');
      document.body.appendChild(m);
      var r = b.getBoundingClientRect(), up = r.top > window.innerHeight / 2;
      m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
      m.style.top = (up ? r.top - m.offsetHeight - 6 : r.bottom + 6) + 'px';
      m.onclick = function (e) { var x = e.target.closest('[data-l]'); if (x) set(x.getAttribute('data-l')); };
      setTimeout(function () { document.addEventListener('click', function off() { m.remove(); document.removeEventListener('click', off); }); }, 0);
    }
    var h = document.querySelector('header');
    if (h && !h.querySelector('.mlp-g')) {
      var row = h.querySelector('div') || h, g = make(); g.style.marginLeft = 'auto';
      var nav = row.querySelector('nav'); if (nav) nav.parentNode.insertBefore(g, nav.nextSibling); else row.appendChild(g);
    }
  }
  if (!root.__mlpBound) {
    root.__mlpBound = true;
    // Pages redraw their header as they load, so put the picker back whenever it goes missing.
    var pend = 0, check = function () { pend = 0; var h = document.querySelector('header'); if (h && !h.querySelector('.mlp-g')) sitePicker(); };
    var go = function () { check(); new MutationObserver(function () { if (!pend) pend = setTimeout(check, 120); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  root.MoonI18n = { lang: lang, T: T, apply: apply, set: set, languages: LANGS, picker: sitePicker };
  root.MoonT = T;
})(window);
