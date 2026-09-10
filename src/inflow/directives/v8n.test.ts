import { InflowCore } from "../core";

/**
 * `data-v8n` is a form-level directive: its value is a map of input name to
 * validator, and `afterUpdate` reads `host.elements`. Putting it on an input
 * used to validate nothing and then throw, so the non-form host is covered
 * here as deliberately as the form one.
 *
 * `afterUpdate` only runs through the debounced `requestUpdate`, so these tests
 * drive a full update cycle on fake timers rather than calling `render()` alone.
 */
function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return new InflowCore({ root });
}

describe("data-v8n", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("validates a form's inputs by name", () => {
    const inflow = mount(
      `<form data-v8n="validators"><input name="email" value="not-an-email" /></form>`
    );

    inflow.globalContext.validators = {
      email: (value: string) => (value.includes("@") ? "" : "Email is invalid."),
    };

    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    expect(document.querySelector("input")?.validationMessage).toBe("Email is invalid.");
  });

  // `data-if` stashes the form and restores the SAME node, so anything that
  // remembered "this form was already validated" would skip the pass on every
  // mount after the first — leaving a value that changed while the form was
  // hidden unchecked.
  it("re-validates the fields when data-if re-mounts the form", () => {
    const inflow = mount(
      `<form data-if="ready" data-v8n="validators">` +
        `<input name="email" value="not-an-email" />` +
        `</form>`
    );

    inflow.globalContext.validators = {
      email: (value: string) => (value.includes("@") ? "" : "Email is invalid."),
    };

    inflow.globalContext.ready = true;
    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    const input = document.querySelector("input") as HTMLInputElement;
    expect(input.validationMessage).toBe("Email is invalid.");

    inflow.globalContext.ready = false;
    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    // What a refetch does through data-value while the form is stashed.
    input.value = "customer@example.com";

    inflow.globalContext.ready = true;
    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    expect(input.validationMessage).toBe("");
  });

  // The all-fields pass runs on every update now, and it writes to each input
  // through `setCustomValidity`. If that write — or the `data-value` write in
  // the same cycle — fed the directive's own input/change listener, `onEvent`
  // would call `update()` and the page would spin on the debounce interval.
  it("settles after one pass instead of re-validating in a loop", () => {
    const validate = vi.fn(() => "Email is invalid.");
    const inflow = mount(
      `<form data-v8n="{ email: validate }">` +
        `<input name="email" data-value="email" />` +
        `</form>`
    );

    inflow.globalContext.validate = validate;
    inflow.globalContext.email = "not-an-email";

    inflow.requestUpdate();
    vi.runAllTimers();

    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("warns once per host and validates nothing when the host is not a form", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validate = vi.fn(() => "Email is invalid.");
    const inflow = mount(`<input name="email" data-v8n="validate" value="not-an-email" />`);

    inflow.globalContext.validate = validate;
    inflow.render();
    inflow.render();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(validate).not.toHaveBeenCalled();
    expect(document.querySelector("input")?.validationMessage).toBe("");
  });

  it("completes an update cycle when the host is not a form", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const inflow = mount(`<input name="email" data-v8n="validate" />`);

    inflow.globalContext.validate = () => "Email is invalid.";

    expect(() => {
      inflow.requestUpdate();
      vi.advanceTimersByTime(250);
    }).not.toThrow();
  });
});
