import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  ssr: {
    noExternal: ["@convex-dev/better-auth"],
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    tailwindcss(),
    viteReact(),
    nitro({
      experimental: { asyncContext: true },
      // ── Region co-location ────────────────────────────────────────────
      // For minimum TTFT, deploy API routes, Redis (Upstash), and Convex
      // to the SAME geographic region (e.g. us-east-1 / iad1).
      // We stay on Node.js serverless (not Edge) because ioredis requires
      // raw TCP sockets for blocking XREAD/SUBSCRIBE, Edge runtimes
      // (Cloudflare Workers, Vercel Edge) don't support this.
      // To move to Edge: replace ioredis with @upstash/redis (HTTP) and
      // refactor blocking XREAD to short-polling, which adds complexity.
    }),
  ],
  worker: {
    format: "es",
  },
});
