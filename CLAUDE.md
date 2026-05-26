# CLAUDE.md

This file is the project briefing for Claude or any coding agent working on this repository.

## Project Summary

`ufro-web` is a React + Vite single page calculator/dashboard for water-treatment process simulation. The active application models a reuse-water process with:

- Phase 1.0 TSS treatment
- Phase 1.5 TSS + UF/RO routing
- UF/RO mass balance
- Conductivity / TDS quality checks
- Reject-water compliance and dilution simulation
- Interactive process diagrams
- Per-section electricity, chemical, and labor cost estimation

The app is currently a client-side calculator. There is no backend, database, authentication, or saved-scenario persistence.

## Tech Stack

- React 19
- Vite 8
- Plain JSX
- Inline style objects inside the main component file
- No router
- No CSS framework
- No backend API

Important commands:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

The production build has been the main verification command used during recent work:

```bash
npm run build
```

For fast JSX syntax verification:

```bash
node --input-type=module -e "import { transformWithOxc } from 'vite'; import { readFile } from 'node:fs/promises'; const code = await readFile('src/ufro_v71.jsx','utf8'); await transformWithOxc(code, 'src/ufro_v71.jsx', { lang: 'jsx', jsx: { runtime: 'automatic' } }); console.log('ufro_v71 Oxc transform OK');"
```

## Repository Layout

Active app root:

```text
ufro-web/
  package.json
  vite.config.js
  index.html
  src/
    App.jsx
    main.jsx
    index.css
    ufro_v71.jsx
```

`src/App.jsx` only imports and renders `UFROCalculator` from `src/ufro_v71.jsx`.

Most domain logic, state, UI, diagrams, and styles live in `src/ufro_v71.jsx`. Treat this file as the main product source of truth.

The parent directory contains old exported/copy files such as `ufro_calculator_v63.jsx`, `ufro_v7.jsx`, and backups. Do not edit those unless explicitly asked.

## Main File

Active file:

```text
src/ufro_v71.jsx
```

Major areas inside this file:

- Numeric input helper: `NumInput`
- Conversion helpers: `tds2cond`, `cond2tds`
- Discharge validation: `validateDischarge`
- Defaults: source water, dilution water, chemical rows, equipment rows, cost groups
- Main component: `UFROCalculator`
- Phase 1.0 UI/diagram: `Phase10Panel`, `Phase10Diagram`
- Phase 1.5 diagram: `SvgBlueprintPhase15Diagram`
- Diagram wrapper/export: `ProcessDiagram`, `exportSVG`, `exportPNG`
- Small UI components: `Section`, `SliderRow`, `KPI`, `CostKPI`, `StatusBadge`, `DonutChart`, `StreamRow`
- Style object: `S`
- Color constants: `O`
- Global CSS string: `globalCSS`

## Domain Conventions

The app uses a simplified conductivity/TDS conversion:

```js
Cond = TDS * 2
TDS = Cond * 0.5
```

Reject-water limits are hard-coded:

```js
REJECT_COND_LIMIT = 6000 // uS/cm
REJECT_TDS_LIMIT = 3000
```

`validateDischarge(tds)` returns regulatory status:

- `PASS`
- `WARNING`
- `FAIL`

Warning starts at 80% of the limit.

This is a simulator/calculator, not a regulatory-certified model. Avoid silently changing these constants because many UI statuses and recommendations rely on them.

## Phase 1.0

Phase 1.0 is available through the project tab:

```text
Phase 1.0
```

Current Phase 1.0 model:

```text
Raw feed -> PAC / Polymer -> TSS Process -> Reject -> Sludge Pond
                                           -> Phase 1 Tank -> Sale Water
                                                            -> To P1.5 Blend
```

Important state:

- `phase10ToSalePct`
- `phase10HasTargetCond`
- `phase10TargetCond`
- `phase10HasTargetFlow`
- `phase10TargetFlow`
- shared `tssReject`
- shared `sludgeWaterRecovery`

Important calculation:

```js
phase10Calc
```

Phase 1.0 supports both app modes:

- `FEED -> ?`
  - Uses actual feed flow from enabled feed sources.
  - Target Cond/Flow are used as pass/fail targets.
- `? -> PRODUCT`
  - Uses `phase10TargetFlow` to back-calculate required feed through the TSS process.
  - If Flow target is disabled, the target is not enforced.

Phase 1.0 target controls can be disabled independently:

- `ไม่มี Cond เป้าหมาย`
- `ไม่มี Flow เป้าหมาย`

The Phase 1.0 diagram is a first working implementation based on the supplied SVG layout. It now displays Cond values on the main stream nodes. TSS is currently assumed not to change conductivity, so downstream Cond equals feed Cond until a more specific model is supplied.

