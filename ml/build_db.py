"""
build_db.py  --  builds public/ppms.db from domain.py + kpis.py
===============================================================
Run from project root:   python ml/build_db.py

Creates the read-only seed database the React app loads in the browser
(via sql.js). Live changes during a session are layered on top in
localStorage by src/data/repository.js.
"""

import os
import sqlite3
import numpy as np
import pandas as pd

import domain as D
import kpis as K

DB_PATH = "public/ppms.db"
SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")

SEV_ORDER = ["Low", "Medium", "High", "Critical"]
STATUSES = ["Open", "Under Investigation", "Action Initiated", "Awaiting Verification", "Closed"]

rng = np.random.default_rng(20260701)   # reproducible seed


def epoch(ts):
    return int(pd.Timestamp(ts).value // 10**9)


NOW = epoch(D.END_DATE)
DAY = 86400


def severity_from_dev(kpi, benchmark, actual):
    """Classify severity from how far actual deviates from benchmark, in the
    'bad' direction, relative to the KPI's critical threshold."""
    direction = next(k["direction"] for k in D.KPIS if k["key"] == kpi)
    crit = next(k["critical_pct"] for k in D.KPIS if k["key"] == kpi)
    if benchmark == 0:
        return "Medium"
    dev = (actual - benchmark) / abs(benchmark)
    bad = dev if direction == "lower" else -dev   # positive = worse than benchmark
    if bad >= crit:
        return "Critical"
    if bad >= crit * 0.6:
        return "High"
    if bad >= crit * 0.3:
        return "Medium"
    return "Low"


# templated engineering text so seeded responses read like real RCA -----------
RCA_TEMPLATES = {
    "CONDENSER": "Condenser vacuum deteriorated due to air ingress at LP turbine gland and partial CW tube fouling.",
    "APH": "Air preheater basket fouling raised flue-gas exit temperature, increasing dry-flue-gas loss.",
    "ID_FAN": "ID fan operating at high loading following flue-gas path resistance and damper characterisation drift.",
    "MILL": "Mill fineness and reject rate deteriorated with harder coal, raising unburnt carbon and specific coal consumption.",
    "TURBINE": "HP turbine stage efficiency reduced; gland steam leakage and deposit build-up on blading indicated.",
}
ACTION_TEMPLATES = {
    "CONDENSER": "Attended LP gland sealing, planned online condenser tube cleaning; vacuum improving.",
    "APH": "Soot-blowing frequency increased; APH offline water-wash scheduled at next opportunity.",
    "ID_FAN": "Damper re-characterised and flue-gas path inspected; fan loading normalised.",
    "MILL": "Mill internals inspected, classifier vanes reset, coal blending revised to arrest GCV drop.",
    "TURBINE": "Gland steam parameters corrected; efficiency test scheduled to quantify recovery.",
}
DEFAULT_RCA = "Root cause traced to the flagged parameter deviation; investigation and corrective action in progress."
DEFAULT_ACTION = "Corrective action initiated by the department; parameter being trended toward benchmark."


def main():
    os.makedirs("public", exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    with open(SCHEMA) as f:
        cur.executescript(f.read())

    # ---- sites, units, departments, equipment -----------------------------
    for s in D.SITES:
        cur.execute("INSERT INTO site VALUES(?,?,?,?,?)",
                    (s["id"], s["name"], s["state"], s["region"], s["capacity_mw"]))
        for u in range(1, s["units"] + 1):
            cur.execute("INSERT INTO unit VALUES(?,?,?,?)",
                        (f"{s['id']}-U{u}", s["id"], f"Unit {u}", s["capacity_mw"] // s["units"]))

    for d in D.DEPARTMENTS:
        cur.execute("INSERT INTO department VALUES(?,?)", (d["id"], d["name"]))

    equip_by_dept = {}
    for s in D.SITES:
        for u in range(1, s["units"] + 1):
            uid = f"{s['id']}-U{u}"
            for dept, ekey, label, _aux in D.EQUIPMENT:
                eid = f"{uid}-{ekey}"
                cur.execute("INSERT INTO equipment VALUES(?,?,?,?,?)", (eid, uid, dept, ekey, label))
                equip_by_dept.setdefault((s["id"], dept), []).append((eid, ekey, label))

    # ---- users -------------------------------------------------------------
    users = []  # (id, name, email, role, site_id, dept_id, title, password)
    users.append(("u_corp_1", "Ananya Rao",  "ananya.rao@corp.btp.in",  "corporate", None, None, "Performance Analytics Engineer", "demo1234"))
    users.append(("u_corp_2", "Vikram Nair", "vikram.nair@corp.btp.in", "corporate", None, None, "Sr. Performance Analytics Engineer", "demo1234"))
    # regional performance heads (escalation L3 recipients, corporate side)
    for region in sorted({s["region"] for s in D.SITES}):
        rid = f"u_region_{region.lower()}"
        users.append((rid, f"{region} Regional Head", f"{region.lower()}.head@corp.btp.in",
                      "corporate", None, None, "Regional Performance Head", "demo1234"))
    # per-site plant users: one Plant Head + one engineer per department
    for s in D.SITES:
        users.append((f"u_{s['id']}_HEAD", f"{s['name']} Plant Head",
                      f"planthead.{s['id'].lower()}@btp.in", "plant", s["id"], "OPS",
                      "Plant Head", "demo1234"))
        for d in D.DEPARTMENTS:
            users.append((f"u_{s['id']}_{d['id']}", f"{s['name']} {d['name']} Engr",
                          f"{d['id'].lower()}.{s['id'].lower()}@btp.in", "plant", s["id"], d["id"],
                          f"{d['name']} Engineer / Dept Head", "demo1234"))
    cur.executemany("INSERT INTO app_user VALUES(?,?,?,?,?,?,?,?)", users)

    dept_user = {(sid, did): f"u_{sid}_{did}" for s in D.SITES for sid in [s["id"]] for d in D.DEPARTMENTS for did in [d["id"]]}
    plant_head = {s["id"]: f"u_{s['id']}_HEAD" for s in D.SITES}

    # ---- KPI definitions + readings ---------------------------------------
    for k in D.KPIS:
        cur.execute("INSERT INTO kpi_definition VALUES(?,?,?,?,?,?,?)",
                    (k["key"], k["label"], k["unit"], k["benchmark"], k["direction"], k["critical_pct"], k["dept"]))

    index = K.daily_index()
    kpi_rows, series = K.generate(index)
    cur.executemany("INSERT INTO kpi_reading VALUES(?,?,?,?,?,?)", kpi_rows)

    # ---- SLA rules ---------------------------------------------------------
    for r in D.SLA_RULES:
        cur.execute("INSERT INTO sla_rule VALUES(?,?,?,?)", (r["days"], r["level"], r["role"], r["label"]))

    # ---- issues ------------------------------------------------------------
    issues, responses, comments, audits, notifs = [], [], [], [], []
    seq = 0
    kpi_bench = {k["key"]: k["benchmark"] for k in D.KPIS}
    kpi_label = {k["key"]: k["label"] for k in D.KPIS}
    kpi_unit = {k["key"]: k["unit"] for k in D.KPIS}

    def new_id(prefix):
        nonlocal seq
        seq += 1
        return f"{prefix}-{seq:04d}"

    def add_audit(iid, user, ts, field, old, new, comment=""):
        audits.append((new_id("AUD"), "issue", iid, user, ts, field, str(old) if old is not None else None,
                       str(new) if new is not None else None, comment))

    def add_issue(site, unit_no, dept, equipment_id, kpi_key, severity, title, observation,
                  bench, actual, deviation, impact, created_at, status, progress, closed_at=None):
        iid = new_id("ISS")
        unit_id = f"{site}-U{unit_no}" if unit_no else None
        target = created_at + int(rng.integers(7, 16)) * DAY
        creator = "u_corp_1" if rng.random() < 0.5 else "u_corp_2"
        issues.append((iid, site, unit_id, dept, equipment_id, kpi_key, severity, title, observation,
                       bench, actual, deviation, impact, target, creator, created_at, status, progress, 0, closed_at))
        # audit: creation + assignment
        add_audit(iid, creator, created_at, "status", None, "Open", "Issue raised from KPI deviation")
        add_audit(iid, creator, created_at, "assignment", None, f"{site}/{dept}", "Auto-routed to responsible department")
        # notify the assigned department engineer
        recipient = dept_user.get((site, dept))
        if recipient:
            notifs.append((new_id("NTF"), recipient, iid, "assigned", "inapp",
                           f"New issue assigned: {title}", observation, 0, created_at))
            notifs.append((new_id("NTF"), recipient, iid, "assigned", "email",
                           f"[PPMS] Issue {iid} assigned to your department", observation, 0, created_at))
        return iid, unit_id, creator, recipient

    def advance(iid, recipient, creator, ekey, created_at, status, closed_at):
        """Add responses/audit consistent with a non-Open status."""
        if status == "Open":
            return
        t = created_at + int(rng.integers(1, 3)) * DAY
        add_audit(iid, recipient, t, "status", "Open", "Under Investigation", "Investigation started")
        if status in ("Action Initiated", "Awaiting Verification", "Closed"):
            t2 = t + int(rng.integers(1, 4)) * DAY
            responses.append((new_id("RSP"), iid, recipient,
                              RCA_TEMPLATES.get(ekey, DEFAULT_RCA),
                              ACTION_TEMPLATES.get(ekey, DEFAULT_ACTION),
                              "Revise inspection frequency and update operating checklist to prevent recurrence.",
                              t2 + 5 * DAY, "Action Initiated", t2))
            add_audit(iid, recipient, t2, "status", "Under Investigation", "Action Initiated", "RCA + corrective action submitted")
        if status in ("Awaiting Verification", "Closed"):
            t3 = created_at + int(rng.integers(4, 8)) * DAY
            add_audit(iid, recipient, t3, "progress_pct", "40", "90", "Action largely complete")
            add_audit(iid, recipient, t3, "status", "Action Initiated", "Awaiting Verification", "Requested closure verification")
        if status == "Closed":
            ct = closed_at or (created_at + int(rng.integers(6, 14)) * DAY)
            add_audit(iid, creator, ct, "status", "Awaiting Verification", "Closed", "Verified and accepted by corporate")
            notifs.append((new_id("NTF"), recipient, iid, "closed", "inapp",
                           "Issue closed", "Corporate accepted the corrective action.", 0, ct))

    # 1) one issue per seeded deviation (the explainable, chart-linked ones) --
    dev_statuses = ["Open", "Under Investigation", "Action Initiated", "Awaiting Verification", "Under Investigation", "Open"]
    for i, dev in enumerate(D.DEVIATIONS):
        arr = series[(dev["site"], f"{dev['site']}-U{dev['unit']}", dev["kpi"])]
        actual = round(float(arr[-1]), 2)
        bench = kpi_bench[dev["kpi"]]
        deviation = round(actual - bench, 2)
        sev = severity_from_dev(dev["kpi"], bench, actual)
        eid = f"{dev['site']}-U{dev['unit']}-{dev['equipment']}"
        title = f"Unit-{dev['unit']} {kpi_label[dev['kpi']]} deviation"
        obs = (f"{kpi_label[dev['kpi']]} at {actual} {kpi_unit[dev['kpi']]} vs benchmark {bench} "
               f"{kpi_unit[dev['kpi']]} over the last {dev['days']} days, attributed to {dev['cause']}.")
        impact = f"~{abs(deviation)*0.4:.1f} MU/month generation-cost impact at risk" if dev["kpi"] in ("gross_heat_rate", "turbine_hr", "sp_coal") else "Availability / efficiency impact under assessment"
        created = NOW - int(rng.integers(3, 18)) * DAY
        status = dev_statuses[i % len(dev_statuses)]
        progress = {"Open": 0, "Under Investigation": 25, "Action Initiated": 55, "Awaiting Verification": 90}.get(status, 0)
        iid, uid, creator, recipient = add_issue(dev["site"], dev["unit"], dev["dept"], eid, dev["kpi"],
                                                  sev, title, obs, bench, actual, deviation, impact, created, status, progress)
        advance(iid, recipient, creator, dev["equipment"], created, status, None)

    # 2) ~36 more historical issues for realistic dashboards -----------------
    kpi_keys = [k["key"] for k in D.KPIS]
    for _ in range(36):
        s = D.SITES[int(rng.integers(0, len(D.SITES)))]
        unit_no = int(rng.integers(1, s["units"] + 1))
        kpi_key = kpi_keys[int(rng.integers(0, len(kpi_keys)))]
        dept = next(k["dept"] for k in D.KPIS if k["key"] == kpi_key)
        eqs = equip_by_dept.get((s["id"], dept)) or equip_by_dept.get((s["id"], "MNT"))
        eid, ekey, elabel = eqs[int(rng.integers(0, len(eqs)))]
        bench = kpi_bench[kpi_key]
        direction = next(k["direction"] for k in D.KPIS if k["key"] == kpi_key)
        crit = next(k["critical_pct"] for k in D.KPIS if k["key"] == kpi_key)
        bad = rng.uniform(0.2, 1.3) * crit
        actual = round(bench * (1 + bad) if direction == "lower" else bench * (1 - bad), 2)
        deviation = round(actual - bench, 2)
        sev = severity_from_dev(kpi_key, bench, actual)
        created = NOW - int(rng.integers(2, D.HISTORY_DAYS)) * DAY
        # older issues are more likely resolved
        age_days = (NOW - created) / DAY
        r = rng.random()
        if age_days > 25:
            status = "Closed" if r < 0.8 else "Awaiting Verification"
        elif age_days > 10:
            status = ["Closed", "Awaiting Verification", "Action Initiated", "Under Investigation"][int(rng.integers(0, 4))]
        else:
            status = ["Open", "Under Investigation", "Action Initiated"][int(rng.integers(0, 3))]
        progress = {"Open": 0, "Under Investigation": 30, "Action Initiated": 60, "Awaiting Verification": 90, "Closed": 100}[status]
        # resolution time: ~70% close within the SLA target window (target is
        # created + 7..16d in add_issue), the rest breach — a realistic mix.
        closed_at = None
        if status == "Closed":
            offset = int(rng.integers(3, 11)) if rng.random() < 0.7 else int(rng.integers(16, 28))
            closed_at = min(created + offset * DAY, NOW - DAY)
        title = f"Unit-{unit_no} {kpi_label[kpi_key]} above tolerance" if direction == "lower" else f"Unit-{unit_no} {kpi_label[kpi_key]} below target"
        obs = f"{kpi_label[kpi_key]} at {actual} {kpi_unit[kpi_key]} vs benchmark {bench} {kpi_unit[kpi_key]} on {elabel}."
        impact = "Generation-cost / efficiency impact under assessment"
        iid, uid, creator, recipient = add_issue(s["id"], unit_no, dept, eid, kpi_key, sev, title, obs,
                                                  bench, actual, deviation, impact, created, status, progress, closed_at)
        advance(iid, recipient, creator, ekey, created, status, closed_at)

    cur.executemany("INSERT INTO issue VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", issues)
    cur.executemany("INSERT INTO issue_response VALUES(?,?,?,?,?,?,?,?,?)", responses)
    cur.executemany("INSERT INTO issue_comment VALUES(?,?,?,?,?)", comments)
    cur.executemany("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?,?,?)", audits)
    cur.executemany("INSERT INTO notification VALUES(?,?,?,?,?,?,?,?,?)", notifs)

    # ---- meta --------------------------------------------------------------
    cur.executemany("INSERT INTO meta VALUES(?,?)", [
        ("schema_version", "1"),
        ("generated_at", str(NOW)),
        ("virtual_today", str(NOW)),
        ("company", D.COMPANY),
    ])

    con.commit()
    con.close()

    size_mb = os.path.getsize(DB_PATH) / 1e6
    print(f"  Sites:        {len(D.SITES)}")
    print(f"  Units:        {sum(s['units'] for s in D.SITES)}")
    print(f"  Departments:  {len(D.DEPARTMENTS)}")
    print(f"  Users:        {len(users)}")
    print(f"  KPI defs:     {len(D.KPIS)}   KPI readings: {len(kpi_rows):,}")
    print(f"  Issues:       {len(issues)}   Responses: {len(responses)}   Audit: {len(audits)}   Notifs: {len(notifs)}")
    print(f"\nWrote {DB_PATH}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
