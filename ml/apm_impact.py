"""
apm_impact.py  --  enriched APM condition extract for the PPMS impact model
===========================================================================
Reads the APM database (apm-platform/public/apm.db) and, for every equipment
whose health is below the "healthy" band, emits a compact record with enough
condition detail for PPMS's Performance-Impact & Risk model to project the
plant-performance and economic impact (APC, heat rate, trip probability, ₹).

The heavy domain mapping (which KPI, how much, ₹) lives in the browser in
src/lib/impact.js — this script only surfaces the *condition* facts:
  worst binding sensor, how far into the alert->trip band, ETA-to-trip, the
  equipment type, its unit capacity, and whether it is redundant.

Run from the ppms project root:  python ml/apm_impact.py  [path/to/apm.db]
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

APM_DB = sys.argv[1] if len(sys.argv) > 1 else os.path.join("..", "apm-platform", "public", "apm.db")
OUT = os.path.join("public", "apm_impact.json")

# equipment that, on a protection trip, takes the whole unit down (non-redundant);
# everything else is typically N+1 and a single failure derates rather than trips.
CRITICAL_TYPES = {"TURBINE", "GENERATOR"}
VELOCITY_TAIL = 14   # recent readings used for the trip-velocity slope


def sensor_health(value, baseline, healthy_max):
    if healthy_max is None or healthy_max <= baseline:
        return 100.0
    dev = max(0.0, (value - baseline) / (healthy_max - baseline))
    return max(0.0, min(100.0, 100.0 * (1.0 - dev)))


def status_of(h):
    return "healthy" if h >= 80 else "warning" if h >= 60 else "alarm"


def slope_per_day(points):
    """least-squares slope (value per day) over [(ts, value), ...]."""
    n = len(points)
    if n < 2:
        return None
    tmean = sum(p[0] for p in points) / n
    vmean = sum(p[1] for p in points) / n
    num = sum((p[0] - tmean) * (p[1] - vmean) for p in points)
    den = sum((p[0] - tmean) ** 2 for p in points)
    if den == 0:
        return None
    return (num / den) * 86400.0


def main():
    if not os.path.exists(APM_DB):
        sys.exit(f"apm.db not found at {APM_DB} — pass the path as an argument.")
    con = sqlite3.connect(APM_DB)
    con.row_factory = sqlite3.Row

    weights = {}
    for r in con.execute("SELECT plant_id, skey, weight FROM weight"):
        weights.setdefault(r["plant_id"], {})[r["skey"]] = r["weight"]

    units_per_plant = {r["plant_id"]: r["n"] for r in
                       con.execute("SELECT plant_id, COUNT(*) n FROM unit GROUP BY plant_id")}
    plant_cap = {r["id"]: r["capacity_mw"] for r in con.execute("SELECT id, capacity_mw FROM plant")}

    equip = {}
    for r in con.execute("""
        SELECT e.id eid, e.type etype, e.name ename, u.plant_id, p.name pname
        FROM equipment e JOIN system sy ON sy.id = e.system_id
        JOIN unit u ON u.id = sy.unit_id JOIN plant p ON p.id = u.plant_id"""):
        # per-unit MW = plant capacity / units, clamped to a realistic unit size
        # (some demo plants divide into implausibly large "units", e.g. 2310 MW)
        cap = plant_cap.get(r["plant_id"], 0) / max(1, units_per_plant.get(r["plant_id"], 1))
        cap = max(100.0, min(800.0, cap))
        equip[r["eid"]] = {"name": r["ename"], "type": r["etype"], "plant_id": r["plant_id"],
                           "plant": r["pname"], "capacityMW": round(cap, 1), "sensors": {}}

    # latest reading per sensor (single shared time grid -> global MAX(ts))
    for r in con.execute("""
        SELECT s.id sid, s.equipment_id eid, s.skey, s.label, s.unit, s.baseline, s.healthy_max, s.trip_limit, r.value
        FROM sensor s JOIN reading r ON r.sensor_id = s.id
        WHERE r.ts = (SELECT MAX(ts) FROM reading)"""):
        e = equip.get(r["eid"])
        if e:
            e["sensors"][r["skey"]] = dict(r)

    issues = []
    for eid, e in equip.items():
        w = weights.get(e["plant_id"], {})
        num = den = 0.0
        worst = None
        for skey, s in e["sensors"].items():
            wt = w.get(skey, 0)
            if wt <= 0:
                continue
            sh = sensor_health(s["value"], s["baseline"], s["healthy_max"])
            num += wt * sh
            den += wt
            if worst is None or sh < worst["_h"]:
                worst = {**s, "_h": sh}
        if den == 0:
            continue
        health = num / den
        if health >= 80:            # only surface condition *issues*
            continue

        # distance into the alert->trip band, and ETA to the protection trip
        trip = worst["trip_limit"]
        alert = worst["healthy_max"]
        has_trip = trip is not None and trip < 9990
        band = (trip - alert) if (has_trip and trip > alert) else None
        dist_frac = max(0.0, min(1.2, (worst["value"] - alert) / band)) if band else None

        eta_days = None
        if has_trip:
            rows = con.execute("""
                SELECT r.ts, r.value FROM reading r JOIN sensor s ON s.id = r.sensor_id
                WHERE s.id = ? ORDER BY r.ts DESC LIMIT ?""", (worst["sid"], VELOCITY_TAIL)).fetchall()
            pts = [(rr["ts"], rr["value"]) for rr in reversed(rows)]
            per_day = slope_per_day(pts)
            if per_day and per_day > 0 and worst["value"] < trip:
                eta_days = round((trip - worst["value"]) / per_day, 1)

        issues.append({
            "eid": eid, "name": e["name"], "type": e["type"], "plant": e["plant"],
            "plantId": e["plant_id"], "capacityMW": e["capacityMW"],
            "health": round(health, 1), "status": status_of(health),
            "redundancy": "critical" if e["type"] in CRITICAL_TYPES else "redundant",
            "worst": {
                "skey": worst["skey"], "label": worst["label"], "unit": worst["unit"],
                "value": round(worst["value"], 2), "baseline": worst["baseline"],
                "healthyMax": alert, "tripLimit": trip if has_trip else None,
            },
            "tripSensor": has_trip,
            "distToTripFrac": round(dist_frac, 3) if dist_frac is not None else None,
            "etaTripDays": eta_days,
        })
    con.close()

    issues.sort(key=lambda i: i["health"])
    summary = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "apm-platform (condition-monitoring module)",
        "counts": {"issues": len(issues),
                   "alarms": sum(1 for i in issues if i["status"] == "alarm"),
                   "warnings": sum(1 for i in issues if i["status"] == "warning")},
        "issues": issues,
    }
    os.makedirs("public", exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Wrote {OUT}  ({len(issues)} condition issues)")
    for i in issues[:4]:
        print(f"  {i['name']} ({i['plant']}) {i['health']}% - {i['worst']['label']} "
              f"{i['worst']['value']}{i['worst']['unit'] or ''} -> trip {i['worst']['tripLimit']} "
              f"| dist {i['distToTripFrac']} | ETA {i['etaTripDays']}d | {i['redundancy']}")


if __name__ == "__main__":
    main()
