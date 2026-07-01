// cutoutSpec.js — Core calculation engine for the Cabinet Pullout Trash Can Cutout Spec tool.
//
// This module is pure (no DOM, no side effects) so it can be unit-tested and reused
// on a server, in a build step, or in the browser. All dimensions are in INCHES.
//
// Loaded as a UMD-style plain script so the tool works when the HTML is opened
// directly from disk (file://) — no ES module server required — while still being
// require()-able in Node. Everything is exposed on the global `CutoutSpec` object.

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / CommonJS
    }
    root.CutoutSpec = api;         // Browser global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

// ── Manufacturing constants ──────────────────────────────────────────────────

// Panel grips the can and CNC cutout is traced at this height on the tapering bin.
const GRIP_FROM_CAN_BOTTOM = 4.75;

const SPEC_CONSTANTS = Object.freeze({
    // Holding panel top surface, measured from the bottom of the box (cabinet floor).
    PANEL_TOP_FROM_BOX: 5.75,
    // Holding panel top surface, measured from the bottom of the can (same as cutout capture height).
    PANEL_TOP_FROM_CAN: GRIP_FROM_CAN_BOTTOM,
    // Solid panel wood left/right of cutout (minimum center bridge when rim allows).
    WOOD_MARGIN: 1.25,
    // Extra gap between tapered rim profiles on double layouts (strict no-contact at top).
    RIM_MIN_BRIDGE_GAP: 1 / 32,
    // Panel lip at front/back (solid wood on holding panel, cutout edge → panel end).
    // Groove seat is part of total lip at that end — not added on top of these solids.
    WOOD_MARGIN_FRONT: 1.0,    // 1.0″ solid → 1.25″ total front lip w/ 0.25″ groove
    WOOD_MARGIN_BACK: 0.25,    // 0.25″ solid → 0.5″ total back lip w/ 0.25″ in back groove
    // Front/back cubby divider seam — 0.25″ solid on panel, 0.25″ groove seated in divider (0.5″ total).
    WOOD_MARGIN_DIVIDER_SIDE: 0.25,
    // Nominal thickness of the maple holding panel the cutouts are routed into.
    PANEL_THICKNESS: 0.625,
    // A cubby is only functional (usable as accessory storage) at this minimum opening.
    CUBBY_MIN: 3.00,
    // Box walls (front, back, left, right) — holding panel seats in 1/4″ grooves on inside face.
    SIDE_THICKNESS: 0.625,   // 5/8″ default side material
    GROOVE_DEPTH: 0.25,       // 1/4″ dado in box front, back, and side walls for panel seat
    // CNC cutout cross-section height on the can — matches panel grip (GRIP_FROM_CAN_BOTTOM).
    CUTOUT_HEIGHT_FROM_BOTTOM: GRIP_FROM_CAN_BOTTOM
});

// ── Divider / panel materials ────────────────────────────────────────────────
// A vertical divider is installed between the can compartment and any added cubby.
// Its thickness consumes leftover space, so it directly reduces cubby opening size.
// Values are the material thickness expressed in INCHES.

