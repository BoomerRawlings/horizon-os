import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Lets `npm run dev` exercise the real API instead of every fetch() silently
      // falling back to offline defaults. Defaults to the app's standard port; override
      // with VITE_API_PROXY_TARGET when 3873 is busy (e.g. the live Horizon.exe app).
      "/api": process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3873",
    },
  },
});
