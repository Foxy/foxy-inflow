import { InflowCore } from "./core";

const BASE_A = "https://store-a.example.com/s/customer/";
const BASE_B = "https://store-b.example.com/s/customer/";

describe("InflowCore storage", () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("scopes storage to the configured base", () => {
    const core = new InflowCore({ base: BASE_A });
    core.storage.setItem("session", "token-a");

    expect(localStorage.getItem(`inflow:${BASE_A}:session`)).toBe("token-a");
  });

  it("keeps two stores on one domain from seeing each other's data", () => {
    const a = new InflowCore({ base: BASE_A });
    const b = new InflowCore({ base: BASE_B });

    a.storage.setItem("session", "token-a");

    expect(b.storage.getItem("session")).toBeNull();
  });

  // SourceDirective reads `inflow.storage` in a field initializer, which runs
  // while the directives are being constructed. If `storage` is assigned after
  // that, construction throws. This pins the ordering.
  it("has storage available while its directives are constructed", () => {
    localStorage.setItem(
      `inflow:${BASE_A}:cachedSources`,
      JSON.stringify([[`${BASE_A}customer`, { id: 1 }]])
    );

    expect(() => new InflowCore({ base: BASE_A })).not.toThrow();
  });
});
