# cutoutSpec.js — function reference

Pure calculation engine for pullout trash can cutout specs. All dimensions are **inches** unless noted.

Use this doc to explain every export without opening the file. Run `npm test` to verify golden cases.

---

## Constants & product data

| Symbol | Purpose |
|--------|---------|
| `GRIP_FROM_CAN_BOTTOM` | 4.75″ — height on can taper where CNC traces cutout |
| `SPEC_CONSTANTS` | Panel lips, groove depth, min bridge, cubby min, panel height from box floor |
| `CAN_MODELS` | RV-35 and RV-50 taper matrices from customer PDF elevations |
| `SIDE_MATERIALS` / `DIVIDER_MATERIALS` | Stock thickness options (12 mm – ¾″) |
| `DEFAULT_SIDE_INCHES` | 0.625″ fallback side thickness |
| `DEFAULT_DIVIDER_INCHES` | 0.75″ (legacy default; UI uses side thickness for divider) |

---

## Low-level helpers

### `round3(n)`
Rounds to 3 decimal places; avoids float noise in displayed spec dimensions.

### `taperAt(bottom, top, totalHeight, height)`
Linear interpolation along can height. Used to get cross-section at grip.

### `gripCrossSectionCad(model)` / `gripCrossSection(model)`
Can width × depth at **4.75″** from can bottom (shop trace height).

### `rimCrossSection(model)` / `bottomCrossSection(model)`
Widest (top rim) and narrowest (base) cross-sections from product taper data.

### `lipEnvelope(solidLip)`
Total lip at cabinet wall = solid panel lip + ¼″ groove seat in box wall.

### `rimOverhangPair(cutout, top)`
How far the rim flares past the grip cutout on each axis — drives double-can bridge width.

---

## Box & panel geometry

### `computeInterior(outerDimension, sideThickness)`
Inside face to inside face: `outer − 2× side thickness`.

### `computePanelSpan(interiorDimension, sideThickness, grooveDepth)`
Routable panel length on one axis. **Equals interior** — grooves are in box walls, not deducted from panel span.

### `minOuterForInterior(interiorNeeded, sideThickness)`
Minimum outer box size for a required interior.

### `minOuterForCutout(cutoutSize, sideThickness)`
Shorthand: min outer when cutout block must fit interior on one axis.

### `minOuterForCutoutDepth(cutoutDepth, sideThickness)`
Min outer **depth** when cutout + back solid lip (0.25″) + front solid lip (1.0″) must fit on depth axis.

---

## Layout footprints & bridges

### `orient(dims, rotated)` / `effectiveCutout(model, rotated)` / `effectiveTop(model, rotated)`
Swap width/depth when can is installed rotated 90°.

### `computeCenterBridge(orientationId, ohW, ohD)`
Center bridge between two cutouts on double layouts. Uses `max(1.25″ structural, rim no-contact gap)`.

### `footprintFor(orientationId, cutout, centerBridge)`
Cutout block size on holding panel:
- **single** — one cutout
- **side-by-side** — `2×W + bridgeW`
- **front-to-back** — `2×D + bridgeD`

---

## Panel margins & cubbies

### `computePanelMargins(orientationId, cutout, panelSpan, cubbyPlacement, centerBridge)`
Solid wood left on holding panel around cutout(s).  
- No cubby → centered on panel (with min front/back lips).  
- Cubby on front/back → **0.25″ divider lip** at seam (not full 1.0″ front / 0.25″ back at that edge).  
- Cubby on left/right → can shifts; leftover margin becomes cubby side.

Returns `marginOkW`, `marginOkBack`, `marginOkFront` for validation.

### `analyzeCubbyOptions(orientationId, cutout, panelSpan, dividerThickness, centerBridge)`
Which cubby sides qualify. Opening = panel margin on that side **minus divider thickness**; must be ≥ `CUBBY_MIN` (3″).

### `cubbyInteriorOpenings(orientation, panelSpan, dividerThickness, cubbyPlacement)`
Actual cubby W×D openings for diagram/print. Perpendicular axis uses full panel interior (lips not deducted).

### `relayoutForCubby(orientation, cutout, panelSpan, dividerThickness, cubbyPlacement)`
Recomputes margins + cubby list after user picks a cubby side.

---

## Fit evaluation

### `evaluateOrientation(orientationId, cutout, panelSpan, model, dividerThickness, top, sideThickness, grooveDepth, outer)`
Checks one layout candidate:
1. Cutout block fits interior W×D  
2. Front/back solid lips meet minimums (unless cubby on that seam)  
3. Double layout: center bridge clears rim at top  

Returns `fits`, `validation` messages, margins, cubby options, spacing metadata.

---

## Main entry

### `calculateCutoutSpec(input)`

**Input:** `cabinetWidth`, `cabinetDepth`, `cabinetHeight` (optional), `canQuantity` (1|2), `canModel`, `rotateCan`, `sideThickness`.

**Output:**
- `outer` / `interior` / `panelSpan`
- `effectiveCutout`, `top`, `height` (required clearance)
- `orientations[]` — each evaluated layout
- `autoSelected` — when exactly one fits
- `choices` — when multiple fit
- `fits` — footprint and height both OK

**Height rule:** `required = (5.75 − 4.75) + can.totalHeight` = under-can slide space + full can height.

---

## Golden cases (verify against PDF trace)

See [README.md](../README.md#golden-shop-cases). Tests in `tests/goldenCases.test.js`.
