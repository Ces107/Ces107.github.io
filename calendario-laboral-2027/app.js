/* Calendario laboral 2027 - app. Datos: BOE-A-2026-21254 (embebidos en index.html). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('cal-data').textContent);
  var Y = D.year, N = 365, BASE = '/calendario-laboral-2027/', SITE = 'ces107.github.io';
  var MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var WD3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var ISO = [], WDAY = [], MON = [], DOM = [];
  for (var i = 0; i < N; i++) {
    var dt = new Date(Date.UTC(Y, 0, 1 + i));
    ISO.push(dt.toISOString().slice(0, 10)); WDAY.push(dt.getUTCDay()); MON.push(dt.getUTCMonth()); DOM.push(dt.getUTCDate());
  }
  var IDX = {}; ISO.forEach(function (s, k) { IDX[s] = k; });
  var REG = {}; D.regions.forEach(function (r) { REG[r.slug] = r; });
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function get(k) { try { return localStorage.getItem('cl27.' + k); } catch (e) { return null; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem('cl27.' + k); else localStorage.setItem('cl27.' + k, v); } catch (e) { /* sin almacenamiento */ } }

  var S = { region: null, zone: null, locals: ['', ''], n: 4, sel: null };

  /* ------------------------------------------------------------ datos */
  function holidays() {
    var out = [];
    D.holidays.forEach(function (h) {
      var all = h.regions === 'all';
      if (all || (S.region && h.regions.indexOf(S.region) >= 0)) out.push({ date: h.date, name: h.name, kind: all ? 'n' : 'r' });
    });
    var z = S.region && D.zones[S.region];
    if (z && S.zone) {
      var o = z.options.filter(function (x) { return x.slug === S.zone; })[0];
      if (o && o.remove) out = out.filter(function (h) { return h.date !== o.remove; });
      if (o && o.add) out.push({ date: o.add.date, name: o.add.name, kind: 'r' });
    }
    var boe = out.length;
    if (S.region) S.locals.forEach(function (d) { if (d && IDX[d] != null) out.push({ date: d, name: 'Festivo local', kind: 'l' }); });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    out.boe = boe;
    return out;
  }

  function offDays(hols) {
    var hd = {}; hols.forEach(function (h) { hd[h.date] = h.kind; });
    var off = [];
    for (var i = 0; i < N; i++) off.push(WDAY[i] === 0 || WDAY[i] === 6 || !!hd[ISO[i]]);
    return { off: off, hd: hd };
  }

  function runs(off) {
    var res = [], s = 0;
    for (var i = 1; i <= off.length; i++) if (i === off.length || off[i] !== off[s]) { res.push([s, i - 1, off[s]]); s = i; }
    return res;
  }

  /* Puentes: fines de semana largos (0 días) y huecos de 1-2 días laborables junto a un festivo. Igual que build.py. */
  function bridges(hols) {
    var o = offDays(hols), rs = runs(o.off), items = [], covered = {};
    function hasHol(r) { for (var i = r[0]; i <= r[1]; i++) if (o.hd[ISO[i]]) return true; return false; }
    rs.forEach(function (r, k) {
      if (r[2] && hasHol(r) && r[1] - r[0] + 1 >= 3) { items.push({ s: r[0], e: r[1], cost: 0, take: [] }); covered[k] = 1; }
    });
    rs.forEach(function (r, k) {
      if (!r[2] && r[1] === r[0] && k > 0 && k < rs.length - 1) {
        var a = rs[k - 1], b = rs[k + 1];
        if (hasHol(a) || hasHol(b)) {
          items.push({ s: a[0], e: b[1], cost: 1, take: [r[0]] });
          if (hasHol(a)) covered[k - 1] = 1;
          if (hasHol(b)) covered[k + 1] = 1;
        }
      }
    });
    rs.forEach(function (r, k) {
      if (!r[2] && r[1] - r[0] === 1 && k > 0 && k < rs.length - 1) {
        var hk = [k - 1, k + 1].filter(function (x) { return hasHol(rs[x]); });
        if (hk.length && !hk.every(function (x) { return covered[x]; })) {
          items.push({ s: rs[k - 1][0], e: rs[k + 1][1], cost: 2, take: [r[0], r[0] + 1] });
          hk.forEach(function (x) { covered[x] = 1; });
        }
      }
    });
    items.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    items.forEach(function (it) { it.len = it.e - it.s + 1; });
    return items;
  }

  /* Vacaciones: cada ventana de n días laborables seguidos se extiende a los libres de alrededor;
     se ordenan por días libres y se toman las mejores sin solaparse. */
  function plan(hols, n, max) {
    var off = offDays(hols).off, W = [];
    for (var i = 0; i < N; i++) if (!off[i]) W.push(i);
    n = Math.max(1, Math.min(n, W.length));
    var c = [];
    for (var k = 0; k + n <= W.length; k++) {
      var s = k > 0 ? W[k - 1] + 1 : 0, e = k + n < W.length ? W[k + n] - 1 : N - 1;
      c.push({ s: s, e: e, len: e - s + 1, cost: n, take: W.slice(k, k + n) });
    }
    c.sort(function (a, b) { return b.len - a.len || a.s - b.s; });
    var out = [];
    for (var j = 0; j < c.length && out.length < (max || 5); j++) {
      if (!out.some(function (x) { return c[j].s <= x.e && x.s <= c[j].e; })) out.push(c[j]);
    }
    return out;
  }

  /* ------------------------------------------------------------ formato */
  function fday(i) { return WD3[WDAY[i]] + ' ' + DOM[i] + ' ' + MON3[MON[i]]; }
  function frange(a, b) {
    return MON[a] === MON[b] ? WD3[WDAY[a]] + ' ' + DOM[a] + ' – ' + WD3[WDAY[b]] + ' ' + DOM[b] + ' ' + MON3[MON[b]] : fday(a) + ' – ' + fday(b);
  }
  function names(hols, it) {
    return hols.filter(function (h) { return h.date >= ISO[it.s] && h.date <= ISO[it.e]; }).map(function (h) { return h.name; }).join(' · ');
  }
  function strip(it, hd) {
    var t = {}, h = '';
    it.take.forEach(function (x) { t[x] = 1; });
    for (var i = it.s; i <= it.e; i++) h += '<i class="' + (hd[ISO[i]] || (t[i] ? 'w' : 'o')) + '"></i>';
    return '<span class="strip" aria-hidden="true">' + h + '</span>';
  }
  function item(it, hols, hd, id, what) {
    var cost = it.cost === 0 ? '<span class="cost free">0 días</span>' : '<span class="cost">' + it.cost + ' día' + (it.cost > 1 ? 's' : '') + '</span>';
    var on = S.sel && S.sel.s === it.s && S.sel.e === it.e && S.sel.cost === it.cost;
    return '<li><button type="button" class="it" data-k="' + id + '" aria-pressed="' + on + '">' +
      '<span class="big"><b>' + it.len + '</b><span>libres</span></span>' +
      '<span class="when">' + frange(it.s, it.e) + '</span>' + cost +
      '<span class="what">' + esc(what) + '</span>' + strip(it, hd) + '</button></li>';
  }

  /* ------------------------------------------------------------ render */
  var CELLS = {};
  Array.prototype.forEach.call(document.querySelectorAll('.g b[data-d]'), function (el) { CELLS[el.getAttribute('data-d')] = el; });
  var TODAY = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
  var PITEMS = [], VITEMS = [], icsUrl = null;

  function paintYear(hols) {
    var hd = {};
    hols.forEach(function (h) { if (!hd[h.date]) hd[h.date] = h; });
    for (var i = 0; i < N; i++) {
      var el = CELLS[ISO[i]], h = hd[ISO[i]], c = [];
      if (WDAY[i] === 0 || WDAY[i] === 6) c.push('we');
      if (h) c.push(h.kind);
      if (S.sel && i >= S.sel.s && i <= S.sel.e) c.push('sel');
      if (S.sel && S.sel.take.indexOf(i) >= 0) c.push('pk');
      if (ISO[i] === TODAY) c.push('today');
      el.className = c.join(' ');
      if (h) el.title = h.name; else el.removeAttribute('title');
    }
    for (var m = 0; m < 12; m++) {
      var ul = document.querySelector('#m' + (m + 1) + ' .hl'), html = '';
      hols.forEach(function (h) {
        if (+h.date.slice(5, 7) === m + 1) html += '<li><i class="' + h.kind + '"></i><b>' + (+h.date.slice(8)) + '</b><span>' + esc(h.name) + '</span></li>';
      });
      ul.innerHTML = html;
    }
    $('lg-v').hidden = !S.sel;
  }

  function render() {
    var hols = holidays(), r = S.region && REG[S.region], hd = offDays(hols).hd;
    paintYear(hols);
    $('rn').textContent = r ? r.name : 'España';
    Array.prototype.forEach.call(document.querySelectorAll('#pick .chip'), function (a) { a.setAttribute('aria-current', a.getAttribute('data-s') === S.region ? 'true' : 'false'); });

    var z = r && D.zones[S.region], zb = $('zones');
    if (z) {
      zb.innerHTML = '<b>' + esc(z.label) + '</b>' + z.options.map(function (o) {
        return '<button type="button" class="chip" data-z="' + o.slug + '" aria-pressed="' + (S.zone === o.slug) + '">' + esc(o.name) + '</button>';
      }).join('');
      zb.hidden = false;
    } else { zb.hidden = true; zb.innerHTML = ''; }

    $('s-f').textContent = r ? hols.boe + (S.region === 'canarias' && !S.zone ? '+1' : '') : 9;
    $('s-l').textContent = S.locals.filter(Boolean).length + '/2';

    if (!r) {
      $('s-p').textContent = '–';
      $('plist').innerHTML = '<li class="empty">↑ Comunidad</li>';
      $('vlist').innerHTML = ''; $('vhead').textContent = '';
      $('p-sub').textContent = '';
      $('dl').setAttribute('aria-disabled', 'true'); $('gc').setAttribute('aria-disabled', 'true');
      return;
    }
    PITEMS = bridges(hols);
    $('s-p').textContent = PITEMS.length;
    $('p-sub').textContent = r.name;
    $('plist').innerHTML = PITEMS.map(function (it, k) { return item(it, hols, hd, 'p' + k, names(hols, it)); }).join('') || '<li class="empty">—</li>';

    VITEMS = plan(hols, S.n, 5);
    var b = VITEMS[0];
    $('vhead').innerHTML = b ? 'Con <b>' + b.cost + '</b> día' + (b.cost > 1 ? 's' : '') + ' te llevas <b>' + b.len + '</b> libres' : '';
    $('vlist').innerHTML = VITEMS.map(function (it, k) { return item(it, hols, hd, 'v' + k, names(hols, it) || '—'); }).join('');

    // exportar
    if (icsUrl) URL.revokeObjectURL(icsUrl);
    var label = r.name + (z && S.zone ? ' · ' + z.options.filter(function (o) { return o.slug === S.zone; })[0].name : '');
    icsUrl = URL.createObjectURL(new Blob([ics(hols, label)], { type: 'text/calendar;charset=utf-8' }));
    var dl = $('dl');
    dl.href = icsUrl; dl.download = 'festivos-2027-' + S.region + (S.zone && S.zone !== 'general' ? '-' + S.zone : '') + '.ics';
    dl.removeAttribute('aria-disabled');
    var file = 'ics/' + S.region + (S.zone && S.zone !== 'general' ? '-' + S.zone : '') + '.ics';
    $('gc').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent('webcal://' + SITE + BASE + file);
    $('gc').removeAttribute('aria-disabled');
  }

  function ics(hols, label) {
    var p = function (n) { return ('0' + n).slice(-2); };
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ces107.github.io//Calendario laboral 2027//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Festivos 2027 · ' + label];
    hols.forEach(function (h) {
      var i = IDX[h.date], d = h.date.replace(/-/g, ''), nx = new Date(Date.UTC(Y, 0, 2 + i));
      var e = nx.getUTCFullYear() + p(nx.getUTCMonth() + 1) + p(nx.getUTCDate());
      L.push('BEGIN:VEVENT', 'UID:' + d + '-' + h.kind + '-' + S.region + '@ces107.github.io', 'DTSTAMP:20261026T000000Z',
        'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + e, 'SUMMARY:' + h.name.replace(/[\\,;]/g, function (c) { return '\\' + c; }), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  /* ------------------------------------------------------------ estado */
  function loadRegionState() {
    var z = D.zones[S.region];
    S.zone = z ? get('zone.' + S.region) : null;
    if (z && !z.options.some(function (o) { return o.slug === S.zone; })) S.zone = S.region === 'cataluna' ? 'general' : null;
    var l = [];
    try { l = JSON.parse(get('loc.' + S.region) || '[]') || []; } catch (e) { l = []; }
    S.locals = [l[0] || '', l[1] || ''].map(function (d) { return IDX[d] != null ? d : ''; });
    $('l0').value = S.locals[0]; $('l1').value = S.locals[1];
  }

  function setRegion(slug, push) {
    if (!REG[slug]) return;
    S.region = slug; S.sel = null;
    put('region', slug);
    loadRegionState();
    if (push !== false) {
      try { history.replaceState(null, '', '?ccaa=' + slug + location.hash); } catch (e) { /* file:// */ }
    }
    document.title = 'Calendario laboral 2027 ' + REG[slug].name + ': festivos y puentes';
    render();
  }

  function togglePick(open) {
    var p = $('pick'), b = $('chg');
    p.hidden = !open; b.setAttribute('aria-expanded', String(open));
  }

  /* ------------------------------------------------------------ eventos */
  $('pick').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-s]');
    if (!a) return;
    e.preventDefault();
    setRegion(a.getAttribute('data-s'));
    togglePick(false);
  });
  $('chg').addEventListener('click', function () { togglePick($('pick').hidden); });
  $('zones').addEventListener('click', function (e) {
    var b = e.target.closest('[data-z]');
    if (!b) return;
    S.zone = b.getAttribute('data-z'); S.sel = null;
    put('zone.' + S.region, S.zone);
    render();
  });

  function onPick(list) {
    return function (e) {
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var k = +b.getAttribute('data-k').slice(1), it = list()[k];
      var same = S.sel && S.sel.s === it.s && S.sel.e === it.e && S.sel.cost === it.cost;
      S.sel = same ? null : it;
      render();
      if (!same) {
        var m = document.getElementById('m' + (MON[it.s] + 1));
        if (m) m.scrollIntoView({ block: 'center' });
      }
    };
  }
  $('plist').addEventListener('click', onPick(function () { return PITEMS; }));
  $('vlist').addEventListener('click', onPick(function () { return VITEMS; }));

  function setN(v) {
    v = Math.max(1, Math.min(30, parseInt(v, 10) || 1));
    S.n = v; $('vn').value = v; put('n', String(v)); S.sel = null;
    render();
  }
  $('vm').addEventListener('click', function () { setN(S.n - 1); });
  $('vp').addEventListener('click', function () { setN(S.n + 1); });
  $('vn').addEventListener('change', function () { setN(this.value); });

  [0, 1].forEach(function (k) {
    $('l' + k).addEventListener('change', function () {
      var v = this.value;
      S.locals[k] = IDX[v] != null ? v : '';
      if (!S.region) return;
      put('loc.' + S.region, JSON.stringify(S.locals));
      render();
    });
  });
  document.querySelector('.locs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-clear]');
    if (!b) return;
    var k = +b.getAttribute('data-clear');
    $('l' + k).value = ''; S.locals[k] = '';
    if (S.region) put('loc.' + S.region, JSON.stringify(S.locals));
    render();
  });
  ['dl', 'gc'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (this.getAttribute('aria-disabled') === 'true') { e.preventDefault(); togglePick(true); $('pick').scrollIntoView({ block: 'center' }); }
    });
  });
  $('pr').addEventListener('click', function () { window.print(); });

  // pestañas: marca la sección visible
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs a'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) tabs.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    tabs.forEach(function (a) { var s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); });
  }

  /* ------------------------------------------------------------ inicio */
  var q = null;
  try { q = new URLSearchParams(location.search).get('ccaa'); } catch (e) { q = null; }
  var n0 = parseInt(get('n'), 10);
  if (n0 >= 1 && n0 <= 30) { S.n = n0; $('vn').value = n0; }
  var start = REG[q] ? q : (REG[get('region')] ? get('region') : null);
  if (start) { setRegion(start, false); togglePick(false); } else { render(); togglePick(true); }

  // para pruebas automáticas
  window.CL27 = { plan: function (n) { return plan(holidays(), n, 5); }, bridges: function () { return bridges(holidays()); }, holidays: holidays, iso: ISO };
})();
