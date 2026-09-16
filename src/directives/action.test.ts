import { InflowCore } from "../core";

/**
 * `data-action` posts the form to the Customer API. Everything the API needs
 * comes from the form's own fields, so the request body is the behaviour worth
 * pinning down — the existing portal tests stub `fetch` without ever reading
 * what was sent, which is how an empty body went unnoticed.
 */
function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return new InflowCore({
    root,
    base: "https://store.example.com/s/customer/",
  });
}

// The submit handler does not await its own fetch chain, so tests let the
// queued microtasks settle before asserting.
async function submit() {
  document.querySelector("form")!.dispatchEvent(new SubmitEvent("submit"));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("data-action", () => {
  let sent: {
    url: string;
    body: unknown;
    method?: string;
    headers?: Record<string, string>;
  }[];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    sent = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent.push({
        url: String(url),
        body: init.body,
        method: init.method,
        headers: init.headers as Record<string, string>,
      });
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
    // Without this a spy stays installed on the prototype, and the next
    // `spyOn` of the same method hands back that same mock — call counts from
    // one test then show up in the next.
    vi.restoreAllMocks();
  });

  // The handler disables every control to block a double submit. Disabled
  // controls are barred from the form data set, so collecting the values after
  // disabling them posts `{}` and the API rejects the request for missing
  // fields it was actually given.
  it("posts the form's field values", async () => {
    const inflow = mount(
      `<form data-action="signIn">` +
        `<input name="email" value="customer@example.com" />` +
        `<input name="password" value="secret" />` +
        `<button>Sign in</button>` +
        `</form>`,
    );

    inflow.globalContext.signIn = inflow.createAction({ path: "authenticate" });
    inflow.render();

    await submit();

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body as string)).toEqual({
      email: "customer@example.com",
      password: "secret",
    });
  });

  // Everything in a form data set is a string, so a typed field was
  // unreachable from markup: `<input name="save_cc" value="false">` posted
  // `{"save_cc":"false"}` and the Customer API answered
  // `data.save_cc should be boolean`. `data-json` marks the fields to parse.
  it("sends a field marked data-json as its parsed value", async () => {
    const inflow = mount(
      `<form data-action="patch">` +
        `<input name="save_cc" value="false" data-json />` +
        `<button>Remove card</button>` +
        `</form>`,
    );

    inflow.globalContext.patch = inflow.createAction({
      path: "default_payment_method",
    });
    inflow.render();

    await submit();

    expect(JSON.parse(sent[0].body as string)).toEqual({ save_cc: false });
  });

  it("parses numbers and objects the same way", async () => {
    const inflow = mount(
      `<form data-action="patch">` +
        `<input name="quantity" value="3" data-json />` +
        `<input name="shape" value='{"a":1}' data-json />` +
        `<input name="plain" value="3" />` +
        `<button>Save</button>` +
        `</form>`,
    );

    inflow.globalContext.patch = inflow.createAction({ path: "anything" });
    inflow.render();

    await submit();

    expect(JSON.parse(sent[0].body as string)).toEqual({
      quantity: 3,
      shape: { a: 1 },
      plain: "3",
    });
  });

  // The marker is an attribute like any other, so it has to follow a
  // configured prefix rather than being hardcoded to `data-`.
  it("honours a configured attribute prefix", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<form fx-action="patch">` +
      `<input name="save_cc" value="false" fx-json />` +
      `<button>Remove card</button>` +
      `</form>`;
    document.body.append(root);

    const inflow = new InflowCore({
      root,
      prefix: "fx-",
      base: "https://store.example.com/s/customer/",
    });

    inflow.globalContext.patch = inflow.createAction({
      path: "default_payment_method",
    });
    inflow.render();

    await submit();

    expect(JSON.parse(sent[0].body as string)).toEqual({ save_cc: false });
  });

  // A marked field holding something unparseable must not take the whole
  // submit down with it — the other fields still have to reach the API.
  it("keeps an unparseable marked field as a string", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const inflow = mount(
      `<form data-action="patch">` +
        `<input name="broken" value="not json" data-json />` +
        `<input name="email" value="customer@example.com" />` +
        `<button>Save</button>` +
        `</form>`,
    );

    inflow.globalContext.patch = inflow.createAction({ path: "anything" });
    inflow.render();

    await submit();

    expect(JSON.parse(sent[0].body as string)).toEqual({
      broken: "not json",
      email: "customer@example.com",
    });
    expect(error).toHaveBeenCalled();
  });

  // An invalid field used to end the submit with a bare `return`: no request,
  // no browser validation UI, nothing. The customer pressed the button and the
  // page sat there. Ask the browser to report the problem instead.
  it("reports the invalid field instead of failing silently", async () => {
    const reportValidity = vi.spyOn(
      HTMLFormElement.prototype,
      "reportValidity",
    );

    const inflow = mount(
      `<form data-action="signIn">` +
        `<input name="email" required value="" />` +
        `<button>Sign in</button>` +
        `</form>`,
    );

    inflow.globalContext.signIn = inflow.createAction({ path: "authenticate" });
    inflow.render();

    await submit();

    expect(reportValidity).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  // `novalidate` is the documented way to suppress the browser's bubbles and
  // show the messages in your own markup instead. Reporting over the top of
  // that would take the escape hatch away, so the check stays silent here.
  it("stays silent on a novalidate form", async () => {
    const reportValidity = vi.spyOn(
      HTMLFormElement.prototype,
      "reportValidity",
    );

    const inflow = mount(
      `<form data-action="signIn" novalidate>` +
        `<input name="email" required value="" />` +
        `<button>Sign in</button>` +
        `</form>`,
    );

    inflow.globalContext.signIn = inflow.createAction({ path: "authenticate" });
    inflow.render();

    await submit();

    expect(reportValidity).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  // Disabling the controls is what stops a second submit while the first is in
  // flight, so the fix must keep that behaviour rather than drop it.
  it("disables the controls while the request is in flight", async () => {
    const inflow = mount(
      `<form data-action="signIn">` +
        `<input name="email" value="customer@example.com" />` +
        `<button>Sign in</button>` +
        `</form>`,
    );

    inflow.globalContext.signIn = inflow.createAction({ path: "authenticate" });
    inflow.render();

    document.querySelector("form")!.dispatchEvent(new SubmitEvent("submit"));

    expect(document.querySelector("input")!.disabled).toBe(true);
    expect(document.querySelector("button")!.disabled).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // A source's URL is not always `base` plus a segment: sources built from
  // `_links` hrefs are arbitrary URLs on the API origin, so the endpoint has
  // to be expressible in full.
  it("posts to an absolute url when given one", async () => {
    const inflow = mount(
      `<form data-action="save"><input name="email" value="a@b.com" /></form>`,
    );

    inflow.globalContext.save = inflow.createAction({
      url: "https://store.example.com/s/customer/",
    });
    inflow.render();

    await submit();

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://store.example.com/s/customer/");
  });

  it("sends the method it was given", async () => {
    const inflow = mount(
      `<form data-action="save"><input name="email" value="a@b.com" /></form>`,
    );

    inflow.globalContext.save = inflow.createAction({
      url: "https://store.example.com/s/customer/",
      method: "PATCH",
    });
    inflow.render();

    await submit();

    expect(sent[0].method).toBe("PATCH");
  });

  // A source reads its token at request time. Capturing a string when the
  // action is built would send a stale credential after a session refresh.
  it("reads a callable bearer token at submit time", async () => {
    let token = "first";
    const inflow = mount(
      `<form data-action="save"><input name="email" value="a@b.com" /></form>`,
    );

    inflow.globalContext.save = inflow.createAction({
      url: "https://store.example.com/s/customer/",
      bearerToken: () => token,
    });
    inflow.render();

    token = "second";
    await submit();

    expect(sent[0].headers?.authorization).toBe("Bearer second");
  });

  // A 502 from a proxy in front of the API returns an HTML error page, not
  // JSON. `err.json()` rejects in that case, and that rejection used to have
  // no `.catch`: `requestUpdate()` and `reportValidity()` were only reached
  // from inside the (never-settling) `.then()`, so the failure never reached
  // the page and the rejection went unhandled.
  it("still reports one error when the failed response body is not JSON", async () => {
    const inflow = mount(
      `<form data-action="save">` +
        `<input name="email" value="a@b.com" />` +
        `<p data-for="error in save.errors"><span data-text="error.message"></span></p>` +
        `</form>`,
    );

    const badResponse = new Response("<html>Bad Gateway</html>", {
      status: 502,
    });
    vi.spyOn(badResponse, "json").mockRejectedValue(
      new SyntaxError("Unexpected token <"),
    );
    globalThis.fetch = (async () =>
      badResponse) as unknown as typeof globalThis.fetch;

    inflow.globalContext.save = inflow.createAction({ path: "customer" });
    const requestUpdate = vi.spyOn(inflow, "requestUpdate");
    inflow.render();

    await submit();

    // One call puts the action into "busy" before the request goes out; a
    // second is the only way a failure ever reaches the page.
    expect(requestUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      (inflow.globalContext.save as { errors: unknown[] }).errors,
    ).toHaveLength(1);

    inflow.render();
    expect(document.querySelectorAll("p span")).toHaveLength(1);
    expect(document.querySelector("p span")?.textContent).toBeTruthy();
  });

  // The regression guard for every existing caller.
  it("still posts to base plus path when given a path", async () => {
    const inflow = mount(
      `<form data-action="save"><input name="email" value="a@b.com" /></form>`,
    );

    inflow.globalContext.save = inflow.createAction({ path: "authenticate" });
    inflow.render();

    await submit();

    expect(sent[0].url).toBe(
      "https://store.example.com/s/customer/authenticate",
    );
    expect(sent[0].method).toBe("POST");
  });
});
