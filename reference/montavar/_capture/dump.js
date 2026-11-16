// Read-only page dumper for the reference site (run in the page through the browser's JS tool).
// It only reads the DOM, DataTables settings and inline scripts, and writes the result to the console
// in chunks: `[CAP <slug> <i>/<n> @<run>] b64:<base64 of UTF-8>.<length>`. It never clicks, submits or sends a request,
// except `__capFetchScripts`, which GETs the page's own static .js files.
// State kept between pages: sessionStorage keys `__claude_capture_tool` (this source) and
// `__claude_capture_seen` (hashes of blocks already dumped, so shared dialogs are dumped once).
// Usage per page:  eval(sessionStorage.getItem('__claude_capture_tool')); await __capRun('<slug>')
//                  __capNext(5)   -> logs the next 5 chunks, returns "remaining N"
// After opening a dialog by hand: __capWatch() before the click, then await __capRun('<slug>', {open: true})
//                  -> only the open dialogs and the requests (with responses) since __capWatch().
(function () {
  var src = (function () {
    var SEEN_KEY = '__claude_capture_seen', LINES_KEY = '__claude_capture_lines', BY_KEY = '__claude_capture_lines_by';
    var ORIGIN = location.origin;
    function loadSeen() { try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { return {}; } }
    function saveSeen(s) { try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {} }
    function loadLines() { try { return JSON.parse(sessionStorage.getItem(LINES_KEY) || '{}'); } catch (e) { return {}; } }
    function saveLines(s) { try { sessionStorage.setItem(LINES_KEY, JSON.stringify(s)); } catch (e) {} }
    function loadBy() { try { return JSON.parse(sessionStorage.getItem(BY_KEY) || '{}'); } catch (e) { return {}; } }
    function saveBy(s) { try { sessionStorage.setItem(BY_KEY, JSON.stringify(s)); } catch (e) {} }
    function lh(s) { var a = 5381, b = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); a = ((a << 5) + a + c) | 0; b = (c + (b << 6) + (b << 16) - b) | 0; } return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36); }
    // Keeps only the lines that no earlier capture contained; runs of known lines become one "@@" marker.
    function lineDiff(text, st) {
      var lines = text.split('\n'), out = [], fresh = [], skipped = 0, emitted = 0;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i], tl = l.trim();
        if (tl.length < 4) { if (!skipped) out.push(l); continue; }
        var k = lh(tl);
        if (st.lines[k]) { skipped++; continue; }
        if (skipped) { out.push('@@ ' + skipped + ' lines already captured on earlier pages'); skipped = 0; }
        out.push(l); fresh.push(k); emitted++;
      }
      if (skipped) out.push('@@ ' + skipped + ' lines already captured on earlier pages');
      fresh.forEach(function (k) { st.lines[k] = 1; st.fresh.push(k); });
      return { text: out.join('\n'), emitted: emitted, total: lines.length };
    }
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36) + 'x' + s.length.toString(36); }
    function T(s, n) { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); n = n || 300; return s.length > n ? s.slice(0, n) + '…[' + s.length + ']' : s; }
    function q(s, n) { return JSON.stringify(T(s, n)); }
    function url(u) { return String(u || '').split(ORIGIN).join(''); }
    function eid(el) { return (el.getAttribute && el.getAttribute('id')) || ''; }
    function cn(el) { var c = el.getAttribute && el.getAttribute('class'); return c ? String(c).replace(/\s+/g, ' ').trim() : ''; }
    function selfHidden(el) { return (el.style && el.style.display === 'none') || el.hasAttribute('hidden') || /(^| )(hide|hidden|d-none)( |$)/.test(cn(el)); }
    var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, LINK: 1, META: 1, HEAD: 1, BR: 1, HR: 1, COLGROUP: 1, COL: 1, PATH: 1, SVG: 1, OPTION: 1, OPTGROUP: 1 };
    var SKIPCLASS = /(^| )(select2-container|chosen-container|dataTables_paginate|daterangepicker|datepicker-dropdown|ui-datepicker|mfp-bg|tooltip|select2-hidden-accessible-x)( |$)/;
    var ATTRS = ['name', 'type', 'for', 'href', 'action', 'method', 'enctype', 'target', 'title', 'placeholder', 'min', 'max', 'step', 'maxlength', 'minlength', 'pattern', 'accept', 'rows', 'role', 'onclick', 'onchange', 'onsubmit', 'onkeyup', 'onblur', 'oninput', 'src', 'alt', 'aria-label'];
    function common(el) {
      var p = [], tag = el.tagName.toUpperCase();
      if (eid(el)) p.push('#' + eid(el));
      var c = cn(el); if (c) p.push('.' + T(c, 100).replace(/ /g, '.'));
      ATTRS.forEach(function (n) {
        var v = el.getAttribute(n); if (v == null || v === '') return;
        if (n === 'href' || n === 'action' || n === 'src') v = url(v);
        if (n === 'type' && tag === 'BUTTON' && v === 'button') return;
        p.push(n + '=' + q(v, n.indexOf('on') === 0 ? 1500 : 300));
      });
      for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (a.name.indexOf('data-') === 0 && a.name !== 'data-select2-id') p.push(a.name + '=' + q(a.value, 200)); }
      ['required', 'readOnly', 'disabled', 'multiple', 'checked'].forEach(function (n) { if (el[n] === true) p.push(n.toUpperCase()); });
      if (selfHidden(el)) p.push('HID');
      return p.join(' ');
    }
    function ctl(el) {
      var tag = el.tagName.toUpperCase();
      if (tag === 'SELECT') {
        var opts = [], n = 0;
        Array.prototype.forEach.call(el.querySelectorAll('option'), function (o) {
          n++; if (opts.length >= 80) return;
          var g = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? '[' + T(o.parentElement.label, 40) + '] ' : '';
          opts.push(g + T(o.getAttribute('value'), 40) + '|' + T(o.textContent, 80) + (o.defaultSelected ? '*' : '') + (o.disabled ? '~dis' : ''));
        });
        var sel = el.selectedIndex >= 0 && el.options[el.selectedIndex] ? T(el.options[el.selectedIndex].textContent, 60) : '';
        return 'SEL ' + common(el) + ' cur=' + JSON.stringify(sel) + ' opts(' + n + '): ' + opts.join(' ; ') + (n > opts.length ? ' ; …+' + (n - opts.length) : '');
      }
      if (tag === 'TEXTAREA') return 'TA ' + common(el) + (el.value ? ' val=' + q(el.value, 300) : '');
      var secret = el.type === 'password';
      var v = el.getAttribute('value'); var cur = secret || el.type === 'file' ? '' : el.value;
      return 'IN ' + common(el) + (v != null && v !== '' && !secret ? ' val=' + q(v, 200) : '') + (cur && cur !== v ? ' cur=' + q(cur, 200) : '');
    }
    function btn(el) {
      var i = el.querySelector('i[class], span[class*="glyphicon"], span[class*="fa-"]');
      return (el.tagName.toUpperCase() === 'A' ? 'A ' : 'BTN ') + q(el.textContent, 200) + ' ' + common(el) + (i ? ' ico=' + q(cn(i), 60) : '');
    }
    function inline(node, cap) {
      if (node.nodeType === 3) return T(node.nodeValue, cap || 400);
      if (node.nodeType !== 1) return '';
      var tag = node.tagName.toUpperCase();
      if (SKIP[tag] || SKIPCLASS.test(cn(node))) return '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return '{' + ctl(node) + '}';
      if (tag === 'A' || tag === 'BUTTON') return '{' + btn(node) + '}';
      if (tag === 'IMG') return '{IMG ' + common(node) + '}';
      var parts = []; for (var c = node.firstChild; c; c = c.nextSibling) { var s = inline(c, cap); if (s) parts.push(s); }
      var tip = node.getAttribute('title') || node.getAttribute('data-original-title');
      var extra = (node.getAttribute('onclick') ? '{ONCLICK ' + q(node.getAttribute('onclick'), 800) + '}' : '') + (tip ? '{TIP ' + q(tip, 200) + '}' : '') + (!parts.length && /(^| )(fa|glyphicon|icon|badge|label)([- ]|$)/.test(cn(node)) ? '{ICO ' + q(cn(node), 60) + '}' : '');
      return (extra + ' ' + parts.join(' ')).trim();
    }
    function dtInfo(table) {
      try {
        if (!window.jQuery || !jQuery.fn.dataTable || !jQuery.fn.dataTable.isDataTable(table)) return null;
        var s = jQuery(table).DataTable().settings()[0]; var a = s.ajax, ax = null;
        if (a) ax = typeof a === 'string' ? a : { url: url(a.url), type: a.type, data: typeof a.data === 'function' ? T(a.data.toString(), 1500) : a.data };
        return {
          serverSide: !!(s.oFeatures && s.oFeatures.bServerSide), ajax: ax, ajaxSource: s.sAjaxSource ? url(s.sAjaxSource) : undefined,
          pageLength: s._iDisplayLength, order: s.aaSorting, lengthMenu: s.aLengthMenu,
          cols: s.aoColumns.map(function (c) { return { t: T(c.sTitle, 60), d: typeof c.mData === 'function' ? 'fn' : c.mData, n: c.sName || undefined, vis: c.bVisible, sort: c.bSortable, cls: c.sClass || undefined }; }),
          total: s.fnRecordsTotal ? s.fnRecordsTotal() : null, shown: s.fnRecordsDisplay ? s.fnRecordsDisplay() : null,
          lang: s.oLanguage ? { empty: s.oLanguage.sEmptyTable, info: s.oLanguage.sInfo, zero: s.oLanguage.sZeroRecords, search: s.oLanguage.sSearch } : undefined
        };
      } catch (e) { return { err: String(e) }; }
    }
    // A client-side DataTable keeps every row in memory but draws one page: write the rows that are not drawn.
    function dtRows(table, cap) {
      try {
        if (!window.jQuery || !jQuery.fn.dataTable || !jQuery.fn.dataTable.isDataTable(table)) return null;
        var api = jQuery(table).DataTable(), s = api.settings()[0];
        if (s.oFeatures && s.oFeatures.bServerSide) return null;
        var total = api.rows().count(), shown = table.tBodies[0] ? table.tBodies[0].rows.length : 0;
        if (total <= shown) return null;
        var lines = ['DTROWS all ' + total + ' rows of the table data (the page draws ' + shown + ')'], parser = new DOMParser(), n = 0;
        api.rows({ order: 'applied', search: 'none' }).every(function () {
          if (n++ >= cap) return;
          var data = this.data(), list = Array.isArray(data) ? data : Object.keys(data).map(function (k) { return data[k]; });
          lines.push('DTROW || ' + list.map(function (c) { return inline(parser.parseFromString(String(c == null ? '' : c), 'text/html').body, 200) || '-'; }).join(' | '));
        });
        if (total > cap) lines.push('(+' + (total - cap) + ' more rows of ' + total + ')');
        return lines;
      } catch (e) { return ['DTROWS-ERR ' + e]; }
    }
    function pad(d) { return '            '.slice(0, Math.min(d, 12)); }
    var MARK = /(^| )(modal|modal-title|modal-header|modal-footer|modal-body|tab-pane|tab-content|panel|panel-title|panel-heading|panel-body|alert|help-block|nav-tabs|nav-pills|dropdown-menu|btn-group|well|popover|dataTables_info|dataTables_length|dataTables_filter|dt-buttons)( |$)/;
    function kids(node, out, d, st) { for (var c = node.firstChild; c; c = c.nextSibling) walk(c, out, d, st); }
    function generic(node, out, d, st) {
      var tag = node.tagName.toUpperCase(), c0 = cn(node);
      var hasCtl = !!node.querySelector('input,select,textarea,button,a,table,img,canvas,iframe');
      var text = node.textContent || '';
      if (!hasCtl && text.length <= 900) {
        var t = T(text, 900), own = common(node);
        var isIcon = !t && /(^| )(fa|glyphicon|icon)([- ]|$)/.test(c0);
        if (t || eid(node) || node.getAttribute('onclick') || isIcon) out.push(pad(d) + tag + (own ? ' ' + own : '') + (t ? ' ' + JSON.stringify(t) : ''));
        return;
      }
      if (eid(node) || MARK.test(c0) || node.getAttribute('onclick') || selfHidden(node) || tag === 'FORM' || tag === 'FIELDSET' || tag === 'LABEL' || tag === 'LI' || tag === 'TD' || tag === 'TH' || /^H[1-6]$/.test(tag)) {
        out.push(pad(d) + tag + ' ' + common(node)); kids(node, out, d + 1, st);
      } else kids(node, out, d, st);
    }
    function walk(node, out, d, st) {
      if (node.nodeType === 3) { var t = T(node.nodeValue, 900); if (t) out.push(pad(d) + JSON.stringify(t)); return; }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toUpperCase(), c0 = cn(node);
      if (SKIP[tag] || SKIPCLASS.test(c0)) return;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { out.push(pad(d) + ctl(node)); return; }
      if (tag === 'A' || tag === 'BUTTON') { out.push(pad(d) + btn(node)); if (node.querySelector('input,select,textarea,table')) kids(node, out, d + 1, st); return; }
      if (tag === 'IFRAME' || tag === 'CANVAS' || tag === 'IMG' || tag === 'VIDEO' || tag === 'OBJECT' || tag === 'EMBED') { out.push(pad(d) + tag + ' ' + common(node)); return; }
      if (tag === 'TABLE') { st.tables++; out.push(pad(d) + 'TABLE ' + common(node)); var di = dtInfo(node); if (di) out.push(pad(d + 1) + 'DT ' + JSON.stringify(di)); kids(node, out, d + 1, st); var all = dtRows(node, st.rowCap); if (all) all.forEach(function (l) { out.push(pad(d + 1) + l); }); return; }
      if (tag === 'TBODY') {
        var rows = node.children, n = rows.length, table = node.parentElement, cap = (table && table.querySelector('thead') && n > st.rowCap) ? st.rowCap : n;
        for (var i = 0; i < cap; i++) walk(rows[i], out, d, st);
        if (n > cap) out.push(pad(d) + '(+' + (n - cap) + ' more rows of ' + n + ')');
        return;
      }
      if (tag === 'TR') {
        var cells = [];
        for (var c = node.firstElementChild; c; c = c.nextElementSibling) cells.push((c.tagName === 'TH' ? 'TH:' : '') + (inline(c, 300) || '-') + (c.getAttribute('colspan') ? ' {colspan ' + c.getAttribute('colspan') + '}' : '') + (selfHidden(c) ? ' {HID}' : ''));
        var m = common(node); out.push(pad(d) + 'TR' + (m ? ' ' + m : '') + ' || ' + cells.join(' | ')); return;
      }
      var isModal = /(^| )modal( |$)/.test(c0) || node.getAttribute('role') === 'dialog';
      var isChrome = tag === 'HEADER' || tag === 'ASIDE' || tag === 'FOOTER' || tag === 'NAV';
      if ((isModal || isChrome) && !st.inBlock) {
        var sub = []; st.inBlock = true; generic(node, sub, 0, st); st.inBlock = false;
        var text = sub.join('\n');
        if (text.length < 300 || st.noDedupe) { sub.forEach(function (l) { out.push(pad(d) + l); }); return; }
        var h = hash(text), key = 'b:' + h, titleEl = node.querySelector('.modal-title, h4, h3');
        var head = (isModal ? 'MODAL ' : 'CHROME ') + tag + (eid(node) ? '#' + eid(node) : '') + ' ' + q(titleEl ? titleEl.textContent : '', 80) + ' h=' + h;
        if (st.seen[key] && st.seen[key] !== st.slug) { out.push(pad(d) + head + ' SAME-AS ' + st.seen[key]); st.seenBlocks++; }
        else if (isChrome) { st.seen[key] = st.slug; var ld = lineDiff(text, st); out.push(pad(d) + head + ' LINEDIFF new=' + ld.emitted + ' of ' + ld.total + ' BEGIN'); out.push(ld.text); out.push(pad(d) + 'END ' + (eid(node) || tag)); }
        else { st.seen[key] = st.slug; st.newBlocks++; out.push(pad(d) + head + ' BEGIN'); sub.forEach(function (l) { out.push(pad(d + 1) + l); }); out.push(pad(d) + 'END ' + (eid(node) || tag)); }
        return;
      }
      generic(node, out, d, st);
    }
    function idle(ms) {
      return new Promise(function (res) {
        var t0 = Date.now(), quiet = 0;
        (function tick() {
          var busy = (window.jQuery && jQuery.active > 0) || document.readyState !== 'complete';
          quiet = busy ? 0 : quiet + 1;
          if (quiet >= 4 || Date.now() - t0 > ms) return res(Date.now() - t0);
          setTimeout(tick, 250);
        })();
      });
    }
    function chunk(slug, text) {
      if (text.toWellFormed) text = text.toWellFormed();
      window.__capChunks = []; var i = 0;
      while (i < text.length) { var e = Math.min(text.length, i + 6000), c = text.charCodeAt(e - 1); if (e < text.length && c >= 0xD800 && c <= 0xDBFF) e++; window.__capChunks.push(text.slice(i, e)); i = e; }
      window.__capSlug = slug; window.__capPos = 0; window.__capRunId = hash(text).split('x')[0] + (Date.now() % 1679616).toString(36);
    }
    function normHash(t) { return hash(t.replace(/[A-Za-z0-9+\/_-]{24,}/g, '@').replace(/\d+/g, '#')); }
    // opts: { wait: ms (default 8000), rowCap: body rows per table (default 40), noDedupe: true to dump shared blocks again }
    // Partial capture after something was opened by a click: only the open dialogs / menus (or opts.root),
    // written in full, plus the requests the page made since __capWatch() and their responses.
    function finishOpen(slug, opts, st, out) {
      var roots = opts.root ? Array.prototype.slice.call(document.querySelectorAll(opts.root)) : Array.prototype.filter.call(document.querySelectorAll('.modal, .mfp-content, .popover, .dropdown-menu, [role=dialog], .ui-dialog'), function (m) { return m.offsetParent !== null || (m.style && m.style.display === 'block'); });
      st.noDedupe = true; st.inBlock = true;
      out.push('--- OPEN ' + roots.length + ' element(s)');
      roots.forEach(function (r) {
        out.push('ROOT ' + r.tagName + (eid(r) ? '#' + eid(r) : '') + (cn(r) ? ' .' + cn(r).replace(/ /g, '.') : ''));
        generic(r, out, 1, st);
        Array.prototype.forEach.call(r.querySelectorAll('script'), function (s) { var t = s.textContent || ''; if (t.trim()) { out.push('SCRIPT-IN-ROOT len=' + t.length + ' BEGIN'); out.push(t); out.push('SCRIPT-END'); } });
      });
      var log = window.__capXhrLog || [];
      out.push('--- XHR-LOG ' + log.length + ' request(s) since the last capture');
      log.forEach(function (rec) {
        out.push('XHR ' + rec.method + ' ' + url(rec.url) + ' status=' + rec.status + ' len=' + rec.len + (rec.body ? ' body=' + q(String(rec.body).replace(/(pass[^=&]*=)[^&]*/gi, '$1***'), 2000) : ''));
        out.push(rec.text || ''); out.push('XHR-END');
      });
      if (window.__capXhrLog) window.__capXhrLog = [];
      var text = out.join('\n'); chunk(slug, text);
      return JSON.stringify({ slug: slug, chars: text.length, chunks: window.__capChunks.length, open: roots.map(function (r) { return eid(r) || r.tagName; }), requests: log.length }).replace(/[=&?]/g, '~');
    }
    // Records (never changes) the requests the page makes from now on, with their responses.
    window.__capWatch = function () {
      if (window.__capXhrLog) return 'already watching';
      window.__capXhrLog = [];
      var X = XMLHttpRequest.prototype, open = X.open, send = X.send;
      X.open = function (m, u) { this.__cap = { method: m, url: String(u) }; return open.apply(this, arguments); };
      X.send = function (body) {
        var self = this, rec = self.__cap || {};
        rec.body = typeof body === 'string' ? body.slice(0, 2000) : (body ? Object.prototype.toString.call(body) : '');
        self.addEventListener('loadend', function () {
          try { rec.status = self.status; var t = (self.responseType === '' || self.responseType === 'text') ? self.responseText : '[' + self.responseType + ']'; rec.len = t.length; rec.text = t.slice(0, 150000); } catch (e) { rec.err = String(e); }
          window.__capXhrLog.push(rec);
        });
        return send.apply(this, arguments);
      };
      var f = window.fetch;
      if (f) window.fetch = function (input, init) {
        var rec = { method: (init && init.method) || 'GET', url: typeof input === 'string' ? input : ((input && input.url) || ''), body: init && typeof init.body === 'string' ? init.body.slice(0, 2000) : '' };
        return f.apply(this, arguments).then(function (r) { try { r.clone().text().then(function (t) { rec.status = r.status; rec.len = t.length; rec.text = t.slice(0, 150000); window.__capXhrLog.push(rec); }); } catch (e) {} return r; });
      };
      return 'watching';
    };
    window.__capRun = async function (slug, opts) {
      opts = opts || {};
      var waited = await idle(opts.wait || 8000);
      var st = { slug: slug, seen: loadSeen(), lines: loadLines(), tables: 0, newBlocks: 0, seenBlocks: 0, newScripts: 0, seenScripts: 0, rowCap: opts.rowCap || 40, noDedupe: !!opts.noDedupe, inBlock: false, fresh: [] };
      var by = loadBy(); (by[slug] || []).forEach(function (k) { delete st.lines[k]; });
      var out = ['### CAPTURE ' + slug, 'URL ' + location.pathname + location.search + location.hash, 'TITLE ' + document.title, 'WAITED ' + waited + 'ms'];
      try {
        var xs = {}; performance.getEntriesByType('resource').forEach(function (e) { if (/xmlhttprequest|fetch/.test(e.initiatorType)) xs[T(url(e.name), 300)] = 1; });
        out.push('XHR ' + JSON.stringify(Object.keys(xs)));
      } catch (e) {}
      if (opts.open || opts.root) return finishOpen(slug, opts, st, out);
      out.push('--- DOM');
      walk(document.body, out, 0, st);
      out.push('--- SCRIPTS');
      Array.prototype.forEach.call(document.querySelectorAll('script'), function (s) {
        if (s.src) { if (s.src.indexOf('chrome-extension') !== 0) out.push('SCRIPT-SRC ' + url(s.src)); return; }
        var t = s.textContent || ''; if (!t.trim()) return;
        var h = hash(t), nh = normHash(t), head = 'SCRIPT-INLINE h=' + h + ' type=' + (s.type || 'js') + ' len=' + t.length;
        var prev = !st.noDedupe && (st.seen['s:' + h] || st.seen['n:' + nh]);
        if (prev && prev !== slug) { out.push(head + (st.seen['s:' + h] ? ' SAME-AS ' : ' SAME-MODULO-NUMBERS-AS ') + prev); st.seenScripts++; return; }
        st.seen['s:' + h] = slug; st.seen['n:' + nh] = slug; st.newScripts++;
        if (t.length > 600000) t = t.slice(0, 600000) + '\n…[truncated ' + t.length + ']';
        if (t.length > 3000) { var ld = lineDiff(t, st); out.push(head + ' LINEDIFF new=' + ld.emitted + ' of ' + ld.total + ' BEGIN'); out.push(ld.text); }
        else { out.push(head + ' BEGIN'); out.push(t); }
        out.push('SCRIPT-END ' + h);
      });
      by[slug] = st.fresh; saveSeen(st.seen); saveLines(st.lines); saveBy(by);
      var text = out.join('\n'); chunk(slug, text);
      return JSON.stringify({ slug: slug, chars: text.length, chunks: window.__capChunks.length, title: T(document.title, 50), path: T(location.pathname, 60), tables: st.tables, newBlocks: st.newBlocks, sharedBlocks: st.seenBlocks, newScripts: st.newScripts, sharedScripts: st.seenScripts }).replace(/[=&?]/g, '~');
    };
    // Dumps the page's own (non-vendor) external .js files once each. GET of static files only.
    window.__capFetchScripts = async function (slug) {
      var seen = loadSeen(), out = ['### SCRIPTS ' + slug, 'URL ' + location.pathname + location.search], n = 0;
      var srcs = Array.prototype.map.call(document.scripts, function (s) { return s.src; }).filter(function (s) { return s && s.indexOf(ORIGIN) === 0; });
      for (var i = 0; i < srcs.length; i++) {
        var path = url(srcs[i]).replace(/\?.*$/, '');
        if (/vendor|plugins|jquery|bootstrap|datatable|select2|quill\.min|jsqr|toastr|moment|chosen|magnific|xeditable|jszip|pdfmake|vfs_fonts|vue(\.|-)|chart|highcharts|tinymce|ckeditor|fullcalendar|dropzone|summernote|signature_pad|html2canvas|sortable/i.test(path)) { out.push('EXT-SKIP ' + path); continue; }
        if (seen['ext:' + path]) { out.push('EXT-SEEN ' + path + ' in ' + seen['ext:' + path]); continue; }
        try { var r = await fetch(srcs[i], { credentials: 'same-origin' }); var t = await r.text(); out.push('EXT ' + path + ' len=' + t.length + ' BEGIN'); out.push(t.length > 400000 ? t.slice(0, 400000) + '\n…[truncated ' + t.length + ']' : t); out.push('EXT-END ' + path); seen['ext:' + path] = slug; n++; }
        catch (e) { out.push('EXT-ERR ' + path + ' ' + e); }
      }
      saveSeen(seen);
      var text = out.join('\n'); chunk(slug, text);
      return JSON.stringify({ slug: slug, chars: text.length, chunks: window.__capChunks.length, fetched: n });
    };
    window.__capNext = function (k) {
      k = k || 5; var n = window.__capChunks ? window.__capChunks.length : 0, end = Math.min(n, (window.__capPos || 0) + k);
      for (var i = window.__capPos || 0; i < end; i++) console.log('[CAP ' + window.__capSlug + ' ' + i + '/' + n + ' @' + window.__capRunId + '] b64:' + btoa(unescape(encodeURIComponent(window.__capChunks[i]))) + '.' + window.__capChunks[i].length);
      window.__capPos = end; return 'remaining ' + (n - end);
    };
    window.__capReset = function () { sessionStorage.removeItem(SEEN_KEY); sessionStorage.removeItem(LINES_KEY); sessionStorage.removeItem(BY_KEY); return 'seen cleared'; };
    return 'capture tool ready';
  }).toString();
  sessionStorage.setItem('__claude_capture_tool', '(' + src + ')()');
  return eval(sessionStorage.getItem('__claude_capture_tool')) + ' (' + src.length + ' chars stored)';
})()
