import { crowdSize } from "../phaser/crowd";

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function writeUrl(seed: number, size: number): void {
  const params = new URLSearchParams(location.search);
  params.set("seed", String(seed));
  params.set("count", String(size));
  history.replaceState(null, "", `?${params}`);
}

interface CrowdControls {
  max: number;
  spawn: (seed: number, size: number) => void;
  fps: () => number;
}

export function showError(error: unknown): void {
  const status = element<HTMLSpanElement>("status");
  status.textContent = error instanceof Error ? error.message : String(error);
  status.style.color = "#f66";
}

export function mountCrowdControls({ max, spawn, fps }: CrowdControls): void {
  const status = element<HTMLSpanElement>("status");
  const fpsLabel = element<HTMLSpanElement>("fps");
  const seedInput = element<HTMLInputElement>("seed");
  const reseedButton = element<HTMLButtonElement>("reseed");
  const countInput = element<HTMLInputElement>("count");
  const countLabel = element<HTMLOutputElement>("count-label");

  const params = new URLSearchParams(location.search);
  countInput.max = String(max);
  seedInput.value = String(Number(params.get("seed") ?? 1) || 0);
  countInput.value = String(crowdSize(params.get("count"), max));
  countLabel.value = countInput.value;

  const respawn = (): void => {
    const seed = Number(seedInput.value) || 0;
    const size = crowdSize(countInput.value, max);
    countLabel.value = String(size);
    writeUrl(seed, size);
    spawn(seed, size);
    status.textContent = `seed ${seed} · ${size} characters`;
  };

  reseedButton.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    respawn();
  });
  seedInput.addEventListener("change", respawn);
  countInput.addEventListener("input", () => {
    countLabel.value = countInput.value;
  });
  countInput.addEventListener("change", respawn);
  element<HTMLFormElement>("controls").addEventListener("submit", (event) => event.preventDefault());
  setInterval(() => {
    fpsLabel.textContent = `${Math.round(fps())} fps`;
  }, 500);

  respawn();
}
