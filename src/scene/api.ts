import type { CaptureConfig } from "../core/config";
import type { PartSpec } from "../core/parts";

export interface RenderSheetRequest {
  config: CaptureConfig;
  framesPerDirection: number;
  body: PartSpec;
  part?: PartSpec;
}

interface SceneApi {
  renderSheet(request: RenderSheetRequest): string;
}

declare global {
  interface Window {
    spritesheet?: SceneApi;
  }
}
