# CLAUDE.md — PPMS

## What this is
A **Power Plant Performance Monitoring & Issue Management System**: an enterprise-style web app that
connects a **Corporate Performance Analytics team** with **Plant Site departments** through a structured
engineering issue workflow (identify KPI deviation → assign → investigate → verify → escalate). It is a
**second interview-portfolio project**, complementing `apm-platform` (condition monitoring / ML) by showing
**operations workflow, accountability, and KPI performance management**.

Repo/deploy: intended for GitHub Pages at base `/ppms/`.

## Who I'm working with
Shiv is a **mechanical engineer / performance analyst** (ex thermal power plant), currently a PGPM student.
He is a **non-coder**: explain changes in plain language, prefer small reviewable steps, show diffs before
applying, and give exact click/command instructions. Warm, patient tone.

## Architecture (two layers, no backend — same pattern as apm-platform)
1. **Python "brain"** (`/ml`): `domain.py` (fleet + org + workflow config), `kpis.py` (derives KPIs from a
   simple operating model), `build_db.py` → writes `public/ppms.db` (SQLite) with seed org data, KPI series,
   and a realistic history of issues/responses/audit/notifications.
2. **React static site** (`/src`): reads `public/ppms.db` **in the browser** via sql.js/WebAssembly. Live
   workflow changes are persisted in **localStorage** and merged over the seed by `src/data/repository.js`.

Stack: React 18 + Vite 5, react-router-dom, recharts, sql.js. Reports: xlsx + jspdf. Python: pandas/numpy.

## Key commands (run from project root, Windows **Command Prompt**)
- Rebuild database:  `python ml/build_db.py`
- Install deps:      `npm install`
- Dev preview:       `npm run dev`   (port 5174)
- Build frontend:    `npm run build`
- Deploy:            `npm run deploy`  (gh-pages -d dist)

## Hard constraints — do not break these
- `vite.config.js` base MUST stay `'/ppms/'` (GitHub Pages paths). Router `basename` follows `import.meta.env.BASE_URL`.
- **All UI talks only to `src/data/repository.js`** — never to sql.js or localStorage directly. This is the
  seam that lets a real backend replace the internals later without touching the UI.
- The **audit log is append-only**: never expose a delete/edit path for `audit_log` rows anywhere in the code.
- **Honesty framing (critical):** auth is a **role-picker with demo passwords**, not secure auth; the audit
  trail is append-only *by convention*, not tamper-proof; "emails" are rendered in an in-app outbox, not sent.
  Never describe any of this as secure/production. The honest line:
  *"Browser-simulated auth and workflow engine; production would be Postgres + row-level security + a real API.
  The domain model, state machine, SLA rules and UI are identical either way."*
- Keep the app buildable: run `npm run build` after each module.

## Data model (in `public/ppms.db`)
`site · unit · department · equipment · app_user` · `kpi_definition · kpi_reading` ·
`issue · issue_response · issue_comment · issue_attachment` · `audit_log` · `sla_rule` · `notification` · `meta`.
Current seed: 6 sites, 14 units, 8 departments, 59 users, 8 KPIs, ~13.4k KPI readings, 42 issues (with
responses, 256 audit rows, 111 notifications).

### KPIs (derived, explainable) — `ml/kpis.py`
Heat Rate, Boiler/Turbine efficiency, **APC** (aggregate aux-drive load / gross generation), **PLF**,
**Unit Availability** (from running-hours model), Specific Coal Consumption, Condenser Back Pressure.
Seeded **deviation events** (`domain.py DEVIATIONS`) ramp a KPI away from benchmark so the "raise an issue
from a chart" flow has real, explainable material (e.g. VND-U2 gross heat rate +45 kcal/kWh over 7 days).

## Issue state machine
`Open → Under Investigation → Action Initiated → Awaiting Verification → Closed`
Corporate verify actions: **Accept & Close · Request Additional Info (→ Under Investigation) · Reopen (→ Open)**.
Every transition writes an `audit_log` row (user, timestamp, old → new, comment).

## Escalation
SLA rules (configurable, seeded): **3d → Dept Head · 7d → Plant Head · 15d → Regional/Corporate Gen Head.**
Escalation level is **derived** from days-pending on read (`repo.escalationFor`). A virtual "as-of" date
(`repo.getVirtualToday/setVirtualToday`) lets the demo show issues at every escalation level.

## Roadmap — all 9 modules SHIPPED
1. ~~**Scaffold + data layer.**~~ Repo, Vite/React/router, Python data layer + KPI engine, `repository.js`, seed DB.
2. ~~**Auth + RBAC shell.**~~ Login (demo creds), session, route guards, role-aware nav + mobile nav, demo banner.
3. ~~**Issue lifecycle.**~~ List + detail, raise-issue, respond (RCA/actions/attachments/progress), verify → close /
   request-info / reopen. Audit on every change.
4. ~~**Dashboards**~~ (corporate + plant): site distribution, aging, SLA compliance, resolution analytics,
   equipment trends, escalations, KPI heat map / plant pending+due+closed.
5. ~~**KPI analytics**~~ — benchmark-vs-actual trends + "Raise issue from this deviation" prefill.
6. ~~**Escalation engine + dashboard**~~ — configurable SLA rules, derived levels, responsible-person routing
   (dept/plant/regional), virtual as-of clock, auto-escalation writes audit + notifies.
7. ~~**Notifications + audit viewer**~~ — bell dropdown, in-app + simulated email outbox, immutable audit page.
8. ~~**Reports**~~ — 6 report types, Excel (xlsx) + PDF (jspdf) export.
9. ~~**Polish**~~ — responsive + mobile nav, aria labels, realistic SLA-compliance seeding (~62%), README.

Data build reproducible via `python ml/build_db.py` (this project's DB is NOT pinned — safe to regenerate,
unlike apm-platform's).

## Working preferences
- Prefer browser-side simulation over real backend infra (free hosting, no maintenance).
- Enterprise UI: calm, dense, tabular-first (Inter + IBM Plex Mono). Deliberately NOT the neon HUD used in `apm-platform`.
- A **"Reset demo data"** control should restore the seeded state (localStorage is per-browser).
- Do **not** touch `apm-platform` — it's a separate deployed project with its ML figures pinned to a printed study guide.
