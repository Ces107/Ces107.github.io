#!/usr/bin/env python3
"""Comprueba data/2027.json contra el BOE-A-2026-21254.  Uso: python test_data.py"""
import datetime as dt
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

data = build.load()
slugs = [r["slug"] for r in data["regions"]]
WD = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)


# 19 comunidades en el orden del BOE
check(slugs == ["andalucia", "aragon", "asturias", "baleares", "canarias", "cantabria", "castilla-la-mancha",
                "castilla-y-leon", "cataluna", "extremadura", "galicia", "madrid", "murcia", "navarra", "pais-vasco",
                "la-rioja", "comunitat-valenciana", "ceuta", "melilla"], "orden de comunidades")

for h in data["holidays"]:
    check(h["regions"] == "all" or all(s in slugs for s in h["regions"]), f"slug desconocido en {h}")
    check(dt.date.fromisoformat(h["date"]).year == 2027, f"año {h}")

# 12 festivos por comunidad. Canarias: 11 del BOE (el 30 de mayo cae en domingo) + 1 insular por isla.
for s in slugs:
    hols = build.region_holidays(data, s)
    dates = [h["date"] for h in hols]
    check(len(set(dates)) == len(dates), f"{s}: fechas repetidas")
    if s == "canarias":
        check(len(hols) == 11, f"canarias BOE: {len(hols)} != 11")
        for o in data["zones"]["canarias"]["options"]:
            n = len(build.region_holidays(data, s, o["slug"]))
            check(n == 12, f"canarias/{o['slug']}: {n} != 12")
    else:
        check(len(hols) == 12, f"{s}: {len(hols)} != 12")
    check(not any(h["date"] == "2027-08-15" for h in hols), f"{s}: 15 ago no es festivo en 2027")
check(len(build.region_holidays(data, "cataluna", "aran")) == 12, "Arán != 12")
check("2027-03-29" not in [h["date"] for h in build.region_holidays(data, "cataluna", "aran")], "Arán conserva el 29 mar")

# 9 comunes a las 19
check(sum(h["regions"] == "all" for h in data["holidays"]) == 9, "9 nacionales comunes")
# Jueves Santo en todas salvo Cataluña y C. Valenciana
js = next(h for h in data["holidays"] if h["date"] == "2027-03-25")
check(set(js["regions"]) == set(slugs) - {"cataluna", "comunitat-valenciana"}, "Jueves Santo")

# días de la semana
WEEKDAYS = {"2027-01-01": "vie", "2027-01-06": "mié", "2027-03-25": "jue", "2027-03-26": "vie", "2027-03-29": "lun",
            "2027-05-01": "sáb", "2027-08-15": "dom", "2027-08-16": "lun", "2027-09-11": "sáb", "2027-10-09": "sáb",
            "2027-10-12": "mar", "2027-11-01": "lun", "2027-12-06": "lun", "2027-12-08": "mié", "2027-12-25": "sáb",
            "2027-06-17": "jue", "2027-05-30": "dom"}
for d, w in WEEKDAYS.items():
    check(WD[dt.date.fromisoformat(d).weekday()] == w, f"{d} no es {w}")

# puentes: casos calculados a mano (Madrid)
mad = build.region_holidays(data, "madrid")
p = {(build.DAYS[i["s"]].isoformat(), build.DAYS[i["e"]].isoformat(), i["cost"]) for i in build.puentes(mad)}
for exp in [("2027-12-04", "2027-12-08", 1), ("2027-03-25", "2027-03-28", 0), ("2027-08-14", "2027-08-16", 0),
            ("2027-01-01", "2027-01-03", 0), ("2027-10-09", "2027-10-12", 1)]:
    check(exp in p, f"madrid puente {exp} no encontrado")

print(f"{len(fails)} fallos" if fails else "OK: 19 comunidades, 12 festivos cada una, días de la semana correctos")
for f in fails:
    print(" -", f)
sys.exit(1 if fails else 0)
