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

/**
 * Characterization coverage for `render()` itself rather than for any one
 * directive: stashing, `skipChildren`, instance reuse and handler rebinding all
 * live in the loop, and every one of them is shared state that a change to
 * attribute discovery can break without failing a single directive test.
 */
function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return new InflowCore({ root });
}

describe("InflowCore render loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("skips the children of a stashed node", () => {
    const inflow = mount(`<section data-if="ready"><span data-text="probe()"></span></section>`);
    const probe = vi.fn(() => "rendered");

    inflow.globalContext.probe = probe;
    inflow.globalContext.ready = false;
    inflow.render();

    expect(document.querySelector("section")).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("restores the same node when the condition turns truthy, children and all", () => {
    const inflow = mount(`<section data-if="ready"><span data-text="greeting"></span></section>`);
    inflow.globalContext.greeting = "Hello";
    inflow.globalContext.ready = false;
    inflow.render();

    const stashed = document.querySelector("section");
    expect(stashed).toBeNull();

    inflow.globalContext.ready = true;
    inflow.render();

    expect(document.querySelector("span")?.textContent).toBe("Hello");
  });

  it("applies the rest of a node's directives alongside a truthy data-if", () => {
    const inflow = mount(`<p data-if="ready" data-text="greeting"></p>`);
    inflow.globalContext.greeting = "Hello";
    inflow.globalContext.ready = true;
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("Hello");
  });

  it("reuses data-for instances instead of appending a second set", () => {
    const inflow = mount(`<ul><li data-for="item in items" data-text="item"></li></ul>`);
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map((li) => li.textContent);
    expect(text).toEqual(["Pizza", "Pasta"]);
  });

  // `data-on-*` adds a listener on every pass and removes it in `beforeUpdate`.
  // If the removal is ever skipped, the handler runs once per completed update
  // cycle instead of once per event.
  it("binds an event handler once per update cycle", () => {
    const inflow = mount(`<button data-on-click="handler"></button>`);
    const handler = vi.fn();

    inflow.globalContext.handler = handler;
    inflow.render();

    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    document.querySelector("button")?.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
