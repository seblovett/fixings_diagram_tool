# Fixings

A static web tool for drawing fastener joints for assembly documents: pick a screw,
stack up washers, the parts being clamped (sheet metal, PCB, plastic…) and a nut or
tapped boss, then export a black-and-white drawing with callouts and a BOM.

- **Views:** cross-section, or isometric (exploded or assembled)
- **Library:** metric M2–M12 socket cap, button, countersunk, pan head, hex head and set
  screws; plain, large and spring washers; hex, nyloc, thin, flange and dome nuts;
  tapped bosses with optional heat-set inserts
- **Output:** SVG (transparent background) or PNG; designs save and open as JSON
- Drawings are illustrative, not to scale; sizes come from the ISO/DIN tables

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
