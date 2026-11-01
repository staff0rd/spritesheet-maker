export const RENDER_STYLES = ["blocky", "smooth"] as const;

export type RenderStyle = (typeof RENDER_STYLES)[number];

export const DEFAULT_RENDER_STYLE: RenderStyle = "blocky";

export function parseRenderStyle(value: string | null): RenderStyle {
  return RENDER_STYLES.find((style) => style === value) ?? DEFAULT_RENDER_STYLE;
}

export function manifestUrl(params: URLSearchParams, style: RenderStyle, base: string): URL {
  return new URL(params.get("manifest") ?? `/out/${style}/manifest.json`, base);
}

export function missingManifestMessage(url: URL, status: number, style: RenderStyle): string {
  return `Could not load ${url} (${status}). Run npm run generate to write out/${style}/.`;
}
