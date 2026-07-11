"""
kpis.py  --  performance-KPI generation for PPMS
================================================
Generates a daily KPI series per unit. Values are grounded in a simple
operating model so each metric is explainable in an interview:

  PLF          ~ unit load factor (generation / capacity)
  APC (%)      aggregate auxiliary-drive load / gross generation; rises at
               part load because fixed aux power is spread over less MWh
  Availability from run-state (running hours / period), with outage events
  Gross Heat Rate / Turbine Heat Rate  worsen at part load and with a
               seeded degradation event (e.g. condenser back pressure)
  Boiler Efficiency  drops with flue-gas losses (part-load + fouling event)
  Specific Coal Consumption = gross heat rate / coal GCV
  Condenser Back Pressure  a driver we also expose as its own KPI

On top of the baseline, DEVIATIONS from domain.py ramp a chosen KPI away
from benchmark over the trailing N days, giving the "raise an issue from a
deviation" workflow real, explainable material.
"""

import numpy as np
import pandas as pd

import domain as D

GCV = 3838.0   # coal gross calorific value (kcal/kg) -> sp_coal = heat_rate/GCV


def daily_index():
    end = pd.Timestamp(D.END_DATE)
    start = end - pd.Timedelta(days=D.HISTORY_DAYS - 1)
    return pd.date_range(start=start, end=end, freq="D")


def _units():
    """Yield (site, unit_no, unit_id, unit_capacity_mw)."""
    for s in D.SITES:
        cap = s["capacity_mw"] / s["units"]
        for u in range(1, s["units"] + 1):
            yield s, u, f"{s['id']}-U{u}", cap


def _trailing_ramp(n, days, magnitude):
    """0 -> magnitude over the trailing `days` samples of an n-length series."""
    ramp = np.zeros(n)
    d = min(days, n)
    ramp[n - d:] = np.linspace(0, magnitude, d)
    return ramp


def generate(index):
    """Return (rows, series).
    rows   : list of (site_id, unit_id, kpi_key, ts_epoch, value, benchmark)
    series : dict[(site_id, unit_id, kpi_key)] -> np.ndarray  (for issue seeding)
    """
    n = len(index)
    ts_epoch = [int(t.value // 10**9) for t in index]
    day_of_year = index.dayofyear.to_numpy()
    # summer months push condenser back pressure & heat rate up a touch
    summer = np.clip(np.sin((day_of_year - 80) / 365 * 2 * np.pi), 0, 1)

    bench = {k["key"]: k["benchmark"] for k in D.KPIS}
    rows, series = [], {}

    for s, u, uid, cap in _units():
        rng = np.random.default_rng(abs(hash(uid)) % (2**32))

        # --- load / generation ---
        load = 85 + 6 * np.sin(2 * np.pi * np.arange(n) / 45) + rng.normal(0, 4, n)
        load = np.clip(load, 55, 99)
        part = (85 - load)  # positive when below reference load

        # --- availability: mostly high, with a few outage events ---
        avail = 97 + rng.normal(0, 1.0, n)
        for _ in range(rng.integers(1, 4)):
            start = rng.integers(0, n)
            length = int(rng.integers(2, 7))
            avail[start:start + length] -= rng.uniform(10, 28)
        avail = np.clip(avail, 55, 100)

        # --- KPI baselines (grounded in the load model) ---
        vals = {
            "plf":            np.clip(load + rng.normal(0, 1.2, n), 40, 100),
            "availability":   avail,
            "apc":            6.0 * (85.0 / load) ** 0.3 + rng.normal(0, 0.10, n),
            "boiler_eff":     86.5 - 0.02 * part + rng.normal(0, 0.28, n),
            "cond_backpress": 10.5 + 1.6 * summer + rng.normal(0, 0.3, n),
            "gross_heat_rate": 2380 + 3.0 * part + rng.normal(0, 7, n),
            "turbine_hr":     1955 + 2.2 * part + rng.normal(0, 6, n),
        }
        # coupled / derived
        vals["gross_heat_rate"] += 22 * (vals["cond_backpress"] - 10.5)  # back-pressure penalty
        vals["sp_coal"] = vals["gross_heat_rate"] / GCV + rng.normal(0, 0.004, n)

        # --- apply seeded deviation events for this unit ---
        for dev in D.DEVIATIONS:
            if dev["site"] == s["id"] and dev["unit"] == u:
                vals[dev["kpi"]] = vals[dev["kpi"]] + _trailing_ramp(n, dev["days"], dev["magnitude"])
                # keep the story consistent: a back-pressure-caused heat-rate
                # event also lifts the condenser back-pressure series
                if dev["kpi"] == "gross_heat_rate" and "back pressure" in dev["cause"]:
                    vals["cond_backpress"] += _trailing_ramp(n, dev["days"], dev["magnitude"] / 22.0)

        for kpi_key, arr in vals.items():
            b = bench[kpi_key]
            series[(s["id"], uid, kpi_key)] = arr
            for i in range(n):
                rows.append((s["id"], uid, kpi_key, ts_epoch[i], round(float(arr[i]), 3), b))

    return rows, series
