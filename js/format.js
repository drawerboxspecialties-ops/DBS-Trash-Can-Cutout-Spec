// Shared formatting helpers for the cutout spec UI.
(function (root) {
    'use strict';

    var App = (root.CutoutApp = root.CutoutApp || {});

    App.$ = function (id) {
        return document.getElementById(id);
    };

    App.fmt = function (n) {
        return Number(n).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '\u2033';
    };

    App.fmtThin = function (n) {
        return Number(n).toFixed(3).replace(/\.?0+$/, '') + '\u2033';
    };

    App.escAttr = function (s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    };

    App.round = function (n) {
        return Math.round(n * 1000) / 1000;
    };

    App.cubbyDimLabel = function (dims) {
        return App.fmtThin(dims.width) + '\u00d7' + App.fmtThin(dims.depth);
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
