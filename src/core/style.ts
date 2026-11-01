export const RENDER_STYLES = ["blocky", "smooth"] as const;

export type RenderStyle = (typeof RENDER_STYLES)[number];

export const DEFAULT_RENDER_STYLE: RenderStyle = "blocky";
