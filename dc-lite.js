/* Tiny template runtime for the Brandit concept pages.
   Renders the <template id="tpl"> markup with {{holes}}, <sc-if> and <sc-for>,
   and patches the DOM in place when state changes. No dependencies. */
(function () {
  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  var ANY = /\{\{([^}]+)\}\}/g;
  var app = null, tpl = null, comp = null, extra = null, persist = null, queued = false, mounted = false;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    var v = scope, parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(ANY, function (m, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function each(nodes, fn) { for (var i = 0; i < nodes.length; i++) fn(nodes[i]); }

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.data, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName, m;
    if (tag === 'sc-if') {
      m = WHOLE.exec(node.getAttribute('value') || '');
      if (m && lookup(m[1], scope)) each(node.childNodes, function (c) { build(c, scope, out); });
      return;
    }
    if (tag === 'sc-for') {
      m = WHOLE.exec(node.getAttribute('list') || '');
      var list = (m && lookup(m[1], scope)) || [], as = node.getAttribute('as') || 'item';
      list.forEach(function (it, i) {
        var s = Object.create(scope); s[as] = it; s.$index = i;
        each(node.childNodes, function (c) { build(c, s, out); });
      });
      return;
    }
    var el = document.createElementNS(node.namespaceURI, node.localName);
    el.__a = {}; el.__h = {};
    each(node.attributes, function (a) {
      var w = WHOLE.exec(a.value);
      if (/^on[a-z]/.test(a.name) && w) { el.__h[a.name.slice(2)] = lookup(w[1], scope); return; }
      if (a.name === 'key') { el.__k = interp(a.value, scope); return; }
      el.__a[a.name] = interp(a.value, scope);
      el.setAttribute(a.name, el.__a[a.name]);
    });
    var kids = [];
    each(node.childNodes, function (c) { build(c, scope, kids); });
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  function same(o, n) {
    return o.nodeType === n.nodeType && (n.nodeType !== 1 || (o.localName === n.localName && o.__k === n.__k));
  }
  function patch(o, n) {
    if (n.nodeType === 3) { if (o.data !== n.data) o.data = n.data; return; }
    var pa = o.__a || {}, na = n.__a, k;
    for (k in na) if (pa[k] !== na[k]) o.setAttribute(k, na[k]);
    for (k in pa) if (!(k in na)) o.removeAttribute(k);
    o.__a = na; o.__h = n.__h;
    morph(o, Array.prototype.slice.call(n.childNodes));
  }
  function morph(parent, kids) {
    var o = parent.firstChild;
    kids.forEach(function (n) {
      if (o && same(o, n)) { var next = o.nextSibling; patch(o, n); o = next; return; }
      if (o && o.nextSibling && same(o.nextSibling, n)) {
        var gone = o; o = o.nextSibling; parent.removeChild(gone);
        var nx = o.nextSibling; patch(o, n); o = nx; return;
      }
      parent.insertBefore(n, o);
    });
    while (o) { var d = o; o = o.nextSibling; parent.removeChild(d); }
  }

  function render() {
    queued = false;
    var vals = comp.renderVals();
    if (extra) { var x = extra(); for (var k in x) vals[k] = x[k]; }
    var out = [];
    each(tpl.content.childNodes, function (c) { build(c, vals, out); });
    morph(app, out);
    if (!mounted) { mounted = true; if (comp.componentDidMount) comp.componentDidMount(); }
  }
  function schedule() { if (!queued) { queued = true; Promise.resolve().then(render); } }

  function DCLogic() { this.props = {}; this.state = {}; }
  DCLogic.prototype.setState = function (o) {
    this.state = Object.assign({}, this.state, o);
    if (persist) { try { var s = {}; persist.keys.forEach(function (k) { s[k] = comp.state[k]; }); localStorage.setItem(persist.name, JSON.stringify(s)); } catch (e) {} }
    schedule();
  };
  DCLogic.prototype.forceUpdate = schedule;
  window.DCLogic = DCLogic;

  window.DC = {
    mount: function (Component, props, opts) {
      opts = opts || {};
      app = document.getElementById('app'); tpl = document.getElementById('tpl');
      extra = opts.extra || null;
      comp = new Component();
      comp.props = props || {};
      if (opts.persist) {
        try { var saved = JSON.parse(localStorage.getItem(opts.persist.name) || 'null'); if (saved) comp.state = Object.assign({}, comp.state, saved); } catch (e) {}
        persist = opts.persist;
      }
      ['click', 'input', 'change'].forEach(function (type) {
        app.addEventListener(type, function (e) {
          var key = type === 'input' ? 'change' : type, n = e.target;
          while (n && n !== app) { if (n.__h && n.__h[key]) { n.__h[key](e); return; } n = n.parentNode; }
        });
      });
      render();
    }
  };
})();