## Phase 1.5

Phase 1.5 is the original primary workflow and is selected by default.

Routes:

```js
PHASE15_ROUTES = {
  A: TSS + UF/RO before final tank
  B: TSS then bypass UF/RO to final tank
  C: Mixed feed bypasses treatment to final tank
}
```

Important state:

- `phase15Routes`
- `phase15RouteRatios`
- `phase15RouteInputMode`
- `mode`
- `strategy`
- `sources`
- `manualSourceRatios`
- `hasTargetCond`
- `targetCond`
- `productFlow`
- `tssReject`
- `sludgeWaterRecovery`
- `ufReject`
- `roReject`
- `roSaltRejection`
- `splitMode`
- `manualToRO`

Route allocation rules:

- Active plans A/B/C must normalize to 100%.
- Route values can be entered as percent or flow.
- Flow mode clamps values to available capacity.
- Manual source ratios are remembered when switching Optimize/Equal/Manual.

Phase 1.5 output is calculated in:

```js
calc
```

`calc` contains stream values such as:

- `feedFlow`
- `tssOutFlow`
- `tssRejectFlow`
- `ufOut`
- `ufBypass`
- `roIn`
- `roOut`
- `roRejectFlow`
- `ufRejectFlow`
- `totalReject`
- `finalProduct`
- `actualProductTDS`
- `totalRejectTDS`
- `sourceAllocations`
- per-route data under `calc.routes`

## Source Water Logic

Feed sources are stored in:

```js
sources
```

Defaults are in:

```js
DEFAULT_SOURCES
```

Each source has:

- `name`
- `flow`
- `ratio`
- `tds`
- `enabled`
- `costWater`
- `costElec`
- `costChem`
- `costOps`

Modes:

- `know-input`: user enters source flow.
- `know-output`: user enters ratios, and the app calculates required feed.

Source strategy in output mode:

- `optimize`
- `equal`
- `manual`

Important caution:

Manual ratios are persisted in `manualSourceRatios`. Do not break this behavior; users expect manual settings to be restored after switching out of Optimize/Equal.

## UF/RO Split Logic

UF/RO split can be:

- Auto Blend
- Manual Split

State:

- `splitMode`
- `manualToRO`
- `hasTargetCond`
- `targetCond`

If `hasTargetCond` is disabled, auto blend falls back to manual-style split behavior instead of solving from product Cond target.

Product quality status should only fail when `hasTargetCond` is enabled.

## Water Control

Water control exposes sliders for red control points in the Phase 1.5 diagram:

- UF Tank -> RO System / Bypass
- Final Tank -> Send to RIL / Mixed with P10
- Mixed UF/RO -> Wastewater / Return to Junction Inlet

Important state:

- `finalToRilPct`
- `treatedToWastePct`

Important derived object:

```js
waterControl
```

Reject routing rule:

- If total reject Cond is `<= 6000 uS/cm`, reject can go to discharge/reuse directly.
- If total reject Cond is `> 6000 uS/cm`, it must go through mixing/treatment first.

Keep this rule aligned with diagram arrows and labels.

## Dilution Simulation

Dilution source defaults:

```js
DEFAULT_DILUTION
```

Important state:

- `dilutionMode`
- `dilutionSources`
- `showDilutionSim`
- `safetyMargin`

Modes:

- Auto dilution
- Manual dilution

Engineering formula:

```text
QdReq = Qr * (Cr - Ct) / (Ct - Cd)
```

Important rule:

Final discharge conductivity must be calculated with a flow-weighted average:

```text
Final Cond = (Qr * Cr + sum(Qd * Cd)) / (Qr + sum(Qd))
```

Do not average dilution source conductivity without using source flows.

## Diagrams

Phase 1.5 active diagram:

```js
SvgBlueprintPhase15Diagram
```

Important requirement:

- Keep `viewBox="0 0 1700 800"` for the active Phase 1.5 SVG.
- Do not move nodes or pipes unless the user explicitly asks.
- Diagram must stay inside its own scrollable container.
- Page must not horizontally overflow.
- Horizontal scroll should happen only in the diagram area when the diagram is wider than the viewport.

Diagram features:

- Fullscreen mode
- Zoom in/out/reset
- Export SVG
- Export PNG

PNG export currently renders the diagram into a `2400 x 1070` canvas.

Phase 1.0 diagram:

```js
Phase10Diagram
```

Current Phase 1.0 diagram is based on the user's SVG layout but is simplified into maintainable JSX nodes and paths. It uses a `1700 x 800` viewBox.

## Cost Model

Cost is split into two layers:

1. Legacy UF/RO cost tables
2. Per-system group cost dashboard

