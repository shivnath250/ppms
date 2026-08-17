"""
apm_summary.py  --  APM condition-monitoring snapshot for the PPMS dashboard
============================================================================
Reads the sibling APM project's database (apm-platform/public/apm.db) and
computes a small fleet-health summary that the PPMS "Operations Excellence"
dashboard shows as its Condition-Monitoring highlights card — without PPMS
having to load the full ~19 MB apm.db in the browser.

Run from the ppms project root:
    python ml/apm_summary.py
    (optionally: python ml/apm_summary.py path/to/apm.db)

Health model mirrors apm-platform/src/health.js exactly:
  sensor health = 100 at baseline -> 0 at healthy_max (the alert limit)
  equipment health = weight-weighted average of scored sensors
  bands: >=80 healthy / 60-80 warning / <60 alarm
Weights come from apm.db's per-plant `weight` table.
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

APM_DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join("..", "apm-platform", "public", "apm.db")
OUT = os.path.join("public", "apm_summary.json")


def sensor_health(value, baseline, healthy_max):
    if healthy_max is None or healthy_max <= baseline:
        return 100.0
    dev = max(0.0, (value - baseline) / (healthy_max - baseline))
    return max(0.0, min(100.0, 100.0 * (1.0 - dev)))


def status_of(h):
    if h >= 80:
        return "healthy"
    if h >= 60:
        return "warning"
    return "alarm"


def main():
    if not os.path.exists(APM_DB):
        sys.exit(f"apm.db not found at {APM_DB} — pass the path as an argument.")
    con = sqlite3.connect(APM_DB)
    con.row_factory = sqlite3.Row

    # per-plant sensor weights (0 = context only, not scored)
    weights = {}
    for r in con.execute("SELECT plant_id, skey, weight FROM weight"):
        weights.setdefault(r["plant_id"], {})[r["skey"]] = r["weight"]

    # equipment -> plant lookup
    equip = {}
    for r in con.execute("""
        SELECT e.id eid, e.name ename, u.plant_id, p.name pname
        FROM equipment e JOIN system sy ON sy.id = e.system_id
        JOIN unit u ON u.id = sy.unit_id JOIN plant p ON p.id = u.plant_id"""):
        equip[r["eid"]] = {"name": r["ename"], "plant_id": r["plant_id"], "plant": r["pname"],
                           "sensors": []}

    # latest reading per sensor (all sensors share one time grid -> global MAX(ts))
    for r in con.execute("""
        SELECT s.equipment_id eid, s.skey, s.label, s.unit, s.baseline, s.healthy_max, r.value
        FROM sensor s JOIN reading r ON r.sensor_id = s.id
        WHERE r.ts = (SELECT MAX(ts) FROM reading)"""):
        e = equip.get(r["eid"])
        if e:
            e["sensors"].append(dict(r))
    con.close()

    rows = []
    for eid, e in equip.items():
        w = weights.get(e["plant_id"], {})
        num = den = 0.0
        worst = None
        for s in e["sensors"]:
            wt = w.get(s["skey"], 0)
            if wt <= 0:
                continue
            sh = sensor_health(s["value"], s["baseline"], s["healthy_max"])
            num += wt * sh
            den += wt
            if worst is None or sh < worst["health"]:
                worst = {"health": sh, "label": s["label"], "value": s["value"], "unit": s["unit"]}
        if den == 0:
            continue
        health = num / den
        rows.append({
            "eid": eid, "name": e["name"], "plant": e["plant"], "plantId": e["plant_id"],
            "health": round(health, 1), "status": status_of(health),
            "worstLabel": worst["label"] if worst else None,
            "worstValue": round(worst["value"], 1) if worst else None,
            "worstUnit": worst["unit"] if worst else None,
        })

    total = len(rows)
    alarms = sum(1 for r in rows if r["status"] == "alarm")
    warns = sum(1 for r in rows if r["status"] == "warning")
    fleet_health = round(sum(r["health"] for r in rows) / total, 1) if total else 100.0
    top = sorted(rows, key=lambda r: r["health"])[:8]

    summary = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "apm-platform (condition-monitoring module)",
        "fleetHealth": fleet_health,
        "counts": {"total": total, "alarms": alarms, "warns": warns,
                   "healthy": total - alarms - warns},
        "top": top,
    }

    os.makedirs("public", exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Wrote {OUT}")
    print(f"  Fleet health: {fleet_health}%  | equipment: {total}  "
          f"| alarms: {alarms}  warnings: {warns}")
    print(f"  Worst: {top[0]['name']} ({top[0]['plant']}) {top[0]['health']}% "
          f"— {top[0]['worstLabel']} {top[0]['worstValue']}{top[0]['worstUnit'] or ''}")


if __name__ == "__main__":
    main()
