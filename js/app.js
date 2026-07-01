(function () {
    'use strict';

    var App = (window.CutoutApp = window.CutoutApp || {});
    var $ = App.$;

    function showFatal(msg) {
        var el = $('results');
        if (el) {
            el.innerHTML =
                '<div class="status-banner status-banner--err"><span class="status-icon">!</span><div>' +
                msg +
                '</div></div>';
        }
    }

    try {
        if (!window.CutoutSpec) {
            showFatal(
                'Could not load <strong>cutoutSpec.js</strong>. Serve from the project root so <code>js/cutoutSpec.js</code> loads.'
            );
            return;
        }

        App.CS = window.CutoutSpec;
        var CS = App.CS;

        if (
            typeof CS.calculateCutoutSpec !== 'function' ||
            typeof CS.relayoutForCubby !== 'function' ||
            typeof CS.cubbyInteriorOpenings !== 'function'
        ) {
            showFatal('cutoutSpec.js is outdated. Hard-refresh (Ctrl+F5).');
            return;
        }

        if (!CS.SIDE_MATERIALS) {
            showFatal('cutoutSpec.js is missing SIDE_MATERIALS. Hard-refresh (Ctrl+F5).');
            return;
        }

        App.initMaterialSelects();

        function statusInlineHtml(r) {
            if (r.fits && r.autoSelected) {
                return (
                    '<div class="layout-status layout-status--ok"><span class="layout-status__icon">\u2713</span><span>Fits \u2014 ' +
                    App.escAttr(r.autoSelected.label) +
                    '</span></div>'
                );
            }
            if (r.fits) {
                return (
                    '<div class="layout-status layout-status--ok"><span class="layout-status__icon">\u2713</span><span>Fits</span></div>'
                );
            }
            return (
                '<div class="layout-status layout-status--err"><span class="layout-status__icon">\u2717</span><span>Does not fit \u2014 enlarge box or change layout</span></div>'
            );
        }

        function keyMetricsHtml(interior, cutout) {
            return (
                '<div class="layout-metrics">' +
                '<div class="layout-metric layout-metric--primary">' +
                '<span class="layout-metric__label">Cut out opening</span>' +
                '<span class="layout-metric__val">' +
                App.fmt(cutout.width) +
                ' \u00d7 ' +
                App.fmt(cutout.depth) +
                '</span>' +
                '</div>' +
                '<div class="layout-metric">' +
                '<span class="layout-metric__label">Interior of box</span>' +
                '<span class="layout-metric__val">' +
                App.fmt(interior.width) +
                ' \u00d7 ' +
                App.fmt(interior.depth) +
                '</span>' +
                '</div>' +
                '</div>'
            );
        }

        function cubbyControls(o, panelSpan) {
            if (!o.fits) return '';

            App.sanitizeCubbySel(o.id, o.cubbies);

            var widthCubby = o.cubbies.find(function (c) {
                return c.axis === 'width';
            });
            var depthCubby = o.cubbies.find(function (c) {
                return c.axis === 'depth';
            });

            if (!widthCubby && !depthCubby) return '';

            var sel = App.cubbyFor(o.id);
            var opt = function (axis, side, label, disabled) {
                return (
                    '<button type="button" class="cubby-opt' +
                    (sel[axis] === side ? ' active' : '') +
                    '" data-orient="' +
                    o.id +
                    '" data-axis="' +
                    axis +
                    '" data-side="' +
                    side +
                    '"' +
                    (disabled ? ' disabled' : '') +
                    '>' +
                    label +
                    '</button>'
                );
            };

            var rows = '';
            if (widthCubby) {
                rows +=
                    '<div class="cubby-row">' +
                    '<span class="cubby-row__label">Left / Right</span>' +
                    '<div class="cubby-opts">' +
                    opt('width', 'none', 'None') +
                    opt('width', 'left', 'Left', !widthCubby.sides.includes('left')) +
                    opt('width', 'right', 'Right', !widthCubby.sides.includes('right')) +
                    '</div></div>';
            }
            if (depthCubby) {
                rows +=
                    '<div class="cubby-row">' +
                    '<span class="cubby-row__label">Front / Back</span>' +
                    '<div class="cubby-opts">' +
                    opt('depth', 'none', 'None') +
                    opt('depth', 'front', 'Front', !depthCubby.sides.includes('front')) +
                    opt('depth', 'back', 'Back', !depthCubby.sides.includes('back')) +
                    '</div></div>';
            }

            var summary = '';
            var openings = CS.cubbyInteriorOpenings(o, panelSpan, App.sideInches(), sel);
            if (openings.length) {
                var cap = function (s) {
                    return s.charAt(0).toUpperCase() + s.slice(1);
                };
                summary =
                    '<p class="cubby-summary">' +
                    openings
                        .map(function (op) {
                            return cap(op.side) + ': ' + App.fmt(op.width) + ' \u00d7 ' + App.fmt(op.depth);
                        })
                        .join(' \u00b7 ') +
                    '</p>';
            }

            return (
                '<div class="cubby cubby--interactive"><div class="cubby__title">Cubby placement</div>' +
                rows +
                summary +
                '</div>'
            );
        }

        function orientationCard(o, outer, interior, cutout, panelSpan, cardOpts) {
            cardOpts = cardOpts || {};
            var auto = !!cardOpts.auto;
            var selected = !!cardOpts.selected;
            var cls =
                'orient orient--selectable ' + (o.fits ? (auto ? 'orient--auto' : 'orient--fit') : 'orient--nofit');
            if (selected) cls += ' orient--selected';

            var sel = App.cubbyFor(o.id);
            var chosen = { width: sel.width, depth: sel.depth };
            var layout = CS.relayoutForCubby(o, cutout, panelSpan, App.sideInches(), chosen);
            App.sanitizeCubbySel(o.id, layout.cubbies);
            chosen = App.resolveCubbyChoice(layout.cubbies, sel);
            sel.width = chosen.width;
            sel.depth = chosen.depth;
            layout = CS.relayoutForCubby(o, cutout, panelSpan, App.sideInches(), chosen);

            var validationHtml =
                !o.fits && o.validation && o.validation.length
                    ? '<div class="orient__taper">' + o.validation[0] + '</div>'
                    : '';

            var cutoutLine =
                o.id === 'single'
                    ? App.fmt(cutout.width) + ' \u00d7 ' + App.fmt(cutout.depth)
                    : '2\u00d7 ' + App.fmt(cutout.width) + ' \u00d7 ' + App.fmt(cutout.depth);

            return (
                '<div class="' +
                cls +
                '" data-orient-id="' +
                o.id +
                '" role="button" tabindex="0">' +
                '<h3 class="orient__title">' +
                o.label +
                '</h3>' +
                '<div class="orient__cutout"><span>Cut out </span>' +
                cutoutLine +
                '</div>' +
                validationHtml +
                cubbyControls(layout, panelSpan) +
                '</div>'
            );
        }

        App.render = function () {
            var el = $('results');
            try {
                var input = App.readInput();

                if (!input.valid) {
                    el.innerHTML =
                        '<div class="status-banner status-banner--warn"><span class="status-icon">!</span>' +
                        '<div>Enter valid dimensions.</div></div>';
                    App.updatePrintSheet(null);
                    App.state.lastPrintPack = null;
                    return;
                }

                var r = CS.calculateCutoutSpec(input);

                if (!r.ok) {
                    el.innerHTML =
                        '<div class="status-banner status-banner--err">' +
                        '<span class="status-icon">!</span>' +
                        '<div>' +
                        r.errors.join('<br>') +
                        '</div></div>';
                    App.updatePrintSheet(null);
                    App.state.lastPrintPack = null;
                    return;
                }

                var statusHtml = statusInlineHtml(r);
                var outer = r.outer;
                var interior = r.interior;
                var panelSpan = r.panelSpan;
                var activeOrient = App.resolveActiveOrient(r);
                var activeCutout = activeOrient.cutout || r.effectiveCutout;
                var activePack = App.layoutForOrient(activeOrient, activeCutout, panelSpan);
                var selectedId = activeOrient.id;

                function cardFor(o, opts) {
                    opts = opts || {};
                    opts.selected = o.id === selectedId;
                    return orientationCard(o, outer, interior, o.cutout || activeCutout, panelSpan, opts);
                }

                var orientHtml;
                if (r.autoSelected) {
                    var others = r.orientations.filter(function (o) {
                        return o.id !== r.autoSelected.id;
                    });
                    orientHtml =
                        '<div class="orient-grid">' +
                        cardFor(r.autoSelected, { auto: true }) +
                        others
                            .map(function (o) {
                                return cardFor(o);
                            })
                            .join('') +
                        '</div>';
                } else {
                    orientHtml =
                        '<div class="orient-grid">' +
                        r.orientations
                            .map(function (o) {
                                return cardFor(o);
                            })
                            .join('') +
                        '</div>';
                }

                el.innerHTML = App.diagramPanelHtml(
                    activePack.layout,
                    outer,
                    interior,
                    activeCutout,
                    activePack.chosen,
                    orientHtml,
                    statusHtml,
                    keyMetricsHtml(interior, activeCutout)
                );
                App.updatePrintSheet(r, activePack.layout, outer, interior, activeCutout, activePack.chosen);
                App.state.lastPrintPack = {
                    layout: activePack.layout,
                    outer: outer,
                    interior: interior,
                    cutout: activeCutout,
                    chosen: activePack.chosen,
                    result: r
                };
                App.bindDiagramInteractions();
                requestAnimationFrame(function () {
                    App.syncDiagramWorkspaceHeight();
                    App.ensureDiagramHeightObserver();
                });
            } catch (err) {
                console.error(err);
                App.updatePrintSheet(null);
                App.state.lastPrintPack = null;
                if (el) {
                    el.innerHTML =
                        '<div class="status-banner status-banner--err"><span class="status-icon">!</span><div>Display error: ' +
                        String(err.message || err) +
                        '</div></div>';
                }
            }
        };

        $('qtySeg').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-qty]');
            if (!btn) return;
            App.state.canQuantity = Number(btn.dataset.qty);
            document.querySelectorAll('#qtySeg button').forEach(function (b) {
                b.classList.toggle('active', b === btn);
            });
            App.render();
        });
        $('rotSeg').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-rot]');
            if (!btn) return;
            App.state.rotateCan = btn.dataset.rot === '1';
            document.querySelectorAll('#rotSeg button').forEach(function (b) {
                b.classList.toggle('active', b === btn);
            });
            App.render();
        });
        $('canModel').addEventListener('change', function (e) {
            App.state.canModel = e.target.value;
            App.render();
        });
        $('sideMaterial').addEventListener('change', function (e) {
            App.state.sideKey = e.target.value;
            App.render();
        });
        ['cabWidth', 'cabDepth'].forEach(function (id) {
            $(id).addEventListener('input', App.render);
        });
        $('cabHeight').addEventListener('input', App.refreshPrintSheetOnly);
        $('includeCansOrder').addEventListener('change', function () {
            App.syncOrderCanQtyVisibility();
            App.refreshPrintSheetOnly();
        });
        $('orderCanQty').addEventListener('input', App.refreshPrintSheetOnly);
        $('resetAllBtn').addEventListener('click', App.resetAll);
        App.syncOrderCanQtyVisibility();

        $('results').addEventListener('click', function (e) {
            var card = e.target.closest('.orient[data-orient-id]');
            if (card && !e.target.closest('.cubby-opt')) {
                App.state.diagramView.selectedOrientId = card.getAttribute('data-orient-id');
                App.render();
                return;
            }
            var cubbyBtn = e.target.closest('.cubby-opt');
            if (!cubbyBtn || cubbyBtn.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            var orient = cubbyBtn.dataset.orient;
            App.state.diagramView.selectedOrientId = orient;
            var axis = cubbyBtn.dataset.axis;
            var side = cubbyBtn.dataset.side;
            var cubbySel = App.cubbyFor(orient);
            cubbySel[axis] = side;
            App.render();
        });

        $('results').addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var card = e.target.closest('.orient[data-orient-id]');
            if (!card) return;
            e.preventDefault();
            App.state.diagramView.selectedOrientId = card.getAttribute('data-orient-id');
            App.render();
        });

        App.render();
    } catch (bootErr) {
        console.error(bootErr);
        showFatal('Startup error: ' + String(bootErr.message || bootErr));
    }
})();
