import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = process.env.FREEBAND_PORT ?? "7010";

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    proxy: { "/api": `http://localhost:${serverPort}` },
  },
});
