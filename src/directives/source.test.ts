import { InflowCore } from "../core";

/**
 * Sources are fetched with the customer's bearer token attached, so the URL a
 * source resolves to decides who receives that token. These cover the origin
 * guard: everything the directive fetches has to live on the configured API
 * origin, because a page is free to build a source out of a query string.
 */
const API = "https://api.example.com/s/customer/";

function mount(html: string, config: Record<string, unknown> = {}) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return new InflowCore({
    root,
    base: API,
    getToken: () => "t0ken",
    ...config,
  });
}

function respondWith(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response);
}

/** Lets the directive's fetch promise chain settle before assertions. */
async function settle() {
  for (let index = 0; index < 30; index++) await Promise.resolve();
}

describe("source directive origin guard", () => {
  let fetchMock: ReturnType<typeof respondWith>;

  beforeEach(() => {
    fetchMock = respondWith({ _links: {}, first_name: "Jo" });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => void 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("fetches a source on the API origin with the bearer token attached", async () => {
    const inflow = mount(`<div data-source="{ customer: url }"></div>`);
    inflow.globalContext.url = `${API}customer`;
    inflow.render();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}customer`);
    expect((init.headers as Headers).get("authorization")).toBe("Bearer t0ken");
  });

  it("refuses a source on another origin instead of sending it the token", async () => {
    const inflow = mount(`<div data-source="{ customer: url }"></div>`);
    inflow.globalContext.url = "https://attacker.example/";
    inflow.render();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused source as failed rather than loading forever", async () => {
    const inflow = mount(
      `<div data-source="{ customer: url }"><p data-text="customer.hasFailedToLoad"></p></div>`,
    );

    inflow.globalContext.url = "https://attacker.example/";
    inflow.render();
    await settle();
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("true");
  });

  it("allows a relative source when the portal is served from its API origin", async () => {
    const inflow = mount(
      `<div data-source="{ addresses: 'addresses' }"></div>`,
      {
        base: "/s/customer/",
      },
    );

    inflow.render();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("addresses");
  });

  it("refuses a pagination link that points off the API origin", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _links: { next: { href: "https://attacker.example/next" } },
        _embedded: { "fx:addresses": [] },
        total_items: 2,
        returned_items: 1,
        offset: 0,
        limit: 1,
      }),
    } as unknown as Response);

    const inflow = mount(
      `<div data-source="{ addresses: url }">
         <!-- Optional call: plain render() does not run the on directive's
              cleanup, so the listener bound while the source was still
              loading is still attached and would throw on a bare call. -->
         <button data-on-click="() => addresses.loadNextPage?.()"></button>
         <p data-text="addresses.isReady"></p>
       </div>`,
    );

    inflow.globalContext.url = `${API}addresses`;
    inflow.render();
    await settle();
    inflow.render();

    // Without this the click below would hit an undefined handler and the
    // assertion would pass for the wrong reason.
    expect(document.querySelector("p")?.textContent).toBe("true");

    fetchMock.mockClear();
    document.querySelector("button")?.click();
    inflow.render();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to patch a cached source that sits on another origin", async () => {
    localStorage.setItem(
      `inflow:${API}:cachedSources`,
      JSON.stringify([
        ["https://attacker.example/", { _links: {}, first_name: "Jo" }],
      ]),
    );

    const inflow = mount(
      `<form data-source="{ customer: url }" data-on-submit="customer.patch">
         <input name="first_name" value="Mo" />
       </form>`,
    );

    inflow.globalContext.url = "https://attacker.example/";
    inflow.render();
    await settle();

    const form = document.querySelector("form") as HTMLFormElement;
    form.reportValidity = () => true;
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a same-origin source when no base is configured", async () => {
    const inflow = mount(`<div data-source="{ thing: url }"></div>`, {
      base: undefined,
    });
    inflow.globalContext.url = `${location.origin}/thing.json`;
    inflow.render();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin source when no base is configured", async () => {
    const inflow = mount(`<div data-source="{ thing: url }"></div>`, {
      base: undefined,
    });
    inflow.globalContext.url = "https://attacker.example/thing.json";
    inflow.render();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("patch failure handling", () => {
  const FIXTURE =
    `<div data-source="{ customer: url }">` +
    `<form data-action="customer.patch"><input name="first_name" value="Ada" /></form>` +
    `<p data-for="error in customer.patch.errors"><span data-text="error.message"></span></p>` +
    `</div>`;

  /**
   * Records every request and lets the PATCH response be chosen per test.
   *
   * Returns real `Response` instances rather than plain objects cast to
   * `Response` — `createAction`'s error handling in src/directives/action.ts
   * branches on `err instanceof Response` to decide whether to extract
   * `fx:errors` from the body, and a plain object fails that check silently,
   * falling back to a `String(err)` message ("[object Object]").
   */
  function stubFetch(patchResponse: { ok: boolean; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];

    const mock = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });

      if (init.method === "PATCH") {
        return new Response(JSON.stringify(patchResponse.body), {
          status: patchResponse.ok ? 200 : 400,
        });
      }

      return new Response(JSON.stringify({ _links: {}, first_name: "Jo" }));
    });

    vi.stubGlobal("fetch", mock);
    return calls;
  }

  /** Mounts the fixture, lets the source load, and returns the mounted form. */
  async function load(inflow: ReturnType<typeof mount>) {
    inflow.globalContext.url = `${API}customer`;
    inflow.render();
    await settle();
    inflow.render();
    return document.querySelector("form")!;
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => void 0);
    vi.spyOn(console, "warn").mockImplementation(() => void 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("reports a rejected save instead of refetching", async () => {
    const calls = stubFetch({
      ok: false,
      body: {
        _embedded: { "fx:errors": [{ message: "email is already in use" }] },
      },
    });

    const inflow = mount(FIXTURE);
    const form = await load(inflow);

    form.dispatchEvent(new SubmitEvent("submit"));
    await settle();
    inflow.render();

    expect(
      calls.filter((call) => (call.init.method ?? "GET") === "GET"),
    ).toHaveLength(1);
    expect(document.querySelector("p span")?.textContent).toBe(
      "email is already in use",
    );
  });

  // Regression: `patch` used to be a fully working action in every branch,
  // including while the source is still loading. A form rendered before data
  // arrives (no `data-if="isReady"` guard required by this library) could
  // fire a genuine PATCH built from whatever placeholder markup is currently
  // in the DOM — a silent overwrite risk, not just a UX one.
  it("ignores a submit made before the source has loaded", async () => {
    const calls = stubFetch({ ok: true, body: {} });

    const inflow = mount(FIXTURE);
    inflow.globalContext.url = `${API}customer`;
    inflow.render(); // still loading: the GET is in flight, nothing has resolved yet

    document.querySelector("form")!.dispatchEvent(new SubmitEvent("submit"));
    await settle();

    expect(calls.filter((call) => call.init.method === "PATCH")).toHaveLength(
      0,
    );
    expect(console.warn).toHaveBeenCalledWith(
      "Ignoring a patch submitted before the source has loaded:",
      `${API}customer`,
    );
  });

  it("still refetches after a save the API accepted", async () => {
    const calls = stubFetch({
      ok: true,
      body: { _links: {}, first_name: "Ada" },
    });

    // The refetch is triggered through `requestUpdate`, which debounces 250ms
    // (see `InflowCore.requestUpdate` in src/core.ts) before it re-renders.
    // `settle()` only drains microtasks, so real time has to move for the
    // trailing edge of that debounce to fire — hence fake timers for the
    // whole flow. Lodash's debounce keeps reusing its pending timer instead
    // of scheduling a new one as long as one is outstanding, so switching to
    // fake timers only after the initial load (which also calls
    // `requestUpdate`) would leave a real, un-advanceable timer in place.
    vi.useFakeTimers();
    try {
      const inflow = mount(FIXTURE);
      const form = await load(inflow);

      form.dispatchEvent(new SubmitEvent("submit"));
      await settle();
      await vi.advanceTimersByTimeAsync(250);

      expect(
        calls.filter((call) => (call.init.method ?? "GET") === "GET"),
      ).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends PATCH to the source's own url with the token read at submit time", async () => {
    const calls = stubFetch({ ok: true, body: {} });
    let token = "first";

    const inflow = mount(FIXTURE, { getToken: () => token });
    const form = await load(inflow);

    token = "second";
    form.dispatchEvent(new SubmitEvent("submit"));
    await settle();

    const patch = calls.find((call) => call.init.method === "PATCH")!;
    expect(patch.url).toBe(`${API}customer`);
    expect((patch.init.headers as Record<string, string>).authorization).toBe(
      "Bearer second",
    );
    expect(JSON.parse(patch.init.body as string)).toEqual({
      first_name: "Ada",
    });
  });

  // This guard exists today and must survive the rewrite.
  it("refuses to patch a source that is not on the api origin", async () => {
    const calls = stubFetch({ ok: true, body: {} });

    const inflow = mount(FIXTURE);
    inflow.globalContext.url = "https://attacker.example/";
    inflow.render();
    await settle();
    inflow.render();

    // `#loadSource` already logs its own origin refusal by this point, so
    // asserting `console.error` was called at all would pass even if the
    // patch handler never ran. Check for its specific message instead.
    vi.mocked(console.error).mockClear();

    document.querySelector("form")!.dispatchEvent(new SubmitEvent("submit"));
    await settle();

    expect(calls.filter((call) => call.init.method === "PATCH")).toHaveLength(
      0,
    );
    expect(console.error).toHaveBeenCalledWith(
      "Refusing to patch a source outside the API origin:",
      "https://attacker.example/",
    );
  });
});
