import { InflowCore } from "../core";

/**
 * `data-as` exists for visual builders. Webflow owns its Form element: it wraps
 * every form in a `div.w-form`, swaps a `<button>` for an anchor, disables the
 * submit control until its own spam protection clears, and injects a field of
 * its own into the payload. A builder will hand you a `<div>` without a fight,
 * so `data-as` turns that div into the element the markup actually needs.
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

describe("data-as", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("replaces the element with one of the named tag", () => {
    const inflow = mount(`<div data-as="form"></div>`);
    inflow.render();

    expect(document.querySelector("form")).toBeTruthy();
    expect(document.querySelector("div[data-as]")).toBeNull();
  });

  it("carries the attributes and classes over", () => {
    const inflow = mount(
      `<div data-as="input" class="field" name="email" placeholder="you@example.com"></div>`,
    );
    inflow.render();

    const input = document.querySelector("input")!;
    expect(input.className).toBe("field");
    expect(input.getAttribute("name")).toBe("email");
    expect(input.getAttribute("placeholder")).toBe("you@example.com");
  });

  it("keeps the children", () => {
    const inflow = mount(
      `<div data-as="form"><label>Email</label><span>hint</span></div>`,
    );
    inflow.render();

    const form = document.querySelector("form")!;
    expect(form.querySelector("label")?.textContent).toBe("Email");
    expect(form.querySelector("span")?.textContent).toBe("hint");
  });

  // The swap has to happen once. Re-creating the element on every render would
  // throw away what the customer had typed, along with focus and any listener
  // another directive attached.
  it("does not re-create the element on a later render", () => {
    const inflow = mount(`<div data-as="form"><input name="email" /></div>`);
    inflow.render();

    const form = document.querySelector("form")!;
    const input = document.querySelector("input")!;
    input.value = "customer@example.com";

    inflow.render();

    expect(document.querySelector("form")).toBe(form);
    expect(document.querySelector("input")).toBe(input);
    expect(document.querySelector("input")!.value).toBe("customer@example.com");
  });

  // The whole point: the replacement has to be a real form as far as every
  // other directive is concerned, in the same render pass.
  it("applies the element's other directives to the replacement", async () => {
    const sent: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: init.body });
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;

    try {
      const inflow = mount(
        `<div data-as="form" data-action="signIn">` +
          `<input name="email" value="customer@example.com" />` +
          `<input name="password" value="secret" />` +
          `</div>`,
      );
      inflow.globalContext.signIn = inflow.createAction({
        path: "authenticate",
      });
      inflow.render();

      const form = document.querySelector("form")!;
      const event = new SubmitEvent("submit", {
        cancelable: true,
        bubbles: true,
      });
      form.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(event.defaultPrevented).toBe(true);
      expect(sent).toHaveLength(1);
      expect(JSON.parse((sent[0] as { body: string }).body)).toEqual({
        email: "customer@example.com",
        password: "secret",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // A builder that refuses to give you an `<input>` will not give you its
  // `type` or `name` either, so those have to be reachable from directives.
  it("works with data-attr-* to finish the element off", () => {
    const inflow = mount(
      `<div data-as="input" data-attr-type="'password'" data-attr-name="'password'"></div>`,
    );
    inflow.render();

    const input = document.querySelector("input")!;
    expect(input.type).toBe("password");
    expect(input.name).toBe("password");
  });

  // `as` is registered before `if` and `for`, so it has to hand the element it
  // built back to the render loop rather than walking into it: a `data-for`
  // template's children reference a loop variable that only exists once `for`
  // has bound it. Walking in early evaluated them against the enclosing
  // context, threw, and aborted the whole render pass — leaving the untouched
  // template in the DOM and every later section stale.
  it("lets data-for stash its template before the children are read", () => {
    const inflow = mount(
      `<div data-as="table"><div data-as="tbody">` +
        `<div data-as="tr" data-for="row in rows">` +
        `<div data-as="td" data-text="row.name"></div>` +
        `</div>` +
        `</div></div>`,
    );

    inflow.globalContext.rows = [{ name: "one" }, { name: "two" }];
    inflow.render();

    const body = document.querySelector("tbody")!;
    expect(body.querySelectorAll("tr")).toHaveLength(2);
    expect(
      [...body.querySelectorAll("td")].map((cell) => cell.textContent),
    ).toEqual(["one", "two"]);
  });

  // The failure only appeared once a gate opened on a later pass, which is what
  // a page does while its sources resolve.
  it("survives a data-if gate opening on a later render", () => {
    const inflow = mount(
      `<div data-as="table" data-if="ready"><div data-as="tbody">` +
        `<div data-as="tr" data-for="row in rows">` +
        `<div data-as="td" data-text="row.name"></div>` +
        `</div>` +
        `</div></div>`,
    );

    inflow.globalContext.rows = [{ name: "one" }, { name: "two" }];
    inflow.globalContext.ready = false;
    inflow.render();

    expect(document.querySelector("table")).toBeNull();

    inflow.globalContext.ready = true;
    inflow.render();

    // The third pass is the one that broke: by then `for` has stashed its
    // template, and the pass that walks back over it produced a spare row and
    // then threw, which took the rest of the document with it.
    expect(() => inflow.render()).not.toThrow();

    const body = document.querySelector("tbody")!;
    expect(body.querySelectorAll("tr")).toHaveLength(2);
    expect(
      [...body.querySelectorAll("td")].map((cell) => cell.textContent),
    ).toEqual(["one", "two"]);
  });

  // A throw anywhere in a pass used to take the rest of the document with it.
  it("renders what follows a repeated element", () => {
    const inflow = mount(
      `<div><div data-as="li" data-for="row in rows"><span data-text="row.name"></span></div>` +
        `<p data-text="'after'"></p></div>`,
    );

    inflow.globalContext.rows = [{ name: "one" }];
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("after");
  });

  it("warns and leaves the element alone when the tag name is invalid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const inflow = mount(`<div data-as="not a tag"></div>`);
    inflow.render();

    expect(document.querySelector("div[data-as]")).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });
});
