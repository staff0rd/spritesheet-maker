import { describe, expect, it } from "vitest";
import { manifestUrl, parseRenderStyle } from "./style";

const BASE = "http://localhost:5173/preview.html";

describe("manifestUrl", () => {
  it("points at the chosen style's manifest", () => {
    expect(manifestUrl(new URLSearchParams(), "blocky", BASE).href).toBe("http://localhost:5173/out/blocky/manifest.json");
    expect(manifestUrl(new URLSearchParams(), "smooth", BASE).href).toBe("http://localhost:5173/out/smooth/manifest.json");
  });

  it("lets ?manifest= override the style", () => {
    const params = new URLSearchParams("manifest=/custom/manifest.json");
    expect(manifestUrl(params, "smooth", BASE).href).toBe("http://localhost:5173/custom/manifest.json");
  });
});

describe("parseRenderStyle", () => {
  it("defaults to blocky", () => {
    expect(parseRenderStyle(null)).toBe("blocky");
    expect(parseRenderStyle("nonsense")).toBe("blocky");
    expect(parseRenderStyle("smooth")).toBe("smooth");
  });
});
