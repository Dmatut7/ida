import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateway = `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "7788"}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.WEB_HOST || "127.0.0.1",
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      "/api": gateway,
      "/ws": { target: gateway, ws: true },
    },
  },
});
