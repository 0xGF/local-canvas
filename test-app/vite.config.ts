import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localCanvasPlugin } from "../src/plugin/vite.js";

export default defineConfig({
  plugins: [react(), tailwindcss(), localCanvasPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
