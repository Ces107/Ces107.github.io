#!/usr/bin/env python3
"""Calendario laboral 2027 - generador.

Lee data/2027.json y escribe: index.html (app), <slug>/index.html (19 paginas SEO),
ics/*.ics, og/*.png, icons/*.png, sitemap.xml y sw.js.

    python build.py          # genera todo
    python build.py --no-img # sin regenerar PNG
"""
import datetime as dt
import hashlib
import html
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
# Where the site is served. Defaults: ces107.github.io/calendario-laboral-2027/. For the own domain:
#   CL_SITE=https://elcalendariolaboral.es CL_BASE=/ python build.py
SITE = os.environ.get("CL_SITE", "https://ces107.github.io").rstrip("/")
BASE = os.environ.get("CL_BASE", "/calendario-laboral-2027/")
HOST = SITE.split("://", 1)[1]
URL = SITE + BASE
YEAR = 2027
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]
MON3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
WD = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
WD3 = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
DAYS = [dt.date(YEAR, 1, 1) + dt.timedelta(i) for i in range(365)]
E = html.escape


def load():
    return json.loads((ROOT / "data" / "2027.json").read_text("utf-8"))


# ---------------------------------------------------------------- data logic

def region_holidays(data, slug, zone=None):
    """Festivos de una comunidad (y zona opcional: isla de Canarias, Arán)."""
    out = []
    for h in data["holidays"]:
        if h["regions"] == "all" or slug in h["regions"]:
            out.append({"date": h["date"], "name": h["name"], "code": h["code"],
                        "kind": "n" if h["regions"] == "all" else "r"})
    z = data["zones"].get(slug)
    if z and zone:
        opt = next(o for o in z["options"] if o["slug"] == zone)
        if "remove" in opt:
            out = [h for h in out if h["date"] != opt["remove"]]
        if "add" in opt:
            out.append({**opt["add"], "code": 3, "kind": "r"})
    out.sort(key=lambda h: h["date"])
    return out


def runs(off):
    """Tramos consecutivos [inicio, fin, libre]."""
    res, s = [], 0
    for i in range(1, len(off) + 1):
        if i == len(off) or off[i] != off[s]:
            res.append([s, i - 1, off[s]])
            s = i
    return res


def puentes(hols):
    """Fines de semana largos (0 dias) y puentes de 1-2 dias de vacaciones.
    Misma logica que app.js (bridges)."""
    hd = {h["date"] for h in hols}
    off = [d.weekday() >= 5 or d.isoformat() in hd for d in DAYS]
    rs = runs(off)

    def has_hol(r):
        return any(DAYS[i].isoformat() in hd for i in range(r[0], r[1] + 1))

    items, covered = [], set()
    for k, r in enumerate(rs):
        if r[2] and has_hol(r) and r[1] - r[0] + 1 >= 3:
            items.append({"s": r[0], "e": r[1], "cost": 0, "take": []})
            covered.add(k)
    for k, r in enumerate(rs):
        if not r[2] and r[1] - r[0] + 1 == 1 and 0 < k < len(rs) - 1:
            a, b = rs[k - 1], rs[k + 1]
            if has_hol(a) or has_hol(b):
                items.append({"s": a[0], "e": b[1], "cost": 1, "take": [r[0]]})
                covered.update(x for x, rr in ((k - 1, a), (k + 1, b)) if has_hol(rr))
    for k, r in enumerate(rs):
        if not r[2] and r[1] - r[0] + 1 == 2 and 0 < k < len(rs) - 1:
            a, b = rs[k - 1], rs[k + 1]
            hk = [x for x, rr in ((k - 1, a), (k + 1, b)) if has_hol(rr)]
            if hk and not all(x in covered for x in hk):
                items.append({"s": a[0], "e": b[1], "cost": 2, "take": [r[0], r[0] + 1]})
                covered.update(hk)
    items.sort(key=lambda it: (it["s"], it["e"]))
    for it in items:
        it["len"] = it["e"] - it["s"] + 1
        it["names"] = [h["name"] for h in hols if DAYS[it["s"]].isoformat() <= h["date"] <= DAYS[it["e"]].isoformat()]
    return items


