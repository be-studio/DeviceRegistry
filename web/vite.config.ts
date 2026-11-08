import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs on :3000; the proxy keeps the browser on one origin so cookies work
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/graphql": "http://localhost:3000",
      "/api": "http://localhost:3000"
    }
  }
});
