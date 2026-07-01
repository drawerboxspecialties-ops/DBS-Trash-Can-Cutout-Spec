// Printable shop-floor sheet.
(function (root) {
    'use strict';

    var App = root.CutoutApp;
    if (!App) return;

    var $ = App.$;

    function boxHeightPrint() {
        var v = parseFloat($('cabHeight').value);
        return isFinite(v) && v > 0 ? v : null;
    }

    function boxHeightPrintLabel() {
        var h = boxHeightPrint();
        return h != null ? App.fmt(h) : '\u2014';
    }

    function orderCansPrintLine(model) {
        var cb = $('includeCansOrder');
        if (!cb || !cb.checked) return null;
        var n = parseInt($('orderCanQty').value, 10);
        if (!isFinite(n) || n < 1) n = 1;
        return App.escAttr(model.label) + ' \u00d7 ' + n;
    }

    function cubbyPlacementLabel(layout, chosen, panelSpan) {
        var openings = App.CS.cubbyInteriorOpenings(layout, panelSpan, App.sideInches(), chosen);
        if (!openings.length) return 'None';
        var cap = function (s) {
            return s.charAt(0).toUpperCase() + s.slice(1);
        };
        return openings
            .map(function (o) {
                return cap(o.side) + ' \u2014 opening ' + App.fmt(o.width) + ' \u00d7 ' + App.fmt(o.depth);
            })
            .join(' \u00b7 ');
    }

    App.buildPrintSheetHtml = function (r, layout, outer, interior, cutout, chosen) {
        var model = r.model;
        var cutCount = layout.id === 'single' ? 1 : 2;
        var rotLabel = r.rotated ? 'Rotated 90\u00b0' : 'Standard';
        var sideT = App.sideInches();
        var cutoutLine =
            cutCount === 1
                ? App.fmt(cutout.width) + ' \u00d7 ' + App.fmt(cutout.depth)
                : cutCount + '\u00d7 ' + App.fmt(cutout.width) + ' \u00d7 ' + App.fmt(cutout.depth);
        var cubbyLine = cubbyPlacementLabel(layout, chosen, { width: interior.width, depth: interior.depth });

        var dg = App.buildDiagram(layout, outer, interior, cutout, chosen, {
            sideT: sideT,
            groove: App.CS.SPEC_CONSTANTS.GROOVE_DEPTH,
            dividerIn: sideT,
            rotated: r.rotated,
            forPrint: true
        });

        var boxH = boxHeightPrint();
        var outerSize =
            App.fmt(outer.width) +
            ' \u00d7 ' +
            App.fmt(outer.depth) +
            (boxH != null ? ' \u00d7 ' + App.fmt(boxH) : '');

        var rows = function (pairs) {
            return pairs
                .map(function (pair) {
                    return '<tr><th>' + pair[0] + '</th><td>' + pair[1] + '</td></tr>';
                })
                .join('');
        };

        var specRows = [
            ['Layout', App.escAttr(layout.label) + ' \u00b7 ' + rotLabel],
            ['Box size', outerSize],
            ['Box material', App.escAttr(App.sideMaterialLabel())],
            ['Cut out opening', cutoutLine],
            ['Cubby', App.escAttr(cubbyLine)]
        ];
        var cansLine = orderCansPrintLine(model);
        if (cansLine) specRows.push(['Cans with order', cansLine]);

        return (
            '<header class="print-header">' +
            '<h1>Shop Floor \u2014 Cutout Spec</h1>' +
            '</header>' +
            '<div class="print-highlight">' +
            '<div class="print-highlight__item"><span>Box outer</span><strong>' +
            App.fmt(outer.width) +
            ' \u00d7 ' +
            App.fmt(outer.depth) +
            '</strong></div>' +
            '<div class="print-highlight__item"><span>Box height</span><strong>' +
            boxHeightPrintLabel() +
            '</strong></div>' +
            '<div class="print-highlight__item"><span>Interior</span><strong>' +
            App.fmt(interior.width) +
            ' \u00d7 ' +
            App.fmt(interior.depth) +
            '</strong></div>' +
            '<div class="print-highlight__item print-highlight__item--primary"><span>Cut out</span><strong>' +
            cutoutLine +
            '</strong></div>' +
            '</div>' +
            '<div class="print-spec"><table class="print-table">' +
            rows(specRows) +
            '</table></div>' +
            '<section class="print-diagram">' +
            '<h2>Plan view</h2>' +
            '<div class="print-diagram__frame">' +
            dg.svg +
            '</div>' +
            '</section>'
        );
    };

    App.updatePrintSheet = function (r, layout, outer, interior, cutout, chosen) {
        var sheet = $('printSheet');
        if (!sheet) return;
        if (!r || !r.ok || !layout) {
            sheet.innerHTML = '';
            App.state.printReady = false;
            return;
        }
        sheet.innerHTML = App.buildPrintSheetHtml(r, layout, outer, interior, cutout, chosen);
        App.state.printReady = !!layout.fits;
    };

    App.printShopSheet = function () {
        if (!App.state.printReady) return;
        window.print();
    };

    App.refreshPrintSheetOnly = function () {
        var pack = App.state.lastPrintPack;
        if (!pack || !pack.result) return;
        App.updatePrintSheet(pack.result, pack.layout, pack.outer, pack.interior, pack.cutout, pack.chosen);
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