/** Round to 3 decimals to avoid floating-point noise in displayed spec dimensions. */
function round3(n) {
    return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

const DIVIDER_MATERIALS = Object.freeze({
    '12mm':  { label: '12 mm',  inches: round3(12 / 25.4) },   // ≈ 0.472"
    '15mm':  { label: '15 mm',  inches: round3(15 / 25.4) },   // ≈ 0.591"
    '1/2in': { label: '1/2"',   inches: 0.5 },
    '5/8in': { label: '5/8"',   inches: 0.625 },
    '3/4in': { label: '3/4"',   inches: 0.75 }
});

// Side panel material options (same thickness scale as shop stock).
const SIDE_MATERIALS = Object.freeze({
    '12mm':  { label: '12 mm sides',  inches: round3(12 / 25.4) },
    '15mm':  { label: '15 mm sides',  inches: round3(15 / 25.4) },
    '1/2in': { label: '1/2″ sides',   inches: 0.5 },
    '5/8in': { label: '5/8″ sides',   inches: 0.625 },
    '3/4in': { label: '3/4″ sides',   inches: 0.75 }
});

const DEFAULT_SIDE_INCHES = 0.625;
const DEFAULT_DIVIDER_INCHES = 0.75;

// ── Product data matrices ────────────────────────────────────────────────────
// Taper from customer PDF elevation (base + rim). Shop traces true taper @ 4.75″ grip.

const CAN_MODELS = Object.freeze({
    'RV-35_CUSTOMER': Object.freeze({
        sku: 'RV-35_CUSTOMER',
        label: 'RV-35 QT-White',
        totalHeight: round3(17.85),   // 17.85″ per customer drawing
        taper: Object.freeze({
            // Elevation base + top rim (customer PDF)
            short: Object.freeze({ bottom: 8.08, top: 10.46 }),
            long: Object.freeze({ bottom: 11.57, top: 14.21 })
        }),
        cutoutCornerRadius: round3(1.18),   // R1.18 on customer drawing (reference)
        cutoutFromBottom: GRIP_FROM_CAN_BOTTOM
    }),
    'RV-50_V2_CUST': Object.freeze({
        sku: 'RV-50_V2_CUST',
        label: 'RV-50 QT-White',
        totalHeight: 21.75,           // 21.75″ per customer drawing
        taper: Object.freeze({
            // Elevation base + top rim (customer PDF)
            short: Object.freeze({ bottom: 8.09, top: 10.46 }),
            long: Object.freeze({ bottom: 11.59, top: 14.21 })
        }),
        cutoutCornerRadius: round3(1.13),   // R1.13 on customer drawing (reference)
        cutoutFromBottom: GRIP_FROM_CAN_BOTTOM
    })
});

// ── Small helpers ────────────────────────────────────────────────────────────

/** Linear taper: dimension at `height` inches from can bottom. */
function taperAt(bottom, top, totalHeight, height) {
    const t = Number(height) / Number(totalHeight);
    return round3(bottom + (top - bottom) * t);
}

/** CAD taper cross-section at panel grip (4.75″ from can bottom). */
function gripCrossSectionCad(model) {
    const { taper, totalHeight } = model;
    const h = GRIP_FROM_CAN_BOTTOM;
    return {
        width: taperAt(taper.long.bottom, taper.long.top, totalHeight, h),
        depth: taperAt(taper.short.bottom, taper.short.top, totalHeight, h)
    };
}

/** Shop CNC cutout — true taper profile @ 4.75″ grip (CAD interpolation). */
function gripCrossSection(model) {
    const cad = gripCrossSectionCad(model);
    return {
        width: round3(cad.width),
        depth: round3(cad.depth)
    };
}

/** Rim cross-section (top of can). Long axis = standard width. */
function rimCrossSection(model) {
    const { taper } = model;
    return { width: round3(taper.long.top), depth: round3(taper.short.top) };
}

/** Bottom cross-section. Long axis = standard width. */
function bottomCrossSection(model) {
    const { taper } = model;
    return { width: round3(taper.long.bottom), depth: round3(taper.short.bottom) };
}

/**
 * Inside-face-to-inside-face dimension from outer box size and side material.
 * User enters outer width/depth; sides consume 2×T from each axis.
 */
function computeInterior(outerDimension, sideThickness) {
    const T = Number(sideThickness) || DEFAULT_SIDE_INCHES;
    return round3(outerDimension - 2 * T);
}

/**
 * Usable holding-panel span on one axis — equals interior width/depth.
 * The panel runs inside face to inside face; 1/4″ grooves are cut into the
 * box front, back, and side walls — not deducted from routable panel length.
 */
function computePanelSpan(interiorDimension, sideThickness, grooveDepth) {
    void sideThickness;
    void grooveDepth;
    return round3(interiorDimension);
}

/** Minimum outer box dimension for a given interior requirement. */
function minOuterForInterior(interiorNeeded, sideThickness) {
    const T = Number(sideThickness) || DEFAULT_SIDE_INCHES;
    return round3(interiorNeeded + 2 * T);
}

/** Minimum outer dimension so a cutout (or cutout block) fits the interior. */
function minOuterForCutout(cutoutSize, sideThickness) {
    return minOuterForInterior(cutoutSize, sideThickness);
}

/** Total panel lip at one end (solid on panel + groove seat in the box wall). */
function lipEnvelope(solidLip) {
    return round3(solidLip + SPEC_CONSTANTS.GROOVE_DEPTH);
}

/** Minimum total back lip (0.25″ solid + 0.25″ groove seat). */
function minBackLipTotal() {
    return lipEnvelope(SPEC_CONSTANTS.WOOD_MARGIN_BACK);
}

/** Minimum outer depth: cutout + back solid lip + front solid lip on panel. */
function minOuterForCutoutDepth(cutoutDepth, sideThickness) {
    const { WOOD_MARGIN_BACK, WOOD_MARGIN_FRONT } = SPEC_CONSTANTS;
    return minOuterForInterior(
        cutoutDepth + WOOD_MARGIN_BACK + WOOD_MARGIN_FRONT,
        sideThickness
    );
}

/** @deprecated — symmetric margin helper */
function minOuterForCutoutWithWoodMargin(cutoutSize, sideThickness, woodMargin) {
    const M = Number(woodMargin) || SPEC_CONSTANTS.WOOD_MARGIN;
    return minOuterForInterior(cutoutSize + 2 * M, sideThickness);
}

/** @deprecated alias — kept for callers passing interior targets */
function minInteriorForPanelSpan(panelSpanNeeded, sideThickness, grooveDepth) {
    void grooveDepth;
    return round3(panelSpanNeeded);
}

/**
 * Which cubby sides are available — uses margin for each side as if that cubby were selected.
 *
 * @returns {Array<{axis, sides, openings, dividerThickness}>}
 */
function analyzeCubbyOptions(orientationId, cutout, panelSpan, dividerThickness, centerBridge) {
    const { CUBBY_MIN } = SPEC_CONSTANTS;
    const T = Number(dividerThickness) || 0;
    const opening = (margin) => round3(margin - T);
    const qualifies = (margin) => opening(margin) + 1e-6 >= CUBBY_MIN;
    const marginIf = (placement) => computePanelMargins(orientationId, cutout, panelSpan, placement, centerBridge);
    const cubbies = [];

    const widthSides = [];
    const widthOpenings = {};
    for (const side of ['left', 'right']) {
        const m = marginIf({ width: side, depth: 'none' });
        const margin = side === 'left' ? m.panelMarginLeft : m.panelMarginRight;
        if (qualifies(margin)) {
            widthSides.push(side);
            widthOpenings[side] = opening(margin);
        }
    }
    if (widthSides.length) {
        cubbies.push({
            axis: 'width',
            sides: widthSides,
            openings: widthOpenings,
            dividerThickness: round3(T)
        });
    }

    const depthSides = [];
    const depthOpenings = {};
    for (const side of ['back', 'front']) {
        const m = marginIf({ width: 'none', depth: side });
        const margin = side === 'back' ? m.panelMarginBack : m.panelMarginFront;
        if (qualifies(margin)) {
            depthSides.push(side);
            depthOpenings[side] = opening(margin);
        }
    }
    if (depthSides.length) {
        cubbies.push({
            axis: 'depth',
            sides: depthSides,
            openings: depthOpenings,
            dividerThickness: round3(T)
        });
    }

    return cubbies;
}

/**
 * Cubby openings per side — divider thickness is deducted; opening must be ≥ CUBBY_MIN.
 * @deprecated Use analyzeCubbyOptions for side availability.
 */
function analyzeCubbies({
    dividerThickness,
    panelMarginLeft,
    panelMarginRight,
    panelMarginBack,
    panelMarginFront
}) {
    const { CUBBY_MIN } = SPEC_CONSTANTS;
    const T = Number(dividerThickness) || 0;

    const opening = (margin) => round3(margin - T);
    const qualifies = (margin) => opening(margin) + 1e-6 >= CUBBY_MIN;

    const cubbies = [];

    const widthSides = [];
    const widthOpenings = {};
    if (qualifies(panelMarginLeft)) {
        widthSides.push('left');
        widthOpenings.left = opening(panelMarginLeft);
    }
    if (qualifies(panelMarginRight)) {
        widthSides.push('right');
        widthOpenings.right = opening(panelMarginRight);
    }
    if (widthSides.length) {
        cubbies.push({
            axis: 'width',
            sides: widthSides,
            openings: widthOpenings,
            dividerThickness: round3(T)
        });
    }

    const depthSides = [];
    const depthOpenings = {};
    if (qualifies(panelMarginBack)) {
        depthSides.push('back');
        depthOpenings.back = opening(panelMarginBack);
    }
    if (qualifies(panelMarginFront)) {
        depthSides.push('front');
        depthOpenings.front = opening(panelMarginFront);
    }
    if (depthSides.length) {
        cubbies.push({
            axis: 'depth',
            sides: depthSides,
            openings: depthOpenings,
            dividerThickness: round3(T)
        });
    }

    return cubbies;
}

/**
 * Interior cubby opening width × depth (inches).
 * Cubby-side axis: panel margin minus divider only.
 * Perpendicular axis: full panel interior (lips/grooves are not deducted from cubby size).
 *
 * @returns {Array<{axis:'width'|'depth', side:string, width:number, depth:number}>}
 */
function cubbyInteriorOpenings(orientation, panelSpan, dividerThickness, cubbyPlacement) {
    const cp = cubbyPlacement || { width: 'none', depth: 'none' };
    const T = Number(dividerThickness) || 0;
    const mL = orientation.panelMarginLeft != null ? orientation.panelMarginLeft : 0;
    const mR = orientation.panelMarginRight != null ? orientation.panelMarginRight : 0;
    const mB = orientation.panelMarginBack != null ? orientation.panelMarginBack : 0;
    const mF = orientation.panelMarginFront != null ? orientation.panelMarginFront : 0;
    const panelW = round3(panelSpan.width);
    const panelD = round3(panelSpan.depth);
    const cubbies = orientation.cubbies || [];
    const out = [];

    if (cp.width === 'left' || cp.width === 'right') {
        const wc = cubbies.find((c) => c.axis === 'width');
        const openW = wc && wc.openings[cp.width] != null
            ? wc.openings[cp.width]
            : round3((cp.width === 'left' ? mL : mR) - T);
        out.push({ axis: 'width', side: cp.width, width: openW, depth: panelD });
    }
    if (cp.depth === 'back' || cp.depth === 'front') {
        const dc = cubbies.find((c) => c.axis === 'depth');
        const openD = dc && dc.openings[cp.depth] != null
            ? dc.openings[cp.depth]
            : round3((cp.depth === 'back' ? mB : mF) - T);
        out.push({ axis: 'depth', side: cp.depth, width: panelW, depth: openD });
    }
    return out;
}

/** Rim flare beyond the grip cutout on each side (inches). */
function rimOverhangPair(cutout, top) {
    return {
        ohW: round3(Math.max(0, (top.width - cutout.width) / 2)),
        ohD: round3(Math.max(0, (top.depth - cutout.depth) / 2))
    };
}

/**
 * Center bridge between two cutouts on double layouts.
 * Uses max(structural WOOD_MARGIN, rim no-contact bridge on the paired axis).
 */
function computeCenterBridge(orientationId, ohW, ohD) {
    const { WOOD_MARGIN, RIM_MIN_BRIDGE_GAP } = SPEC_CONSTANTS;
    const minRimBridgeW = round3(2 * ohW + RIM_MIN_BRIDGE_GAP);
    const minRimBridgeD = round3(2 * ohD + RIM_MIN_BRIDGE_GAP);

    if (orientationId === 'side-by-side') {
        const bridgeW = round3(Math.max(WOOD_MARGIN, minRimBridgeW));
        return {
            bridgeW,
            bridgeD: WOOD_MARGIN,
            minRimBridgeW,
            minRimBridgeD,
            rimGoverns: bridgeW > WOOD_MARGIN + 1e-6
        };
    }
    if (orientationId === 'front-to-back') {
        const bridgeD = round3(Math.max(WOOD_MARGIN, minRimBridgeD));
        return {
            bridgeW: WOOD_MARGIN,
            bridgeD,
            minRimBridgeW,
            minRimBridgeD,
            rimGoverns: bridgeD > WOOD_MARGIN + 1e-6
        };
    }
    return {
        bridgeW: WOOD_MARGIN,
        bridgeD: WOOD_MARGIN,
        minRimBridgeW,
        minRimBridgeD,
        rimGoverns: false
    };
}

/**
 * Cutout block footprint on the holding panel.
 * Single: cutout only. Double: two cutouts + center bridge on the paired axis
 * (≥ 1.25″ structural, widened when rim taper requires no contact at the top).
 */
function footprintFor(orientationId, cutout, centerBridge) {
    const { WOOD_MARGIN } = SPEC_CONSTANTS;
    const w = cutout.width;
    const d = cutout.depth;
    const bridge = centerBridge || { bridgeW: WOOD_MARGIN, bridgeD: WOOD_MARGIN };
    const bridgeW = bridge.bridgeW != null ? bridge.bridgeW : WOOD_MARGIN;
    const bridgeD = bridge.bridgeD != null ? bridge.bridgeD : WOOD_MARGIN;

    let panelWidth, panelDepth;
    switch (orientationId) {
        case 'single':
            panelWidth = w;
            panelDepth = d;
            break;
        case 'side-by-side':
            panelWidth = 2 * w + bridgeW;
            panelDepth = d;
            break;
        case 'front-to-back':
            panelWidth = w;
            panelDepth = 2 * d + bridgeD;
            break;
        default:
            throw new Error(`Unknown orientation: ${orientationId}`);
    }

    return {
        panelWidth: round3(panelWidth),
        panelDepth: round3(panelDepth),
        spacing: {
            outerW: round3(WOOD_MARGIN),
            outerD: round3(WOOD_MARGIN),
            bridgeW: round3(bridgeW),
            bridgeD: round3(bridgeD),
            minRimBridgeW: round3(bridge.minRimBridgeW != null ? bridge.minRimBridgeW : 0),
            minRimBridgeD: round3(bridge.minRimBridgeD != null ? bridge.minRimBridgeD : 0),
            rimGoverns: !!bridge.rimGoverns,
            structuralBridge: round3(WOOD_MARGIN)
        }
    };
}

const ORIENTATION_LABELS = {
    'single': 'Single Can',
    'side-by-side': 'Side-by-Side',
    'front-to-back': 'Front-to-Back'
};

/**
 * Compute the effective cutout for a can, swapping width/depth when the can is
 * installed rotated 90° (long dimension running front-to-back rather than left-right).
 */
function effectiveCutout(model, rotated) {
    return orient(gripCrossSection(model), rotated);
}

/** Top rim (widest cross-section), auto-rotated with the can. */
function effectiveTop(model, rotated) {
    return orient(rimCrossSection(model), rotated);
}

/** Rotate a { width, depth } pair 90° when requested. */
function orient(dims, rotated) {
    return rotated
        ? { width: round3(dims.depth), depth: round3(dims.width) }
        : { width: round3(dims.width), depth: round3(dims.depth) };
}

/**
 * Panel wood margins (solid on holding panel).
 * No cubby: cutout centered on panel (width and depth).
 * Cubby selected: can shifts so leftover is on the cubby side.
 * Front/back cubby: 0.25″ solid lip at divider seam (0.5″ total w/ groove in divider).
 * Groove seat is extra 0.25″ in each side beyond these solids.
 */
function computePanelMargins(orientationId, cutout, panelSpan, cubbyPlacement, centerBridge) {
    const { WOOD_MARGIN, WOOD_MARGIN_FRONT, WOOD_MARGIN_BACK, WOOD_MARGIN_DIVIDER_SIDE } = SPEC_CONSTANTS;
    const divLip = WOOD_MARGIN_DIVIDER_SIDE;
    const w = cutout.width;
    const d = cutout.depth;
    const cp = cubbyPlacement || { width: 'none', depth: 'none' };
    const bridge = centerBridge || { bridgeW: WOOD_MARGIN, bridgeD: WOOD_MARGIN };
    const centerBridgeW = bridge.bridgeW != null ? bridge.bridgeW : WOOD_MARGIN;
    const centerBridgeD = bridge.bridgeD != null ? bridge.bridgeD : WOOD_MARGIN;

    let panelMarginLeft;
    let panelMarginRight;
    let panelMarginFront;
    let panelMarginBack;

    if (orientationId === 'side-by-side') {
        const blockW = 2 * w + centerBridgeW;
        if (cp.width === 'left') {
            panelMarginLeft = round3(panelSpan.width - blockW - WOOD_MARGIN);
            panelMarginRight = WOOD_MARGIN;
        } else if (cp.width === 'right') {
            panelMarginRight = round3(panelSpan.width - blockW - WOOD_MARGIN);
            panelMarginLeft = WOOD_MARGIN;
        } else {
            panelMarginLeft = round3((panelSpan.width - blockW) / 2);
            panelMarginRight = round3(panelSpan.width - blockW - panelMarginLeft);
        }
        if (cp.depth === 'back') {
            panelMarginBack = round3(panelSpan.depth - d - WOOD_MARGIN_FRONT - divLip);
            panelMarginFront = WOOD_MARGIN_FRONT;
        } else if (cp.depth === 'front') {
            panelMarginBack = WOOD_MARGIN_BACK;
            panelMarginFront = round3(panelSpan.depth - d - WOOD_MARGIN_BACK - divLip);
        } else {
            const slack = panelSpan.depth - d - WOOD_MARGIN_BACK - WOOD_MARGIN_FRONT;
            panelMarginBack = round3(WOOD_MARGIN_BACK + slack / 2);
            panelMarginFront = round3(WOOD_MARGIN_FRONT + slack / 2);
        }
    } else if (orientationId === 'front-to-back') {
        panelMarginLeft = cp.width === 'left'
            ? round3(panelSpan.width - w - WOOD_MARGIN)
            : cp.width === 'right'
                ? WOOD_MARGIN
                : round3((panelSpan.width - w) / 2);
        panelMarginRight = round3(panelSpan.width - w - panelMarginLeft);

        const blockD = 2 * d + centerBridgeD;
        if (cp.depth === 'back') {
            panelMarginBack = round3(panelSpan.depth - blockD - WOOD_MARGIN_FRONT - divLip);
            panelMarginFront = WOOD_MARGIN_FRONT;
        } else if (cp.depth === 'front') {
            panelMarginBack = WOOD_MARGIN_BACK;
            panelMarginFront = round3(panelSpan.depth - blockD - WOOD_MARGIN_BACK - divLip);
        } else {
            const slack = panelSpan.depth - blockD - WOOD_MARGIN_BACK - WOOD_MARGIN_FRONT;
            panelMarginBack = round3(WOOD_MARGIN_BACK + slack / 2);
            panelMarginFront = round3(WOOD_MARGIN_FRONT + slack / 2);
        }
    } else {
        if (cp.width === 'left') {
            panelMarginLeft = round3(panelSpan.width - w - WOOD_MARGIN);
            panelMarginRight = WOOD_MARGIN;
        } else if (cp.width === 'right') {
            panelMarginRight = round3(panelSpan.width - w - WOOD_MARGIN);
            panelMarginLeft = WOOD_MARGIN;
        } else {
            panelMarginLeft = round3((panelSpan.width - w) / 2);
            panelMarginRight = round3(panelSpan.width - w - panelMarginLeft);
        }

        if (cp.depth === 'back') {
            panelMarginBack = round3(panelSpan.depth - d - WOOD_MARGIN_FRONT - divLip);
            panelMarginFront = WOOD_MARGIN_FRONT;
        } else if (cp.depth === 'front') {
            panelMarginBack = WOOD_MARGIN_BACK;
            panelMarginFront = round3(panelSpan.depth - d - WOOD_MARGIN_BACK - divLip);
        } else {
            const slack = panelSpan.depth - d - WOOD_MARGIN_BACK - WOOD_MARGIN_FRONT;
            panelMarginBack = round3(WOOD_MARGIN_BACK + slack / 2);
            panelMarginFront = round3(WOOD_MARGIN_FRONT + slack / 2);
        }
    }

    const marginOkW = panelMarginLeft + 1e-6 >= WOOD_MARGIN && panelMarginRight + 1e-6 >= WOOD_MARGIN;
    // Front/back cubby: outer cabinet lip on one end; divider seam only needs divLip solid (0.5″ total w/ groove in divider).
    const marginOkBack = cp.depth === 'back'
        ? true
        : panelMarginBack + 1e-6 >= WOOD_MARGIN_BACK;
    const marginOkFront = cp.depth === 'front'
        ? true
        : panelMarginFront + 1e-6 >= WOOD_MARGIN_FRONT;

    return {
        panelMarginLeft,
        panelMarginRight,
        panelMarginBack,
        panelMarginFront,
        marginOkW,
        marginOkBack,
        marginOkFront
    };
}

/** Recompute panel margins and cubby options for a cubby placement choice. */
function relayoutForCubby(orientation, cutout, panelSpan, dividerThickness, cubbyPlacement) {
    const sp = orientation.spacing || {};
    const centerBridge = {
        bridgeW: sp.bridgeW != null ? sp.bridgeW : SPEC_CONSTANTS.WOOD_MARGIN,
        bridgeD: sp.bridgeD != null ? sp.bridgeD : SPEC_CONSTANTS.WOOD_MARGIN
    };
    const margins = computePanelMargins(orientation.id, cutout, panelSpan, cubbyPlacement, centerBridge);
    const {
        panelMarginLeft,
        panelMarginRight,
        panelMarginBack,
        panelMarginFront,
        marginOkW,
        marginOkBack,
        marginOkFront
    } = margins;
    const marginOk = marginOkBack && marginOkFront;
    const cubbies = orientation.fits
        ? analyzeCubbyOptions(orientation.id, cutout, panelSpan, dividerThickness, centerBridge)
        : [];

    return Object.assign({}, orientation, {
        panelMarginLeft,
        panelMarginRight,
        panelMarginBack,
        panelMarginFront,
        marginOkW,
        marginOkBack,
        marginOkFront,
        marginOk,
        lipBackTotal: lipEnvelope(panelMarginBack),
        lipFrontTotal: lipEnvelope(panelMarginFront),
        panelMarginW: panelMarginLeft,
        panelMarginD: panelMarginFront,
        cubbies
    });
}

/**
 * Evaluate one candidate arrangement against interior panel span.
 * Hard fail: cutout block exceeds interior, back solid lip < 0.5″, or front solid lip < 1.0″.
 */
function evaluateOrientation(orientationId, cutout, panelSpan, model, dividerThickness, top, sideThickness, grooveDepth, outer) {
    const { WOOD_MARGIN, WOOD_MARGIN_FRONT, WOOD_MARGIN_BACK, GROOVE_DEPTH } = SPEC_CONSTANTS;
    const T = Number(sideThickness) || DEFAULT_SIDE_INCHES;

    const overhang = rimOverhangPair(cutout, top);
    const ohW = overhang.ohW;
    const ohD = overhang.ohD;
    const centerBridge = computeCenterBridge(orientationId, ohW, ohD);
    const fp = footprintFor(orientationId, cutout, centerBridge);

    const widthFits = fp.panelWidth <= panelSpan.width + 1e-6;
    const depthFits = fp.panelDepth <= panelSpan.depth + 1e-6;

    const margins = computePanelMargins(orientationId, cutout, panelSpan, { width: 'none', depth: 'none' }, centerBridge);
    const {
        panelMarginLeft,
        panelMarginRight,
        panelMarginBack,
        panelMarginFront,
        marginOkW,
        marginOkBack,
        marginOkFront
    } = margins;

    const marginOk = marginOkBack && marginOkFront;

    const activeBridge = orientationId === 'side-by-side'
        ? centerBridge.bridgeW
        : orientationId === 'front-to-back'
            ? centerBridge.bridgeD
            : 0;
    const rimClearanceOk = orientationId === 'single' || activeBridge + 1e-6 >= (
        orientationId === 'side-by-side' ? centerBridge.minRimBridgeW : centerBridge.minRimBridgeD
    );
    const rimGapAtTop = orientationId === 'side-by-side'
        ? round3(centerBridge.bridgeW - 2 * ohW)
        : orientationId === 'front-to-back'
            ? round3(centerBridge.bridgeD - 2 * ohD)
            : 0;

    const fits = widthFits && depthFits && marginOk && rimClearanceOk;

    const outerLipBack = round3(T + lipEnvelope(panelMarginBack));
    const outerLipFront = round3(T + lipEnvelope(panelMarginFront));
    const outerLipW = round3(T + panelMarginLeft);

    const cubbies = fits
        ? analyzeCubbyOptions(orientationId, cutout, panelSpan, dividerThickness, centerBridge)
        : [];

    const validation = [];
    if (!widthFits) {
        if (orientationId === 'side-by-side' && centerBridge.rimGoverns) {
            validation.push(
                `Width needs ${fmtIn(fp.panelWidth)} — center bridge ${fmtIn(centerBridge.bridgeW)} for rim clearance (structural min ${WOOD_MARGIN}″).`
            );
        } else {
            validation.push(
                `Width needs ${fmtIn(fp.panelWidth)} interior (min outer ${fmtIn(minOuterForCutout(fp.panelWidth, T))}).`
            );
        }
    }
    if (!depthFits) {
        if (orientationId === 'front-to-back' && centerBridge.rimGoverns) {
            validation.push(
                `Depth needs ${fmtIn(fp.panelDepth)} — center bridge ${fmtIn(centerBridge.bridgeD)} for rim clearance (structural min ${WOOD_MARGIN}″).`
            );
        } else {
            validation.push(
                `Depth needs ${fmtIn(fp.panelDepth)} interior (min outer ${fmtIn(minOuterForCutout(fp.panelDepth, T))}).`
            );
        }
    }
    if (widthFits && depthFits && !marginOkBack) {
        validation.push(
            `Back lip ${fmtIn(panelMarginBack)} solid — min ${WOOD_MARGIN_BACK}″ ` +
            `(${fmtIn(minBackLipTotal())} total incl. ${fmtIn(GROOVE_DEPTH)} groove).`
        );
    }
    if (widthFits && depthFits && !marginOkFront) {
        validation.push(`Front lip ${fmtIn(panelMarginFront)} solid — min ${WOOD_MARGIN_FRONT}″ (+ ${fmtIn(GROOVE_DEPTH)} groove).`);
    }

    return {
        id: orientationId,
        label: ORIENTATION_LABELS[orientationId],
        requiredWidth: fp.panelWidth,
        requiredDepth: fp.panelDepth,
        widthFits,
        depthFits,
        marginOk,
        marginOkW,
        marginOkBack,
        marginOkFront,
        fits,
        structuralOk: marginOk,
        panelMarginLeft,
        panelMarginRight,
        panelMarginBack,
        panelMarginFront,
        lipBackTotal: lipEnvelope(panelMarginBack),
        lipFrontTotal: lipEnvelope(panelMarginFront),
        panelMarginW: panelMarginLeft,
        panelMarginD: panelMarginFront,
        outerLipW,
        outerLipBack,
        outerLipFront,
        outerLipD: outerLipFront,
        minOuterWidth: minOuterForCutout(fp.panelWidth, T),
        minOuterDepth: minOuterForCutout(fp.panelDepth, T),
        minOuterDepthWithLips: minOuterForCutoutDepth(cutout.depth, T),
        validation,
        cutout: {
            width: cutout.width,
            depth: cutout.depth,
            heightFromBottom: model.cutoutFromBottom
        },
        top: { width: top.width, depth: top.depth },
        rimClearanceOk,
        rimGapAtTop,
        spacing: Object.assign({}, fp.spacing, {
            rimOverhangW: ohW,
            rimOverhangD: ohD,
            rimGapAtTop,
            taperAdjusted: ohW > 1e-9 || ohD > 1e-9
        }),
        cubbies
    };
}

function fmtIn(n) {
    return round3(n).toFixed(3) + '"';
}

/**
 * MAIN ENTRY POINT.
 *
 * @param {object} input
 * @param {number} input.cabinetWidth   Outer box width (in).
 * @param {number} input.cabinetDepth   Outer box depth (in).
 * @param {number} input.cabinetHeight  Interior clear height (in).
 * @param {number} input.canQuantity    1 or 2.
 * @param {string} input.canModel       Key into CAN_MODELS.
 * @param {boolean} [input.rotateCan]   Install can rotated 90° (swaps cutout W/D).
 *
 * @returns {object} A structured, UI-ready result.
 */
function calculateCutoutSpec(input) {
    const errors = [];

    const model = CAN_MODELS[input && input.canModel];
    if (!model) {
        errors.push(`Unknown can model "${input && input.canModel}". Expected one of: ${Object.keys(CAN_MODELS).join(', ')}.`);
    }

    const outer = {
        width: Number(input && input.cabinetWidth),
        depth: Number(input && input.cabinetDepth),
        height: Number(input && input.cabinetHeight)
    };

    for (const key of ['width', 'depth']) {
        if (!Number.isFinite(outer[key]) || outer[key] <= 0) {
            errors.push(`Box outer ${key} must be a positive number.`);
        }
    }

    const qty = Number(input && input.canQuantity);
    if (![1, 2].includes(qty)) {
        errors.push('Can quantity must be 1 or 2.');
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    // ── Height clearance (informational; only gates fit if a height was supplied) ─
    // The holding panel top is fixed 5.75" from the box floor and 4.75" from the can
    // bottom, so the space beneath the can (slide/hardware stack) is their difference.
    // Required interior clearance = under-can space + full can height.
    const { PANEL_TOP_FROM_BOX, PANEL_TOP_FROM_CAN, PANEL_THICKNESS } = SPEC_CONSTANTS;
    const underCanSpace = round3(PANEL_TOP_FROM_BOX - PANEL_TOP_FROM_CAN);
    const requiredHeight = round3(underCanSpace + model.totalHeight);
    const holdingPanelTop = PANEL_TOP_FROM_BOX;
    const heightProvided = Number.isFinite(outer.height) && outer.height > 0;
    const heightFits = heightProvided ? outer.height + 1e-6 >= requiredHeight : true;

    // ── Orientation candidates ────────────────────────────────────────────────
    const rotated = !!(input && input.rotateCan);
    const cutout = effectiveCutout(model, rotated);
    const top = effectiveTop(model, rotated);

    const sideThickness = Number(input && input.sideThickness) > 0
        ? Number(input.sideThickness)
        : DEFAULT_SIDE_INCHES;
    const dividerThickness = sideThickness;
    const grooveDepth = SPEC_CONSTANTS.GROOVE_DEPTH;

    const interior = {
        width: computeInterior(outer.width, sideThickness),
        depth: computeInterior(outer.depth, sideThickness)
    };

    const panelSpan = {
        width: computePanelSpan(interior.width, sideThickness, grooveDepth),
        depth: computePanelSpan(interior.depth, sideThickness, grooveDepth)
    };

    const candidateIds = qty === 1 ? ['single'] : ['side-by-side', 'front-to-back'];
    const orientations = candidateIds.map(id =>
        evaluateOrientation(id, cutout, panelSpan, model, dividerThickness, top, sideThickness, grooveDepth, outer)
    );

    // A configuration is valid only if BOTH footprint and height fit.
    const validOrientations = heightFits ? orientations.filter(o => o.fits) : [];

    // ── Selection logic ───────────────────────────────────────────────────────
    // Both fit  → present as choices. Only one fits → auto-select it.
    let autoSelected = null;
    let choices = [];
    if (validOrientations.length === 1) {
        autoSelected = validOrientations[0];
    } else if (validOrientations.length > 1) {
        choices = validOrientations;
    }

    const warnings = [];
    if (heightProvided && !heightFits) {
        warnings.push(
            `Cabinet height ${outer.height}" is below the required ${requiredHeight}" ` +
            `(${underCanSpace}" beneath can + ${model.totalHeight}" can).`
        );
    } else if (validOrientations.length === 0) {
        warnings.push(
            qty === 2
                ? 'Neither double layout fits — rim clearance may require a wider center bridge than 1.25″.'
                : 'CNC cutout does not fit the interior space (check outer box size and side thickness).'
        );
    }

    return {
        ok: true,
        errors: [],
        warnings,
        model: { sku: model.sku, label: model.label, totalHeight: model.totalHeight },
        outer,
        interior,
        cabinet: outer,
        panelSpan,
        sideThickness,
        grooveDepth,
        canQuantity: qty,
        rotated,
        effectiveCutout: cutout,
        top,
        taperConsidered: top.width > cutout.width + 1e-9 || top.depth > cutout.depth + 1e-9,
        dividerThickness,
        constants: SPEC_CONSTANTS,
        height: {
            required: requiredHeight,
            provided: heightProvided,
            fits: heightFits,
            underCanSpace,
            holdingPanelTop,                          // from box floor (5.75")
            panelTopFromCan: PANEL_TOP_FROM_CAN,      // from can bottom (4.75")
            panelThickness: PANEL_THICKNESS
        },
        orientations,
        validOrientations,
        autoSelected,
        choices,
        // Convenience flag for the UI.
        fits: heightFits && validOrientations.length > 0
    };
}

// ── Public API ────────────────────────────────────────────────────────────────
return {
    SPEC_CONSTANTS, CAN_MODELS, SIDE_MATERIALS, DIVIDER_MATERIALS,
    GRIP_FROM_CAN_BOTTOM, DEFAULT_SIDE_INCHES, DEFAULT_DIVIDER_INCHES,
    round3, taperAt, gripCrossSectionCad, gripCrossSection, rimCrossSection, bottomCrossSection, lipEnvelope,
    rimOverhangPair, computeCenterBridge,
    computeInterior, computePanelSpan, minOuterForInterior, minOuterForCutout,
    minOuterForCutoutDepth, minOuterForCutoutWithWoodMargin, minInteriorForPanelSpan,
    computePanelMargins, analyzeCubbies, analyzeCubbyOptions, cubbyInteriorOpenings, relayoutForCubby, effectiveCutout, effectiveTop, calculateCutoutSpec
};

});
