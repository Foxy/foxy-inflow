import { describe, expect, it } from "vitest";

// The three entry points are the published API surface: `index.js`,
// `portal.js` and `core.js` on the CDN, and the matching `exports` map on npm.
// Removing a name from one of them is a breaking change for integrators, so
// pin the surface here rather than discovering it after a release.
describe("entry points", () => {
  it("exports everything from the index entry", async () => {
    const entry = await import("../index");
    expect(Object.keys(entry).sort()).toEqual(["Core", "Directive", "Portal"]);
  });

  it("exports Portal from the portal entry", async () => {
    const entry = await import("./portal");
    expect(Object.keys(entry).sort()).toEqual(["Portal"]);
  });

  it("exports Core and Directive from the core entry", async () => {
    const entry = await import("./core");
    expect(Object.keys(entry).sort()).toEqual(["Core", "Directive"]);
  });

  it("exports the same classes from the narrow entries as from the index", async () => {
    const index = await import("../index");
    const portal = await import("./portal");
    const core = await import("./core");

    expect(portal.Portal).toBe(index.Portal);
    expect(core.Core).toBe(index.Core);
    expect(core.Directive).toBe(index.Directive);
  });
});
