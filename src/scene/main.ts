import { PART_CATALOG } from "../core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { planSheets } from "../core/parts";
import { renderSheet } from "./capture";

window.spritesheet = { renderSheet };

if (!navigator.webdriver) {
  const grid = document.createElement("div");
  grid.style.display = "flex";
  grid.style.flexWrap = "wrap";
  grid.style.gap = "12px";
  document.body.append(grid);

  for (const job of planSheets(PART_CATALOG)) {
    const figure = document.createElement("figure");
    figure.style.margin = "0";
    const preview = document.createElement("img");
    preview.src = renderSheet({ config: DEFAULT_CAPTURE_CONFIG, framesPerDirection: 1, body: job.body, part: job.part });
    preview.style.imageRendering = "pixelated";
    preview.style.height = "384px";
    const caption = document.createElement("figcaption");
    caption.textContent = job.file;
    caption.style.font = "11px monospace";
    figure.append(preview, caption);
    grid.append(figure);
  }
}
