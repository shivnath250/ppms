"""
domain.py  --  fleet, org & workflow definition for PPMS
========================================================
Single source of truth for the demo. Self-contained (a trimmed copy of the
apm-platform fleet idea) so this project does not depend on the other repo.

Hierarchy:  Company -> Site (plant) -> Unit -> Department -> Equipment
KPIs are DERIVED from a simple sensor/operating model in kpis.py, so their
values are explainable ("APC comes from the aux motor currents", etc.).
"""

COMPANY = "Bharat Thermal Power"

# ---------------------------------------------------------------------------
# 1) SITES (plants)  --  capacity is illustrative for the demo
# ---------------------------------------------------------------------------
SITES = [
    {"id": "VND", "name": "Vindhya",   "state": "Madhya Pradesh", "capacity_mw": 2640, "units": 2, "region": "West"},
    {"id": "KRB", "name": "Korba",     "state": "Chhattisgarh",   "capacity_mw": 2100, "units": 3, "region": "East"},
    {"id": "TLC", "name": "Talcher",   "state": "Odisha",         "capacity_mw": 3000, "units": 2, "region": "East"},
    {"id": "SPT", "name": "Sipat",     "state": "Chhattisgarh",   "capacity_mw": 1980, "units": 3, "region": "East"},
    {"id": "MND", "name": "Mundra",    "state": "Gujarat",        "capacity_mw": 4620, "units": 2, "region": "West"},
    {"id": "RMG", "name": "Ramagundam","state": "Telangana",      "capacity_mw": 2600, "units": 2, "region": "South"},
]

# ---------------------------------------------------------------------------
# 2) DEPARTMENTS at every site (issues are routed to one of these)
# ---------------------------------------------------------------------------
DEPARTMENTS = [
    {"id": "OPS", "name": "Operations"},
    {"id": "BLR", "name": "Boiler"},
    {"id": "TRB", "name": "Turbine"},
    {"id": "ELE", "name": "Electrical"},
    {"id": "CNI", "name": "C&I"},
    {"id": "CHP", "name": "Coal Handling (CHP)"},
    {"id": "ASH", "name": "Ash Handling"},
    {"id": "MNT", "name": "Maintenance"},
]

# ---------------------------------------------------------------------------
# 3) EQUIPMENT catalogue per department (used in issue "equipment" field and
#    for equipment-wise failure-trend analytics). Each has an aux-power draw
#    hint (kW at reference load) that feeds the APC derivation.
# ---------------------------------------------------------------------------
EQUIPMENT = [
    # dept, key, label, aux_kw (0 = not an aux drive)
    ("BLR", "FD_FAN",   "FD Fan",              2400),
    ("BLR", "ID_FAN",   "ID Fan",              3600),
    ("BLR", "PA_FAN",   "PA Fan",              1800),
    ("BLR", "MILL",     "Coal Mill",           1600),
    ("BLR", "APH",      "Air Preheater",          0),
    ("TRB", "BFP",      "Boiler Feed Pump",    9500),
    ("TRB", "CEP",      "Condensate Ext. Pump", 900),
    ("TRB", "TURBINE",  "Steam Turbine",          0),
    ("TRB", "CONDENSER","Condenser",              0),
    ("OPS", "CW_PUMP",  "CW Pump",             3200),
    ("ELE", "GENERATOR","Generator",              0),
    ("ELE", "GT_XFMR",  "Generator Transformer",  0),
    ("CNI", "DCS",      "DCS / Controls",         0),
    ("CHP", "CONVEYOR", "Coal Conveyor",        700),
    ("CHP", "CRUSHER",  "Coal Crusher",         850),
    ("ASH", "ASH_PUMP", "Ash Slurry Pump",     1100),
    ("MNT", "AUX",      "Auxiliary/Other",        0),
]

