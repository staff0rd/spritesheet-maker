import { Color, Group, MathUtils, PerspectiveCamera, WebGLRenderer } from "three";
import type { Random } from "../core/random";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PART_CATALOG } from "../core/catalog";
import { pickCatalogCharacter } from "../core/compose";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { facingYaw } from "../core/directions";
import { element, mountCrowdControls, showError } from "../crowd/controls";
import { MAX_STEP_SECONDS, planCrowd, WANDER } from "../crowd/plan";
import { LEVEL_COUNT, levelHeight, stepWander, toGrid, type Wanderer } from "../phaser/crowd";
import { poseJoints } from "../scene/animation";
import { createLitScene } from "../scene/capture";
import { buildDressedCharacter } from "../scene/character";
import type { Rig } from "../scene/rig";
import { proceduralProvider } from "../scene/parts/procedural";
import { bakeRig, disposeBakedRigs } from "./bake";
import { cachedSkirtFitter, skirtFrame } from "./skirts";
import { buildLevels } from "./levels";
import { outfitFor } from "./outfit";
import { blendPose, clip, groundHeight, headingYaw, strideLength, turnToward } from "./walker";
import { screenToWorld, unitsPerGrid, UNITS_PER_Z } from "./world";

const MAX_THREE_CROWD = 500;
const FIELD_OF_VIEW = 30;
const ISOMETRIC_YAW = Math.PI / 4;

const TURN_SPEED = 3 * Math.PI;
const IDLE = clip("idle");
const WALK = clip("walk");

interface Walker {
  object: Group;
  rig: Rig;
  wanderer: Wanderer;
  random: Random;
  phase: number;
  stride: number;
  walking: boolean;
  cycle: number;
  fitSkirts: (key: string) => void;
}

function place(walker: Walker): void {
  const { wanderer, object } = walker;
  const { x, z } = screenToWorld(WANDER.floor, wanderer);
  object.position.set(x, groundHeight(toGrid(WANDER.floor, wanderer), wanderer.z) * UNITS_PER_Z, z);
}

function advance(walker: Walker, seconds: number): void {
  const before = walker.wanderer;
  const wanderer = stepWander(before, seconds, walker.random, WANDER);
  walker.wanderer = wanderer;
  place(walker);

  const walking = wanderer.pause <= 0;
  if (walking !== walker.walking) {
    walker.walking = walking;
    walker.cycle = 0;
  }
  if (walking) {
    const heading = headingYaw(WANDER.floor, wanderer, wanderer.target);
    if (heading !== undefined) {
      walker.object.rotation.y = turnToward(walker.object.rotation.y, heading, TURN_SPEED * seconds);
    }
    const from = screenToWorld(WANDER.floor, before);
    const to = screenToWorld(WANDER.floor, wanderer);
    walker.cycle += Math.hypot(to.x - from.x, to.z - from.z) / walker.stride;
  } else {
    walker.cycle += (seconds * IDLE.fps) / IDLE.poses.length;
  }
  const cycle = walker.cycle + walker.phase;
  poseJoints(walker.rig, blendPose((walking ? WALK : IDLE).poses, cycle));
  walker.fitSkirts(`${walking ? "walk" : "idle"}:${skirtFrame(cycle)}`);
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
  let walkers: Walker[] = [];
  scene.add(crowd);

  const spawn = (seed: number, size: number): void => {
    scene.remove(crowd);
    disposeBakedRigs(crowd);
    crowd = new Group();
    walkers = planCrowd(seed, size, (random) =>
      outfitFor(PART_CATALOG, pickCatalogCharacter(PART_CATALOG, random)),
    ).map(({ look, wanderer, random, phase }) => {
      const rig = buildDressedCharacter(proceduralProvider, DEFAULT_CAPTURE_CONFIG.seed, look.body, look.parts);
      bakeRig(rig);
      const object = new Group();
      object.add(rig.root);
      object.rotation.y = facingYaw(wanderer.direction);
      crowd.add(object);
      const walker: Walker = {
        object,
        rig,
        wanderer,
        random,
        phase,
        stride: strideLength(rig.shape),
        walking: false,
        cycle: 0,
        fitSkirts: cachedSkirtFitter(rig),
      };
      advance(walker, 0);
      return walker;
    });
    scene.add(crowd);
  };

  let frames = 0;
  let fps = 0;
  let since = performance.now();
  let last = since;
  renderer.setAnimationLoop((time) => {
    const seconds = Math.min((time - last) / 1000, MAX_STEP_SECONDS);
    last = time;
    for (const walker of walkers) advance(walker, seconds);
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
