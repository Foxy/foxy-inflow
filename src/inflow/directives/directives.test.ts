import { InflowCore } from "../core";

/**
 * Smoke coverage for the render pipeline: these exercise attribute discovery,
 * alias resolution, expression evaluation and directive application end to end
 * rather than calling directives in isolation. If the pipeline breaks, these
 * fail before any single-directive test would.
 *
 * Only the synchronous, network-free directives are covered here. `source` and
 * `action` need fetch and form submission and belong in their own files.
 */
function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return new InflowCore({ root });
}

describe("render pipeline", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves the text alias to prop-textcontent", () => {
    const inflow = mount(`<p data-text="greeting"></p>`);
    inflow.globalContext.greeting = "Hello";
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("Hello");
  });

  it("evaluates expressions, not just identifiers", () => {
    const inflow = mount(`<p data-text="items.length + ' items'"></p>`);
    inflow.globalContext.items = [1, 2, 3];
    inflow.render();

    expect(document.querySelector("p")?.textContent).toBe("3 items");
  });

  it("sets attributes via the attr- prefix and its aliases", () => {
    const inflow = mount(`<a data-href="url"></a><img data-attr-alt="label" />`);
    inflow.globalContext.url = "/profile.html";
    inflow.globalContext.label = "Your profile";
    inflow.render();

    expect(document.querySelector("a")?.getAttribute("href")).toBe("/profile.html");
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("Your profile");
  });

  // `render()` used to pick each directive's attribute with `.find()`, so an
  // element could carry at most one `data-attr-*`, one `data-prop-*`, one
  // `data-battr-*` and one `data-on-*` — a second was silently ignored. These
  // pin the fix: every matching attribute is applied, in document order.
  it("applies every data-attr-* on one element", () => {
    const inflow = mount(`<a data-attr-href="url" data-attr-title="label"></a>`);
    inflow.globalContext.url = "/profile.html";
    inflow.globalContext.label = "Your profile";
    inflow.render();

    const anchor = document.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/profile.html");
    expect(anchor?.getAttribute("title")).toBe("Your profile");
  });

  // An alias resolves to the same directive as its expanded form, so the two
  // have to be collected by one pass of the filter rather than shadow one
  // another.
  it("applies an alias alongside the expanded form of the same directive", () => {
    const inflow = mount(`<a data-href="url" data-attr-title="label"></a>`);
    inflow.globalContext.url = "/profile.html";
    inflow.globalContext.label = "Your profile";
    inflow.render();

    const anchor = document.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/profile.html");
    expect(anchor?.getAttribute("title")).toBe("Your profile");
  });

  it("applies every data-prop-* on one element", () => {
    const inflow = mount(`<input data-prop-value="email" data-prop-title="hint" />`);
    inflow.globalContext.email = "customer@example.com";
    inflow.globalContext.hint = "Your email address";
    inflow.render();

    const input = document.querySelector("input");
    expect(input?.value).toBe("customer@example.com");
    expect(input?.title).toBe("Your email address");
  });

  it("applies every data-battr-* on one element", () => {
    const inflow = mount(`<input data-disabled="isBusy" data-required="isRequired" />`);
    inflow.globalContext.isBusy = true;
    inflow.globalContext.isRequired = true;
    inflow.render();

    const input = document.querySelector("input");
    expect(input?.hasAttribute("disabled")).toBe(true);
    expect(input?.hasAttribute("required")).toBe(true);
  });

  it("binds every data-on-* on one element", () => {
    const inflow = mount(`<input data-on-input="onInput" data-on-blur="onBlur" />`);
    const onInput = vi.fn();
    const onBlur = vi.fn();

    inflow.globalContext.onInput = onInput;
    inflow.globalContext.onBlur = onBlur;
    inflow.render();

    const input = document.querySelector("input");
    input?.dispatchEvent(new Event("input"));
    input?.dispatchEvent(new Event("blur"));

    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("toggles boolean attributes on truthiness, not on value", () => {
    const inflow = mount(
      `<button data-disabled="isBusy"></button><input data-required="isRequired" />`
    );
    inflow.globalContext.isBusy = true;
    inflow.globalContext.isRequired = 0;
    inflow.render();

    expect(document.querySelector("button")?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("input")?.hasAttribute("required")).toBe(false);
  });

  it("removes a node when data-if is falsy and restores it when truthy", () => {
    const inflow = mount(`<span data-if="isLoggedIn">Welcome back</span>`);
    inflow.globalContext.isLoggedIn = false;
    inflow.render();

    expect(document.querySelector("span")).toBeNull();

    inflow.globalContext.isLoggedIn = true;
    inflow.render();

    expect(document.querySelector("span")?.textContent).toBe("Welcome back");
  });

  it("inverts that condition for data-if-not", () => {
    const inflow = mount(`<span data-if-not="isLoggedIn">Please sign in</span>`);
    inflow.globalContext.isLoggedIn = false;
    inflow.render();

    expect(document.querySelector("span")?.textContent).toBe("Please sign in");
  });

  it("repeats an element once per item with data-for", () => {
    const inflow = mount(
      `<ul><li data-for="item in items" data-text="item.name"></li></ul>`
    );
    inflow.globalContext.items = [{ name: "Pizza" }, { name: "Pasta" }];
    inflow.render();

    const text = Array.from(document.querySelectorAll("li")).map((li) => li.textContent);
    expect(text).toEqual(["Pizza", "Pasta"]);
  });

  it("exposes a named ref on the context under refs", () => {
    const inflow = mount(`<form data-ref="signInForm"></form>`);
    inflow.render();

    const refs = inflow.globalContext.refs as Record<string, ChildNode>;
    expect(refs.signInForm).toBe(document.querySelector("form"));
  });
});
