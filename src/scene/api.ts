import type { CaptureConfig } from "../core/config";
import type { PartSpec } from "../core/parts";
import type { RenderStyle } from "../core/style";
import type { Pose } from "./animation";

export interface RenderSheetRequest {
  config: CaptureConfig;
  poses: Pose[];
  body: PartSpec;
  part?: PartSpec;
  style?: RenderStyle;
}

interface SceneApi {
  renderSheet(request: RenderSheetRequest): string;
}

declare global {
  interface Window {
    spritesheet?: SceneApi;
  }
}
