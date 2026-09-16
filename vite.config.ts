import { defineConfig, type Plugin } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";
import pkg from "./package.json";

// Three entry points, matching the published `exports` map and the CDN layout:
// index.js exports everything, portal.js and core.js are the narrower ones.
const entry = {
  index: resolve(import.meta.dirname, "src/index.ts"),
  portal: resolve(import.meta.dirname, "src/entries/portal.ts"),
  core: resolve(import.meta.dirname, "src/entries/core.ts"),
};

const dependencies = Object.keys(pkg.dependencies);

/**
 * The CDN bundle inlines its dependencies, and their licences (MIT, BlueOak)
 * require the notices to travel with the code. Collect them into a LICENSE.md
 * next to the bundle — the banner on every chunk points at it.
 */
function bundledLicenses(): Plugin {
  return {
    name: "inflow-bundled-licenses",
    apply: "build",
    generateBundle() {
      const sections = dependencies.map((name) => {
        const dir = resolve(import.meta.dirname, "node_modules", name);
        const meta = JSON.parse(
          readFileSync(resolve(dir, "package.json"), "utf8"),
        );
        const file = readdirSync(dir).find((entry) =>
          /^licen[cs]e(\..+)?$/i.test(entry),
        );
        const text = file
          ? readFileSync(resolve(dir, file), "utf8").trim()
          : "";
        return `## ${meta.name} ${meta.version} (${meta.license})\n\n${text}\n`;
      });

      this.emitFile({
        type: "asset",
        fileName: "LICENSE.md",
        source: `# Licenses of bundled dependencies\n\n${sections.join("\n")}`,
      });
    },
  };
}

/**
 * The source imports without file extensions, which `moduleResolution:
 * "bundler"` allows and TypeScript copies verbatim into the declarations. A
 * consumer on `node16`/`nodenext` then cannot resolve them, so put the
 * extensions back on the way out.
 */
function withExtensions(content: string): string {
  const specifier = /(\bfrom\s*|\bimport\s*\()(["'])(\.\.?\/[^"']+)\2/g;
  return content.replace(specifier, (match, prefix, quote, path) =>
    /\.[cm]?[jt]sx?$|\.json$/.test(path)
      ? match
      : `${prefix}${quote}${path}.js${quote}`,
  );
}

export default defineConfig(({ command, mode }) => {
  // The CDN bundle is dropped into a page with a plain <script type="module">,
  // so it inlines lodash-es, lru-cache and zod. The npm build leaves them to
  // the consumer's package manager.
  const isCDN = mode === "cdn";

  return {
    // The demo pages live in demo/ and are served, never built — the builds
    // below are library builds and must keep the repo root, or outDir would
    // land inside demo/.
    root: command === "serve" ? "demo" : undefined,
    plugins: isCDN
      ? [bundledLicenses()]
      : [
          dts({
            tsconfigPath: "./tsconfig.build.json",
            outDir: "dist/npm/types",
            beforeWriteFile: (filePath, content) => ({
              filePath,
              content: withExtensions(content),
            }),
          }),
        ],
    build: {
      emptyOutDir: true,
      sourcemap: true,
      minify: isCDN,
      outDir: isCDN ? "dist/cdn" : "dist/npm",
      lib: { entry, formats: ["es"] },
      rollupOptions: {
        external: isCDN
          ? []
          : (id) =>
              dependencies.some(
                (dep) => id === dep || id.startsWith(`${dep}/`),
              ),
        output: {
          // A legal comment, so minification keeps it.
          banner: isCDN
            ? "/*! See licenses of bundled dependencies in LICENSE.md */"
            : undefined,
        },
      },
    },
  };
});
