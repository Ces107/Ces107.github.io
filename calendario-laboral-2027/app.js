/* Calendario laboral 2027 - app. Datos: BOE-A-2026-21254 (embebidos en index.html). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('cal-data').textContent);
  var Y = D.year, N = 365, BASE = document.documentElement.getAttribute('data-base') || '/calendario-laboral-2027/';
  var HOST = location.host || 'ces107.github.io';
  var MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MONL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var WD3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var WDL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var ISO = [], WDAY = [], MON = [], DOM = [];
  for (var i = 0; i < N; i++) {
    var dt = new Date(Date.UTC(Y, 0, 1 + i));
    ISO.push(dt.toISOString().slice(0, 10)); WDAY.push(dt.getUTCDay()); MON.push(dt.getUTCMonth()); DOM.push(dt.getUTCDate());
  }
  var IDX = {}; ISO.forEach(function (s, k) { IDX[s] = k; });
  var REG = {}; D.regions.forEach(function (r) { REG[r.slug] = r; });
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var weekend = function (i) { return WDAY[i] === 0 || WDAY[i] === 6; };

  function get(k) { try { return localStorage.getItem('cl27.' + k); } catch (e) { return null; } }
  function put(k, v) { try { if (v == null) localStorage.removeItem('cl27.' + k); else localStorage.setItem('cl27.' + k, v); } catch (e) { /* sin almacenamiento */ } }

  var S = { region: null, zone: null, locals: ['', ''], n: 4, sel: null, vac: {}, vtot: 22, vmode: false };
  var key = function () { return S.region || 'es'; };

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
    if (S.region) S.locals.forEach(function (d) { if (d && IDX[d] != null && !out.some(function (h) { return h.date === d; })) out.push({ date: d, name: 'Festivo local', kind: 'l' }); });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    out.boe = boe;
    return out;
  }

  function offDays(hols) {
    var hd = {}; hols.forEach(function (h) { hd[h.date] = h.kind; });
    var off = [];
    for (var i = 0; i < N; i++) off.push(weekend(i) || !!hd[ISO[i]]);
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
  function costHtml(c) {
    return c === 0 ? '<span class="cost free">Sin gastar vacaciones</span>' : '<span class="cost">' + c + ' día' + (c > 1 ? 's' : '') + ' de vacaciones</span>';
  }
  function same(a, b) { return a && b && a.s === b.s && a.e === b.e && a.cost === b.cost; }
  function item(it, hols, hd, id, what) {
    var on = same(S.sel, it), taken = it.take.length && it.take.every(function (x) { return S.vac[ISO[x]]; });
    var add = on ? '<div class="add">' + (it.cost ? '<button class="btn p" type="button" data-add="' + id + '">' +
      (taken ? 'Ya está en tus vacaciones' : 'Añadir ' + it.cost + ' día' + (it.cost > 1 ? 's' : '') + ' a mis vacaciones') + '</button>' : '') +
      '<a class="btn" href="#m' + (MON[it.s] + 1) + '">Ver en el calendario</a></div>' : '';
    return '<li' + (on ? ' class="on"' : '') + '><button type="button" class="it" data-k="' + id + '" aria-expanded="' + on + '">' +
      '<span class="pl"><span class="when">' + frange(it.s, it.e) + '</span><span class="what">' + esc(what) + '</span></span>' +
      strip(it, hd) + '<span class="pr"><b>' + it.len + '</b><span>días libres</span>' + costHtml(it.cost) + '</span></button>' + add + '</li>';
  }

  /* ------------------------------------------------------------ render */
  var CELLS = {};
  Array.prototype.forEach.call(document.querySelectorAll('.g b[data-d]'), function (el) { CELLS[el.getAttribute('data-d')] = el; });
  var NOW = new Date();
  var TODAY = NOW.getFullYear() + '-' + ('0' + (NOW.getMonth() + 1)).slice(-2) + '-' + ('0' + NOW.getDate()).slice(-2);
  var PITEMS = [], VITEMS = [], icsUrl = null;

  function paintYear(hols) {
    var hd = {};
    hols.forEach(function (h) { if (!hd[h.date]) hd[h.date] = h; });
    var lab = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < N; i++) {
      var el = CELLS[ISO[i]], h = hd[ISO[i]], c = [];
      if (weekend(i)) c.push('we');
      if (h) c.push(h.kind);
      else if (S.vac[ISO[i]] && !weekend(i)) c.push('vac');
      if (S.sel && i >= S.sel.s && i <= S.sel.e && !h && !weekend(i) && !S.vac[ISO[i]]) c.push('pk');
      if (S.sel && i >= S.sel.s && i <= S.sel.e) c.push('sel');
      if (ISO[i] === TODAY) c.push('today');
      el.className = c.join(' ');
      if (h) el.title = h.name; else if (S.vac[ISO[i]]) el.title = 'Vacaciones'; else el.removeAttribute('title');
      if (!weekend(i) && !h && !S.vac[ISO[i]]) lab[MON[i]]++;
    }
    for (var m = 0; m < 12; m++) {
      var ul = document.querySelector('#m' + (m + 1) + ' .hl'), html = '';
      hols.forEach(function (h) {
        if (+h.date.slice(5, 7) === m + 1) html += '<li><i class="sw ' + h.kind + '"></i><b>' + (+h.date.slice(8)) + '</b><span>' + esc(h.name) + '</span></li>';
      });
      ul.innerHTML = html;
      document.querySelector('[data-lab="' + (m + 1) + '"]').textContent = lab[m];
    }
    return lab.reduce(function (a, b) { return a + b; }, 0);
  }

  function nextHoliday(hols) {
    var h = hols.filter(function (x) { return x.date >= TODAY; })[0];
    if (!h) { $('nx-name').textContent = 'Fin de 2027'; $('nx-date').textContent = ''; $('nx-in').textContent = ''; return; }
    var i = IDX[h.date];
    $('nx-name').textContent = h.name;
    $('nx-date').textContent = WDL[WDAY[i]] + ', ' + DOM[i] + ' de ' + MONL[MON[i]] + ' de ' + Y;
    var t0 = Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()), days = Math.round((Date.UTC(Y, 0, 1 + i) - t0) / 864e5);
    $('nx-in').textContent = days === 0 ? 'Es hoy' : days === 1 ? 'Mañana' : 'Faltan ' + days + ' días';
  }

  function vacCount() {
    return Object.keys(S.vac).filter(function (d) { return S.vac[d] && IDX[d] != null && !weekend(IDX[d]); }).length;
  }
  function paintVac() {
    var used = vacCount();
    $('v-used').textContent = used;
    $('v-bar').style.width = Math.min(100, used / Math.max(1, S.vtot) * 100) + '%';
    $('v-bar').parentNode.classList.toggle('over', used > S.vtot);
    $('vclear').hidden = !used;
  }

  function tableRows(hols) {
    var tag = { n: 'Nacional', r: 'Comunidad', l: 'Local' };
    return hols.map(function (h) {
      var i = IDX[h.date];
      return '<tr><td class="dt"><b>' + DOM[i] + '</b> ' + MON3[MON[i]] + '</td><td class="d">' + WDL[WDAY[i]] + '</td><td>' + esc(h.name) +
        '</td><td class="t"><span class="tag ' + h.kind + '">' + tag[h.kind] + '</span></td></tr>';
    }).join('');
  }

  function render() {
    var hols = holidays(), r = S.region && REG[S.region], hd = offDays(hols).hd;
    var lab = paintYear(hols);
    $('rn').textContent = r ? r.name : 'España';
    $('region').value = S.region || '';
    nextHoliday(hols);
    paintVac();
    $('ftab').innerHTML = tableRows(hols);
    $('f-sub').textContent = r ? 'en ' + r.name : 'en toda España';

    var z = r && D.zones[S.region];
    if (z) {
      $('zone-l').textContent = z.label;
      $('zone').innerHTML = (S.region === 'canarias' ? '<option value="">Elige tu isla…</option>' : '') +
        z.options.map(function (o) { return '<option value="' + o.slug + '"' + (S.zone === o.slug ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('');
      $('zone-f').hidden = false;
    } else { $('zone-f').hidden = true; }

    $('s-f').textContent = r ? hols.boe + (S.region === 'canarias' && !S.zone ? '+1' : '') : 9;
    $('s-lab').textContent = r ? lab : '–';
    $('s-l').textContent = S.locals.filter(Boolean).length + '/2';

    if (!r) {
      $('s-p').textContent = '–';
      $('plist').innerHTML = '<li class="empty">Elige tu comunidad para ver sus puentes.</li>';
      $('vlist').innerHTML = ''; $('vhead').textContent = 'Elige tu comunidad para calcularlo.';
      $('p-sub').textContent = '';
      $('dl').setAttribute('aria-disabled', 'true'); $('gc').setAttribute('aria-disabled', 'true');
      return;
    }
    PITEMS = bridges(hols);
    $('s-p').textContent = PITEMS.length;
    $('p-sub').textContent = 'en ' + r.name;
    $('plist').innerHTML = PITEMS.map(function (it, k) { return item(it, hols, hd, 'p' + k, names(hols, it)); }).join('') || '<li class="empty">Sin puentes este año.</li>';

    VITEMS = plan(hols, S.n, 5);
    var b = VITEMS[0];
    $('vhead').innerHTML = b ? 'Con <b>' + b.cost + '</b> día' + (b.cost > 1 ? 's' : '') + ' de vacaciones te llevas <b>' + b.len + '</b> días libres seguidos.' : '';
    $('vlist').innerHTML = VITEMS.map(function (it, k) { return item(it, hols, hd, 'v' + k, names(hols, it) || 'Sin festivos en medio'); }).join('');

    // exportar
    if (icsUrl) URL.revokeObjectURL(icsUrl);
    var zn = z && S.zone ? z.options.filter(function (o) { return o.slug === S.zone; })[0] : null;
    var label = r.name + (zn ? ' · ' + zn.name : '');
    icsUrl = URL.createObjectURL(new Blob([ics(hols, label)], { type: 'text/calendar;charset=utf-8' }));
    var dl = $('dl');
    dl.href = icsUrl; dl.download = 'festivos-2027-' + S.region + (S.zone && S.zone !== 'general' ? '-' + S.zone : '') + '.ics';
    dl.removeAttribute('aria-disabled');
    var file = 'ics/' + S.region + (S.zone && S.zone !== 'general' ? '-' + S.zone : '') + '.ics';
    $('gc').href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent('webcal://' + HOST + BASE + file);
    $('gc').removeAttribute('aria-disabled');
  }

  function ics(hols, label) {
    var p = function (n) { return ('0' + n).slice(-2); };
    var ymd = function (i) { var d = new Date(Date.UTC(Y, 0, 1 + i)); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()); };
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + HOST + '//Calendario laboral 2027//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Festivos 2027 · ' + label];
    function ev(uid, s, e, name) {
      L.push('BEGIN:VEVENT', 'UID:' + uid + '@' + HOST, 'DTSTAMP:20261026T000000Z', 'DTSTART;VALUE=DATE:' + ymd(s), 'DTEND;VALUE=DATE:' + ymd(e + 1),
        'SUMMARY:' + name.replace(/[\\,;]/g, function (c) { return '\\' + c; }), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    hols.forEach(function (h) { var i = IDX[h.date]; ev(h.date.replace(/-/g, '') + '-' + h.kind + '-' + S.region, i, i, h.name); });
    // mis vacaciones: un evento por tramo (dos días de vacaciones con solo fines de semana o festivos en medio son el mismo tramo)
    var hd = offDays(hols).hd, blocks = [];
    Object.keys(S.vac).filter(function (d) { return S.vac[d] && IDX[d] != null; }).map(function (d) { return IDX[d]; })
      .sort(function (a, b) { return a - b; }).forEach(function (d) {
        var last = blocks[blocks.length - 1], joined = !!last;
        if (last) for (var g = last.e + 1; g < d; g++) if (!weekend(g) && !hd[ISO[g]]) joined = false;
        if (joined) last.e = d; else blocks.push({ s: d, e: d });
      });
    blocks.forEach(function (b) { ev('vac-' + ymd(b.s) + '-' + S.region, b.s, b.e, 'Vacaciones'); });
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
    loadVac();
  }
  function loadVac() {
    S.vac = {};
    try { (JSON.parse(get('vac.' + key()) || '[]') || []).forEach(function (d) { if (IDX[d] != null) S.vac[d] = 1; }); } catch (e) { S.vac = {}; }
  }
  function saveVac() { put('vac.' + key(), JSON.stringify(Object.keys(S.vac).filter(function (d) { return S.vac[d]; }))); }

  function setRegion(slug, push) {
    if (slug && !REG[slug]) return;
    S.region = slug || null; S.sel = null;
    put('region', slug || null);
    if (S.region) loadRegionState(); else { S.locals = ['', '']; loadVac(); }
    if (push !== false) {
      try { history.replaceState(null, '', S.region ? '?ccaa=' + slug + location.hash : location.pathname + location.hash); } catch (e) { /* file:// */ }
    }
    document.title = S.region ? 'Calendario laboral 2027 ' + REG[slug].name + ': festivos y puentes' : 'Calendario laboral 2027: festivos y puentes por comunidad';
    render();
  }

  var toastT = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ------------------------------------------------------------ eventos */
  $('region').addEventListener('change', function () { setRegion(this.value); });
  $('zone').addEventListener('change', function () {
    S.zone = this.value || null; S.sel = null;
    put('zone.' + S.region, S.zone);
    render();
  });

  function onPick(list) {
    return function (e) {
      var add = e.target.closest('[data-add]');
      if (add) {
        var it = list()[+add.getAttribute('data-add').slice(1)];
        it.take.forEach(function (x) { S.vac[ISO[x]] = 1; });
        saveVac(); render();
        toast('Añadido a tus vacaciones: ' + it.take.length + ' día' + (it.take.length > 1 ? 's' : ''));
        return;
      }
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var x = list()[+b.getAttribute('data-k').slice(1)];
      S.sel = same(S.sel, x) ? null : x;
      render();
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
      if (!S.region) { toast('Elige primero tu comunidad'); this.value = ''; S.locals[k] = ''; return; }
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

  // mis vacaciones
  $('vmode').addEventListener('click', function () {
    S.vmode = !S.vmode;
    this.setAttribute('aria-pressed', String(S.vmode));
    this.querySelector('span').textContent = S.vmode ? 'Listo' : 'Marcar días en el calendario';
    document.body.classList.toggle('vmode', S.vmode);
    $('vhint').hidden = !S.vmode;
    if (S.vmode) $('ano').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('year').addEventListener('click', function (e) {
    if (!S.vmode) return;
    var c = e.target.closest('b[data-d]');
    if (!c) return;
    var d = c.getAttribute('data-d'), i = IDX[d];
    if (weekend(i) || /\b(n|r|l)\b/.test(c.className)) return;
    if (S.vac[d]) delete S.vac[d]; else S.vac[d] = 1;
    saveVac(); render();
  });
  $('v-total').addEventListener('change', function () {
    S.vtot = Math.max(1, Math.min(40, parseInt(this.value, 10) || 22)); this.value = S.vtot; put('vtot', String(S.vtot)); paintVac();
  });
  $('vclear').addEventListener('click', function () { S.vac = {}; saveVac(); render(); toast('Vacaciones borradas'); });

  ['dl', 'gc'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (this.getAttribute('aria-disabled') === 'true') { e.preventDefault(); $('region').focus(); toast('Elige primero tu comunidad'); }
    });
  });
  $('pr').addEventListener('click', function () { window.print(); });
  $('sh').addEventListener('click', function () {
    var url = location.origin + BASE + (S.region ? '?ccaa=' + S.region : ''), title = document.title;
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () { /* cancelado */ }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Enlace copiado'); }, function () { toast(url); });
    else toast(url);
  });

  /* ------------------------------------------------------------ inicio */
  var q = null;
  try { q = new URLSearchParams(location.search).get('ccaa'); } catch (e) { q = null; }
  var n0 = parseInt(get('n'), 10);
  if (n0 >= 1 && n0 <= 30) { S.n = n0; $('vn').value = n0; }
  var t0 = parseInt(get('vtot'), 10);
  if (t0 >= 1 && t0 <= 40) { S.vtot = t0; $('v-total').value = t0; }
  var start = REG[q] ? q : (REG[get('region')] ? get('region') : null);
  setRegion(start, false);

  // para pruebas automáticas
  window.CL27 = { plan: function (n) { return plan(holidays(), n, 5); }, bridges: function () { return bridges(holidays()); }, holidays: holidays, iso: ISO, ics: function () { return ics(holidays(), 'test'); } };
})();
