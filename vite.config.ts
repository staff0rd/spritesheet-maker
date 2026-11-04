import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: [".ts.net"],
  },
  build: {
    rollupOptions: {
      input: { scene: "index.html", preview: "preview.html", phaser: "phaser.html", three: "three.html" },
    },
  },
});
