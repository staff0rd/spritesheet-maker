# spritesheet-maker

Renders procedural low-poly 3D characters in three.js and captures them as layered 2D isometric spritesheets that a game stacks and tints at runtime.

## Usage

- `npm run generate [outDir]` — starts a Vite server, renders every part sheet in headless Chromium (Playwright) in both render styles and writes each style's sheets plus its own `manifest.json` to `out/blocky/` and `out/smooth/` (or under `outDir`).
- `npm run dev` — opens the 3D viewer. Its `style` control switches between `blocky` and `smooth` without reloading; "View rendered sheets" (`?view=sheets&style=<style>`) shows every sheet rendered live in the selected style.
- `npm run dev` then open `/preview.html` — composites a reseedable grid of 120 random characters from `out/<style>/manifest.json`, picking a variant per category and a multiply tint from the skin/hair/cloth palettes in `src/core/compose.ts`, stacked in the manifest draw order.
- `npm run dev` then open `/phaser.html` — a Phaser crowd of wandering characters loaded from `out/<style>/manifest.json`.
- Both crowd pages have a `Style` toggle (default `blocky`, also `?style=smooth`) that loads the matching manifest; `?manifest=<url>` overrides it.
- `assist verify` — typecheck, lint, knip and tests.

If Playwright's Chromium is missing, run `npx playwright install chromium`.

## Parts

- Categories and variants are listed in `src/core/catalog.ts`: `body` (skin), `hair` (hair), `top`, `bottom`, `shoes`, `hat` (cloth). `hair` and `hat` are optional.
- Each variant names a procedural `kind` plus params. Kinds are defined in `src/scene/parts/` and served through the `PartProvider` interface. Adding a variant with an existing kind only needs a catalog entry; a new shape needs a new `definePart` definition.
- Seeded randomness (e.g. spike placement) comes from `CaptureConfig.seed`, hashed per part, so output is deterministic.

## Sheets

- Each render style has its own sheet tree: `out/blocky/` (flat-shaded, low side counts) and `out/smooth/` (smooth shading, rounded torso and limbs with joint spheres). Paths below are relative to a style directory.
- Body sheets are `body/<variant>.png`. Every other part is rendered once per body as `<category>/<variant>.<body>.png`, so clothing fits each build.
- When rendering a non-body part, the body is drawn depth-only (`colorWrite: false`), so body parts in front of clothing (e.g. an arm in front of the torso) cut holes in that layer.
- Everything renders in neutral greys with baked shading on a transparent background, ready for a multiply tint.
- One row per direction, in `NE`, `SE`, `SW`, `NW` order; one column per animation frame. Every frame is the same size, with the character's feet at the manifest's `anchor` pixel.
- Orthographic camera at 30° elevation and 45° yaw.

## Manifest

- `categories.<id>`: `tintGroup`, `optional` and `variants`, where each variant's `files` maps a body variant id to its sheet.
- `drawOrder.<direction>`: the category stacking order (bottom first). Hair goes under the top when facing the camera and over it when facing away.
