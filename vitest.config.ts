import { defineConfig } from "vitest/config";

// Node 25 turned on its own `localStorage` global. Without a
// `--localstorage-file` it is undefined, and it hides the one jsdom provides.
const nodeMajor = Number(process.versions.node.split(".")[0]);

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    execArgv: nodeMajor >= 25 ? ["--no-experimental-webstorage"] : [],
    coverage: {
      exclude: ["**/*.d.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
