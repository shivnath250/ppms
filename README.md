# PPMS — Power Plant Performance Monitoring & Issue Management System

An enterprise-style web app that connects a **Corporate Performance Analytics team** with
**Plant Site departments** through a structured engineering issue workflow — identify a KPI
deviation → raise an observation → auto-route to the responsible department → investigate (RCA +
corrective action) → verify → close, with automatic **SLA escalation** and a full **audit trail**.

Built as an interview-portfolio project to demonstrate thermal-power domain knowledge (heat rate,
boiler/turbine efficiency, APC, PLF, availability, specific coal consumption) alongside product,
workflow, and front-end engineering.

**Live:** https://shivnath250.github.io/ppms/

## An "Operations Excellence Platform" — two modules
PPMS is the shell for a two-module platform:
- **Performance & Issue Management** (this app) — KPI monitoring + the engineering issue workflow.
- **Condition Monitoring** — a sibling app (`apm-platform`) covering sensor health, trip-distance
  prognosis, an ML "model lab", and a simulated live feed. It's embedded in PPMS at **/monitoring**,
  and its fleet-health highlights are surfaced on the corporate dashboard.
  Live: https://shivnath250.github.io/apm-platform/ · Repo: https://github.com/shivnath250/apm-platform

The two currently model different demo fleets and are presented as two capability modules (the
dashboard highlights are labelled as the condition-monitoring fleet). `ml/apm_summary.py` generates
the small health snapshot the dashboard reads, so PPMS never loads APM's full database.

### The technical bridge — Performance Impact & Risk (`/impact`)
The modules are also linked *analytically*: every equipment condition issue from the monitoring module
is **projected into plant-performance and economic terms** — APC penalty, heat-rate/fuel cost, boiler/
turbine efficiency loss, **unit-trip probability**, avoidable maintenance escalation, extra CO₂, and
total **₹ / MU at risk** — turning "FD Fan at 46% health" into "≈ ₹X/day at risk, Y% trip probability".
Sensitivities are simplified, cited engineering rules of thumb (back pressure → heat rate ~10–14
kcal/kWh per kPa; fans ~60–70% of APC; boiler efficiency ~1% per ~20 °C flue-gas temp), with editable
economic assumptions so the numbers stay transparent. `ml/apm_impact.py` extracts the condition facts;
`src/lib/impact.js` + `src/lib/plantEconomics.js` do the projection; the `/impact` page ranks the fleet
by ₹ at risk and can pre-fill a PPMS performance issue from any row.

## Honest framing (please read)

This is a **front-end demo with a simulated backend**, deliberately kept serverless so it can be
hosted for free on static hosting:

- **Authentication is a role picker** with demo passwords — it is **not** secure auth.
- The **audit log is append-only by convention**, not tamper-proof.
- **"Emails" are rendered in an in-app outbox**, not actually sent.
- All data lives in a read-only SQLite file loaded in the browser (via sql.js/WebAssembly), with
  live changes layered in `localStorage`.

The honest one-liner: *"Browser-simulated auth and workflow engine; production would be Postgres +
row-level security + a real API and mail service. The domain model, state machine, SLA rules and UI
are identical either way."*

## Architecture

Two layers, no server:

1. **Python "brain"** (`/ml`) — `domain.py` (fleet + org + workflow config), `kpis.py` (derives KPIs
   from a simple operating model so every metric is explainable), `build_db.py` → writes
   `public/ppms.db`.
2. **React static site** (`/src`) — reads `public/ppms.db` **in the browser**; all UI talks only to
   `src/data/repository.js`, which merges the read-only seed with a mutable `localStorage` overlay.
   That single seam is what a real REST backend would slot behind without touching the UI.

Stack: React 18 + Vite 5, react-router, recharts, sql.js. Reports via `xlsx` + `jspdf`.
Data build: Python + pandas/numpy.

## Features

- **Role-based access** — Corporate sees the whole fleet; plant users see only their site
  (department engineers just their department; plant heads their whole site).
- **Issue lifecycle** — `Open → Under Investigation → Action Initiated → Awaiting Verification →
  Closed`, with corporate verify actions (accept & close / request info / reopen). Every transition
  is audited (user, timestamp, old → new, comment).
- **Dashboards** — corporate (site distribution, aging, SLA compliance, resolution analytics,
  equipment trends, escalations, KPI heat map) and plant (assigned/pending/overdue/due-soon).
- **KPI analytics** — benchmark-vs-actual trends with a critical threshold, plus a one-click
  **"Raise issue from this deviation"** that pre-fills the issue form from the chart.
- **Escalation engine** — configurable SLA rules (3d → Dept Head, 7d → Plant Head, 15d → Regional
  Head); crossings write an audit entry and notify the responsible person. A **virtual as-of date**
  lets you fast-forward the clock to watch issues climb the chain.
- **Notifications** — in-app center (bell) + a simulated **email outbox**.
- **Immutable audit trail** viewer, scoped to what each user may see.
- **Reports** — Monthly Performance, Plant Scorecard, KPI Deviation, Issue Closure, RCA Summary,
  Department Performance — each exportable to **Excel and PDF**.

## KPIs (derived, not invented)

Computed in `ml/kpis.py` from a daily operating model:

- **APC** — aggregate auxiliary-drive load ÷ gross generation (rises at part load).
- **Unit Availability** — from a running-hours model with outage events.
- **Gross / Turbine Heat Rate** — worsen at part load and with condenser back pressure.
- **Boiler Efficiency** — drops with flue-gas losses.
- **Specific Coal Consumption** — heat rate ÷ coal GCV. **PLF** — generation ÷ capacity.

Seeded **deviation events** (e.g. Vindhya U-2 heat rate drifting up on rising back pressure) give the
"raise an issue from a chart" flow real, explainable material.

## Demo accounts

All accounts use the password **`demo1234`**. Quick-pick buttons on the login screen include:

| Role | Email | Sees |
|------|-------|------|
| Corporate Performance Analytics | `ananya.rao@corp.btp.in` | whole fleet |
| Plant · Turbine engineer | `trb.vnd@btp.in` | Vindhya · Turbine only |
| Plant · Boiler engineer | `blr.krb@btp.in` | Korba · Boiler only |
| Plant Head | `planthead.tlc@btp.in` | all of Talcher |

"Reset demo" in the sidebar restores the seeded state (data is per-browser).

## Run it

From the project root (Windows Command Prompt):

```
python ml/build_db.py     # (re)build public/ppms.db
npm install
npm run dev               # http://localhost:5174/ppms/
```

Build & deploy (GitHub Pages, base `/ppms/`):

```
npm run build
npm run deploy
```

## Talking points (for interviews)

- **Domain-correct KPIs**: I can explain each formula and why it moves (APC from aux currents,
  availability from run-state, heat rate from back pressure) rather than showing invented numbers.
- **The workflow is a real state machine**, not a ticket list — with RBAC, SLA escalation up a named
  responsibility chain, and an immutable audit trail.
- **Clean architecture seam**: the UI depends only on a repository interface, so the simulated
  backend could be swapped for Postgres + a REST API with no UI changes — and I can say honestly
  what is and isn't production-grade.
