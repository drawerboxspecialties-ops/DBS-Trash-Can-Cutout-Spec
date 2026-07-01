'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../js/cutoutSpec.js');

const {
    SPEC_CONSTANTS,
    CAN_MODELS,
    round3,
    effectiveCutout,
    computeCenterBridge,
    rimOverhangPair,
    minOuterForCutoutDepth,
    calculateCutoutSpec
} = CS;

const RV35 = 'RV-35_CUSTOMER';
const RV50 = 'RV-50_V2_CUST';

function baseInput(overrides) {
    return Object.assign(
        {
            cabinetWidth: 11.375,
            cabinetDepth: 21,
            canQuantity: 1,
            canModel: RV35,
            rotateCan: true,
            sideThickness: 0.5
        },
        overrides || {}
    );
}

/** Golden cases — trace against customer PDF elevation @ 4.75″ grip (see README). */
describe('golden shop cases', () => {
    it('RV-35 rotated — default box fits with documented cutout', () => {
        const r = calculateCutoutSpec(baseInput());
        assert.equal(r.fits, true);
        assert.equal(r.effectiveCutout.width, 8.713);
        assert.equal(r.effectiveCutout.depth, 12.273);
        assert.equal(r.interior.width, 10.375);
        assert.equal(r.interior.depth, 20);
    });

    it('RV-35 standard — width and depth swap vs rotated', () => {
        const rot = effectiveCutout(CAN_MODELS[RV35], true);
        const std = effectiveCutout(CAN_MODELS[RV35], false);
        assert.equal(std.width, 12.273);
        assert.equal(std.depth, 8.713);
        assert.equal(std.width, rot.depth);
        assert.equal(std.depth, rot.width);
    });

    it('RV-50 standard — cutout from customer taper @ 4.75″ grip', () => {
        const cutout = effectiveCutout(CAN_MODELS[RV50], false);
        assert.equal(cutout.width, 12.162);
        assert.equal(cutout.depth, 8.608);
    });

    it('RV-50 rotated — swaps W/D vs standard', () => {
        const std = effectiveCutout(CAN_MODELS[RV50], false);
        const rot = effectiveCutout(CAN_MODELS[RV50], true);
        assert.equal(rot.width, 8.608);
        assert.equal(rot.depth, 12.162);
        assert.equal(rot.width, std.depth);
        assert.equal(rot.depth, std.width);
    });

    it('RV-35 required cabinet height = 1″ under-can + 17.85″ can', () => {
        const r = calculateCutoutSpec(baseInput());
        assert.equal(r.height.underCanSpace, 1);
        assert.equal(r.height.required, 18.85);
    });

    it('RV-50 required cabinet height = 1″ under-can + 21.75″ can', () => {
        const r = calculateCutoutSpec(baseInput({ canModel: RV50, rotateCan: false }));
        assert.equal(r.height.required, 22.75);
    });
});

/** Cases that commonly fail on the floor — box too small, lips, rim bridge, cubby rules. */
describe('floor failure cases', () => {
    it('RV-50 standard does not fit default 11.375 × 21 box', () => {
        const r = calculateCutoutSpec(baseInput({ canModel: RV50, rotateCan: false }));
        assert.equal(r.fits, false);
        assert.ok(r.effectiveCutout.width > r.panelSpan.width);
    });

    it('RV-50 standard fits when outer box is widened', () => {
        const r = calculateCutoutSpec(
            baseInput({ cabinetWidth: 14, cabinetDepth: 22, canModel: RV50, rotateCan: false })
        );
        assert.equal(r.fits, true);
    });

    it('shallow depth fails front lip minimum before cutout depth alone', () => {
        const r = calculateCutoutSpec(baseInput({ cabinetDepth: 14 }));
        const single = r.orientations[0];
        assert.equal(single.fits, false);
        assert.equal(single.marginOkFront, false);
        assert.ok(single.panelMarginFront < SPEC_CONSTANTS.WOOD_MARGIN_FRONT);
    });

    it('double side-by-side widens center bridge when rim taper requires clearance', () => {
        const r = calculateCutoutSpec(
            baseInput({ cabinetWidth: 24, cabinetDepth: 22, canQuantity: 2, rotateCan: false })
        );
        const side = r.orientations.find((o) => o.id === 'side-by-side');
        assert.ok(side.spacing.rimGoverns);
        assert.ok(side.spacing.bridgeW > SPEC_CONSTANTS.WOOD_MARGIN);
        assert.equal(side.spacing.bridgeW, 1.969);
    });

    it('rim overhang + center bridge enforces no contact at can top', () => {
        const cutout = effectiveCutout(CAN_MODELS[RV35], false);
        const top = { width: CAN_MODELS[RV35].taper.long.top, depth: CAN_MODELS[RV35].taper.short.top };
        const oh = rimOverhangPair(cutout, top);
        const bridge = computeCenterBridge('side-by-side', oh.ohW, oh.ohD);
        assert.ok(bridge.bridgeW + 1e-6 >= bridge.minRimBridgeW);
        assert.ok(bridge.minRimBridgeW > SPEC_CONSTANTS.WOOD_MARGIN);
    });

    it('min outer depth includes front and back solid lips on panel', () => {
        const cutoutD = effectiveCutout(CAN_MODELS[RV35], true).depth;
        const minOuter = minOuterForCutoutDepth(cutoutD, 0.5);
        const expectedInterior =
            cutoutD + SPEC_CONSTANTS.WOOD_MARGIN_BACK + SPEC_CONSTANTS.WOOD_MARGIN_FRONT;
        assert.equal(minOuter, round3(expectedInterior + 1));
    });

    it('5/8″ sides still fit default RV-35 rotated box', () => {
        const r = calculateCutoutSpec(baseInput({ sideThickness: 0.625 }));
        assert.equal(r.fits, true);
        assert.equal(r.interior.width, round3(11.375 - 2 * 0.625));
    });

    it('cabinet height below required blocks fit even when footprint fits', () => {
        const r = calculateCutoutSpec(baseInput({ cabinetHeight: 18 }));
        assert.equal(r.height.fits, false);
        assert.equal(r.fits, false);
    });
});
