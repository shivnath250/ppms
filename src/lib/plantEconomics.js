// plantEconomics.js -- configurable economic assumptions for the impact model.
// Sensible Indian thermal-fleet defaults; the user can edit them in the
// Assumptions panel and the overrides persist in localStorage. All money in ₹.

const KEY = 'ppms_econ_v1'

export const ECON_DEFAULTS = {
  coalPricePerTonne: 5000,     // ₹/tonne (landed)
  gcv: 3800,                   // coal GCV, kcal/kg
  realizationPerKwh: 4.20,     // ₹/kWh saleable realisation
  variableCostPerKwh: 2.60,    // ₹/kWh fuel + variable  (margin = 1.60)
  co2PerTonneCoal: 1.6,        // t CO₂ per t coal burnt
  restartHours: 24,            // forced-outage lost-generation window
  startupFuelLakh: 40,         // ₹ lakh oil support per cold start
  plf: 85,                     // % — load the unit runs at
  tripHorizonDays: 30,         // window the trip probability is expressed over
}

// field metadata for the Assumptions panel (label + unit + step)
export const ECON_FIELDS = [
  { key: 'coalPricePerTonne', label: 'Coal price', unit: '₹/t', step: 100 },
  { key: 'gcv', label: 'Coal GCV', unit: 'kcal/kg', step: 50 },
  { key: 'realizationPerKwh', label: 'Realisation', unit: '₹/kWh', step: 0.1 },
  { key: 'variableCostPerKwh', label: 'Variable cost', unit: '₹/kWh', step: 0.1 },
  { key: 'plf', label: 'PLF', unit: '%', step: 1 },
  { key: 'restartHours', label: 'Restart time', unit: 'h', step: 2 },
  { key: 'startupFuelLakh', label: 'Start-up fuel', unit: '₹ lakh', step: 5 },
  { key: 'tripHorizonDays', label: 'Trip horizon', unit: 'days', step: 5 },
]

export function getEconomics() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...ECON_DEFAULTS, ...JSON.parse(raw) } : { ...ECON_DEFAULTS }
  } catch {
    return { ...ECON_DEFAULTS }
  }
}
export function setEconomics(econ) {
  try { localStorage.setItem(KEY, JSON.stringify(econ)) } catch { /* quota */ }
}
export function resetEconomics() {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
  return { ...ECON_DEFAULTS }
}

export const margin = (e) => e.realizationPerKwh - e.variableCostPerKwh

// ---- currency formatting (Indian lakh / crore) ----
export function fmtINR(rupees) {
  if (rupees == null || isNaN(rupees)) return '—'
  const a = Math.abs(rupees)
  if (a >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`
  if (a >= 1e3) return `₹${Math.round(rupees / 1e3)}k`
  return `₹${Math.round(rupees)}`
}
