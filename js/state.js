// Application state, inputs, and cubby selection.
(function (root) {
    'use strict';

    var App = root.CutoutApp;
    if (!App) return;

    var $ = App.$;

    App.state = {
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

    App.DEFAULTS = {
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

    App.sideInches = function () {
        var CS = App.CS;
        if (!CS) return 0.625;
        var m = CS.SIDE_MATERIALS[App.state.sideKey];
        return (m && m.inches) || CS.DEFAULT_SIDE_INCHES;
    };

    App.cubbyFor = function (orientId) {
        if (!App.state.cubbySel[orientId]) {
            App.state.cubbySel[orientId] = { width: 'none', depth: 'none' };
        }
        return App.state.cubbySel[orientId];
    };

    App.cubbyHasSide = function (cubbies, axis, side) {
        if (side === 'none') return true;
        var entry = (cubbies || []).find(function (c) {
            return c.axis === axis;
        });
        return !!(entry && entry.sides.includes(side));
    };

    App.resolveCubbyChoice = function (cubbies, sel) {
        return {
            width: App.cubbyHasSide(cubbies, 'width', sel.width) ? sel.width : 'none',
            depth: App.cubbyHasSide(cubbies, 'depth', sel.depth) ? sel.depth : 'none'
        };
    };

    App.sanitizeCubbySel = function (orientId, cubbies) {
        var sel = App.cubbyFor(orientId);
        if (sel.width !== 'none' && !App.cubbyHasSide(cubbies, 'width', sel.width)) sel.width = 'none';
        if (sel.depth !== 'none' && !App.cubbyHasSide(cubbies, 'depth', sel.depth)) sel.depth = 'none';
    };

    App.layoutForOrient = function (o, cutout, panelSpan) {
        var CS = App.CS;
        var sel = App.cubbyFor(o.id);
        var chosen = { width: sel.width, depth: sel.depth };
        var layout = CS.relayoutForCubby(o, cutout, panelSpan, App.sideInches(), chosen);
        App.sanitizeCubbySel(o.id, layout.cubbies);
        chosen = App.resolveCubbyChoice(layout.cubbies, sel);
        sel.width = chosen.width;
        sel.depth = chosen.depth;
        layout = CS.relayoutForCubby(o, cutout, panelSpan, App.sideInches(), chosen);
        return { layout: layout, chosen: chosen };
    };

    App.resolveActiveOrient = function (r) {
        var id = App.state.diagramView.selectedOrientId;
        var found = null;
        if (id) {
            for (var i = 0; i < r.orientations.length; i++) {
                if (r.orientations[i].id === id) {
                    found = r.orientations[i];
                    break;
                }
            }
        }
        if (!found) found = r.autoSelected || r.orientations[0];
        if (found) App.state.diagramView.selectedOrientId = found.id;
        return found;
    };

    function validateCabinetField(id, errId) {
        var el = $(id);
        var err = $(errId);
        var val = parseFloat(el.value);
        var msg = '';
        if (!Number.isFinite(val) || val <= 0) msg = 'Enter a positive dimension in inches.';
        el.classList.toggle('input--invalid', !!msg);
        if (err) {
            err.textContent = msg;
            err.hidden = !msg;
        }
        return !msg;
    }

    App.readInput = function () {
        var wOk = validateCabinetField('cabWidth', 'cabWidthErr');
        var dOk = validateCabinetField('cabDepth', 'cabDepthErr');
        App.state.canModel = $('canModel').value;
        return {
            cabinetWidth: parseFloat($('cabWidth').value),
            cabinetDepth: parseFloat($('cabDepth').value),
            canQuantity: App.state.canQuantity,
            canModel: App.state.canModel,
            rotateCan: App.state.rotateCan,
            sideThickness: App.sideInches(),
            valid: wOk && dOk
        };
    };

    App.syncOrderCanQtyVisibility = function () {
        var wrap = $('orderCanQtyWrap');
        var cb = $('includeCansOrder');
        if (wrap && cb) wrap.hidden = !cb.checked;
    };

    App.sideMaterialLabel = function () {
        var CS = App.CS;
        var m = CS && CS.SIDE_MATERIALS[App.state.sideKey];
        return m ? m.label + ' (' + App.fmt(m.inches) + ')' : App.fmt(App.sideInches());
    };

    App.resetAll = function () {
        var D = App.DEFAULTS;
        var s = App.state;
        s.canModel = D.canModel;
        s.canQuantity = D.canQuantity;
        s.rotateCan = D.rotateCan;
        s.sideKey = D.sideKey;
        s.cubbySel = {};
        s.diagramView = defaultDiagramView();

        $('canModel').value = D.canModel;
        $('sideMaterial').value = D.sideKey;
        $('cabWidth').value = D.cabWidth;
        $('cabDepth').value = D.cabDepth;
        $('cabHeight').value = D.cabHeight;
        $('includeCansOrder').checked = D.includeCansOrder;
        $('orderCanQty').value = D.orderCanQty;

        document.querySelectorAll('#qtySeg button').forEach(function (b) {
            b.classList.toggle('active', Number(b.dataset.qty) === D.canQuantity);
        });
        document.querySelectorAll('#rotSeg button').forEach(function (b) {
            b.classList.toggle('active', (b.dataset.rot === '1') === D.rotateCan);
        });

        ['cabWidth', 'cabDepth'].forEach(function (id) {
            var el = $(id);
            el.classList.remove('input--invalid');
            var err = $(id + 'Err');
            if (err) err.hidden = true;
        });

        App.syncOrderCanQtyVisibility();
        if (App.render) App.render();
    };

    App.initMaterialSelects = function () {
        var CS = App.CS;
        if (!CS) return;
        $('sideMaterial').innerHTML = Object.entries(CS.SIDE_MATERIALS)
            .map(function (entry) {
                var key = entry[0];
                var m = entry[1];
                return (
                    '<option value="' +
                    key +
                    '"' +
                    (key === App.state.sideKey ? ' selected' : '') +
                    '>' +
                    m.label +
                    ' (' +
                    m.inches.toFixed(3) +
                    '\u2033)</option>'
                );
            })
            .join('');
        $('canModel').innerHTML = Object.keys(CS.CAN_MODELS)
            .map(function (key) {
                var m = CS.CAN_MODELS[key];
                return (
                    '<option value="' +
                    key +
                    '"' +
                    (key === App.state.canModel ? ' selected' : '') +
                    '>' +
                    m.label +
                    '</option>'
                );
            })
            .join('');
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