def fmt_day(d, wd=True):
    return (WD3[d.weekday()] + " " if wd else "") + f"{d.day} {MON3[d.month - 1]}"


def fmt_range(i, j):
    a, b = DAYS[i], DAYS[j]
    if a.month == b.month:
        return f"{WD3[a.weekday()]} {a.day} – {WD3[b.weekday()]} {b.day} {MON3[b.month - 1]}"
    return f"{fmt_day(a)} – {fmt_day(b)}"


# ---------------------------------------------------------------- html parts

LOGO = ('<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" style="fill:var(--brand)"/>'
        '<rect x="6" y="8" width="16" height="14" rx="2.5" fill="none" style="stroke:#fff" stroke-width="2"/>'
        '<path d="M10 5.5v4M18 5.5v4M6 12.5h16" style="stroke:#fff" stroke-width="2" stroke-linecap="round"/>'
        '<rect x="9" y="15" width="4" height="4" rx="1" fill="#fff"/></svg>')
ICON_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
MONTHS_T = [m.capitalize() for m in MONTHS]
THEME_BTN = ('<button class="ib" id="theme" type="button" aria-label="Tema claro u oscuro">'
             '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>'
             '<path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg></button>')
HEAD_JS = ("<script>try{var t=localStorage.getItem('cl27.theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>")
THEME_JS = ("<script>(function(){var b=document.getElementById('theme');if(!b)return;b.onclick=function(){var r=document.documentElement,"
            "d=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches,n=d?'light':'dark';r.dataset.theme=n;"
            "try{localStorage.setItem('cl27.theme',n)}catch(e){}}})();"
            "if('serviceWorker'in navigator)addEventListener('load',function(){navigator.serviceWorker.register('" + BASE + "sw.js',{scope:'" + BASE + "'}).catch(function(){})});</script>")
ICON_DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ICON_G = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 12.5v5M9.5 15h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
ICON_PRINT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3.5h10V9M7 17H4.5V10a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7H17M7 14h10v6.5H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
ICON_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def legend(local=True, vac=False):
    li = ['<li><i class="sw n"></i>Nacional</li>', '<li><i class="sw r"></i>Comunidad</li>']
    if local:
        li.append('<li><i class="sw l"></i>Local</li>')
    if vac:
        li.append('<li><i class="sw v"></i>Vacaciones</li>')
    return '<ul class="legend">' + "".join(li) + "</ul>"


def workdays(m, hmap):
    first = dt.date(YEAR, m, 1)
    nd = ((dt.date(YEAR + (m == 12), m % 12 + 1, 1)) - first).days
    return sum(1 for d in range(nd) if (first + dt.timedelta(d)).weekday() < 5
               and (first + dt.timedelta(d)).isoformat() not in hmap)


def month_html(m, hmap):
    first = dt.date(YEAR, m, 1)
    nd = ((dt.date(YEAR + (m == 12), m % 12 + 1, 1)) - first).days
    cells = [f'<span class="wd">{c}</span>' for c in "LMXJVSD"]
    cells += ["<i></i>"] * first.weekday()
    for d in range(1, nd + 1):
        day = dt.date(YEAR, m, d)
        iso = day.isoformat()
        cls = []
        if day.weekday() >= 5:
            cls.append("we")
        t = ""
        if iso in hmap:
            cls.append(hmap[iso]["kind"])
            t = f' title="{E(hmap[iso]["name"])}"'
        c = f' class="{" ".join(cls)}"' if cls else ""
        cells.append(f'<b data-d="{iso}"{c}{t}>{d}</b>')
    cells += ["<i></i>"] * (42 - first.weekday() - nd)
    lis = "".join(f'<li><i class="sw {h["kind"]}"></i><b>{int(h["date"][8:])}</b><span>{E(h["name"])}</span></li>'
                  for iso, h in sorted(hmap.items()) if int(iso[5:7]) == m)
    return (f'<section class="m" id="m{m}" aria-label="{MONTHS[m - 1]}"><header><h3>{MONTHS_T[m - 1]}</h3>'
            f'<span class="lab"><b data-lab="{m}">{workdays(m, hmap)}</b> laborables</span></header>'
            f'<div class="g">{"".join(cells)}</div><ul class="hl">{lis}</ul></section>')


