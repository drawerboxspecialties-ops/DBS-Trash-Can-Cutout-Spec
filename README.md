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
js/app.js           UI, diagram, print
tests/              Node unit tests
```

## Math / shop rules (summary)

| Rule | Value |
|------|--------|
| Grip / cutout height | 4.75″ from can bottom |
| Panel top from box floor | 5.75″ |
| Side groove depth | ¼″ in box walls |
| Front lip (solid) | 1.0″ (+ ¼″ groove) |
| Back lip (solid) | 0.25″ (+ ¼″ groove) |
| Divider seam lip | 0.25″ solid in ¼″ divider groove |
| Min side margin / bridge | 1.25″ |
| Min cubby opening | 3″ |

Interior W×D = outer W×D minus **2× side thickness**. Panel span equals interior; grooves are in the box walls, not deducted from routable panel length.

## Deploy (GitHub Pages)

1. Push to `main`
2. Repo **Settings → Pages → Build and deployment → GitHub Actions**
3. Workflow `.github/workflows/pages.yml` runs tests then deploys the static site

## License

MIT
