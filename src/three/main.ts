import { Color, Group, MathUtils, PerspectiveCamera, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PART_CATALOG } from "../core/catalog";
import { pickCatalogCharacter } from "../core/compose";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { facingYaw } from "../core/directions";
import { element, mountCrowdControls, showError } from "../crowd/controls";
import { planCrowd, WANDER } from "../crowd/plan";
import { LEVEL_COUNT, levelHeight } from "../phaser/crowd";
import { applyPose, CLIPS } from "../scene/animation";
import { createLitScene, disposeTree } from "../scene/capture";
import { buildDressedCharacter } from "../scene/character";
import { proceduralProvider } from "../scene/parts/procedural";
import { buildLevels } from "./levels";
import { outfitFor } from "./outfit";
import { screenToWorld, unitsPerGrid, UNITS_PER_Z } from "./world";

const MAX_THREE_CROWD = 500;
const FIELD_OF_VIEW = 30;
const ISOMETRIC_YAW = Math.PI / 4;

function idlePose(phase: number) {
  const idle = CLIPS.find((clip) => clip.name === "idle");
  if (!idle) throw new Error("No idle clip");
  return idle.poses[Math.floor(phase * idle.poses.length) % idle.poses.length];
}

function frameDistance(aspect: number): number {
  const halfFov = MathUtils.degToRad(FIELD_OF_VIEW / 2);
  const span = unitsPerGrid(WANDER.floor) * Math.SQRT2;
  const tall = span * Math.sin(MathUtils.degToRad(DEFAULT_CAPTURE_CONFIG.elevationDegrees)) +
    levelHeight(LEVEL_COUNT - 1) * UNITS_PER_Z;
  return Math.max(tall / 2 / Math.tan(halfFov), span / 2 / (Math.tan(halfFov) * aspect)) * 1.25;
}

function start(): void {
  const stage = element<HTMLDivElement>("stage");
  const scene = createLitScene();
  scene.background = new Color(0x2a2d33);
  scene.add(buildLevels(WANDER.floor));

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.domElement.style.display = "block";
  stage.append(renderer.domElement);

  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.5, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, (levelHeight(LEVEL_COUNT - 1) * UNITS_PER_Z) / 3, 0);
  controls.screenSpacePanning = true;

  const resize = (): void => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(stage);

  const elevation = MathUtils.degToRad(DEFAULT_CAPTURE_CONFIG.elevationDegrees);
  const distance = frameDistance(camera.aspect);
  camera.position.set(
    controls.target.x + distance * Math.cos(elevation) * Math.sin(ISOMETRIC_YAW),
    controls.target.y + distance * Math.sin(elevation),
    controls.target.z + distance * Math.cos(elevation) * Math.cos(ISOMETRIC_YAW),
  );
  controls.update();

  let crowd = new Group();
  scene.add(crowd);

  const spawn = (seed: number, size: number): void => {
    scene.remove(crowd);
    disposeTree(crowd);
    crowd = new Group();
    for (const { look, wanderer, phase } of planCrowd(seed, size, (random) =>
      outfitFor(PART_CATALOG, pickCatalogCharacter(PART_CATALOG, random)),
    )) {
      const rig = buildDressedCharacter(proceduralProvider, DEFAULT_CAPTURE_CONFIG.seed, look.body, look.parts);
      applyPose(rig, idlePose(phase));
      const walker = new Group();
      walker.add(rig.root);
      const { x, y, z } = screenToWorld(WANDER.floor, wanderer, wanderer.z);
      walker.position.set(x, y, z);
      walker.rotation.y = facingYaw(wanderer.direction);
      crowd.add(walker);
    }
    scene.add(crowd);
  };

  let frames = 0;
  let fps = 0;
  let since = performance.now();
  renderer.setAnimationLoop((time) => {
    frames++;
    if (time - since >= 500) {
      fps = (frames * 1000) / (time - since);
      frames = 0;
      since = time;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  mountCrowdControls({ max: MAX_THREE_CROWD, spawn, fps: () => fps });
}

try {
  start();
} catch (error) {
  showError(error);
}