def hol_rows(hols):
    tag = {"n": "Nacional", "r": "Comunidad", "l": "Local"}
    return "".join(
        f'<tr><td class="dt"><b>{d.day}</b> {MON3[d.month - 1]}</td><td class="d">{WD[d.weekday()]}</td>'
        f'<td>{E(h["name"])}</td><td class="t"><span class="tag {h["kind"]}">{tag[h["kind"]]}</span></td></tr>'
        for h in hols for d in [dt.date.fromisoformat(h["date"])])


def year_html(hmap):
    return '<div class="year" id="year">' + "".join(month_html(m, hmap) for m in range(1, 13)) + "</div>"


def strip_html(it, hols):
    hd = {h["date"]: h["kind"] for h in hols}
    out = []
    for i in range(it["s"], it["e"] + 1):
        iso = DAYS[i].isoformat()
        out.append(f'<i class="{hd[iso]}"></i>' if iso in hd else ('<i class="w"></i>' if i in it["take"] else '<i class="o"></i>'))
    return '<span class="strip" aria-hidden="true">' + "".join(out) + "</span>"


def cost_html(c):
    return ('<span class="cost free">Sin gastar vacaciones</span>' if c == 0
            else f'<span class="cost">{c} día{"s" if c > 1 else ""} de vacaciones</span>')


def puente_li(it, hols):
    return (f'<li><div class="it"><span class="pl"><span class="when">{fmt_range(it["s"], it["e"])}</span>'
            f'<span class="what">{E(" · ".join(it["names"]))}</span></span>{strip_html(it, hols)}'
            f'<span class="pr"><b>{it["len"]}</b><span>días libres</span>{cost_html(it["cost"])}</span></div></li>')


def footer_html(data, current=None):
    cur = ' aria-current="page"'
    regs = "".join(f'<li><a href="{BASE}{r["slug"]}/"{cur if r["slug"] == current else ""}>{E(r["name"])}</a></li>'
                   for r in data["regions"])
    s = data["source"]
    return (f'<footer class="foot"><div class="wrap"><h2>Calendario laboral 2027 por comunidad</h2><ul class="regs">{regs}</ul>'
            f'<div class="fb"><p>Fuente oficial: <a href="{s["url"]}" rel="noopener">{s["id"]}</a>, {E(s["boe"])}. '
            f'Los 2 festivos locales los fija cada ayuntamiento.</p>'
            f'<p>Calendario laboral 2027 · <a href="https://ces107.github.io/">ces107.github.io</a></p></div></div></footer>')


def head_html(title, desc, canonical, og_img, extra=""):
    return f"""<!doctype html>
<html lang="es" data-base="{BASE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1220" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="Calendario laboral 2027">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{og_img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="{BASE}manifest.webmanifest">
<link rel="icon" href="{BASE}icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="{BASE}icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="{BASE}app.css?v={{CSSV}}">
{HEAD_JS}
{extra}
</head>
"""


def top_html(nav=True):
    links = ('<nav class="tn" aria-label="Secciones"><a href="#ano">Calendario</a><a href="#festivos">Festivos</a>'
             '<a href="#puentes">Puentes</a>' + ('<a href="#vacaciones">Vacaciones</a>' if nav == "app" else "") + '</nav>') if nav else ""
    return (f'<header class="bar"><div class="wrap bar-in"><a class="brand" href="{BASE}">{LOGO}<span>Calendario laboral <b>2027</b></span></a>'
            f'<span class="boe" title="Resolución de 8 de octubre de 2026 (BOE-A-2026-21254)">{ICON_CHECK}Datos oficiales · BOE</span>'
            f'{links}<span class="sp"></span>{THEME_BTN}</div></header>')


