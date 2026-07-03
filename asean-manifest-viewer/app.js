/* ============================================================
   ASEAN Liquidity Manifests — application logic (vanilla JS)
   ============================================================ */
(function () {
  'use strict';
  var DATA = window.MANIFEST_DATA || { templates: [] };

  var REG_FULL = { lcr: 'Liquidity Coverage Ratio', nsfr: 'Net Stable Funding Ratio' };

  // REGULATION colour — consistent across every country (from the stylesheet).
  // LCR = navy everywhere, NSFR = sage everywhere.
  var REG_VAR  = { lcr: 'var(--color-lcr)',  nsfr: 'var(--color-nsfr)' };
  var REG_TINT = { lcr: 'var(--color-lcr-light)', nsfr: 'var(--color-nsfr-light)' };

  // COUNTRY identity — three distinct jurisdiction colours (from the stylesheet).
  var JUR_VAR = {
    sg: 'var(--color-singapore-mas)',
    my: 'var(--color-malaysia-bnm)',
    id: 'var(--color-indonesia-ojk)'
  };
  var JUR_TINT = {
    sg: 'var(--color-singapore-mas-light)',
    my: 'var(--color-malaysia-bnm-light)',
    id: 'var(--color-indonesia-ojk-light)'
  };

  // Simplified geometric flags (viewBox 0 0 24 16), rendered inline for robustness.
  var FLAGS = {
    sg: '<rect width="24" height="8" fill="#EE2536"/><rect y="8" width="24" height="8" fill="#fff"/>' +
        '<circle cx="6" cy="4.2" r="2.8" fill="#fff"/><circle cx="7.5" cy="4.2" r="2.3" fill="#EE2536"/>' +
        '<circle cx="10" cy="2.7" r="0.5" fill="#fff"/><circle cx="11.43" cy="3.74" r="0.5" fill="#fff"/>' +
        '<circle cx="10.88" cy="5.41" r="0.5" fill="#fff"/><circle cx="9.12" cy="5.41" r="0.5" fill="#fff"/>' +
        '<circle cx="8.57" cy="3.74" r="0.5" fill="#fff"/>',
    my: '<rect width="24" height="16" fill="#fff"/><g fill="#CC0001">' +
        '<rect y="0" width="24" height="1.143"/><rect y="2.286" width="24" height="1.143"/>' +
        '<rect y="4.571" width="24" height="1.143"/><rect y="6.857" width="24" height="1.143"/>' +
        '<rect y="9.143" width="24" height="1.143"/><rect y="11.429" width="24" height="1.143"/>' +
        '<rect y="13.714" width="24" height="1.143"/></g>' +
        '<rect width="12" height="8" fill="#010066"/>' +
        '<circle cx="5.4" cy="4" r="2.3" fill="#FFCC00"/><circle cx="6.6" cy="4" r="1.9" fill="#010066"/>' +
        '<circle cx="8.4" cy="4" r="0.95" fill="#FFCC00"/>',
    id: '<rect width="24" height="8" fill="#CE1126"/><rect y="8" width="24" height="8" fill="#fff"/>'
  };
  function flagHTML(code, size) {
    return '<span class="flag flag--' + (size || 'md') + '"><svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">' + (FLAGS[code] || '') + '</svg></span>';
  }

  var CAT_LABELS = {
    DEF: 'Definitions', HQLA: 'High-Quality Liquid Assets', OUT: 'Cash Outflows',
    IN: 'Cash Inflows', INF: 'Cash Inflows', RPT: 'Reporting', FORM: 'Formulas',
    REG: 'Regulatory & General', ASF: 'Available Stable Funding', RSF: 'Required Stable Funding',
    OBS: 'Off-Balance Sheet', CAP: 'Caps & Limits', COND: 'Conditions',
    EXCL: 'Exclusions', IND: 'Indicators', CVR: 'Coverage Ratio'
  };

  // Type ramp uses the CURRENT regulation colour (set as --ramp-color per template),
  // so LCR templates read navy and NSFR templates read sage — never a sea of sienna.
  var TYPE_ORDER = ['definition', 'rate', 'factor', 'condition', 'formula', 'cap', 'exclusion', 'requirement', 'reporting'];
  var TYPE_PCT_ARR = [95, 80, 66, 54, 44, 35, 27, 20, 13];
  var TYPE_PCT = {};
  TYPE_ORDER.forEach(function (t, i) { TYPE_PCT[t] = TYPE_PCT_ARR[i]; });
  function typeColor(t) {
    var p = TYPE_PCT[t] || 50;
    return 'color-mix(in srgb, var(--ramp-color, var(--accent)) ' + p + '%, transparent)';
  }
  function catLabel(c) { return CAT_LABELS[c] || (c.length <= 2 ? 'Section ' + c : c); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }

  // ---- state ----
  var state = {
    key: null,
    search: '',
    types: {},        // active type filter set (empty = all)
    open: {},         // open row ids
    expandAll: false
  };

  var el = {
    nav: document.getElementById('sidebarNav'),
    content: document.getElementById('content'),
    crumb: document.getElementById('crumb'),
    meta: document.getElementById('topbarMeta'),
    search: document.getElementById('search'),
    searchClear: document.getElementById('searchClear'),
    toast: document.getElementById('toast'),
    app: document.getElementById('app'),
    themeToggle: document.getElementById('themeToggle'),
    navOpen: document.getElementById('navOpen'),
    navClose: document.getElementById('navClose')
  };

  // ---------- theme + sidebar chrome ----------
  function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('asean_theme', mode); } catch (e) {}
  }
  el.themeToggle.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });
  function setNav(collapsed) {
    el.app.classList.toggle('nav-collapsed', collapsed);
    try { localStorage.setItem('asean_nav', collapsed ? 'collapsed' : 'open'); } catch (e) {}
  }
  el.navClose.addEventListener('click', function () { setNav(true); });
  el.navOpen.addEventListener('click', function () { setNav(false); });
  try { if (localStorage.getItem('asean_nav') === 'collapsed') el.app.classList.add('nav-collapsed'); } catch (e) {}

  function tpl() { return DATA.templates.filter(function (t) { return t.key === state.key; })[0]; }

  // ---------- sidebar ----------
  function buildSidebar() {
    var byJuris = {};
    DATA.templates.forEach(function (t) {
      (byJuris[t.jurisdiction] = byJuris[t.jurisdiction] || []).push(t);
    });
    var order = ['Indonesia', 'Malaysia', 'Singapore'];
    var html = '';
    order.forEach(function (j) {
      var list = byJuris[j]; if (!list) return;
      var code = list[0].jurisCode;
      html += '<div class="am-sidebar__group">';
      html += '<div class="am-sidebar__group-label">' + flagHTML(code, 'sm') + '<span class="t-label">' + esc(j) + '</span></div>';
      list.forEach(function (t) {
        html += '<button class="am-nav-item" data-key="' + t.key + '">' +
          '<span class="am-nav-item__reg" style="background:' + REG_VAR[t.regKey] + '"></span>' +
          '<span class="am-nav-item__name">' + esc(t.regulation) + '</span>' +
          '<span class="am-nav-item__count">' + t.rows.length + '</span></button>';
      });
      html += '</div>';
    });
    el.nav.innerHTML = html;
    el.nav.addEventListener('click', function (e) {
      var b = e.target.closest('.am-nav-item'); if (!b) return;
      selectTemplate(b.getAttribute('data-key'));
    });
  }

  function markActiveNav() {
    Array.prototype.forEach.call(el.nav.querySelectorAll('.am-nav-item'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-key') === state.key);
    });
  }

  // ---------- select ----------
  function selectTemplate(key) {
    state.key = key;
    state.search = '';
    state.types = {};
    state.open = {};
    state.expandAll = false;
    el.search.value = '';
    el.searchClear.hidden = true;
    try { localStorage.setItem('asean_tpl', key); } catch (e) {}
    markActiveNav();
    var t = tpl();
    el.crumb.innerHTML = '<span>' + esc(t.jurisdiction) + '</span><span class="sep">/</span><b>' + esc(t.regulation) + '</b>';
    render();
    el.content.scrollTop = 0;
  }

  // ---------- filtering ----------
  function filteredRows() {
    var t = tpl(); if (!t) return [];
    var q = state.search.trim().toLowerCase();
    var typeKeys = Object.keys(state.types);
    return t.rows.filter(function (r) {
      if (typeKeys.length && !state.types[r.type]) return false;
      if (q) {
        var hay = (r.id + ' ' + r.title + ' ' + r.value + ' ' + (r.conditions || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function highlight(text) {
    text = esc(text);
    var q = state.search.trim();
    if (!q) return text;
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return text.replace(re, '<mark class="hl">$1</mark>');
  }

  // ---------- render ----------
  function render() {
    var t = tpl(); if (!t) return;
    var rows = filteredRows();

    // counts per type (unfiltered, for chips) and per type within current type-filter for bar
    var typeCounts = {};
    t.rows.forEach(function (r) { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
    var typesPresent = TYPE_ORDER.filter(function (ty) { return typeCounts[ty]; });

    var jur = JUR_VAR[t.jurisCode], jurTint = JUR_TINT[t.jurisCode];

    var h = '<div class="content__inner" style="--ctry-color:' + jur + ';--ctry-tint:' + jurTint + ';--ramp-color:' + jur + '">';

    // header — flag + "Country LCR" badge on line 1, full name below
    h += '<header class="tpl-head">';
    h += '<div class="tpl-head__strip" style="background:' + jur + '"></div>';
    h += '<div class="tpl-head__eyebrow">';
    h += flagHTML(t.jurisCode, 'lg');
    h += '<span class="regulation-label regulation-label--' + t.regKey + '"><em>' + esc(t.jurisdiction) + '</em> ' + esc(t.regulation) + '</span>';
    h += '</div>';
    h += '<h1>' + esc(REG_FULL[t.regKey] || t.regulation) + '</h1>';
    h += '</header>';

    // compact metric strip
    var nDef = typeCounts['definition'] || 0;
    var nRate = (typeCounts['rate'] || 0) + (typeCounts['factor'] || 0);
    var nCat = uniqueCats(t.rows).length;
    h += '<div class="statline">';
    h += stat(t.rows.length, 'Regulatory requirements', jur);
    h += stat(nRate, 'Rates &amp; factors', jur);
    h += stat(nDef, 'Defined terms', jur);
    h += stat(nCat, 'Categories', jur);
    h += '</div>';

    // type distribution (compact — chips below double as the legend)
    h += '<div class="typebar-wrap">';
    h += '<div class="typebar">';
    typesPresent.forEach(function (ty) {
      var pct = (typeCounts[ty] / t.rows.length * 100).toFixed(3);
      h += '<div class="typebar__seg" style="width:' + pct + '%;background:' + typeColor(ty) + '" title="' + esc(cap(ty)) + ': ' + typeCounts[ty] + '"></div>';
    });
    h += '</div></div>';

    // controls (sticky) — stylesheet scope-bar + scope-chip filters
    h += '<div class="controls">';
    h += '<div class="scope-bar" style="--juris-color:' + jur + ';--juris-light:' + jurTint + '">';
    h += '<div class="scope-bar__row">';
    h += '<span class="scope-bar__label">Filter by type</span>';
    typesPresent.forEach(function (ty) {
      var on = !!state.types[ty];
      h += '<button class="scope-chip' + (on ? ' is-active' : '') + '" data-type="' + ty + '">' +
        esc(cap(ty)) + '<span class="scope-chip__count">' + typeCounts[ty] + '</span></button>';
    });
    h += '<span style="flex:1 1 auto"></span>';
    if (Object.keys(state.types).length) h += '<button class="btn btn-ghost btn--size-sm" data-act="clearfilters">Clear</button>';
    h += '<button class="btn btn-ghost btn--size-sm" data-act="toggleall">' + (state.expandAll ? 'Collapse all' : 'Expand all') + '</button>';
    h += '</div>';
    h += '</div>';

    // TOC of visible categories
    var groups = groupByCat(rows);
    if (groups.length) {
      h += '<div class="toc">';
      groups.forEach(function (g) {
        h += '<button class="toc__chip" data-toc="cat-' + g.cat + '">' + esc(catLabel(g.cat)) + ' <span class="toc__chip-n">' + g.rows.length + '</span></button>';
      });
      h += '</div>';
    }
    h += '</div>'; // controls

    // category sections
    if (!groups.length) {
      h += '<div class="empty"><h3>No matching rows</h3><p>Adjust your search or type filters.</p></div>';
    } else {
      groups.forEach(function (g) {
        h += '<section class="cat" id="cat-' + g.cat + '">';
        h += '<div class="cat__head"><span class="cat__code">' + esc(g.cat) + '</span><span class="cat__name">' + esc(catLabel(g.cat)) + '</span><span class="cat__count">' + g.rows.length + ' / ' + (typeCatCount(t.rows, g.cat)) + '</span></div>';
        h += '<div class="grid-rows">';
        g.rows.forEach(function (r) { h += card(r); });
        h += '</div></section>';
      });
    }

    h += '</div>'; // inner
    el.content.innerHTML = h;

    // topbar meta
    var total = t.rows.length;
    el.meta.textContent = (rows.length === total ? total + ' regulatory requirements' : rows.length + ' of ' + total);
  }

  function stat(num, label, colorVar) {
    return '<div class="statline__item"><span class="statline__num" style="color:' + colorVar + '">' + num + '</span><span class="statline__lbl">' + label + '</span></div>';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function uniqueCats(rows) { var seen = {}, out = []; rows.forEach(function (r) { if (!seen[r.cat]) { seen[r.cat] = 1; out.push(r.cat); } }); return out; }
  function typeCatCount(rows, c) { return rows.filter(function (r) { return r.cat === c; }).length; }
  function groupByCat(rows) {
    var order = [], map = {};
    rows.forEach(function (r) { if (!map[r.cat]) { map[r.cat] = { cat: r.cat, rows: [] }; order.push(r.cat); } map[r.cat].rows.push(r); });
    return order.map(function (c) { return map[c]; });
  }

  function card(r) {
    var open = state.expandAll || state.open[r.id];
    var hasDetail = !!(r.intent || r.notes);
    var h = '<article class="rowcard' + (open ? ' open' : '') + '" data-id="' + esc(r.id) + '">';
    h += '<div class="rowcard__top">';
    h += '<span class="rowcard__id">' + highlight(r.id) + '</span>';
    h += '<button class="rowcard__copy" data-copy="' + esc(r.id) + '" title="Copy ID"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1"></rect><path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1"></path></svg></button>';
    h += '<span class="type-tag"><span class="type-tag__dot" style="background:' + typeColor(r.type) + '"></span>' + esc(r.type) + '</span>';
    h += '</div>';
    h += '<h3 class="rowcard__title">' + highlight(r.title) + '</h3>';
    h += '<div class="rowcard__value">' + highlight(r.value) + '</div>';
    if (r.conditions) {
      h += '<div class="rowcard__field"><span class="rowcard__field-label">Conditions</span><div class="rowcard__cond">' + highlight(r.conditions) + '</div></div>';
    }
    if (r.reference) {
      h += '<div class="rowcard__ref"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3M5 11l-1 1a2.1 2.1 0 0 1-3-3l1.5-1.5M11 5l1-1a2.1 2.1 0 0 0-3-3L7.5 2.5"></path></svg>' + esc(r.reference) + '</div>';
    }
    if (hasDetail) {
      h += '<div class="rowcard__detail">';
      if (r.intent) h += '<div class="rowcard__field"><span class="rowcard__field-label">Regulatory intent</span><div class="rowcard__intent">' + esc(r.intent) + '</div></div>';
      if (r.notes) h += '<div class="note-block"><strong>Note.</strong> ' + esc(r.notes) + '</div>';
      h += '</div>';
      h += '<button class="rowcard__toggle" data-toggle="' + esc(r.id) + '">' + (open ? 'Hide intent' : 'Regulatory intent') +
        ' <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"></path></svg></button>';
    }
    h += '</article>';
    return h;
  }

  // ---------- events ----------
  el.content.addEventListener('click', function (e) {
    var copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) { copyText(copyBtn.getAttribute('data-copy')); return; }
    var tg = e.target.closest('[data-toggle]');
    if (tg) {
      var id = tg.getAttribute('data-toggle');
      state.open[id] = !state.open[id];
      var c = el.content.querySelector('.rowcard[data-id="' + cssesc(id) + '"]');
      if (c) {
        c.classList.toggle('open', !!state.open[id]);
        tg.firstChild.textContent = state.open[id] ? 'Hide intent ' : 'Regulatory intent ';
      }
      return;
    }
    var fc = e.target.closest('[data-type]');
    if (fc) {
      var ty = fc.getAttribute('data-type');
      if (state.types[ty]) delete state.types[ty]; else state.types[ty] = 1;
      render(); return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'clearfilters') { state.types = {}; render(); }
      else if (a === 'toggleall') { state.expandAll = !state.expandAll; state.open = {}; render(); }
      return;
    }
    var toc = e.target.closest('[data-toc]');
    if (toc) {
      var sec = document.getElementById(toc.getAttribute('data-toc'));
      if (sec) {
        var top = sec.offsetTop - 72;
        el.content.scrollTo({ top: top, behavior: 'smooth' });
      }
      return;
    }
  });

  function cssesc(s) { return s.replace(/(["\\\]\[])/g, '\\$1'); }

  // search
  var searchTimer = null;
  el.search.addEventListener('input', function () {
    el.searchClear.hidden = !el.search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.search = el.search.value; render(); }, 110);
  });
  el.searchClear.addEventListener('click', function () {
    el.search.value = ''; el.searchClear.hidden = true; state.search = ''; render(); el.search.focus();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); el.search.focus(); el.search.select(); }
    if (e.key === 'Escape' && document.activeElement === el.search) { el.search.blur(); }
  });

  // copy + toast
  function copyText(text) {
    var done = function () { showToast('Copied  ' + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
  }
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg; el.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1700);
  }

  // ---------- init ----------
  buildSidebar();
  var saved = null;
  try { saved = localStorage.getItem('asean_tpl'); } catch (e) {}
  var startKey = (saved && DATA.templates.some(function (t) { return t.key === saved; })) ? saved : (DATA.templates[0] && DATA.templates[0].key);
  if (startKey) selectTemplate(startKey);
})();
