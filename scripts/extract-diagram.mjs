import fs from 'fs';

const src = fs.readFileSync('js/app.js', 'utf8');

const part1Start = src.indexOf('function hitRect');
const part1End = src.indexOf('function layoutForOrient');
let core = src.slice(part1Start, part1End);

const part2Start = src.indexOf('function syncDiagramWorkspaceHeight()');
const part2End = src.indexOf('function resolveActiveOrient');
let ui = src.slice(part2Start, part2End);

const prefix = `var diagramUid = 0;
var SCREEN_DIAGRAM = { w: 560, h: 380, pad: 34 };

`;

function transform(code) {
    return code
        .replace(/\bSPEC_CONSTANTS\b/g, 'App.CS.SPEC_CONSTANTS')
        .replace(/\bcubbyInteriorOpenings\b/g, 'App.CS.cubbyInteriorOpenings')
        .replace(/\blipEnvelope\b/g, 'App.CS.lipEnvelope')
        .replace(/\bbuildDiagram\b/g, 'App.buildDiagram')
        .replace(/\bprintShopSheet\b/g, 'App.printShopSheet')
        .replace(/\bfmtThin\b/g, 'App.fmtThin')
        .replace(/\bfmt\b/g, 'App.fmt')
        .replace(/\bescAttr\b/g, 'App.escAttr')
        .replace(/\bstate\./g, 'App.state.')
        .replace(/\bsideInches\(\)/g, 'App.sideInches()')
        .replace(/\$\(/g, 'App.$(');
}

core = transform(core);
ui = transform(ui);

const out = `(function (root) {
'use strict';
var App = root.CutoutApp;
if (!App) return;

${prefix}${core}
${ui}
App.buildDiagram = buildDiagram;
App.hitRect = hitRect;
App.syncDiagramWorkspaceHeight = syncDiagramWorkspaceHeight;
App.ensureDiagramHeightObserver = ensureDiagramHeightObserver;
App.applyDiagramTransform = applyDiagramTransform;
App.fitDiagramToViewport = fitDiagramToViewport;
App.bindDiagramInteractions = bindDiagramInteractions;
App.diagramPanelHtml = diagramPanelHtml;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

fs.writeFileSync('js/diagram.js', out);
console.log('diagram.js', out.length);