def ics_text(hols, label, slug_key):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{HOST}//Calendario laboral 2027//ES",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:Festivos 2027 · {label}"]
    for h in hols:
        d = dt.date.fromisoformat(h["date"])
        n = d + dt.timedelta(1)
        name = h["name"].replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
        lines += ["BEGIN:VEVENT", f"UID:{d:%Y%m%d}-{slug_key}@{HOST}", "DTSTAMP:20261026T000000Z",
                  f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{n:%Y%m%d}", f"SUMMARY:{name}",
                  "TRANSP:TRANSPARENT", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def gcal(ics_path):
    return "https://calendar.google.com/calendar/r?cid=" + quote("webcal://" + HOST + BASE + ics_path, safe="")


# ---------------------------------------------------------------- region page

def region_page(data, r):
    slug, name = r["slug"], r["name"]
    hols = region_holidays(data, slug)
    hmap = {}
    for h in hols:
        hmap.setdefault(h["date"], h)
    pts = puentes(hols)
    n_nat = sum(h["kind"] == "n" for h in hols)
    n_reg = len(hols) - n_nat
    zone = data["zones"].get(slug)
    is_can = slug == "canarias"
    count_txt = f"{len(hols)} + 1 insular" if is_can else str(len(hols))
    title = f"Calendario laboral 2027 {name}: festivos y puentes"
    desc = (f"Los festivos de 2027 en {r['official']}: {len(hols) + (1 if is_can else 0)} días con su día de la semana, "
            f"{len(pts)} puentes y planificador de vacaciones. Datos del BOE de 13-10-2026.")
    canon = f"{URL}{slug}/"
    events = [{"@type": "ListItem", "position": i + 1, "item": {
        "@type": "Event", "name": f"{h['name']} ({name})", "startDate": h["date"], "endDate": h["date"],
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": {"@type": "Place", "name": r["official"], "address": {"@type": "PostalAddress", "addressRegion": r["official"], "addressCountry": "ES"}},
        "description": f"Festivo laboral 2027 en {r['official']}"}} for i, h in enumerate(hols)]
    ld = [
        {"@context": "https://schema.org", "@type": "ItemList", "name": f"Festivos 2027 en {r['official']}",
         "numberOfItems": len(events), "itemListElement": events},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Calendario laboral 2027", "item": URL},
            {"@type": "ListItem", "position": 2, "name": name, "item": canon}]},
    ]
    ld_html = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in ld)

    rows = "".join(
        f'<tr><td>{d.day} {MON3[d.month - 1]}</td><td class="d">{WD[d.weekday()]}</td>'
        f'<td><i class="sw {h["kind"]}"></i>{E(h["name"])}</td></tr>'
        for h in hols for d in [dt.date.fromisoformat(h["date"])])
    zone_html = ""
    if zone:
        zrows = "".join(
            f'<tr><td>{d.day} {MON3[d.month - 1]}</td><td class="d">{WD[d.weekday()]}</td><td><b>{E(o["name"])}</b> · {E(o["add"]["name"])}</td></tr>'
            for o in zone["options"] if "add" in o for d in [dt.date.fromisoformat(o["add"]["date"])])
        zone_html = (f'<section class="blk" id="zona"><div class="bh"><h2>{"Fiesta de cada isla" if is_can else "Arán"}</h2></div>'
                     f'<div class="card tw"><table class="ht"><thead><tr><th>Fecha</th><th>Día</th><th>{"Isla" if is_can else "Festivo"}</th></tr></thead><tbody>{zrows}</tbody></table></div>'
                     f'<p class="note">{E(zone["note"])}</p></section>')
    plis = "".join(puente_li(it, hols) for it in pts) or '<li class="empty">—</li>'
    ics = f"ics/{slug}.ics"
    s = data["source"]
    body = f"""<body class="rp">
{top_html()}
<main class="wrap layout">
<aside class="side">
  <nav class="crumb" aria-label="Ruta"><a href="{BASE}">España</a><span>/</span>{E(name)}</nav>
  <h1><span class="k">Calendario laboral 2027</span>{E(name)}</h1>
  <p class="intro">{len(hols) + (1 if is_can else 0)} festivos en {E(r["official"])}: {n_nat} nacionales y {len(hols) - n_nat + (1 if is_can else 0)} de la comunidad{" (uno, el de tu isla)" if is_can else ""}, más los 2 locales de tu municipio.</p>
  <dl class="sum">
    <div><dt>Festivos</dt><dd>{len(hols) + (1 if is_can else 0)}</dd></div>
    <div><dt>Laborables</dt><dd>{sum(workdays(m, hmap) for m in range(1, 13)) - (1 if is_can else 0)}</dd></div>
    <div><dt>Puentes</dt><dd>{len(pts)}</dd></div>
  </dl>
  {legend(local=False)}
  <div class="acts">
    <a class="btn p" href="{BASE}?ccaa={slug}">{ICON_OPEN}Abrir el calendario interactivo</a>
    <a class="btn" href="{gcal(ics)}" rel="noopener">{ICON_G}Añadir a Google Calendar</a>
    <a class="btn" href="{BASE}{ics}" download>{ICON_DL}Descargar .ics</a>
  </div>
</aside>
<div class="content">
<section class="blk" id="festivos"><div class="bh"><h2>Festivos de 2027 en {E(name)}</h2></div>
<div class="card tw"><table class="ht"><thead><tr><th>Fecha</th><th>Día</th><th>Festivo</th><th class="t">Tipo</th></tr></thead><tbody>{hol_rows(hols)}</tbody></table></div>
<p class="note">Fuente: <a href="{s["url"]}" rel="noopener">{s["id"]}</a>, {E(s["boe"])}. Faltan los 2 festivos locales de cada municipio.</p></section>
{zone_html}
<section class="blk" id="puentes"><div class="bh"><h2>Puentes de 2027</h2><p>Días libres seguidos y lo que cuestan en vacaciones.</p></div><ul class="plist card">{plis}</ul></section>
<section class="blk" id="ano"><div class="bh"><h2>Calendario 2027</h2>{legend(local=False)}</div>{year_html(hmap)}</section>
</div>
</main>
{footer_html(data, slug)}
{THEME_JS}
</body>
</html>
"""
    return head_html(title, desc, canon, f"{URL}og/{slug}.png", ld_html) + body


