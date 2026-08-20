// impact.js -- the engineering + economic bridge from APM equipment condition
// to plant-performance and cost impact. Pure functions over an apm_impact.json
// issue record + the economic assumptions.
//
// Sensitivities are simplified, cited rules of thumb (see README / plan):
//   condenser back pressure -> heat rate ~10-14 kcal/kWh per kPa
//   boiler efficiency ~1% per ~20°C flue-gas temp; ~1% ≈ 24 kcal/kWh
//   aux drives dominate APC (fans ~60-70%, BFP ~25%)
// They are meant to demonstrate the *method*; a real deployment calibrates
// against the unit's own heat-rate/APC test curves.

import { margin } from './plantEconomics.js'

// per equipment type: rated auxiliary drive power (kW, for APC), one-off
// maintenance base cost (₹ lakh), and how it hits performance.
export const EQUIP_META = {
  FD_FAN:    { label: 'FD Fan',            auxKW: 2500, maintLakh: 6,  paths: ['apc'] },
  ID_FAN:    { label: 'ID Fan',            auxKW: 4000, maintLakh: 8,  paths: ['apc'] },
  PA_FAN:    { label: 'PA Fan',            auxKW: 1800, maintLakh: 5,  paths: ['apc'] },
  MILL:      { label: 'Coal Mill',         auxKW: 1600, maintLakh: 10, paths: ['apc', 'boiler'] },
  BFP:       { label: 'Boiler Feed Pump',  auxKW: 9000, maintLakh: 25, paths: ['apc'] },
  CW_PUMP:   { label: 'CW Pump',           auxKW: 3000, maintLakh: 12, paths: ['apc', 'backpressure'] },
  CEP:       { label: 'Condensate Pump',   auxKW: 900,  maintLakh: 6,  paths: ['apc'] },
  TURBINE:   { label: 'Steam Turbine',     auxKW: 0,    maintLakh: 60, paths: ['turbine'] },
  GENERATOR: { label: 'Generator',         auxKW: 0,    maintLakh: 45, paths: ['derate'] },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// how far the KPI paths move at full degradation (severity = 1)
const SENS = {
  apcMaxExtraFrac: 0.10,       // aux drive draws up to +10% power when fully degraded
  backpressureMaxKPa: 2.5,     // CW/condenser degradation adds up to 2.5 kPa
  kcalPerKPa: 12,              // heat-rate penalty per kPa back pressure
  turbineMaxKcal: 55,          // turbine efficiency loss, kcal/kWh
  boilerMaxKcal: 30,           // mill/boiler-side loss, kcal/kWh
  derateFrac: 0.15,            // redundant/gen failure -> partial load loss
}

// ---- main: project one condition issue into impact + ₹ ---------------------
export function computeImpact(issue, econ) {
  const meta = EQUIP_META[issue.type] || { auxKW: 0, maintLakh: 8, paths: [] }
  const severity = clamp(1 - issue.health / 100, 0, 1)          // 0..1
  const grossMW = issue.capacityMW * (econ.plf / 100)
  const dailyKWh = grossMW * 24 * 1000
  const coalPerKg = econ.coalPricePerTonne / 1000

  const contributors = []
  let deltaHeatRate = 0            // kcal/kWh
  let extraAuxMW = 0

  // --- APC path (aux drives) ---
  if (meta.paths.includes('apc') && meta.auxKW > 0) {
    const extraFrac = SENS.apcMaxExtraFrac * severity
    extraAuxMW = (meta.auxKW * extraFrac) / 1000
    const deltaApcPts = grossMW ? (extraAuxMW / grossMW) * 100 : 0
    const rupeesPerDay = extraAuxMW * 24 * 1000 * econ.realizationPerKwh
    contributors.push({
      path: 'apc', label: 'Auxiliary power',
      detail: `+${(extraFrac * 100).toFixed(1)}% drive power ≈ +${extraAuxMW.toFixed(2)} MW aux (+${deltaApcPts.toFixed(2)} pts APC)`,
      rupeesPerDay,
    })
  }

  // --- heat-rate paths (back pressure / turbine / boiler) ---
  const hr = []
  if (meta.paths.includes('backpressure')) {
    const dBp = SENS.backpressureMaxKPa * severity
    const d = dBp * SENS.kcalPerKPa
    deltaHeatRate += d
    hr.push(`condenser back pressure +${dBp.toFixed(2)} kPa → +${d.toFixed(0)} kcal/kWh`)
  }
  if (meta.paths.includes('turbine')) {
    const d = SENS.turbineMaxKcal * severity
    deltaHeatRate += d
    hr.push(`turbine efficiency loss → +${d.toFixed(0)} kcal/kWh`)
  }
  if (meta.paths.includes('boiler')) {
    const d = SENS.boilerMaxKcal * severity
    deltaHeatRate += d
    hr.push(`boiler efficiency (unburnt carbon) → +${d.toFixed(0)} kcal/kWh`)
  }
  let fuelRupeesPerDay = 0
  let extraCO2PerDay = 0
  if (deltaHeatRate > 0) {
    const extraCoalKgPerKwh = deltaHeatRate / econ.gcv
    const extraCoalKgPerDay = extraCoalKgPerKwh * dailyKWh
    fuelRupeesPerDay = extraCoalKgPerDay * coalPerKg
    extraCO2PerDay = (extraCoalKgPerDay / 1000) * econ.co2PerTonneCoal
    contributors.push({
      path: 'heatrate', label: 'Heat rate / fuel',
      detail: `+${deltaHeatRate.toFixed(0)} kcal/kWh (${hr.join('; ')}) → +${(extraCoalKgPerDay / 1000).toFixed(1)} t coal/day`,
      rupeesPerDay: fuelRupeesPerDay,
    })
  }

  // --- unit-trip probability + expected trip cost ---
  const isCritical = issue.redundancy === 'critical'
  let pTrip = 0
  if (issue.tripSensor && issue.distToTripFrac != null) {
    const band = clamp(issue.distToTripFrac, 0, 1)                 // into alert→trip band
    const velFactor = issue.etaTripDays
      ? clamp(econ.tripHorizonDays / issue.etaTripDays, 0.15, 3)   // sooner ETA → higher
      : 0.3
    const critFactor = isCritical ? 1.0 : 0.35                     // redundant → mostly derate
    pTrip = clamp((0.12 + 0.75 * band) * velFactor * critFactor, 0, 0.92)
  }
  // consequence
  const lostMWh = isCritical
    ? grossMW * econ.restartHours                                  // whole unit down
    : grossMW * SENS.derateFrac * econ.restartHours                // derate on redundant loss
  const tripCost = lostMWh * 1000 * margin(econ) + (isCritical ? econ.startupFuelLakh * 1e5 : 0)
  const tripRupeesPerDay = (pTrip * tripCost) / econ.tripHorizonDays
  if (pTrip > 0) {
    contributors.push({
      path: 'trip', label: isCritical ? 'Unit-trip risk' : 'Derate risk',
      detail: `${(pTrip * 100).toFixed(0)}% in ${econ.tripHorizonDays}d × ${fmtCr(tripCost)} ${isCritical ? 'unit trip' : 'derate'}`,
      rupeesPerDay: tripRupeesPerDay,
    })
  }

  // --- maintenance escalation (one-off, avoidable) ---
  const maintMult = 1 + 7 * severity                              // P–F: planned→breakdown ~1:8
  const maintOneOff = meta.maintLakh * 1e5 * maintMult

  const totalRupeesPerDay = fuelRupeesPerDay + (extraAuxMW * 24 * 1000 * econ.realizationPerKwh) + tripRupeesPerDay
  const muPerMonth = (totalRupeesPerDay * 30) / (econ.realizationPerKwh * 1e6)   // ₹→ MU equivalent

  return {
    severity, grossMW, deltaHeatRate, extraAuxMW, pTrip, isCritical,
    contributors,
    fuelRupeesPerDay,
    apcRupeesPerDay: extraAuxMW * 24 * 1000 * econ.realizationPerKwh,
    tripRupeesPerDay, tripCost,
    maintOneOff, maintMult,
    extraCO2PerDay,
    totalRupeesPerDay,
    muPerMonth,
    priority: totalRupeesPerDay,
  }
}

export function fleetImpact(issues, econ) {
  const rows = issues.map((i) => ({ issue: i, impact: computeImpact(i, econ) }))
  rows.sort((a, b) => b.impact.priority - a.impact.priority)
  const totalPerDay = rows.reduce((s, r) => s + r.impact.totalRupeesPerDay, 0)
  const co2PerDay = rows.reduce((s, r) => s + r.impact.extraCO2PerDay, 0)
  const maintExposure = rows.reduce((s, r) => s + r.impact.maintOneOff, 0)
  const highRisk = rows.filter((r) => r.impact.pTrip >= 0.25 || r.impact.totalRupeesPerDay >= 1e5).length
  return {
    rows,
    totalPerDay,
    totalPerMonth: totalPerDay * 30,
    muPerMonth: (totalPerDay * 30) / (econ.realizationPerKwh * 1e6),
    co2PerDay, maintExposure, highRisk,
  }
}

function fmtCr(r) { return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)} Cr` : `₹${(r / 1e5).toFixed(0)} L` }
