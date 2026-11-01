import { MathUtils, OrthographicCamera, Vector3 } from "three";
import type { CaptureConfig } from "../core/config";

const CAMERA_DISTANCE = 20;
const ISOMETRIC_YAW = Math.PI / 4;

export function createIsometricCamera(config: CaptureConfig): OrthographicCamera {
  const { frameSize, anchor, pixelsPerUnit } = config;
  const camera = new OrthographicCamera(
    -anchor.x / pixelsPerUnit,
    (frameSize.width - anchor.x) / pixelsPerUnit,
    anchor.y / pixelsPerUnit,
    -(frameSize.height - anchor.y) / pixelsPerUnit,
    0.1,
    CAMERA_DISTANCE * 2,
  );
  const elevation = MathUtils.degToRad(config.elevationDegrees);
  camera.position.set(
    CAMERA_DISTANCE * Math.cos(elevation) * Math.sin(ISOMETRIC_YAW),
    CAMERA_DISTANCE * Math.sin(elevation),
    CAMERA_DISTANCE * Math.cos(elevation) * Math.cos(ISOMETRIC_YAW),
  );
  camera.lookAt(new Vector3(0, 0, 0));
  camera.updateProjectionMatrix();
  return camera;
}
