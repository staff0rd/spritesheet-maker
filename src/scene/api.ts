import type { CaptureConfig } from "../core/config";
import type { PartSpec } from "../core/parts";
import type { Pose } from "./animation";

export interface RenderSheetRequest {
  config: CaptureConfig;
  poses: Pose[];
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
