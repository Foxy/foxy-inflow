import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Inflow walks and mutates real DOM nodes (document.body, Element,
    // Comment, SubmitEvent, FormData), so tests need a document. jsdom covers
    // everything used today — there is no MutationObserver, no custom
    // elements, and no IntersectionObserver in this codebase.
    environment: "jsdom",
    globals: true,
    // Tests live beside the code they cover, matching the layout in
    // foxy-design-system and foxy-checkout.
    include: ["src/**/*.test.ts"],
    coverage: {
      exclude: ["**/*.d.ts", "src/demo.ts", "src/vite-env.d.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
