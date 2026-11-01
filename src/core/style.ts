export const RENDER_STYLES = ["blocky", "smooth"] as const;

export type RenderStyle = (typeof RENDER_STYLES)[number];

export const DEFAULT_RENDER_STYLE: RenderStyle = "blocky";

export function parseRenderStyle(value: string | null): RenderStyle {
  return RENDER_STYLES.find((style) => style === value) ?? DEFAULT_RENDER_STYLE;
}
