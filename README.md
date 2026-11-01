# spritesheet-maker

Renders procedural low-poly 3D characters in three.js and captures them as layered 2D isometric spritesheets that a game stacks and tints at runtime.

## Usage

- `npm run generate [outDir]` — starts a Vite server, renders every part sheet in headless Chromium (Playwright) and writes them plus `manifest.json` to `out/` (or `outDir`).
- `npm run dev` — opens the scene page in a browser and shows every rendered sheet.
- `npm run dev` then open `/preview.html` — composites a reseedable grid of 120 random characters from `out/manifest.json` (or `?manifest=<url>`), picking a variant per category and a multiply tint from the skin/hair/cloth palettes in `src/core/compose.ts`, stacked in the manifest draw order.
- `assist verify` — typecheck, lint, knip and tests.

If Playwright's Chromium is missing, run `npx playwright install chromium`.

## Parts

- Categories and variants are listed in `src/core/catalog.ts`: `body` (skin), `hair` (hair), `top`, `bottom`, `shoes`, `hat` (cloth). `hair` and `hat` are optional.
- Each variant names a procedural `kind` plus params. Kinds are defined in `src/scene/parts/` and served through the `PartProvider` interface. Adding a variant with an existing kind only needs a catalog entry; a new shape needs a new `definePart` definition.
- Seeded randomness (e.g. spike placement) comes from `CaptureConfig.seed`, hashed per part, so output is deterministic.

## Sheets

- Body sheets are `body/<variant>.png`. Every other part is rendered once per body as `<category>/<variant>.<body>.png`, so clothing fits each build.
- When rendering a non-body part, the body is drawn depth-only (`colorWrite: false`), so body parts in front of clothing (e.g. an arm in front of the torso) cut holes in that layer.
- Everything renders in neutral greys with baked shading on a transparent background, ready for a multiply tint.
- One row per direction, in `NE`, `SE`, `SW`, `NW` order; one column per animation frame. Every frame is the same size, with the character's feet at the manifest's `anchor` pixel.
- Orthographic camera at 30° elevation and 45° yaw.

## Manifest

- `categories.<id>`: `tintGroup`, `optional` and `variants`, where each variant's `files` maps a body variant id to its sheet.
- `drawOrder.<direction>`: the category stacking order (bottom first). Hair goes under the top when facing the camera and over it when facing away.