The legacy UF/RO electricity and chemical tables are now treated as the cost data for:

```text
group_uf_ro_plan_A
```

Cost groups:

```js
COST_GROUPS = [
  group_uf_ro_plan_A,
  group_tss,
  group_water_treatment_system_after_ufro,
  group_final_from_p15,
  group_p15_plan_B,
  group_p15_plan_C
]
```

UF/RO group uses:

- `equipments`
- `cleaningEvents`
- `chemicalRows`
- `elecCalc`
- `chemCalc`

Other groups use:

- `groupMachines`
- `groupChemicals`
- `groupCostCalc`

Dashboard aggregation:

```js
sectionCostRows
costDashboard
```

Dashboard prioritizes cost per Q:

- Total per Q
- Electricity per Q
- Chemical per Q
- Labor per Q
- Total per day
- Total per month

`DonutChart` shows cost share by system. Its container must grow with the legend; do not reintroduce fixed-height clipping that overlaps later sections.

Labor cost is currently a project-level cost, not allocated to each system.

Raw water cost and dilution-water cost still exist in older summary logic but are not fully folded into the new system-by-system dashboard unless explicitly requested.

## UI Structure

Top project tabs:

- Phase 1.5
- Phase 1.0
- Project Diagram
- Project Financial

Only Phase 1.5 and Phase 1.0 are implemented as real workflows. Project Diagram and Project Financial are still placeholder/future tabs.

Most sections use the reusable:

```js
Section
```

Open/closed section state is stored in:

```js
sec
```

## Styling Rules In This Codebase

Styles are mostly inline through the `S` object.

Global responsive fixes live in:

```js
globalCSS
```

Important layout rules:

- Avoid `width: 100vw` on main containers.
- Use `minWidth: 0` for grid/flex children that contain scrollable areas.
- Use `overflowX: auto` only on table/diagram wrappers.
- Avoid horizontal page overflow.
- Keep tables inside `S.tableScroll`.
- Keep large SVG diagrams inside `S.diagramScrollWrapper`.

## Common Pitfalls

- Do not assume Phase 1.0 and Phase 1.5 targets are the same. They now have separate target states.
- Do not let Phase 1.5 `productFlow` drive Phase 1.0 mass balance.
- Do not expose API keys in the frontend if adding AI or backend integrations later.
- Do not remove manual-source-ratio persistence.
- Do not change the TDS/Cond conversion factor without checking all status and display logic.
- Do not add backend assumptions; the app is currently static-client only.
- Do not edit old parent-directory snapshots unless explicitly asked.
- Do not make SVG edits by shifting a single visual element when pipes/labels/control nodes also depend on the same coordinates.

## Verification Checklist

After code changes:

```bash
npm run build
```

Then run the Oxc transform check:

```bash
node --input-type=module -e "import { transformWithOxc } from 'vite'; import { readFile } from 'node:fs/promises'; const code = await readFile('src/ufro_v71.jsx','utf8'); await transformWithOxc(code, 'src/ufro_v71.jsx', { lang: 'jsx', jsx: { runtime: 'automatic' } }); console.log('ufro_v71 Oxc transform OK');"
```

Whitespace check when git is available:

```bash
git diff --check -- src/ufro_v71.jsx
```

If git reports dubious ownership on Windows, use:

```bash
git -c safe.directory='C:/Users/Advice/Desktop/JYN/UF_RO_project/ufro-web' -C 'C:/Users/Advice/Desktop/JYN/UF_RO_project/ufro-web' diff --check -- src/ufro_v71.jsx
```

For frontend changes, visually check:

- Phase 1.5 diagram at desktop width
- Phase 1.5 diagram scroll behavior at small width
- Phase 1.0 diagram and target controls
- Cost dashboard with donut chart
- No page-level horizontal overflow
- No text overlap in compact KPI/cards/buttons

## Product Direction

The user is iteratively building the system from engineering layouts/SVG references. When they provide SVG files, treat them as layout references for node order, group position, and pipe routing.

Preferred workflow for future additions:

1. Read the provided SVG/layout.
2. Extract node names, rough coordinates, and pipes.
3. Implement a maintainable JSX diagram, not a pasted raw SVG blob, unless the user explicitly asks for literal SVG embedding.
4. Add calculation state and controls incrementally.
5. Preserve existing Phase 1.5 behavior unless the user explicitly asks to change it.
6. Build and verify.

## Current Known Limitations

- Phase 1.0 logic is an initial working version. TSS currently does not change Cond/TDS.
- Phase 1.0 does not yet have a full stream table, cost group integration, dilution, or recommendation system.
- Project Diagram and Project Financial tabs remain placeholders.
- No persisted scenarios.
- No AI advisor integration yet.
- No backend.

