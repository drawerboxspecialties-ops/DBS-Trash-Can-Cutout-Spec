(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };

function showFatal(msg) {
    var el = $('results');
    if (el) {
        el.innerHTML = '<div class="status-banner status-banner--err"><span class="status-icon">!</span><div>' + msg + '</div></div>';
    }
}

try {

if (!window.CutoutSpec) {
    showFatal('Could not load <strong>cutoutSpec.js</strong>. Serve from the project root so <code>js/cutoutSpec.js</code> loads.');
    return;
}

var CS = window.CutoutSpec;
if (typeof CS.calculateCutoutSpec !== 'function' || typeof CS.relayoutForCubby !== 'function' || typeof CS.cubbyInteriorOpenings !== 'function') {
    showFatal('cutoutSpec.js is outdated. Hard-refresh (Ctrl+F5).');
    return;
}

var calculateCutoutSpec = CS.calculateCutoutSpec;
var CAN_MODELS = CS.CAN_MODELS;
var SPEC_CONSTANTS = CS.SPEC_CONSTANTS;
var SIDE_MATERIALS = CS.SIDE_MATERIALS;
var DEFAULT_SIDE_INCHES = CS.DEFAULT_SIDE_INCHES;
var relayoutForCubby = CS.relayoutForCubby;
var cubbyInteriorOpenings = CS.cubbyInteriorOpenings;
var lipEnvelope = CS.lipEnvelope;

if (!SIDE_MATERIALS) {
    showFatal('cutoutSpec.js is missing SIDE_MATERIALS. Hard-refresh (Ctrl+F5).');
    return;
}

var state = {
    canModel: 'RV-35_CUSTOMER',
    canQuantity: 1,
    rotateCan: true,
    sideKey: '1/2in',
    cubbySel: {},
    diagramView: {
        zoom: 1,
        panX: 0,
        panY: 0,
        showRim: false,
        showLips: false,
        selectedOrientId: null
    },
    printReady: false,
    lastPrintPack: null
};

var DEFAULTS = {
    canModel: 'RV-35_CUSTOMER',
    canQuantity: 1,
    rotateCan: true,
    sideKey: '1/2in',
    cabWidth: '11.375',
    cabDepth: '21',
    cabHeight: '',
    includeCansOrder: false,
    orderCanQty: '1'
};

function defaultDiagramView() {
    return {
        zoom: 1,
        panX: 0,
        panY: 0,
        showRim: false,
        showLips: false,
        selectedOrientId: null
    };
}

function resetAll() {
    state.canModel = DEFAULTS.canModel;
    state.canQuantity = DEFAULTS.canQuantity;
    state.rotateCan = DEFAULTS.rotateCan;
    state.sideKey = DEFAULTS.sideKey;
    state.cubbySel = {};
    state.diagramView = defaultDiagramView();

    $('canModel').value = DEFAULTS.canModel;
    $('sideMaterial').value = DEFAULTS.sideKey;
    $('cabWidth').value = DEFAULTS.cabWidth;
    $('cabDepth').value = DEFAULTS.cabDepth;
    $('cabHeight').value = DEFAULTS.cabHeight;
    $('includeCansOrder').checked = DEFAULTS.includeCansOrder;
    $('orderCanQty').value = DEFAULTS.orderCanQty;

    document.querySelectorAll('#qtySeg button').forEach(function (b) {
        b.classList.toggle('active', Number(b.dataset.qty) === DEFAULTS.canQuantity);
    });
    document.querySelectorAll('#rotSeg button').forEach(function (b) {
        b.classList.toggle('active', (b.dataset.rot === '1') === DEFAULTS.rotateCan);
    });

    ['cabWidth', 'cabDepth'].forEach(function (id) {
        var el = $(id);
        el.classList.remove('input--invalid');
        var err = $(id + 'Err');
        if (err) err.hidden = true;
    });

    syncOrderCanQtyVisibility();
    render();
}

function sideInches() {
    const m = SIDE_MATERIALS[state.sideKey];
    return (m && m.inches) || DEFAULT_SIDE_INCHES;
}

(function initMaterialSelects() {
    $('sideMaterial').innerHTML = Object.entries(SIDE_MATERIALS)
        .map(([key, m]) => `<option value="${key}"${key === state.sideKey ? ' selected' : ''}>${m.label} (${m.inches.toFixed(3)}″)</option>`)
        .join('');
    $('canModel').innerHTML = Object.keys(CAN_MODELS)
        .map(function (key) {
            var m = CAN_MODELS[key];
            return '<option value="' + key + '"' + (key === state.canModel ? ' selected' : '') + '>' + m.label + '</option>';
        })
        .join('');
})();

function cubbyFor(orientId) {
    if (!state.cubbySel[orientId]) state.cubbySel[orientId] = { width: 'none', depth: 'none' };
    return state.cubbySel[orientId];
}

function fmt(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '″';
}

function validateCabinetField(id, errId) {
    const el = $(id);
    const err = $(errId);
    const val = parseFloat(el.value);
    let msg = '';
    if (!Number.isFinite(val) || val <= 0) msg = 'Enter a positive dimension in inches.';
    el.classList.toggle('input--invalid', !!msg);
    if (err) {
        err.textContent = msg;
        err.hidden = !msg;
    }
    return !msg;
}

function readInput() {
    var wOk = validateCabinetField('cabWidth', 'cabWidthErr');
    var dOk = validateCabinetField('cabDepth', 'cabDepthErr');
    state.canModel = $('canModel').value;
    return {
        cabinetWidth: parseFloat($('cabWidth').value),
        cabinetDepth: parseFloat($('cabDepth').value),
        canQuantity: state.canQuantity,
        canModel: state.canModel,
        rotateCan: state.rotateCan,
        sideThickness: sideInches(),
        valid: wOk && dOk
    };
}

function statusInlineHtml(r) {
    if (r.fits && r.autoSelected) {
        return '<div class="layout-status layout-status--ok"><span class="layout-status__icon">✓</span><span>Fits — ' + escAttr(r.autoSelected.label) + '</span></div>';
    }
    if (r.fits) {
        return '<div class="layout-status layout-status--ok"><span class="layout-status__icon">✓</span><span>Fits</span></div>';
    }
    return '<div class="layout-status layout-status--err"><span class="layout-status__icon">✗</span><span>Does not fit — enlarge box or change layout</span></div>';
}

function keyMetricsHtml(interior, cutout) {
    return (
        '<div class="layout-metrics">' +
            '<div class="layout-metric layout-metric--primary">' +
                '<span class="layout-metric__label">Cut out opening</span>' +
                '<span class="layout-metric__val">' + fmt(cutout.width) + ' × ' + fmt(cutout.depth) + '</span>' +
            '</div>' +
            '<div class="layout-metric">' +
                '<span class="layout-metric__label">Interior of box</span>' +
                '<span class="layout-metric__val">' + fmt(interior.width) + ' × ' + fmt(interior.depth) + '</span>' +
            '</div>' +
        '</div>'
    );
}

function round(n) { return Math.round(n * 1000) / 1000; }

let diagramUid = 0;
const SCREEN_DIAGRAM = { w: 560, h: 380, pad: 34 };

function fmtThin(n) {
    return Number(n).toFixed(3).replace(/\.?0+$/, '') + '″';
}

function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function sideMaterialLabel() {
    var m = SIDE_MATERIALS[state.sideKey];
    return m ? m.label + ' (' + fmt(m.inches) + ')' : fmt(sideInches());
}

function cubbyPlacementLabel(layout, chosen, panelSpan) {
    var openings = cubbyInteriorOpenings(layout, panelSpan, sideInches(), chosen);
    if (!openings.length) return 'None';
    var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
    return openings.map(function (o) {
        return cap(o.side) + ' — opening ' + fmt(o.width) + ' × ' + fmt(o.depth);
    }).join(' · ');
}

function cubbyDimLabel(dims) {
    return fmtThin(dims.width) + '×' + fmtThin(dims.depth);
}

function printTimestamp() {
    return new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function boxHeightPrint() {
    var v = parseFloat($('cabHeight').value);
    return (isFinite(v) && v > 0) ? v : null;
}

function boxHeightPrintLabel() {
    var h = boxHeightPrint();
    return h != null ? fmt(h) : '—';
}

function syncOrderCanQtyVisibility() {
    var wrap = $('orderCanQtyWrap');
    var cb = $('includeCansOrder');
    if (wrap && cb) wrap.hidden = !cb.checked;
}

function orderCansPrintLine(model) {
    var cb = $('includeCansOrder');
    if (!cb || !cb.checked) return null;
    var n = parseInt($('orderCanQty').value, 10);
    if (!isFinite(n) || n < 1) n = 1;
    return escAttr(model.label) + ' × ' + n;
}

function boxMaterialLabel() {
    return sideMaterialLabel();
}

function buildPrintSheetHtml(r, layout, outer, interior, cutout, chosen) {
    var model = r.model;
    var qty = r.canQuantity;
    var cutCount = layout.id === 'single' ? 1 : 2;
    var rotLabel = r.rotated ? 'Rotated 90°' : 'Standard';
    var sideT = sideInches();
    var cutoutLine = cutCount === 1
        ? fmt(cutout.width) + ' × ' + fmt(cutout.depth)
        : cutCount + '× ' + fmt(cutout.width) + ' × ' + fmt(cutout.depth);
    var cubbyLine = cubbyPlacementLabel(layout, chosen, { width: interior.width, depth: interior.depth });

    var dg = buildDiagram(layout, outer, interior, cutout, chosen, {
        sideT: sideT,
        groove: SPEC_CONSTANTS.GROOVE_DEPTH,
        dividerIn: sideT,
        rotated: r.rotated,
        forPrint: true
    });

    var boxH = boxHeightPrint();
    var outerSize = fmt(outer.width) + ' × ' + fmt(outer.depth) + (boxH != null ? ' × ' + fmt(boxH) : '');

    var rows = function (pairs) {
        return pairs.map(function (pair) {
            return '<tr><th>' + pair[0] + '</th><td>' + pair[1] + '</td></tr>';
        }).join('');
    };

    var specRows = [
        ['Layout', escAttr(layout.label) + ' · ' + rotLabel],
        ['Box size', outerSize],
        ['Box material', escAttr(boxMaterialLabel())],
        ['Cut out opening', cutoutLine],
        ['Cubby', escAttr(cubbyLine)]
    ];
    var cansLine = orderCansPrintLine(model);
    if (cansLine) specRows.push(['Cans with order', cansLine]);

    return (
        '<header class="print-header">' +
            '<h1>Shop Floor — Cutout Spec</h1>' +
        '</header>' +
        '<div class="print-highlight">' +
            '<div class="print-highlight__item"><span>Box outer</span><strong>' + fmt(outer.width) + ' × ' + fmt(outer.depth) + '</strong></div>' +
            '<div class="print-highlight__item"><span>Box height</span><strong>' + boxHeightPrintLabel() + '</strong></div>' +
            '<div class="print-highlight__item"><span>Interior</span><strong>' + fmt(interior.width) + ' × ' + fmt(interior.depth) + '</strong></div>' +
            '<div class="print-highlight__item print-highlight__item--primary"><span>Cut out</span><strong>' + cutoutLine + '</strong></div>' +
        '</div>' +
        '<div class="print-spec"><table class="print-table">' + rows(specRows) + '</table></div>' +
        '<section class="print-diagram">' +
            '<h2>Plan view</h2>' +
            '<div class="print-diagram__frame">' + dg.svg + '</div>' +
        '</section>'
    );
}

function updatePrintSheet(r, layout, outer, interior, cutout, chosen) {
    var sheet = $('printSheet');
    if (!sheet) return;
    if (!r || !r.ok || !layout) {
        sheet.innerHTML = '';
        state.printReady = false;
        return;
    }
    sheet.innerHTML = buildPrintSheetHtml(r, layout, outer, interior, cutout, chosen);
    state.printReady = !!layout.fits;
}

function printShopSheet() {
    if (!state.printReady) return;
    window.print();
}

function hitRect(r1, x, y, w, h, title, detail) {
    if (w < 0.5 || h < 0.5) return '';
    return '<rect class="dg-hit" data-tip-title="' + escAttr(title) + '" data-tip="' + escAttr(detail) + '" x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" fill="transparent" pointer-events="all"/>';
}

// Top-down layout diagram — back=top, front=bottom.
function buildDiagram(orientation, outer, interior, cutout, chosen, opts) {
    chosen = chosen || { width: 'none', depth: 'none' };
    opts = opts || {};
    const forPrint = !!opts.forPrint;
    const outerW = Number(outer.width) || 1;
    const outerD = Number(outer.depth) || 1;
    const labelBand = forPrint ? 26 : 0;
    let VW, VH, pad, scale, shiftX = 0, shiftY = 0;
    if (forPrint) {
        VW = 600;
        VH = 480;
        pad = 52;
        scale = Math.min((VW - pad) / outerW, (VH - pad - labelBand * 2) / outerD);
    } else {
        var stIn = opts.sideT != null ? opts.sideT : 0;
        var mL = orientation.panelMarginLeft || 0;
        var mR = orientation.panelMarginRight || 0;
        var mB = orientation.panelMarginBack || 0;
        var mF = orientation.panelMarginFront || 0;
        var reqWIn = orientation.requiredWidth || cutout.width;
        var reqDIn = orientation.requiredDepth || cutout.depth;
        var bxIn = stIn + mL;
        var byIn = stIn + mB;
        var leftIn = Math.min(0, bxIn);
        var topIn = Math.min(0, byIn);
        var rightIn = Math.max(outerW, bxIn + reqWIn, stIn + mL + reqWIn + mR + stIn);
        var bottomIn = Math.max(outerD, byIn + reqDIn, stIn + mB + reqDIn + mF + stIn);
        var drawWIn = rightIn - leftIn;
        var drawDIn = bottomIn - topIn;
        pad = SCREEN_DIAGRAM.pad;
        VW = SCREEN_DIAGRAM.w;
        VH = SCREEN_DIAGRAM.h;
        var availW = VW - pad * 2;
        var availH = VH - pad * 2;
        scale = Math.min(availW / drawWIn, availH / drawDIn);
        var marginX = (availW - drawWIn * scale) / 2;
        var marginY = (availH - drawDIn * scale) / 2;
        shiftX = pad + marginX + (-leftIn) * scale;
        shiftY = pad + marginY + (-topIn) * scale;
    }
    const r1 = (n) => Number(n).toFixed(1);
    const uid = `dg${++diagramUid}`;

    const sideT = opts.sideT != null ? opts.sideT : 0;
    const dividerIn = opts.dividerIn != null ? opts.dividerIn : sideT;
    const groove = opts.groove != null ? opts.groove : SPEC_CONSTANTS.GROOVE_DEPTH;
    const st = sideT * scale;
    const divT = dividerIn * scale;
    const g = groove * scale;

    const ow = outerW * scale;
    const od = outerD * scale;
    const ox = forPrint ? (VW - ow) / 2 : shiftX;
    const oy = forPrint
        ? labelBand + (VH - labelBand * 2 - od) / 2
        : shiftY;

    const iw = interior.width * scale;
    const id = interior.depth * scale;
    const ix = ox + st;
    const iy = oy + st;
    const px = ix;
    const py = iy;
    const pw = iw;
    const pd = id;

    const mLeft = orientation.panelMarginLeft * scale;
    const mRight = orientation.panelMarginRight * scale;
    const mBack = orientation.panelMarginBack * scale;
    const mFront = orientation.panelMarginFront * scale;

    const bw = cutout.width * scale;
    const bd = cutout.depth * scale;
    const spacing = orientation.spacing || {};
    const topRim = orientation.top || cutout;
    const brW = (spacing.bridgeW || 0) * scale;
    const brD = (spacing.bridgeD || 0) * scale;
    const ohW = (spacing.rimOverhangW || 0) * scale;
    const ohD = (spacing.rimOverhangD || 0) * scale;
    const rimW = topRim.width * scale;
    const rimD = topRim.depth * scale;
    const bridgeIn = orientation.id === 'side-by-side'
        ? (spacing.bridgeW || 0)
        : orientation.id === 'front-to-back'
            ? (spacing.bridgeD || 0)
            : 0;

    const reqW = orientation.requiredWidth * scale;
    const reqD = orientation.requiredDepth * scale;
    const bx = px + mLeft;
    const by = py + mBack;
    const panelSpan = { width: interior.width, depth: interior.depth };
    const divSideLip = SPEC_CONSTANTS.WOOD_MARGIN_DIVIDER_SIDE * scale;
    var cubbyOpenings = cubbyInteriorOpenings(orientation, panelSpan, dividerIn, chosen);
    var showCabGrooveBack = chosen.depth !== 'back';
    var showCabGrooveFront = chosen.depth !== 'front';
    var showCabGrooveLeft = chosen.width !== 'left';
    var showCabGrooveRight = chosen.width !== 'right';

    function drawDividerGrooveFace(gx, gy, gw, gh, edge) {
        if (g < 0.2 || gw < 0.2) return;
        var tip = '¼″ groove in divider · ' + fmtThin(SPEC_CONSTANTS.WOOD_MARGIN_DIVIDER_SIDE) + ' panel lip seats here';
        if (edge === 'bottom') {
            var gy0 = gy + gh - g;
            if (forPrint) {
                parts.push('<line x1="' + r1(gx) + '" y1="' + r1(gy + gh) + '" x2="' + r1(gx + gw) + '" y2="' + r1(gy + gh) + '" stroke="' + ink.grooveStroke + '" stroke-width="0.75"/>');
            } else {
                parts.push('<rect x="' + r1(gx) + '" y="' + r1(gy0) + '" width="' + r1(gw) + '" height="' + r1(g) + '" fill="#6B4F2A" opacity="0.85"/>');
            }
            hits.push(hitRect(r1, gx, gy0, gw, g, 'Divider groove', tip));
        } else if (edge === 'top') {
            if (forPrint) {
                parts.push('<line x1="' + r1(gx) + '" y1="' + r1(gy) + '" x2="' + r1(gx + gw) + '" y2="' + r1(gy) + '" stroke="' + ink.grooveStroke + '" stroke-width="0.75"/>');
            } else {
                parts.push('<rect x="' + r1(gx) + '" y="' + r1(gy) + '" width="' + r1(gw) + '" height="' + r1(g) + '" fill="#6B4F2A" opacity="0.85"/>');
            }
            hits.push(hitRect(r1, gx, gy, gw, g, 'Divider groove', tip));
        } else if (edge === 'right') {
            var gx0 = gx + gw - g;
            if (forPrint) {
                parts.push('<line x1="' + r1(gx + gw) + '" y1="' + r1(gy) + '" x2="' + r1(gx + gw) + '" y2="' + r1(gy + gh) + '" stroke="' + ink.grooveStroke + '" stroke-width="0.75"/>');
            } else {
                parts.push('<rect x="' + r1(gx0) + '" y="' + r1(gy) + '" width="' + r1(g) + '" height="' + r1(gh) + '" fill="#6B4F2A" opacity="0.85"/>');
            }
            hits.push(hitRect(r1, gx0, gy, g, gh, 'Divider groove', tip));
        } else if (edge === 'left') {
            if (forPrint) {
                parts.push('<line x1="' + r1(gx) + '" y1="' + r1(gy) + '" x2="' + r1(gx) + '" y2="' + r1(gy + gh) + '" stroke="' + ink.grooveStroke + '" stroke-width="0.75"/>');
            } else {
                parts.push('<rect x="' + r1(gx) + '" y="' + r1(gy) + '" width="' + r1(g) + '" height="' + r1(gh) + '" fill="#6B4F2A" opacity="0.85"/>');
            }
            hits.push(hitRect(r1, gx, gy, g, gh, 'Divider groove', tip));
        }
    }

    function cubbyDims(axis, side) {
        for (var ci = 0; ci < cubbyOpenings.length; ci++) {
            if (cubbyOpenings[ci].axis === axis && cubbyOpenings[ci].side === side) {
                return cubbyOpenings[ci];
            }
        }
        return null;
    }

    function centerOpeningLabel(x, y, w, h, cutW, cutD) {
        if (forPrint || w < 22 || h < 18) return;
        var fs = Math.round(Math.min(22, Math.max(14, Math.min(w, h) * 0.2)));
        var cx = x + w / 2;
        var cy = y + h / 2;
        var line1 = fmtThin(cutW);
        var line2 = '\u00d7 ' + fmtThin(cutD);
        var boxW = Math.min(w - 8, Math.max(Math.max(line1.length, line2.length) * fs * 0.58 + 16, 88));
        var boxH = fs * 2.55;
        parts.push('<rect class="dg-opening__bg" x="' + r1(cx - boxW / 2) + '" y="' + r1(cy - boxH / 2) + '" width="' + r1(boxW) + '" height="' + r1(boxH) + '" rx="5"/>');
        parts.push('<text x="' + r1(cx) + '" y="' + r1(cy - fs * 0.38) + '" text-anchor="middle" dominant-baseline="middle" class="dg-opening" font-size="' + fs + '">' + line1 + '</text>');
        parts.push('<text x="' + r1(cx) + '" y="' + r1(cy + fs * 0.58) + '" text-anchor="middle" dominant-baseline="middle" class="dg-opening" font-size="' + fs + '">' + line2 + '</text>');
    }

    function centerText(x, y, w, h, lines, cls) {
        if (w < 18 || h < 12) return;
        var arr = Array.isArray(lines) ? lines : [lines];
        cls = cls || 'dg-div';
        var lineH = cls === 'dg-ply' ? 10 : cls === 'dg-cubby-dim' ? 16 : 11;
        var startY = y + h / 2 - ((arr.length - 1) * lineH) / 2;
        arr.forEach(function (line, i) {
            parts.push('<text x="' + r1(x + w / 2) + '" y="' + r1(startY + i * lineH) + '" text-anchor="middle" dominant-baseline="middle" class="' + cls + '">' + line + '</text>');
        });
    }

    function centerCubbyDim(x, y, w, h, dims) {
        if (forPrint || !dims || w < 32 || h < 24) return;
        var label = cubbyDimLabel(dims);
        var cx = x + w / 2;
        var cy = y + h / 2;
        var fs = Math.round(Math.min(18, Math.max(13, Math.min(w, h) * 0.14)));
        var boxW = Math.min(Math.max(w - 8, 80), 140);
        var boxH = fs + 14;
        parts.push('<rect class="dg-cubby-dim__bg" x="' + r1(cx - boxW / 2) + '" y="' + r1(cy - boxH / 2) + '" width="' + r1(boxW) + '" height="' + r1(boxH) + '" rx="5"/>');
        parts.push('<text x="' + r1(cx) + '" y="' + r1(cy) + '" text-anchor="middle" dominant-baseline="middle" class="dg-cubby-dim" font-size="' + fs + '">' + label + '</text>');
    }

    const parts = [];
    const hits = [];
    const dimColor = forPrint ? '#000' : '#C05621';
    const ink = forPrint ? {
        shellFill: '#fff', shellStroke: '#000', shellSw: 1.5,
        sideFill: '#E5E7EB', sideStroke: '#9CA3AF', sideSw: 0.75,
        panelFill: '#fff', panelStroke: '#000', panelSw: 1.25,
        grooveStroke: '#000',
        pieceFill: 'none', pieceStroke: '#000', pieceSw: 1,
        cubbyFill: '#FFEB3B', cubbyStroke: '#000', cubbySw: 1.25,
        rimStroke: '#000', rimSw: 1,
        interiorStroke: '#000',
        dividerStroke: '#000', dividerFill: '#fff'
    } : null;

    function printOrientLabel(cx, cy, text, anchor) {
        anchor = anchor || 'middle';
        var tw = text.length * 8 + 12;
        var th = 18;
        var x0 = anchor === 'end' ? cx - tw : (anchor === 'start' ? cx : cx - tw / 2);
        parts.push('<rect class="dg-orient-lbl__bg" x="' + r1(x0) + '" y="' + r1(cy - th / 2) + '" width="' + r1(tw) + '" height="' + r1(th) + '" rx="2"/>');
        parts.push('<text x="' + r1(cx) + '" y="' + r1(cy) + '" text-anchor="' + anchor + '" dominant-baseline="middle" class="dg-orient-lbl">' + text + '</text>');
    }

    function printRegionLabel(cx, cy, lines, opts) {
        if (!forPrint) return;
        opts = opts || {};
        if (opts.minW != null && opts.minH != null && (opts.minW < 22 || opts.minH < 14)) return;
        var arr = Array.isArray(lines) ? lines : [lines];
        var lineH = 9;
        var maxLen = 0;
        arr.forEach(function (l) { if (l.length > maxLen) maxLen = l.length; });
        var boxW = Math.min(Math.max(maxLen * 5.2 + 8, 48), opts.maxW || 118);
        var boxH = arr.length * lineH + 4;
        parts.push('<rect class="dg-print-name__bg" x="' + r1(cx - boxW / 2) + '" y="' + r1(cy - boxH / 2) + '" width="' + r1(boxW) + '" height="' + r1(boxH) + '" rx="2"/>');
        var startY = cy - ((arr.length - 1) * lineH) / 2;
        arr.forEach(function (line, i) {
            parts.push('<text class="dg-print-name" x="' + r1(cx) + '" y="' + r1(startY + i * lineH) + '" text-anchor="middle" dominant-baseline="middle">' + line + '</text>');
        });
    }

    const bins = [];
    if (orientation.id === 'single') {
        bins.push([bx, by, bw, bd]);
    } else if (orientation.id === 'side-by-side') {
        bins.push([bx, by, bw, bd]);
        bins.push([bx + bw + brW, by, bw, bd]);
    } else {
        bins.push([bx, by, bw, bd]);
        bins.push([bx, by + bd + brD, bw, bd]);
    }

    const lipBack = forPrint ? 'none' : (orientation.marginOkBack ? '#9AE6B4' : '#FC8181');
    const lipFront = forPrint ? 'none' : (orientation.marginOkFront ? '#9AE6B4' : '#FC8181');
    const lipSide = forPrint ? 'none' : (orientation.marginOkW ? '#B2F5EA' : '#FC8181');
    const binStroke = forPrint ? '#000' : (orientation.fits ? '#2C5282' : '#A0AEC0');
    const binFill = forPrint ? '#fff' : (orientation.fits ? '#4299E1' : '#E2E8F0');

    if (forPrint) {
        parts.push(`<defs>
            <pattern id="${uid}-div" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="#000" stroke-width="0.8"/>
            </pattern>
        </defs>`);
    } else {
        parts.push(`<defs>
            <pattern id="${uid}-div" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="3" height="3" fill="#A0AEC0"/>
                <line x1="0" y1="0" x2="0" y2="3" stroke="#718096" stroke-width="0.75"/>
            </pattern>
        </defs>`);
    }

    const thicknessDim = (x, y, w, h) => {
        const label = fmtThin(dividerIn);
        const gap = 3;
        if (w >= h) {
            const mid = x + w / 2;
            const below = y > py + pd * 0.55;
            const y0 = below ? y + h + gap : y - gap;
            const yEdge = below ? y + h : y;
            parts.push(`<line x1="${r1(x)}" y1="${r1(y0)}" x2="${r1(x)}" y2="${r1(yEdge)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            parts.push(`<line x1="${r1(x + w)}" y1="${r1(y0)}" x2="${r1(x + w)}" y2="${r1(yEdge)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            parts.push(`<line x1="${r1(x)}" y1="${r1(y0)}" x2="${r1(x + w)}" y2="${r1(y0)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            parts.push(`<text x="${r1(mid)}" y="${r1(below ? y0 + 8 : y0 - 2)}" text-anchor="middle" class="dg-div">${label}</text>`);
        } else {
            const mid = y + h / 2;
            const right = x > px + pw * 0.5;
            const x0 = right ? x + w + gap : x - gap;
            const xEdge = right ? x + w : x;
            parts.push(`<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(xEdge)}" y2="${r1(y)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            parts.push(`<line x1="${r1(x0)}" y1="${r1(y + h)}" x2="${r1(xEdge)}" y2="${r1(y + h)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            parts.push(`<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x0)}" y2="${r1(y + h)}" stroke="${dimColor}" stroke-width="0.65"/>`);
            var anchor = right ? 'start' : 'end';
            parts.push('<text x="' + r1(right ? x0 + 2 : x0 - 2) + '" y="' + r1(mid) + '" text-anchor="' + anchor + '" dominant-baseline="middle" class="dg-div">' + label + '</text>');
        }
    };

    const drawDivider = (x, y, w, h, skipDim) => {
        if (w < 0.05 && h < 0.05) return;
        var dFill = forPrint ? 'url(#' + uid + '-div)' : 'url(#' + uid + '-div)';
        var dStroke = forPrint ? ink.dividerStroke : '#2D3748';
        var dSw = forPrint ? 1 : 1.35;
        parts.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${dFill}" stroke="${dStroke}" stroke-width="${dSw}"/>`);
        if (!skipDim && !forPrint) thicknessDim(x, y, w, h);
        hits.push(hitRect(r1, x, y, w, h, 'Cubby divider', fmtThin(dividerIn) + ' stock · full panel span'));
    };

    parts.push('<g class="dg-layer-shell">');
    if (forPrint) {
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy)}" width="${r1(ow)}" height="${r1(od)}" rx="2" fill="${ink.shellFill}" stroke="${ink.shellStroke}" stroke-width="${ink.shellSw}"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy)}" width="${r1(ow)}" height="${r1(st)}" fill="${ink.sideFill}" stroke="${ink.sideStroke}" stroke-width="${ink.sideSw}"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy + od - st)}" width="${r1(ow)}" height="${r1(st)}" fill="${ink.sideFill}" stroke="${ink.sideStroke}" stroke-width="${ink.sideSw}"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(iy)}" width="${r1(st)}" height="${r1(id)}" fill="${ink.sideFill}" stroke="${ink.sideStroke}" stroke-width="${ink.sideSw}"/>`);
        parts.push(`<rect x="${r1(ox + ow - st)}" y="${r1(iy)}" width="${r1(st)}" height="${r1(id)}" fill="${ink.sideFill}" stroke="${ink.sideStroke}" stroke-width="${ink.sideSw}"/>`);
    } else {
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy)}" width="${r1(ow)}" height="${r1(od)}" rx="4" fill="#EDF2F7" stroke="#4A5568" stroke-width="2"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy)}" width="${r1(ow)}" height="${r1(st)}" fill="#A0AEC0" opacity="0.55"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(oy + od - st)}" width="${r1(ow)}" height="${r1(st)}" fill="#A0AEC0" opacity="0.55"/>`);
        parts.push(`<rect x="${r1(ox)}" y="${r1(iy)}" width="${r1(st)}" height="${r1(id)}" fill="#A0AEC0" opacity="0.55"/>`);
        parts.push(`<rect x="${r1(ox + ow - st)}" y="${r1(iy)}" width="${r1(st)}" height="${r1(id)}" fill="#A0AEC0" opacity="0.55"/>`);
    }
    parts.push('</g>');
    hits.push(hitRect(r1, ox, oy, ow, od, 'Outer box', fmtThin(outerW) + ' W × ' + fmtThin(outerD) + ' D'));

    parts.push('<g class="dg-layer-panel">');
    if (forPrint) {
        parts.push(`<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(pd)}" fill="${ink.panelFill}" stroke="${ink.panelStroke}" stroke-width="${ink.panelSw}"/>`);
        if (g > 0.2) {
            if (showCabGrooveBack) {
                parts.push(`<line x1="${r1(px)}" y1="${r1(py)}" x2="${r1(px + pw)}" y2="${r1(py)}" stroke="${ink.grooveStroke}" stroke-width="0.75"/>`);
            }
            if (showCabGrooveFront) {
                parts.push(`<line x1="${r1(px)}" y1="${r1(py + pd)}" x2="${r1(px + pw)}" y2="${r1(py + pd)}" stroke="${ink.grooveStroke}" stroke-width="0.75"/>`);
            }
            if (showCabGrooveLeft) {
                parts.push(`<line x1="${r1(px)}" y1="${r1(py)}" x2="${r1(px)}" y2="${r1(py + pd)}" stroke="${ink.grooveStroke}" stroke-width="0.75"/>`);
            }
            if (showCabGrooveRight) {
                parts.push(`<line x1="${r1(px + pw)}" y1="${r1(py)}" x2="${r1(px + pw)}" y2="${r1(py + pd)}" stroke="${ink.grooveStroke}" stroke-width="0.75"/>`);
            }
        }
    } else {
        parts.push(`<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(pd)}" fill="#E8D5B5" stroke="#B08968" stroke-width="1.25"/>`);
        if (g > 0.2) {
            if (showCabGrooveBack) {
                parts.push(`<rect x="${r1(px)}" y="${r1(py - g)}" width="${r1(pw)}" height="${r1(g)}" fill="#6B4F2A" opacity="0.65"/>`);
            }
            if (showCabGrooveFront) {
                parts.push(`<rect x="${r1(px)}" y="${r1(py + pd)}" width="${r1(pw)}" height="${r1(g)}" fill="#6B4F2A" opacity="0.65"/>`);
            }
            if (showCabGrooveLeft) {
                parts.push(`<rect x="${r1(px - g)}" y="${r1(py)}" width="${r1(g)}" height="${r1(pd)}" fill="#6B4F2A" opacity="0.45"/>`);
            }
            if (showCabGrooveRight) {
                parts.push(`<rect x="${r1(px + pw)}" y="${r1(py)}" width="${r1(g)}" height="${r1(pd)}" fill="#6B4F2A" opacity="0.45"/>`);
            }
        }
    }
    parts.push('</g>');
    var panelGrooveTip = 'Maple panel · seats in ¼″ grooves in box walls';
    if (chosen.depth === 'back' || chosen.depth === 'front') {
        panelGrooveTip += ' (front/back seam uses divider groove)';
    }
    if (chosen.width === 'left' || chosen.width === 'right') {
        panelGrooveTip += ' (side seam uses divider groove)';
    }
    hits.push(hitRect(r1, px, py, pw, pd, 'Holding panel', panelGrooveTip));

    if (!forPrint) {
        function drawCutoutLips(binX, binY, binW, binH, lipOpts) {
            lipOpts = lipOpts || {};
            var showBack = lipOpts.back !== false && mBack > 0.3 && chosen.depth !== 'back';
            var showFront = lipOpts.front !== false && mFront > 0.3 && chosen.depth !== 'front';
            var showLeft = lipOpts.left !== false && mLeft > 0.3 && chosen.width !== 'left';
            var showRight = lipOpts.right !== false && mRight > 0.3 && chosen.width !== 'right';
            if (showBack) {
                parts.push(`<rect x="${r1(binX)}" y="${r1(binY - mBack)}" width="${r1(binW)}" height="${r1(mBack)}" fill="${lipBack}" opacity="0.55"/>`);
                hits.push(hitRect(r1, binX, binY - mBack, binW, mBack, 'Back lip', fmtThin(orientation.panelMarginBack) + ' solid (' + fmtThin(lipEnvelope(orientation.panelMarginBack)) + ' total w/ groove)'));
            }
            if (showFront) {
                parts.push(`<rect x="${r1(binX)}" y="${r1(binY + binH)}" width="${r1(binW)}" height="${r1(mFront)}" fill="${lipFront}" opacity="0.55"/>`);
                hits.push(hitRect(r1, binX, binY + binH, binW, mFront, 'Front lip', fmtThin(orientation.panelMarginFront) + ' solid (' + fmtThin(lipEnvelope(orientation.panelMarginFront)) + ' total w/ groove)'));
            }
            if (showLeft) {
                parts.push(`<rect x="${r1(binX - mLeft)}" y="${r1(binY)}" width="${r1(mLeft)}" height="${r1(binH)}" fill="${lipSide}" opacity="0.4"/>`);
                hits.push(hitRect(r1, binX - mLeft, binY, mLeft, binH, 'Side lip', fmtThin(orientation.panelMarginLeft) + ' solid'));
            }
            if (showRight) {
                parts.push(`<rect x="${r1(binX + binW)}" y="${r1(binY)}" width="${r1(mRight)}" height="${r1(binH)}" fill="${lipSide}" opacity="0.4"/>`);
                hits.push(hitRect(r1, binX + binW, binY, mRight, binH, 'Side lip', fmtThin(orientation.panelMarginRight) + ' solid'));
            }
        }
        parts.push('<g class="dg-layer-lips">');
        bins.forEach(function (bin, i) {
            var lipOpts = {};
            if (orientation.id === 'side-by-side') {
                lipOpts.left = i === 0;
                lipOpts.right = i === bins.length - 1;
            } else if (orientation.id === 'front-to-back') {
                lipOpts.back = i === 0;
                lipOpts.front = i === bins.length - 1;
            }
            drawCutoutLips(bin[0], bin[1], bin[2], bin[3], lipOpts);
        });
        parts.push('</g>');
    }

    var cutCount = bins.length;
    var panelTip = cutCount === 1
        ? 'Single ply panel · ' + fmtThin(cutout.width) + ' × ' + fmtThin(cutout.depth) + ' cut out opening @ 4.75″ grip'
        : 'Single ply panel · ' + cutCount + ' cut out openings @ ' + fmtThin(cutout.width) + ' × ' + fmtThin(cutout.depth)
            + (bridgeIn > 0 ? ' · center bridge ' + fmtThin(bridgeIn) + ' (solid panel)' : '');

    parts.push('<g class="dg-layer-cutout-piece">');
    if (forPrint) {
        parts.push('<rect x="' + r1(bx) + '" y="' + r1(by) + '" width="' + r1(reqW) + '" height="' + r1(reqD) + '" fill="' + ink.pieceFill + '" stroke="' + ink.pieceStroke + '" stroke-width="' + ink.pieceSw + '" stroke-dasharray="4 3"/>');
    } else {
        parts.push('<rect x="' + r1(bx) + '" y="' + r1(by) + '" width="' + r1(reqW) + '" height="' + r1(reqD) + '" fill="#F5E6C8" fill-opacity="0.35" stroke="#8B6914" stroke-width="1.5"/>');
    }
    var labelPerBin = !forPrint && (bins.length === 1 || bins.every(function (b) { return b[2] >= 72; }));
    bins.forEach(function (bin) {
        var x = bin[0], y = bin[1], w = bin[2], h = bin[3];
        var rx = forPrint ? 0 : 3;
        parts.push('<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '" rx="' + rx + '" fill="' + binFill + '" fill-opacity="' + (forPrint ? 1 : 0.5) + '" stroke="' + binStroke + '" stroke-width="' + (forPrint ? 1.75 : 2) + '"/>');
        if (labelPerBin) {
            centerOpeningLabel(x, y, w, h, cutout.width, cutout.depth);
        }
    });
    if (!forPrint && bins.length > 1 && !labelPerBin) {
        centerOpeningLabel(bx, by, reqW, orientation.id === 'side-by-side' ? bd : reqD, cutout.width, cutout.depth);
    }
    if (!forPrint && !orientation.fits) {
        if (bx + reqW > px + pw + 0.5) {
            parts.push('<line x1="' + r1(px + pw) + '" y1="' + r1(py) + '" x2="' + r1(px + pw) + '" y2="' + r1(py + pd) + '" stroke="#E53E3E" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.85"/>');
        }
        if (by + reqD > py + pd + 0.5) {
            parts.push('<line x1="' + r1(px) + '" y1="' + r1(py + pd) + '" x2="' + r1(px + pw) + '" y2="' + r1(py + pd) + '" stroke="#E53E3E" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.85"/>');
        }
    }
    if (cutCount > 1 && orientation.id === 'side-by-side' && brW > 0.3) {
        centerText(bx + bw, by, brW, bd, '1 PLY', 'dg-ply');
    } else if (cutCount > 1 && orientation.id === 'front-to-back' && brD > 0.3) {
        centerText(bx, by + bd, bw, brD, '1 PLY', 'dg-ply');
    }
    hits.push(hitRect(r1, bx, by, reqW, reqD, 'Holding panel (1 ply)', panelTip));
    parts.push('</g>');

    if (!forPrint && spacing.taperAdjusted) {
        parts.push('<g class="dg-layer-rim">');
        bins.forEach(function (bin) {
            var x = bin[0], y = bin[1];
            parts.push(`<rect x="${r1(x - ohW)}" y="${r1(y - ohD)}" width="${r1(rimW)}" height="${r1(rimD)}" rx="3" fill="none" stroke="#E53E3E" stroke-width="1.25" stroke-dasharray="4 3" opacity="0.9"/>`);
            hits.push(hitRect(r1, x - ohW, y - ohD, rimW, rimD, 'Top rim', fmtThin(topRim.width) + ' × ' + fmtThin(topRim.depth)));
        });
        parts.push('</g>');
    }

    // Cubbies + dividers (same stock as sides — scaled to true thickness)
    function cubby(x, y, w, h) {
        var cw = Math.max(w, 0);
        var ch = Math.max(h, 0);
        if (forPrint) {
            return '<rect class="dg-cubby" x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(cw) + '" height="' + r1(ch) + '" fill="' + ink.cubbyFill + '" stroke="' + ink.cubbyStroke + '" stroke-width="' + ink.cubbySw + '"/>';
        }
        return '<rect class="dg-cubby" x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(cw) + '" height="' + r1(ch) + '" rx="3" fill="#FFEB3B" fill-opacity="0.72" stroke="#B7791F" stroke-width="1.75" stroke-dasharray="5 3"/>';
    }

    parts.push('<g class="dg-layer-cubby">');
    if (chosen.width === 'left') {
        var cwL = bx - divT - px;
        var dimsL = cubbyDims('width', 'left');
        parts.push(cubby(px, py, cwL, pd));
        drawDivider(bx - divT, py, divT, pd, true);
        drawDividerGrooveFace(bx - divT, py, divT, pd, 'right');
        centerCubbyDim(px, py, cwL, pd, dimsL);
        if (forPrint) printRegionLabel(px + cwL / 2, py + pd / 2, dimsL ? ['Cubby interior', cubbyDimLabel(dimsL)] : 'Cubby interior', { minW: cwL, minH: pd, maxW: 96 });
        if (dimsL) hits.push(hitRect(r1, px, py, cwL, pd, 'Accessory cubby', 'Interior opening ' + fmt(dimsL.width) + ' × ' + fmt(dimsL.depth)));
    }
    if (chosen.width === 'right') {
        var cwR = px + pw - (bx + reqW + divT);
        var dimsR = cubbyDims('width', 'right');
        parts.push(cubby(bx + reqW + divT, py, cwR, pd));
        drawDivider(bx + reqW, py, divT, pd, true);
        drawDividerGrooveFace(bx + reqW, py, divT, pd, 'left');
        centerCubbyDim(bx + reqW + divT, py, cwR, pd, dimsR);
        if (forPrint) printRegionLabel(bx + reqW + divT + cwR / 2, py + pd / 2, dimsR ? ['Cubby interior', cubbyDimLabel(dimsR)] : 'Cubby interior', { minW: cwR, minH: pd, maxW: 96 });
        if (dimsR) hits.push(hitRect(r1, bx + reqW + divT, py, cwR, pd, 'Accessory cubby', 'Interior opening ' + fmt(dimsR.width) + ' × ' + fmt(dimsR.depth)));
    }
    if (chosen.depth === 'back') {
        var chB = by - divT - divSideLip - py;
        var dimsB = cubbyDims('depth', 'back');
        var divBackY = by - divT - divSideLip;
        parts.push(cubby(px, py, pw, chB));
        drawDivider(px, divBackY, pw, divT, true);
        drawDividerGrooveFace(px, divBackY, pw, divT, 'bottom');
        if (divSideLip > 0.3 && !forPrint) {
            parts.push('<rect x="' + r1(px) + '" y="' + r1(by - divSideLip) + '" width="' + r1(pw) + '" height="' + r1(divSideLip) + '" fill="#9AE6B4" opacity="0.55"/>');
            hits.push(hitRect(r1, px, by - divSideLip, pw, divSideLip, 'Divider-side lip', fmtThin(SPEC_CONSTANTS.WOOD_MARGIN_DIVIDER_SIDE) + ' solid (0.5″ total w/ groove in divider)'));
        }
        centerCubbyDim(px, py, pw, chB, dimsB);
        if (forPrint) printRegionLabel(px + pw / 2, py + chB / 2, dimsB ? ['Cubby interior', cubbyDimLabel(dimsB)] : 'Cubby interior', { minW: pw, minH: chB, maxW: 96 });
        if (dimsB) hits.push(hitRect(r1, px, py, pw, chB, 'Accessory cubby', 'Interior opening ' + fmt(dimsB.width) + ' × ' + fmt(dimsB.depth)));
    }
    if (chosen.depth === 'front') {
        var chF = py + pd - (by + reqD + divSideLip + divT);
        var dimsF = cubbyDims('depth', 'front');
        var divFrontY = by + reqD + divSideLip;
        parts.push(cubby(px, by + reqD + divSideLip + divT, pw, chF));
        drawDivider(px, divFrontY, pw, divT, true);
        drawDividerGrooveFace(px, divFrontY, pw, divT, 'top');
        if (divSideLip > 0.3 && !forPrint) {
            parts.push('<rect x="' + r1(px) + '" y="' + r1(by + reqD) + '" width="' + r1(pw) + '" height="' + r1(divSideLip) + '" fill="#9AE6B4" opacity="0.55"/>');
            hits.push(hitRect(r1, px, by + reqD, pw, divSideLip, 'Divider-side lip', fmtThin(SPEC_CONSTANTS.WOOD_MARGIN_DIVIDER_SIDE) + ' solid (0.5″ total w/ groove in divider)'));
        }
        centerCubbyDim(px, by + reqD + divSideLip + divT, pw, chF, dimsF);
        if (forPrint) printRegionLabel(px + pw / 2, by + reqD + divSideLip + divT + chF / 2, dimsF ? ['Cubby interior', cubbyDimLabel(dimsF)] : 'Cubby interior', { minW: pw, minH: chF, maxW: 96 });
        if (dimsF) hits.push(hitRect(r1, px, by + reqD + divSideLip + divT, pw, chF, 'Accessory cubby', 'Interior opening ' + fmt(dimsF.width) + ' × ' + fmt(dimsF.depth)));
    }
    parts.push('</g>');

    parts.push('<g class="dg-layer-labels">');
    parts.push(`<rect x="${r1(ix)}" y="${r1(iy)}" width="${r1(iw)}" height="${r1(id)}" rx="2" fill="none" stroke="${forPrint ? ink.interiorStroke : '#718096'}" stroke-width="1" stroke-dasharray="5 3"/>`);
    if (forPrint) {
        printOrientLabel(VW / 2, labelBand * 0.55, 'BACK', 'middle');
        printOrientLabel(VW / 2, VH - labelBand * 0.55, 'FRONT', 'middle');
        printOrientLabel(pad * 0.42, VH / 2, 'LEFT', 'middle');
        printOrientLabel(VW - pad * 0.42, VH / 2, 'RIGHT', 'middle');
    } else {
        parts.push(`<text x="${r1(VW / 2)}" y="${r1(14)}" text-anchor="middle" class="dg-lbl">BACK</text>`);
        parts.push(`<text x="${r1(VW / 2)}" y="${r1(VH - 10)}" text-anchor="middle" class="dg-lbl">FRONT</text>`);
        parts.push(`<text x="${r1(14)}" y="${r1(VH / 2)}" text-anchor="start" dominant-baseline="middle" class="dg-lbl">LEFT</text>`);
        parts.push(`<text x="${r1(VW - 14)}" y="${r1(VH / 2)}" text-anchor="end" dominant-baseline="middle" class="dg-lbl">RIGHT</text>`);
    }
    parts.push('</g>');
    if (!opts.forPrint) {
        parts.push('<g class="dg-layer-hits">' + hits.join('') + '</g>');
    }

    return {
        label: orientation.label,
        orientId: orientation.id,
        svg: '<svg class="orient__diagram' + (forPrint ? ' orient__diagram--print' : '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '"' + (forPrint ? '' : ' preserveAspectRatio="xMidYMid meet"') + ' shape-rendering="geometricPrecision" text-rendering="geometricPrecision" role="img" aria-label="Top-down box layout">' + parts.join('') + '</svg>'
    };
}

function layoutForOrient(o, cutout, panelSpan) {
    var sel = cubbyFor(o.id);
    var chosen = { width: sel.width, depth: sel.depth };
    var layout = relayoutForCubby(o, cutout, panelSpan, sideInches(), chosen);
    sanitizeCubbySel(o.id, layout.cubbies);
    chosen = resolveCubbyChoice(layout.cubbies, sel);
    sel.width = chosen.width;
    sel.depth = chosen.depth;
    layout = relayoutForCubby(o, cutout, panelSpan, sideInches(), chosen);
    return { layout: layout, chosen: chosen };
}

function syncDiagramWorkspaceHeight() {
    var inputs = $('inputsCard');
    var workspace = document.querySelector('.diagram-workspace');
    var card = workspace && workspace.closest('.diagram-card');
    if (!inputs || !workspace || !card) return;
    var inputsH = inputs.offsetHeight;
    if (inputsH < 1) return;
    var head = card.querySelector('.diagram-head');
    var toolbar = card.querySelector('.diagram-toolbar');
    var chromeH = (head ? head.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0) + 28;
    var workspaceH = Math.max(260, inputsH - chromeH);
    workspace.style.setProperty('--diagram-workspace-h', workspaceH + 'px');
}

function ensureDiagramHeightObserver() {
    if (state._diagramHeightObserver) return;
    var inputs = $('inputsCard');
    if (!inputs || typeof ResizeObserver === 'undefined') return;
    state._diagramHeightObserver = new ResizeObserver(function () {
        syncDiagramWorkspaceHeight();
    });
    state._diagramHeightObserver.observe(inputs);
}

function applyDiagramTransform() {
    var stage = $('diagramStage');
    if (!stage) return;
    var v = state.diagramView;
    stage.setAttribute('data-hide-rim', v.showRim ? '0' : '1');
    stage.setAttribute('data-hide-lips', v.showLips ? '0' : '1');
    stage.style.transform = 'translate(' + v.panX + 'px, ' + v.panY + 'px) scale(' + v.zoom + ')';
}

function fitDiagramToViewport() {
    requestAnimationFrame(function () {
        var viewport = $('diagramViewport');
        var stage = $('diagramStage');
        if (!viewport || !stage) return;
        var svg = stage.querySelector('svg');
        if (!svg) return;

        stage.style.transform = 'none';
        var svgW = svg.getBoundingClientRect().width;
        var svgH = svg.getBoundingClientRect().height;
        var availW = viewport.clientWidth - 8;
        var availH = viewport.clientHeight - 8;
        if (svgW > 0 && svgH > 0 && availW > 0 && availH > 0) {
            var fit = Math.min(availW / svgW, availH / svgH) * 0.98;
            state.diagramView.zoom = Math.min(1.25, Math.max(0.5, fit));
            state.diagramView.panX = 0;
            state.diagramView.panY = 0;
        }
        applyDiagramTransform();
    });
}

function bindDiagramInteractions() {
    var viewport = $('diagramViewport');
    var tooltip = $('diagramTooltip');
    if (!viewport) return;
    state.diagramView.panX = 0;
    state.diagramView.panY = 0;
    state.diagramView.zoom = 1;

    var rimBtn = $('diagramToggleRim');
    var lipsBtn = $('diagramToggleLips');
    if (rimBtn) {
        rimBtn.classList.toggle('active', state.diagramView.showRim);
        rimBtn.onclick = function () {
            state.diagramView.showRim = !state.diagramView.showRim;
            rimBtn.classList.toggle('active', state.diagramView.showRim);
            applyDiagramTransform();
        };
    }
    if (lipsBtn) {
        lipsBtn.classList.toggle('active', state.diagramView.showLips);
        lipsBtn.onclick = function () {
            state.diagramView.showLips = !state.diagramView.showLips;
            lipsBtn.classList.toggle('active', state.diagramView.showLips);
            applyDiagramTransform();
        };
    }

    var zoomIn = $('diagramZoomIn');
    var zoomOut = $('diagramZoomOut');
    var zoomReset = $('diagramZoomReset');
    if (zoomIn) zoomIn.onclick = function () { state.diagramView.zoom = Math.min(4, state.diagramView.zoom * 1.2); applyDiagramTransform(); };
    if (zoomOut) zoomOut.onclick = function () { state.diagramView.zoom = Math.max(0.45, state.diagramView.zoom / 1.2); applyDiagramTransform(); };
    if (zoomReset) zoomReset.onclick = function () {
        state.diagramView.panX = 0;
        state.diagramView.panY = 0;
        state.diagramView.zoom = 1;
        fitDiagramToViewport();
    };

    applyDiagramTransform();

    if (!state._diagramResizeBound) {
        state._diagramResizeBound = true;
        window.addEventListener('resize', function () {
            syncDiagramWorkspaceHeight();
        });
    }

    viewport.onwheel = function (e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 0.92 : 1.08;
        state.diagramView.zoom = Math.min(4, Math.max(0.45, state.diagramView.zoom * factor));
        applyDiagramTransform();
    };

    var printBtn = $('diagramPrintBtn');
    if (printBtn) {
        printBtn.disabled = !state.printReady;
        printBtn.onclick = function () { printShopSheet(); };
    }

    var panning = false;
    var startX = 0;
    var startY = 0;
    var startPanX = 0;
    var startPanY = 0;

    function endPan() {
        panning = false;
        viewport.classList.remove('is-panning');
        document.removeEventListener('mousemove', onPanMove);
        document.removeEventListener('mouseup', endPan);
    }

    function onPanMove(e) {
        if (!panning) return;
        state.diagramView.panX = startPanX + (e.clientX - startX);
        state.diagramView.panY = startPanY + (e.clientY - startY);
        applyDiagramTransform();
    }

    viewport.onmousedown = function (e) {
        if (e.target.closest('.dg-hit')) return;
        panning = true;
        viewport.classList.add('is-panning');
        startX = e.clientX;
        startY = e.clientY;
        startPanX = state.diagramView.panX;
        startPanY = state.diagramView.panY;
        document.addEventListener('mousemove', onPanMove);
        document.addEventListener('mouseup', endPan);
        e.preventDefault();
    };

    viewport.onmousemove = function (e) {
        var hit = e.target.closest('[data-tip]');
        if (!hit || !tooltip) {
            if (tooltip) tooltip.hidden = true;
            return;
        }
        var rect = viewport.getBoundingClientRect();
        tooltip.innerHTML = '<strong>' + hit.getAttribute('data-tip-title') + '</strong>' + hit.getAttribute('data-tip');
        tooltip.hidden = false;
        tooltip.style.left = (e.clientX - rect.left) + 'px';
        tooltip.style.top = (e.clientY - rect.top) + 'px';
    };
    viewport.onmouseleave = function () {
        if (tooltip) tooltip.hidden = true;
    };
}

function diagramPanelHtml(layout, outer, interior, cutout, chosen, orientHtml, statusHtml, metricsHtml) {
    var opts = {
        sideT: sideInches(),
        groove: SPEC_CONSTANTS.GROOVE_DEPTH,
        dividerIn: sideInches(),
        rotated: state.rotateCan
    };
    var dg = buildDiagram(layout, outer, interior, cutout, chosen, opts);
    state.lastDiagramOuter = outer;
    state.lastDiagramOrient = layout;
    return '<div class="card diagram-card">' +
        '<div class="diagram-head">' +
            '<h2>Plan view</h2>' +
            '<span class="diagram-head__layout" id="diagramSubtitle">' + dg.label + '</span>' +
        '</div>' +
        '<div class="diagram-toolbar" id="diagramToolbar">' +
            '<button type="button" class="diagram-btn diagram-btn--print" id="diagramPrintBtn" title="Print or save as PDF">Print</button>' +
            '<span class="diagram-toolbar__sep"></span>' +
            '<button type="button" class="diagram-btn diagram-btn--icon" id="diagramZoomOut" title="Zoom out">−</button>' +
            '<button type="button" class="diagram-btn diagram-btn--icon" id="diagramZoomIn" title="Zoom in">+</button>' +
            '<button type="button" class="diagram-btn" id="diagramZoomReset" title="Reset view">Fit</button>' +
            '<span class="diagram-toolbar__sep"></span>' +
            '<button type="button" class="diagram-btn" id="diagramToggleRim" title="Can rim outline">Rim</button>' +
            '<button type="button" class="diagram-btn" id="diagramToggleLips" title="Panel lips around cutout">Lips</button>' +
        '</div>' +
        '<div class="diagram-workspace">' +
            '<aside class="orient-rail">' +
                (statusHtml || '') +
                (metricsHtml || '') +
                '<div class="orient-rail__header"><h3>Layout</h3></div>' +
                (orientHtml || '') +
            '</aside>' +
            '<div class="diagram-panel">' +
                '<div class="diagram-viewport" id="diagramViewport">' +
                    '<div class="diagram-stage" id="diagramStage">' + dg.svg + '</div>' +
                    '<div class="diagram-tooltip" id="diagramTooltip" hidden></div>' +
                '</div>' +
                '<div class="diagram-legend-inline">' +
                    '<span><i class="diagram-swatch" style="background:#A0AEC0"></i> Box</span>' +
                    '<span><i class="diagram-swatch" style="background:#4299E1"></i> Cut out</span>' +
                    '<span><i class="diagram-swatch" style="background:#FFEB3B;border:1px solid #B7791F"></i> Cubby</span>' +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

function resolveActiveOrient(r) {
    var id = state.diagramView.selectedOrientId;
    var found = null;
    if (id) {
        for (var i = 0; i < r.orientations.length; i++) {
            if (r.orientations[i].id === id) { found = r.orientations[i]; break; }
        }
    }
    if (!found) found = r.autoSelected || r.orientations[0];
    if (found) state.diagramView.selectedOrientId = found.id;
    return found;
}

function cubbyHasSide(cubbies, axis, side) {
    if (side === 'none') return true;
    const entry = (cubbies || []).find(c => c.axis === axis);
    return !!(entry && entry.sides.includes(side));
}

function resolveCubbyChoice(cubbies, sel) {
    return {
        width: cubbyHasSide(cubbies, 'width', sel.width) ? sel.width : 'none',
        depth: cubbyHasSide(cubbies, 'depth', sel.depth) ? sel.depth : 'none'
    };
}

function sanitizeCubbySel(orientId, cubbies) {
    const sel = cubbyFor(orientId);
    if (sel.width !== 'none' && !cubbyHasSide(cubbies, 'width', sel.width)) sel.width = 'none';
    if (sel.depth !== 'none' && !cubbyHasSide(cubbies, 'depth', sel.depth)) sel.depth = 'none';
}

// Cubby side pickers — interior opening ≥ 3″ (margin minus divider) on cubby side.
function cubbyControls(o, panelSpan) {
    if (!o.fits) return '';

    sanitizeCubbySel(o.id, o.cubbies);

    const widthCubby = o.cubbies.find(c => c.axis === 'width');
    const depthCubby = o.cubbies.find(c => c.axis === 'depth');

    if (!widthCubby && !depthCubby) {
        return '';
    }

    const sel = cubbyFor(o.id);
    const opt = (axis, side, label, disabled) =>
        `<button type="button" class="cubby-opt${sel[axis] === side ? ' active' : ''}" data-orient="${o.id}" data-axis="${axis}" data-side="${side}"${disabled ? ' disabled' : ''}>${label}</button>`;

    let rows = '';
    if (widthCubby) {
        rows += `
            <div class="cubby-row">
                <span class="cubby-row__label">Left / Right</span>
                <div class="cubby-opts">
                    ${opt('width', 'none', 'None')}
                    ${opt('width', 'left', 'Left', !widthCubby.sides.includes('left'))}
                    ${opt('width', 'right', 'Right', !widthCubby.sides.includes('right'))}
                </div>
            </div>`;
    }
    if (depthCubby) {
        rows += `
            <div class="cubby-row">
                <span class="cubby-row__label">Front / Back</span>
                <div class="cubby-opts">
                    ${opt('depth', 'none', 'None')}
                    ${opt('depth', 'front', 'Front', !depthCubby.sides.includes('front'))}
                    ${opt('depth', 'back', 'Back', !depthCubby.sides.includes('back'))}
                </div>
            </div>`;
    }

    var summary = '';
    var openings = cubbyInteriorOpenings(o, panelSpan, sideInches(), sel);
    if (openings.length) {
        var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
        summary = '<p class="cubby-summary">' + openings.map(function (op) {
            return cap(op.side) + ': ' + fmt(op.width) + ' × ' + fmt(op.depth);
        }).join(' · ') + '</p>';
    }

    return `<div class="cubby cubby--interactive"><div class="cubby__title">Cubby placement</div>${rows}${summary}</div>`;
}

function orientationCard(o, outer, interior, cutout, panelSpan, cardOpts) {
    cardOpts = cardOpts || {};
    var auto = !!cardOpts.auto;
    var selected = !!cardOpts.selected;
    let cls = 'orient orient--selectable ' + (o.fits ? (auto ? 'orient--auto' : 'orient--fit') : 'orient--nofit');
    if (selected) cls += ' orient--selected';

    const sel = cubbyFor(o.id);
    let chosen = { width: sel.width, depth: sel.depth };
    let layout = relayoutForCubby(o, cutout, panelSpan, sideInches(), chosen);
    sanitizeCubbySel(o.id, layout.cubbies);
    chosen = resolveCubbyChoice(layout.cubbies, sel);
    sel.width = chosen.width;
    sel.depth = chosen.depth;
    layout = relayoutForCubby(o, cutout, panelSpan, sideInches(), chosen);

    const validationHtml = !o.fits && o.validation && o.validation.length
        ? `<div class="orient__taper">${o.validation[0]}</div>`
        : '';

    var cutoutLine = o.id === 'single'
        ? fmt(cutout.width) + ' × ' + fmt(cutout.depth)
        : '2× ' + fmt(cutout.width) + ' × ' + fmt(cutout.depth);

    return `
        <div class="${cls}" data-orient-id="${o.id}" role="button" tabindex="0">
            <h3 class="orient__title">${o.label}</h3>
            <div class="orient__cutout"><span>Cut out </span>${cutoutLine}</div>
            ${validationHtml}
            ${cubbyControls(layout, panelSpan)}
        </div>
    `;
}

function render() {
    var el = $('results');
    try {
    var input = readInput();

    if (!input.valid) {
        el.innerHTML = `<div class="status-banner status-banner--warn"><span class="status-icon">!</span>
            <div>Enter valid dimensions.</div></div>`;
        updatePrintSheet(null);
        state.lastPrintPack = null;
        return;
    }

    const r = calculateCutoutSpec(input);

    if (!r.ok) {
        el.innerHTML = `<div class="status-banner status-banner--err">
            <span class="status-icon">!</span>
            <div>${r.errors.join('<br>')}</div>
        </div>`;
        updatePrintSheet(null);
        state.lastPrintPack = null;
        return;
    }

    const statusHtml = statusInlineHtml(r);

    let orientHtml;
    const outer = r.outer;
    const interior = r.interior;
    const panelSpan = r.panelSpan;
    const activeOrient = resolveActiveOrient(r);
    const activeCutout = activeOrient.cutout || r.effectiveCutout;
    const activePack = layoutForOrient(activeOrient, activeCutout, panelSpan);
    const selectedId = activeOrient.id;

    function cardFor(o, opts) {
        opts = opts || {};
        opts.selected = o.id === selectedId;
        return orientationCard(o, outer, interior, o.cutout || activeCutout, panelSpan, opts);
    }

    if (r.autoSelected) {
        const others = r.orientations.filter(o => o.id !== r.autoSelected.id);
        orientHtml = `<div class="orient-grid">
            ${cardFor(r.autoSelected, { auto: true })}
            ${others.map(function (o) { return cardFor(o); }).join('')}
        </div>`;
    } else {
        orientHtml = `<div class="orient-grid">${r.orientations.map(function (o) { return cardFor(o); }).join('')}</div>`;
    }

    const diagramHtml = diagramPanelHtml(
        activePack.layout, outer, interior, activeCutout, activePack.chosen, orientHtml,
        statusHtml, keyMetricsHtml(interior, activeCutout)
    );

    el.innerHTML = diagramHtml;
    updatePrintSheet(r, activePack.layout, outer, interior, activeCutout, activePack.chosen);
    state.lastPrintPack = { layout: activePack.layout, outer: outer, interior: interior, cutout: activeCutout, chosen: activePack.chosen, result: r };
    bindDiagramInteractions();
    requestAnimationFrame(function () {
        syncDiagramWorkspaceHeight();
        ensureDiagramHeightObserver();
    });
    } catch (err) {
        console.error(err);
        updatePrintSheet(null);
        state.lastPrintPack = null;
        if (el) {
            el.innerHTML = '<div class="status-banner status-banner--err"><span class="status-icon">!</span><div>Display error: ' + String(err.message || err) + '</div></div>';
        }
    }
}

function refreshPrintSheetOnly() {
    var pack = state.lastPrintPack;
    if (!pack || !pack.result) return;
    updatePrintSheet(pack.result, pack.layout, pack.outer, pack.interior, pack.cutout, pack.chosen);
}

// ── Wiring ──
$('qtySeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-qty]');
    if (!btn) return;
    state.canQuantity = Number(btn.dataset.qty);
    document.querySelectorAll('#qtySeg button').forEach(function (b) { b.classList.toggle('active', b === btn); });
    render();
});
$('rotSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-rot]');
    if (!btn) return;
    state.rotateCan = btn.dataset.rot === '1';
    document.querySelectorAll('#rotSeg button').forEach(function (b) { b.classList.toggle('active', b === btn); });
    render();
});
$('canModel').addEventListener('change', function (e) { state.canModel = e.target.value; render(); });
$('sideMaterial').addEventListener('change', function (e) { state.sideKey = e.target.value; render(); });
['cabWidth', 'cabDepth'].forEach(function (id) { $(id).addEventListener('input', render); });
$('cabHeight').addEventListener('input', refreshPrintSheetOnly);
$('includeCansOrder').addEventListener('change', function () {
    syncOrderCanQtyVisibility();
    refreshPrintSheetOnly();
});
$('orderCanQty').addEventListener('input', refreshPrintSheetOnly);
$('resetAllBtn').addEventListener('click', resetAll);
syncOrderCanQtyVisibility();

$('results').addEventListener('click', function (e) {
    var card = e.target.closest('.orient[data-orient-id]');
    if (card && !e.target.closest('.cubby-opt')) {
        state.diagramView.selectedOrientId = card.getAttribute('data-orient-id');
        render();
        return;
    }
    var btn = e.target.closest('.cubby-opt');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    var orient = btn.dataset.orient;
    state.diagramView.selectedOrientId = orient;
    var axis = btn.dataset.axis;
    var side = btn.dataset.side;
    var sel = cubbyFor(orient);
    sel[axis] = side;
    render();
});

$('results').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.orient[data-orient-id]');
    if (!card) return;
    e.preventDefault();
    state.diagramView.selectedOrientId = card.getAttribute('data-orient-id');
    render();
});

render();

} catch (bootErr) {
    console.error(bootErr);
    showFatal('Startup error: ' + String(bootErr.message || bootErr));
}
})();
