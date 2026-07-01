'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../js/cutoutSpec.js');

const {
    SPEC_CONSTANTS,
    CAN_MODELS,
    round3,
    lipEnvelope,
    computeInterior,
    computePanelSpan,
    effectiveCutout,
    effectiveTop,
    computePanelMargins,
    cubbyInteriorOpenings,
    relayoutForCubby,
    calculateCutoutSpec
} = CS;

const RV35 = 'RV-35_CUSTOMER';
const RV50 = 'RV-50_V2_CUST';
const SIDE = 0.5;

function baseInput(overrides) {
    return Object.assign({
        cabinetWidth: 11.375,
        cabinetDepth: 21,
        canQuantity: 1,
        canModel: RV35,
        rotateCan: true,
        sideThickness: SIDE
    }, overrides || {});
}

describe('helpers', () => {
    it('round3 avoids float noise', () => {
        assert.equal(round3(10.3750000001), 10.375);
    });

    it('lipEnvelope adds groove depth to solid lip', () => {
        assert.equal(lipEnvelope(0.25), 0.5);
        assert.equal(lipEnvelope(1.0), 1.25);
    });

    it('computeInterior subtracts two side thicknesses', () => {
        assert.equal(computeInterior(11.375, 0.5), 10.375);
        assert.equal(computeInterior(21, 0.5), 20);
    });

    it('computePanelSpan equals interior (groove not deducted from span)', () => {
        assert.equal(computePanelSpan(10.375, 0.5, 0.25), 10.375);
    });
});

describe('can taper @ 4.75″ grip', () => {
    it('RV-35 rotated cutout matches shop trace dimensions', () => {
        const cutout = effectiveCutout(CAN_MODELS[RV35], true);
        assert.equal(cutout.width, 8.713);
        assert.equal(cutout.depth, 12.273);
    });

    it('RV-35 standard swaps width and depth vs rotated', () => {
        const std = effectiveCutout(CAN_MODELS[RV35], false);
        const rot = effectiveCutout(CAN_MODELS[RV35], true);
        assert.equal(std.width, rot.depth);
        assert.equal(std.depth, rot.width);
    });

    it('RV-50 produces positive cutout dimensions', () => {
        const cutout = effectiveCutout(CAN_MODELS[RV50], false);
        assert.ok(cutout.width > 8);
        assert.ok(cutout.depth > 8);
        const top = effectiveTop(CAN_MODELS[RV50], false);
        assert.ok(top.width >= cutout.width);
        assert.ok(top.depth >= cutout.depth);
    });
});

describe('calculateCutoutSpec', () => {
    it('rejects invalid input', () => {
        const r = calculateCutoutSpec({ canModel: 'NOPE', cabinetWidth: 1, cabinetDepth: 1, canQuantity: 1 });
        assert.equal(r.ok, false);
        assert.ok(r.errors.length > 0);
    });

    it('single RV-35 rotated fits default 11.375 × 21 box', () => {
        const r = calculateCutoutSpec(baseInput());
        assert.equal(r.ok, true);
        assert.equal(r.fits, true);
        assert.equal(r.autoSelected.id, 'single');
        assert.equal(r.interior.width, 10.375);
        assert.equal(r.interior.depth, 20);
    });

    it('double standard does not fit default box', () => {
        const r = calculateCutoutSpec(baseInput({ canQuantity: 2, rotateCan: false }));
        assert.equal(r.ok, true);
        assert.equal(r.fits, false);
        const side = r.orientations.find(o => o.id === 'side-by-side');
        assert.ok(side);
        assert.equal(side.fits, false);
    });

    it('double rotated side-by-side fails width on default box', () => {
        const r = calculateCutoutSpec(baseInput({ canQuantity: 2 }));
        const side = r.orientations.find(o => o.id === 'side-by-side');
        assert.equal(side.fits, false);
        assert.ok(side.requiredWidth > r.panelSpan.width);
    });

    it('height warning when cabinet height too low', () => {
        const r = calculateCutoutSpec(baseInput({ cabinetHeight: 10 }));
        assert.equal(r.ok, true);
        assert.equal(r.height.fits, false);
        assert.equal(r.fits, false);
        assert.ok(r.warnings.length > 0);
    });
});

describe('panel margins & cubby', () => {
    const panelSpan = { width: 10.375, depth: 20 };
    const cutout = effectiveCutout(CAN_MODELS[RV35], true);
    const bridge = { bridgeW: 1.25, bridgeD: 1.25 };

    it('centered single can has minimum front/back lips', () => {
        const m = computePanelMargins('single', cutout, panelSpan, { width: 'none', depth: 'none' }, bridge);
        assert.ok(m.panelMarginBack >= SPEC_CONSTANTS.WOOD_MARGIN_BACK - 1e-6);
        assert.ok(m.panelMarginFront >= SPEC_CONSTANTS.WOOD_MARGIN_FRONT - 1e-6);
        assert.equal(m.marginOkBack, true);
        assert.equal(m.marginOkFront, true);
    });

    it('back cubby uses divider lip instead of full back margin at cutout seam', () => {
        const m = computePanelMargins('single', cutout, panelSpan, { width: 'none', depth: 'back' }, bridge);
        assert.equal(m.marginOkBack, true);
        const slack = round3(panelSpan.depth - cutout.depth - SPEC_CONSTANTS.WOOD_MARGIN_FRONT - SPEC_CONSTANTS.WOOD_MARGIN_DIVIDER_SIDE);
        assert.equal(m.panelMarginBack, slack);
    });

    it('cubby opening on depth axis does not deduct lips on width axis', () => {
        const orient = calculateCutoutSpec(baseInput()).orientations[0];
        const layout = relayoutForCubby(orient, cutout, panelSpan, SIDE, { width: 'none', depth: 'back' });
        const openings = cubbyInteriorOpenings(layout, panelSpan, SIDE, { width: 'none', depth: 'back' });
        const back = openings.find(o => o.axis === 'depth' && o.side === 'back');
        assert.ok(back);
        assert.equal(back.width, panelSpan.width);
        assert.ok(back.depth >= SPEC_CONSTANTS.CUBBY_MIN);
    });

    it('left cubby reduces width opening by divider only on width axis', () => {
        const orient = calculateCutoutSpec(baseInput()).orientations[0];
        const layout = relayoutForCubby(orient, cutout, panelSpan, SIDE, { width: 'left', depth: 'none' });
        const openings = cubbyInteriorOpenings(layout, panelSpan, SIDE, { width: 'left', depth: 'none' });
        const left = openings.find(o => o.axis === 'width' && o.side === 'left');
        assert.ok(left);
        assert.equal(left.depth, panelSpan.depth);
        assert.equal(left.width, round3(layout.panelMarginLeft - SIDE));
    });
});

describe('double layout footprints', () => {
    it('side-by-side required width is 2 cutouts plus bridge', () => {
        const r = calculateCutoutSpec(baseInput({ canQuantity: 2, rotateCan: false }));
        const side = r.orientations.find(o => o.id === 'side-by-side');
        const cutout = r.effectiveCutout;
        const bridge = side.spacing.bridgeW;
        assert.equal(side.requiredWidth, round3(2 * cutout.width + bridge));
    });
});
