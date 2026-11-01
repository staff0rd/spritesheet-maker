# spritesheet-maker

Renders procedural low-poly 3D characters in three.js and captures them as 2D isometric spritesheets.

## Usage

- `npm run generate [outDir]` — starts a Vite server, renders the scene in headless Chromium (Playwright) and writes `body.png` and `manifest.json` to `out/` (or `outDir`).
- `npm run dev` — opens the scene page in a browser and shows the rendered sheet.
- `assist verify` — typecheck, lint, knip and tests.

If Playwright's Chromium is missing, run `npx playwright install chromium`.

## Sheet layout

- One row per direction, in `NE`, `SE`, `SW`, `NW` order; one column per animation frame.
- Every frame is the same size, with the character's feet at the manifest's `anchor` pixel.
- Orthographic camera at 30° elevation and 45° yaw; transparent background, greyscale shading.
