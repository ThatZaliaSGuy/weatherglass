import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds one self-contained index.html, the same shape as the published page.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 2000 },
});