# ---------------------------------------------------------------------------
# 4) KPI DEFINITIONS
#    direction: "lower" = lower is better (heat rate, APC, coal), else "higher"
#    benchmark: design/target value. critical_pct: deviation from benchmark
#    (as a fraction) beyond which a deviation is considered Critical severity.
# ---------------------------------------------------------------------------
KPIS = [
    {"key": "gross_heat_rate", "label": "Gross Heat Rate",       "unit": "kcal/kWh", "benchmark": 2380, "direction": "lower",  "critical_pct": 0.04, "dept": "OPS"},
    {"key": "boiler_eff",      "label": "Boiler Efficiency",     "unit": "%",        "benchmark": 86.5, "direction": "higher", "critical_pct": 0.03, "dept": "BLR"},
    {"key": "turbine_hr",      "label": "Turbine Heat Rate",     "unit": "kcal/kWh", "benchmark": 1955, "direction": "lower",  "critical_pct": 0.04, "dept": "TRB"},
    {"key": "apc",             "label": "Auxiliary Power Consumption", "unit": "%",  "benchmark": 6.0,  "direction": "lower",  "critical_pct": 0.10, "dept": "ELE"},
    {"key": "plf",             "label": "Plant Load Factor",     "unit": "%",        "benchmark": 85.0, "direction": "higher", "critical_pct": 0.08, "dept": "OPS"},
    {"key": "availability",    "label": "Unit Availability",     "unit": "%",        "benchmark": 92.0, "direction": "higher", "critical_pct": 0.05, "dept": "OPS"},
    {"key": "sp_coal",         "label": "Specific Coal Consumption", "unit": "kg/kWh", "benchmark": 0.62, "direction": "lower", "critical_pct": 0.05, "dept": "CHP"},
    {"key": "cond_backpress",  "label": "Condenser Back Pressure", "unit": "kPa",    "benchmark": 10.5, "direction": "lower",  "critical_pct": 0.15, "dept": "TRB"},
]

# ---------------------------------------------------------------------------
# 5) SLA / escalation rules (configurable, seeded into the DB)
#    days_pending threshold -> escalation level -> responsible role
# ---------------------------------------------------------------------------
SLA_RULES = [
    {"days": 3,  "level": 1, "role": "Department Head",                 "label": "L1 · Dept Head"},
    {"days": 7,  "level": 2, "role": "Plant Head",                      "label": "L2 · Plant Head"},
    {"days": 15, "level": 3, "role": "Regional / Corporate Gen Head",   "label": "L3 · Regional Head"},
]

# ---------------------------------------------------------------------------
# 6) DELIBERATE DEVIATION EVENTS  --  give the "raise an issue from a chart"
#    flow explainable material. Each ramps a KPI away from benchmark over the
#    trailing `days`. cause text is reused in seeded issue observations.
# ---------------------------------------------------------------------------
DEVIATIONS = [
    {"site": "VND", "unit": 2, "kpi": "gross_heat_rate", "days": 7,  "magnitude": 45,
     "cause": "rising condenser back pressure", "dept": "TRB", "equipment": "CONDENSER"},
    {"site": "KRB", "unit": 1, "kpi": "boiler_eff",      "days": 12, "magnitude": -1.8,
     "cause": "high flue-gas exit temperature (APH fouling)", "dept": "BLR", "equipment": "APH"},
    {"site": "TLC", "unit": 2, "kpi": "apc",             "days": 10, "magnitude": 0.55,
     "cause": "ID fan running at high loading after damper drift", "dept": "ELE", "equipment": "ID_FAN"},
    {"site": "SPT", "unit": 3, "kpi": "sp_coal",         "days": 9,  "magnitude": 0.03,
     "cause": "deteriorating coal GCV and mill fineness", "dept": "CHP", "equipment": "MILL"},
    {"site": "MND", "unit": 1, "kpi": "turbine_hr",      "days": 14, "magnitude": 38,
     "cause": "HP turbine efficiency drop / gland steam leakage", "dept": "TRB", "equipment": "TURBINE"},
    {"site": "RMG", "unit": 2, "kpi": "availability",    "days": 20, "magnitude": -6.0,
     "cause": "repeated mill trips reducing unit availability", "dept": "BLR", "equipment": "MILL"},
]

# ---------------------------------------------------------------------------
# 7) Data window
# ---------------------------------------------------------------------------
HISTORY_DAYS = 120          # daily KPI series
END_DATE = "2026-07-01"     # fixed "today" for reproducible data
