import { PART_CATALOG } from "../core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { planSheets } from "../core/parts";
import { parseRenderStyle, RENDER_STYLES, type RenderStyle } from "../core/style";
import { CLIPS, sheetFrames } from "./animation";
import { renderSheet } from "./capture";
import { mountViewer } from "./viewer";

window.spritesheet = { renderSheet };

function renderSheets(grid: HTMLElement, style: RenderStyle): void {
  grid.replaceChildren();
  const { poses } = sheetFrames(CLIPS);
  for (const job of planSheets(PART_CATALOG)) {
    const figure = document.createElement("figure");
    figure.style.margin = "0";
    const preview = document.createElement("img");
    preview.src = renderSheet({ config: DEFAULT_CAPTURE_CONFIG, poses, body: job.body, part: job.part, style });
    preview.style.imageRendering = "pixelated";
    preview.style.height = "384px";
    const caption = document.createElement("figcaption");
    caption.textContent = job.file;
    caption.style.font = "11px monospace";
    figure.append(preview, caption);
    grid.append(figure);
  }
}

function showSheets(params: URLSearchParams): void {
  document.body.style.margin = "16px";
  const header = document.createElement("div");
  header.style.cssText = "display:flex;gap:16px;align-items:center;margin-bottom:12px;font:13px system-ui";
  const back = document.createElement("a");
  back.textContent = "← 3D viewer";
  const style = document.createElement("select");
  for (const option of RENDER_STYLES) style.add(new Option(option, option));
  style.value = parseRenderStyle(params.get("style"));
  const label = document.createElement("label");
  label.append("style ", style);
  header.append(back, label);
  const grid = document.createElement("div");
  grid.style.display = "flex";
  grid.style.flexWrap = "wrap";
  grid.style.gap = "12px";
  document.body.append(header, grid);

  function render(): void {
    const selected = parseRenderStyle(style.value);
    back.href = `?style=${selected}`;
    params.set("style", selected);
    history.replaceState(null, "", `?${params}`);
    renderSheets(grid, selected);
  }
  style.addEventListener("change", render);
  render();
}

if (!navigator.webdriver) {
  const params = new URLSearchParams(location.search);
  if (params.get("view") === "sheets") showSheets(params);
  else mountViewer(document.body, parseRenderStyle(params.get("style")));
}
