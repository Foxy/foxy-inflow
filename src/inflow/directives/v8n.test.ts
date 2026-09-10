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
