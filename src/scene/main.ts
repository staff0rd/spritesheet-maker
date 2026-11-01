import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { renderSheet } from "./capture";

window.spritesheet = { renderSheet };

if (!navigator.webdriver) {
  const preview = document.createElement("img");
  preview.src = renderSheet({ config: DEFAULT_CAPTURE_CONFIG, framesPerDirection: 1 });
  preview.style.imageRendering = "pixelated";
  preview.style.width = "auto";
  preview.style.height = "384px";
  document.body.append(preview);
}