# ---------------------------------------------------------------- app page

def app_page(data):
    nat = [h for h in region_holidays(data, "madrid") if h["kind"] == "n"]
    hmap = {h["date"]: h for h in nat}
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    options = "".join(f'<option value="{r["slug"]}">{E(r["name"])}</option>' for r in data["regions"])
    s = data["source"]
    title = "Calendario laboral 2027: festivos y puentes por comunidad"
    desc = ("Calendario laboral 2027 de tu comunidad: los 12 festivos del BOE, tus 2 locales, puentes y "
            "el planificador de vacaciones que te dice cuántos días libres sacas. Exporta a Google Calendar.")
    ld = {"@context": "https://schema.org", "@type": "WebApplication", "name": "Calendario laboral 2027", "url": URL,
          "applicationCategory": "UtilitiesApplication", "operatingSystem": "Web, Android", "inLanguage": "es",
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"}, "description": desc}
    ld_html = f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
    body = f"""<body class="app">
{top_html("app")}
<main class="wrap layout">
<aside class="side" id="side">
  <h1><span class="k">Calendario laboral 2027</span><span id="rn">España</span></h1>
  <div class="field"><label for="region">Comunidad autónoma</label>
    <select id="region"><option value="">Elige tu comunidad…</option>{options}</select></div>
  <div class="field" id="zone-f" hidden><label for="zone" id="zone-l">Zona</label><select id="zone"></select></div>
  <div class="next card" id="next" aria-live="polite"><span class="k">Próximo festivo</span><b id="nx-name">–</b><span id="nx-date"></span><em id="nx-in"></em></div>
  <dl class="sum">
    <div><dt>Festivos</dt><dd id="s-f">9</dd></div>
    <div><dt>Laborables</dt><dd id="s-lab">–</dd></div>
    <div><dt>Puentes</dt><dd id="s-p">–</dd></div>
  </dl>
  <div class="acts">
    <a class="btn p" id="gc" href="#" rel="noopener" target="_blank">{ICON_G}Añadir a Google Calendar</a>
    <div class="row"><a class="btn" id="dl" href="#" download="festivos-2027.ics">{ICON_DL}.ics</a>
    <button class="btn" type="button" id="pr">{ICON_PRINT}Imprimir</button>
    <button class="btn" type="button" id="sh">{ICON_SHARE}Compartir</button></div>
  </div>
  <div class="box card">
    <div class="bx-h"><span>Mis festivos locales</span><b id="s-l">0/2</b></div>
    <div class="locs"><div class="loc"><input type="date" id="l0" min="2027-01-01" max="2027-12-31" aria-label="Festivo local 1"><button type="button" data-clear="0" aria-label="Quitar">×</button></div>
    <div class="loc"><input type="date" id="l1" min="2027-01-01" max="2027-12-31" aria-label="Festivo local 2"><button type="button" data-clear="1" aria-label="Quitar">×</button></div></div>
  </div>
  <div class="box card">
    <div class="bx-h"><span>Mis vacaciones</span><b><span id="v-used">0</span> / <input id="v-total" type="number" min="1" max="40" value="22" aria-label="Días de vacaciones al año"></b></div>
    <div class="meter"><i id="v-bar"></i></div>
    <button class="btn wide" type="button" id="vmode" aria-pressed="false">{ICON_CHECK}<span>Marcar días en el calendario</span></button>
    <button class="lnk" type="button" id="vclear" hidden>Borrar mis vacaciones</button>
  </div>
</aside>
<div class="content">
<section class="blk" id="ano"><div class="bh"><h2>Calendario 2027</h2>{legend(local=True, vac=True)}</div>
<p class="hint" id="vhint" hidden>Toca los días laborables que vas a coger de vacaciones. Vuelve a tocar para quitarlos.</p>
{year_html(hmap)}</section>
<section class="blk" id="festivos"><div class="bh"><h2>Festivos de 2027 <small id="f-sub">en toda España</small></h2></div>
<div class="card tw"><table class="ht"><thead><tr><th>Fecha</th><th>Día</th><th>Festivo</th><th class="t">Tipo</th></tr></thead><tbody id="ftab">{hol_rows(nat)}</tbody></table></div>
<p class="note">Fuente: <a href="{s["url"]}" rel="noopener">{s["id"]}</a>, {E(s["boe"])}.</p></section>
<section class="blk" id="puentes"><div class="bh"><h2>Puentes <small id="p-sub"></small></h2><p>Toca uno para verlo en el calendario o añadirlo a tus vacaciones.</p></div>
<ul class="plist card" id="plist"><li class="empty">Elige tu comunidad para ver sus puentes.</li></ul></section>
<section class="blk" id="vacaciones"><div class="bh"><h2>Planificador de vacaciones</h2><p>Dinos cuántos días quieres coger y te decimos dónde rinden más.</p></div>
  <div class="card plan">
    <div class="step"><button type="button" id="vm" aria-label="Menos días">−</button><input id="vn" type="number" inputmode="numeric" min="1" max="30" value="4" aria-label="Días de vacaciones"><button type="button" id="vp" aria-label="Más días">+</button><label for="vn">días de vacaciones</label></div>
    <p class="head" id="vhead" aria-live="polite"></p>
  </div>
  <ul class="plist card" id="vlist"></ul>
</section>
</div>
</main>
{footer_html(data)}
<div class="toast" id="toast" role="status" hidden></div>
<script id="cal-data" type="application/json">{compact}</script>
<script src="{BASE}app.js?v={{JSV}}"></script>
{THEME_JS}
</body>
</html>
"""
    return head_html(title, desc, URL, f"{URL}og/espana.png", ld_html) + body


# ---------------------------------------------------------------- images

def font(size, weight="b"):
    from PIL import ImageFont
    names = {"b": ["segoeuib.ttf", "DejaVuSans-Bold.ttf"], "bl": ["seguibl.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf"],
             "r": ["segoeui.ttf", "DejaVuSans.ttf"], "sb": ["seguisb.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf"]}[weight]
    for n in names:
        for p in (Path("C:/Windows/Fonts") / n, Path("/usr/share/fonts/truetype/dejavu") / n):
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


INK, BG, MUT, LINE = (16, 24, 40), (246, 247, 249), (102, 112, 133), (228, 231, 236)
NAT, REG, BRAND = (192, 54, 44), (46, 91, 186), (14, 110, 92)


def og_image(path, label, sub, hols):
    from PIL import Image, ImageDraw
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((64, 64), "CALENDARIO LABORAL", font=font(30, "b"), fill=MUT)
    d.text((64, 100), "2027", font=font(150, "bl"), fill=INK)
    size = 84 if len(label) <= 12 else (64 if len(label) <= 18 else 52)
    d.text((64, 300), label, font=font(size, "bl"), fill=INK)
    d.text((64, 420), sub, font=font(34, "sb"), fill=MUT)
    d.rounded_rectangle((64, 500, 64 + 26, 526), 5, fill=NAT)
    d.text((102, 496), "España", font=font(26, "sb"), fill=INK)
    d.ellipse((240, 500, 266, 526), fill=REG)
    d.text((278, 496), "Comunidad", font=font(26, "sb"), fill=INK)
    d.text((64, 568), (HOST + BASE).rstrip("/"), font=font(24, "r"), fill=MUT)
    # 12 mini months (3 cols x 4 rows)
    kind = {h["date"]: h["kind"] for h in hols}
    x0, y0, cw, ch, c, gx, gy = 740, 56, 13, 13, 3, 30, 30
    mw = 7 * (cw + c)
    for m in range(12):
        col, row = m % 3, m // 3
        ox = x0 + col * (mw + gx)
        oy = y0 + row * (6 * (ch + c) + gy + 22)
        d.text((ox, oy - 2), MONTHS[m][:3].upper(), font=font(16, "b"), fill=MUT)
        first = dt.date(YEAR, m + 1, 1)
        nd = ((dt.date(YEAR + (m == 11), (m + 1) % 12 + 1, 1)) - first).days
        for dd in range(nd):
            day = first + dt.timedelta(dd)
            idx = first.weekday() + dd
            cx, cy = ox + (idx % 7) * (cw + c), oy + 22 + (idx // 7) * (ch + c)
            k = kind.get(day.isoformat())
            if k == "n":
                d.rounded_rectangle((cx, cy, cx + cw, cy + ch), 3, fill=NAT)
            elif k == "r":
                d.ellipse((cx - 1, cy - 1, cx + cw + 1, cy + ch + 1), fill=REG)
            else:
                d.rounded_rectangle((cx, cy, cx + cw, cy + ch), 3, fill=(205, 202, 194) if day.weekday() >= 5 else LINE)
    im = im.quantize(colors=48, method=Image.Quantize.MEDIANCUT)
    im.save(path, optimize=True)


def icons(out):
    from PIL import Image, ImageDraw

    def draw(size, maskable=False, bg_full=False):
        S = 4 * size
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        if maskable or bg_full:
            d.rectangle((0, 0, S, S), fill=BRAND)
            pad = int(S * (0.22 if maskable else 0.14))
        else:
            d.rounded_rectangle((0, 0, S - 1, S - 1), int(S * 0.22), fill=BRAND)
            pad = int(S * 0.16)
        x0, y0, x1, y1 = pad, int(pad * 1.25), S - pad, S - pad
        w = x1 - x0
        d.rounded_rectangle((x0, y0, x1, y1), int(w * 0.14), fill=BG)
        rw = int(w * 0.09)
        for fx in (0.27, 0.73):
            cx = x0 + int(w * fx)
            d.rounded_rectangle((cx - rw // 2, y0 - int(w * 0.12), cx + rw // 2, y0 + int(w * 0.12)), rw // 2, fill=BG)
        # 3x2 grid of day tiles
        g0x, g0y = x0 + int(w * 0.14), y0 + int((y1 - y0) * 0.26)
        tw = int(w * 0.2)
        gap = int(w * 0.07)
        for i in range(6):
            cx, cy = g0x + (i % 3) * (tw + gap), g0y + (i // 3) * (tw + gap)
            if i == 1:
                d.rounded_rectangle((cx, cy, cx + tw, cy + tw), int(tw * 0.22), fill=NAT)
            elif i == 5:
                d.ellipse((cx, cy, cx + tw, cy + tw), fill=REG)
            else:
                d.rounded_rectangle((cx, cy, cx + tw, cy + tw), int(tw * 0.22), fill=LINE)
        return im.resize((size, size), Image.LANCZOS)

    draw(192).save(out / "icon-192.png", optimize=True)
    draw(512).save(out / "icon-512.png", optimize=True)
    draw(512, maskable=True).save(out / "maskable-512.png", optimize=True)
    draw(180, bg_full=True).convert("RGB").save(out / "apple-touch-icon.png", optimize=True)


# ---------------------------------------------------------------- main

def short_hash(*paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(Path(p).read_bytes())
    return h.hexdigest()[:10]


def main():
    data = load()
    cssv, jsv = short_hash(ROOT / "app.css"), short_hash(ROOT / "app.js")
    fix = lambda s: s.replace("{CSSV}", cssv).replace("{JSV}", jsv)

    (ROOT / "index.html").write_text(fix(app_page(data)), "utf-8", newline="\n")
    for r in data["regions"]:
        d = ROOT / r["slug"]
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(fix(region_page(data, r)), "utf-8", newline="\n")

    ics = ROOT / "ics"
    ics.mkdir(exist_ok=True)
    for r in data["regions"]:
        (ics / f"{r['slug']}.ics").write_bytes(ics_text(region_holidays(data, r["slug"]), r["name"], r["slug"]).encode("utf-8"))
        for o in data["zones"].get(r["slug"], {}).get("options", []):
            if "add" in o:
                k = f"{r['slug']}-{o['slug']}"
                (ics / f"{k}.ics").write_bytes(ics_text(region_holidays(data, r["slug"], o["slug"]), f"{r['name']} · {o['name']}", k).encode("utf-8"))

    if "--no-img" not in sys.argv:
        (ROOT / "og").mkdir(exist_ok=True)
        (ROOT / "icons").mkdir(exist_ok=True)
        nat = [h for h in region_holidays(data, "madrid") if h["kind"] == "n"]
        og_image(ROOT / "og" / "espana.png", "Festivos y puentes", "19 comunidades · BOE 13-10-2026", nat)
        for r in data["regions"]:
            hols = region_holidays(data, r["slug"])
            n = len(hols) + (1 if r["slug"] == "canarias" else 0)
            og_image(ROOT / "og" / f"{r['slug']}.png", r["name"], f"{n} festivos · {len(puentes(hols))} puentes", hols)
        icons(ROOT / "icons")

    urls = [URL] + [f"{URL}{r['slug']}/" for r in data["regions"]]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f"  <url><loc>{u}</loc><lastmod>{data['updated']}</lastmod><changefreq>monthly</changefreq><priority>{'1.0' if u == URL else '0.8'}</priority></url>" for u in urls]
    sm.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sm) + "\n", "utf-8", newline="\n")

    manifest = {
        "name": "Calendario laboral 2027", "short_name": "Laboral 2027", "lang": "es",
        "description": "Festivos, puentes y vacaciones 2027 por comunidad.",
        "id": BASE, "start_url": BASE + "?source=pwa", "scope": BASE, "display": "standalone",
        "background_color": "#f6f7f9", "theme_color": "#0e6e5c", "categories": ["productivity", "utilities"],
        "icons": [{"src": BASE + "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": BASE + "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": BASE + "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
    }
    (ROOT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")

    ver = short_hash(ROOT / "index.html", ROOT / "app.css", ROOT / "app.js", ROOT / "data" / "2027.json")
    shell = [BASE, f"{BASE}app.css?v={cssv}", f"{BASE}app.js?v={jsv}", f"{BASE}manifest.webmanifest",
             f"{BASE}icons/icon-192.png", f"{BASE}icons/icon-512.png"]
    sw = (ROOT / "sw.src.js").read_text("utf-8").replace("__VERSION__", ver).replace("__SHELL__", json.dumps(shell))
    (ROOT / "sw.js").write_text(sw, "utf-8", newline="\n")
    print(f"ok · {len(urls)} urls · sw {ver}")


if __name__ == "__main__":
    main()
