import type { CaptureConfig } from "../core/config";

export interface RenderSheetRequest {
  config: CaptureConfig;
  framesPerDirection: number;
}

interface SceneApi {
  renderSheet(request: RenderSheetRequest): string;
}

declare global {
  interface Window {
    spritesheet?: SceneApi;
  }
}
