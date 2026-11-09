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
      JSON.stringify([[`${BASE_A}customer`, { id: 1 }]]),
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
    const inflow = mount(
      `<section data-if="ready"><span data-text="probe()"></span></section>`,
    );
    const probe = vi.fn(() => "rendered");

    inflow.globalContext.probe = probe;
    inflow.globalContext.ready = false;
    inflow.render();

    expect(document.querySelector("section")).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("restores the same node when the condition turns truthy, children and all", () => {
    const inflow = mount(
      `<section data-if="ready"><span data-text="greeting"></span></section>`,
    );
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
    const inflow = mount(
      `<ul><li data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza", "Pasta"]);
  });

  // `data-if` and `data-for` both report a stash decision for the same node, and
  // the loop tracks only one flag for it. A truthy `data-if` reports "not
  // stashed", which on the second pass restores the template `data-for` is
  // holding out of the document — leaving the bare template in the DOM next to
  // its own clones, and detaching the placeholder `data-for` counts from.
  it("keeps a data-for template stashed across passes when data-if is truthy", () => {
    const inflow = mount(
      `<ul><li data-if="ready" data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.ready = true;
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza", "Pasta"]);
  });

  // While `data-if` hides them, `data-for`'s clones are stash placeholders, not
  // elements. `for` identifies its instances by DOM identity, so without
  // resolving a placeholder back to the node it stands in for it sees none of
  // its own work and clones a second set alongside the restored originals.
  it("keeps data-for instances when a truthy data-if turns false and back", () => {
    const inflow = mount(
      `<ul><li data-if="ready" data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.ready = true;
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();

    inflow.globalContext.ready = false;
    inflow.render();
    expect(document.querySelectorAll("li")).toHaveLength(0);

    inflow.globalContext.ready = true;
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza", "Pasta"]);
  });

  // The list can change while `data-if` holds it out of the document, and the
  // pass that brings it back is the first chance `for` gets to reconcile. A
  // dropped item's instance has to be forgotten as well as removed, or it stays
  // in the instance set and is counted again the next time the list grows.
  it("reconciles a data-for list that shrank while a data-if hid it", () => {
    const inflow = mount(
      `<ul><li data-if="ready" data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.ready = true;
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();

    inflow.globalContext.ready = false;
    inflow.render();

    inflow.globalContext.items = ["Pizza"];
    inflow.globalContext.ready = true;
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza"]);
  });

  // New clones are inserted after the last instance already standing, not after
  // the template. Getting this wrong is invisible on a first render, because
  // the additions go in reversed and that lands them in order when there is
  // nothing to sit behind — it only shows once a list grows.
  it("appends new data-for instances after the existing ones", () => {
    const inflow = mount(
      `<ul><li data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();

    inflow.globalContext.items = ["Pizza", "Pasta", "Salad"];
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza", "Pasta", "Salad"]);
  });

  // Restoring the hidden instances swaps their placeholders for the clones
  // themselves, so the sibling list read before that loop is stale by the time
  // the additions need somewhere to go. Read the parent again rather than
  // trusting the snapshot, or the new rows land in front of the restored ones.
  it("appends data-for instances added while a data-if hid the list", () => {
    const inflow = mount(
      `<ul><li data-if="ready" data-for="item in items" data-text="item"></li></ul>`,
    );
    inflow.globalContext.ready = true;
    inflow.globalContext.items = ["Pizza", "Pasta"];
    inflow.render();

    inflow.globalContext.ready = false;
    inflow.render();

    inflow.globalContext.items = ["Pizza", "Pasta", "Salad"];
    inflow.render();

    inflow.globalContext.ready = true;
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map(
      (li) => li.textContent,
    );
    expect(text).toEqual(["Pizza", "Pasta", "Salad"]);
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

/**
 * `mount` / `unmount` move one instance between DOM trees — the case is a
 * client-side router that swaps `<body>` (Astro's `<ClientRouter />`) while the
 * loaded data should survive the navigation.
 */
describe("InflowCore mount and unmount", () => {
  const tree = (html: string) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.append(root);
    return root;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("renders the new root immediately, keeping the context", () => {
    const inflow = new InflowCore({
      root: tree(`<p data-text="greeting"></p>`),
    });
    inflow.globalContext.greeting = "Hello";
    inflow.render();

    const next = tree(`<span data-text="greeting"></span>`);
    inflow.mount(next);

    expect(next.querySelector("span")?.textContent).toBe("Hello");
  });

  it("points later updates at the new root", () => {
    const first = tree(`<p data-text="greeting"></p>`);
    const inflow = new InflowCore({ root: first });
    inflow.globalContext.greeting = "Hello";
    inflow.render();

    const next = tree(`<p data-text="greeting"></p>`);
    inflow.mount(next);
    inflow.globalContext.greeting = "Bye";
    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    expect(next.querySelector("p")?.textContent).toBe("Bye");
    expect(first.querySelector("p")?.textContent).toBe("Hello");
  });

  it("removes the listeners it added to the old tree", () => {
    const first = tree(`<button data-on-click="handler"></button>`);
    const inflow = new InflowCore({ root: first });
    const handler = vi.fn();
    inflow.globalContext.handler = handler;
    inflow.render();

    inflow.unmount();
    first.querySelector("button")?.click();

    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels a pending update", () => {
    const first = tree(`<p data-text="greeting"></p>`);
    const inflow = new InflowCore({ root: first });
    inflow.globalContext.greeting = "Hello";
    inflow.render();

    inflow.globalContext.greeting = "Bye";
    inflow.requestUpdate();
    inflow.unmount();
    vi.advanceTimersByTime(250);

    expect(first.querySelector("p")?.textContent).toBe("Hello");
  });

  // A source fetch that resolves between `unmount` and `mount` still calls
  // `requestUpdate`. That must not throw or render anything.
  it("renders nothing while unmounted", () => {
    const first = tree(`<p data-text="greeting"></p>`);
    const inflow = new InflowCore({ root: first });
    inflow.globalContext.greeting = "Hello";
    inflow.render();
    inflow.unmount();

    inflow.globalContext.greeting = "Bye";
    inflow.requestUpdate();
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(() => inflow.render()).not.toThrow();
    expect(first.querySelector("p")?.textContent).toBe("Hello");
  });

  // `refs` lives in the global context, so without this the next page would
  // read the previous page's detached elements through it.
  it("forgets refs from the old tree", () => {
    const inflow = new InflowCore({ root: tree(`<input data-ref="email" />`) });
    inflow.render();
    inflow.unmount();

    const next = tree(`<p data-text="refs?.email ? 'stale' : 'none'"></p>`);
    inflow.mount(next);

    expect(next.querySelector("p")?.textContent).toBe("none");
  });

  // An element carried over into the new tree (`transition:persist`) keeps the
  // listener from the old tree unless mount runs the full update cycle.
  it("binds a carried-over element once when mounted without unmount", () => {
    const first = tree(`<button data-on-click="handler"></button>`);
    const inflow = new InflowCore({ root: first });
    const handler = vi.fn();
    inflow.globalContext.handler = handler;
    inflow.render();

    const next = tree(``);
    next.append(first.querySelector("button")!);
    inflow.mount(next);
    next.querySelector("button")?.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // `unmount()` drops compiled expressions, so the new page starts from
  // scratch, as a full load would, and sees context keys added in between.
  it("compiles expressions afresh for the new tree", () => {
    const inflow = new InflowCore({
      root: tree(`<p data-text="a || b"></p>`),
    });
    inflow.globalContext.a = "x";
    inflow.render();
    inflow.unmount();

    inflow.globalContext.a = "";
    inflow.globalContext.b = "y";
    const next = tree(`<p data-text="a || b"></p>`);
    inflow.mount(next);

    expect(next.querySelector("p")?.textContent).toBe("y");
  });

  // A failed source stays failed until its `refresh()` runs. A full page load
  // would try it again, so the next page does too.
  it("retries a source that failed on the old tree", async () => {
    const api = "https://api.example.com/s/customer/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ _links: {}, first_name: "Jo" }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => void 0);

    const markup = `<div data-source="{ customer: url }"><p data-text="customer.hasFailedToLoad ? 'failed' : customer.first_name"></p></div>`;
    const first = tree(markup);
    const inflow = new InflowCore({ root: first, base: api });
    inflow.globalContext.url = `${api}customer`;
    inflow.render();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    vi.advanceTimersByTime(250);
    expect(first.querySelector("p")?.textContent).toBe("failed");

    inflow.unmount();
    const next = tree(markup);
    inflow.mount(next);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    vi.advanceTimersByTime(250);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next.querySelector("p")?.textContent).toBe("Jo");
  });

  it("mounts document.body by default", () => {
    const inflow = new InflowCore({ root: tree(``) });
    inflow.globalContext.greeting = "Hello";
    inflow.unmount();

    document.body.innerHTML = `<p data-text="greeting"></p>`;
    inflow.mount();

    expect(document.querySelector("p")?.textContent).toBe("Hello");
  });
});

describe("InflowCore expression cache", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sees a context key added after the expression was first compiled", () => {
    const inflow = mount(`<p data-text="a || b"></p>`);
    inflow.globalContext.a = "first";
    inflow.render();

    inflow.globalContext.a = "";
    inflow.globalContext.b = "second";
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("second");
  });
});
