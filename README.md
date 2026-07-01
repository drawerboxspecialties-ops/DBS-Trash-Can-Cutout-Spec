# Trash Can Cutout Spec

Shop-floor calculator for **pullout trash can** box layouts: cutout openings, interior dimensions, double-can layouts, cubby placement, and a printable plan view.

Live app: **https://drawerboxspecialties-ops.github.io/DBS-Trash-Can-Cutout-Spec/**

## Features

- RV-35 and RV-50 can models (true taper traced at **4.75″** grip height)
- Single / double layouts (side-by-side, front-to-back)
- Standard vs rotated 90° can orientation
- Box material thickness (12 mm – ¾″)
- Accessory cubby placement with divider/groove logic
- Interactive plan view + print sheet

## Quick start

**Browser (no build):** open `index.html` or run a local server:

```bash
npm start
# http://localhost:8765
```

**Tests:**

```bash
npm test
```

## Project layout

```
index.html          App shell
css/app.css         Styles (screen + print)
js/cutoutSpec.js    Pure calculation engine (Node + browser)
js/format.js        Display formatting (inch marks, escape)
js/state.js         App state, inputs, cubby selection
js/diagram.js       Plan-view SVG diagram + zoom/pan
js/print.js         Printable shop sheet
js/app.js           Render loop + event wiring
docs/MATH_REFERENCE.md   Every cutoutSpec function explained
tests/              Node unit tests (math + golden shop cases)
```

**Editor:** `.editorconfig` forces UTF-8 (prevents corrupted inch marks). Format with `npm run format`.

## Golden shop cases

Trace against **shop CNC cutout sizes** (standard orientation 8.5″ × depth; swap W/D when rotated).

| Can | Orientation | Cutout W × D | Fits default box? |
|-----|-------------|--------------|-------------------|
| RV-35 | Rotated 90° | **8.5 × 12** | Yes |
| RV-35 | Standard | 12 × 8.5 | Yes |
| RV-50 | Standard | 12.375 × 8.5 | No — needs wider box |
| RV-50 | Rotated 90° | **8.5 × 12.375** | Yes |

**Height clearance:** RV-35 needs **18.85″** interior (1″ under-can + 17.85″ can). RV-50 needs **22.75″**.

Full function reference: [docs/MATH_REFERENCE.md](docs/MATH_REFERENCE.md). Automated checks: `tests/goldenCases.test.js`.

## Math / shop rules (summary)

| Rule | Value |
|------|--------|
| Grip / cutout height | 4.75″ from can bottom |
| Panel top from box floor | 5.75″ |
| Side groove depth | ¼″ in box walls |
| Front lip (solid) | 1.0″ (+ ¼″ groove) |
| Back lip (solid) | 0.25″ (+ ¼″ groove) |
| Divider | Under holding panel (panel spans full interior; no panel lip in divider groove) |
| Center bridge (double) | **1.8125″** |
| Min side margin | 1.25″ |
| Min cubby opening | 3″ |

Interior W×D = outer W×D minus **2× side thickness**. Panel span equals interior; grooves are in the box walls, not deducted from routable panel length.

## Deploy (GitHub Pages)

1. Push to `main`
2. Repo **Settings → Pages → Build and deployment → GitHub Actions**
3. Workflow `.github/workflows/pages.yml` runs tests then deploys the static site

## License

MIT
