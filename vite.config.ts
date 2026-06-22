import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === "test" ? null : tailwindcss(),
    mode === "test"
      ? null
      : react({
          babel: { plugins: [["babel-plugin-react-compiler"]] },
        }),
    mode === "test" ? null : rsc(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/framework/**", "src/lib/**", "src/site.tsx"],
      reporter: ["text"],
    },
  },
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/framework/entry.rsc.tsx" },
          output: {
            manualChunks(id) {
              // Keep the React/RSC runtime in a shared chunk so page route
              // dynamic imports stay effective without Rollup warnings.
              if (
                id.includes("/node_modules/react/") ||
                id.includes("/node_modules/react-dom/") ||
                id.includes("/node_modules/@vitejs/plugin-rsc/dist/vendor/")
              ) {
                return "rsc-react-server";
              }
            },
          },
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
}));
