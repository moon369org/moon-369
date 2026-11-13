/*
 * dc-lite: renders the Moon site pages without a build step.
 *
 * Each page keeps its markup in <x-dc> and its logic in
 * <script type="text/x-dc" data-dc-script>class Component extends DCLogic { ... }</script>.
 * Supported template features:
 *   {{path.to.value}}  in text and attributes (whole-value attributes keep raw values, e.g. functions)
 *   <sc-for list="{{items}}" as="item">  with {{item.x}} and {{$index}}
 *   <sc-if value="{{cond}}">
 *   onClick / onChange / onInput attributes bound to functions
 *   <helmet>  content is moved into <head>
 * Rendering and diffing use Preact (vendored in preact.umd.js), so inputs keep focus between updates.
 */
(function () {
  const { h, render, Component } = window.preact;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    let v = scope;
    for (const k of path.split('.')) {
      if (v == null) return undefined;
      v = v[k];
    }
    return v;
  }

  function interp(str, scope) {
    const w = WHOLE.exec(str);
    if (w) return lookup(scope, w[1]);
    return str.replace(HOLE, (_, p) => {
      const v = lookup(scope, p);
      return v == null ? '' : String(v);
    });
  }

  const EVENT = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown' };

  function build(node, scope, key) {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      return t.indexOf('{{') === -1 ? t : interp(t, scope);
    }
    if (node.nodeType !== 1) return null;
    const tag = node.localName;

    if (tag === 'sc-for') {
      const list = interp(node.getAttribute('list') || '', scope) || [];
      const as = node.getAttribute('as') || 'item';
      return list.map((item, i) => {
        const s = Object.assign(Object.create(scope), { [as]: item, $index: i });
        return kids(node, s, i);
      });
    }
    if (tag === 'sc-if') {
      return interp(node.getAttribute('value') || '', scope) ? kids(node, scope) : null;
    }

    const props = key != null ? { key } : {};
    for (const a of Array.from(node.attributes)) {
      if (a.name.startsWith('hint-')) continue;
      const name = EVENT[a.name.toLowerCase()] || a.name;
      props[name] = a.value.indexOf('{{') === -1 ? a.value : interp(a.value, scope);
    }
    // Controlled inputs: Preact needs an onInput/onChange to accept typing; keep value as given.
    return h(tag, props, ...kids(node, scope));
  }

  function kids(node, scope) {
    const out = [];
    for (const c of Array.from(node.childNodes)) {
      const v = build(c, scope);
      if (v == null || v === false) continue;
      if (Array.isArray(v)) out.push(...v.flat(Infinity)); else out.push(v);
    }
    return out;
  }

  class DCLogic extends Component {
    renderVals() { return {}; }
    render() {
      const vals = this.renderVals() || {};
      return kids(this.props.__template, vals);
    }
  }
  window.DCLogic = DCLogic;

  function mount() {
    const tpl = document.querySelector('x-dc');
    if (!tpl) return;
    const helmet = tpl.querySelector('helmet');
    if (helmet) {
      for (const el of Array.from(helmet.children)) document.head.appendChild(el.cloneNode(true));
      helmet.remove();
    }
    const src = document.querySelector('script[data-dc-script]');
    let Comp = class extends DCLogic {};
    if (src) {
      // eslint-disable-next-line no-new-func
      Comp = new Function('DCLogic', `${src.textContent}\n;return Component;`)(DCLogic);
    }
    // Keep the template as an inert fragment, then render in its place.
    const template = document.createElement('div');
    while (tpl.firstChild) template.appendChild(tpl.firstChild);
    const root = document.createElement('div');
    root.setAttribute('data-dc-root', '');
    tpl.replaceWith(root);
    render(h(Comp, { __template: template }), root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
