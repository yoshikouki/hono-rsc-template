import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [rsc()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/framework/entry.rsc.tsx" },
        },
      },
    },
    ssr: {
      build: {
        rollupOptions: {
          input: { index: "./src/framework/entry.ssr.tsx" },
        },
      },
    },
    client: {
      build: {
        rollupOptions: {
          input: { index: "./src/framework/entry.browser.tsx" },
        },
      },
    },
  },
});
