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

  // `afterUpdate` sets custom validity AFTER the render that read it, so a
  // field invalid on arrival used to paint with its error block still hidden:
  // the `data-if` saw an empty `validationMessage` because nothing had
  // validated yet, and nothing scheduled a second render. On a live portal page
  // the message only appeared once the customer pressed submit and the
  // resulting `invalid` event forced an update.
  it("shows the error for a field that is invalid on arrival", () => {
    const inflow = mount(
      `<form data-v8n="validators">
         <input name="email" data-ref="email" value="not-an-email" />
         <p data-if="refs.email && refs.email.validationMessage"
            data-text="refs.email.validationMessage"></p>
       </form>`,
    );

    inflow.globalContext.validators = {
      email: (value: string) =>
        value.includes("@") ? "" : "Email is invalid.",
    };

    inflow.requestUpdate();
    vi.advanceTimersByTime(250);
    // Whatever the directive schedules to settle must be allowed to run.
    vi.advanceTimersByTime(250);

    expect(document.querySelector("p")?.textContent).toBe("Email is invalid.");
  });

  // The guard against the render loop this could otherwise become: once every
  // message has settled, a further cycle must not schedule another one.
  it("stops re-rendering once the messages have settled", () => {
    const inflow = mount(
      `<form data-v8n="validators"><input name="email" value="not-an-email" /></form>`,
    );

    inflow.globalContext.validators = {
      email: (value: string) =>
        value.includes("@") ? "" : "Email is invalid.",
    };

    inflow.requestUpdate();
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(250);

    const renders = vi.spyOn(inflow, "render");
    vi.advanceTimersByTime(5000);

    expect(renders).not.toHaveBeenCalled();
  });

  it("validates a form's inputs by name", () => {
    const inflow = mount(
      `<form data-v8n="validators"><input name="email" value="not-an-email" /></form>`,
    );

    inflow.globalContext.validators = {
      email: (value: string) =>
        value.includes("@") ? "" : "Email is invalid.",
    };

    inflow.requestUpdate();
    vi.advanceTimersByTime(250);

    expect(document.querySelector("input")?.validationMessage).toBe(
      "Email is invalid.",
    );
  });

  // `data-if` stashes the form and restores the SAME node, so anything that
  // remembered "this form was already validated" would skip the pass on every
  // mount after the first — leaving a value that changed while the form was
  // hidden unchecked.
  it("re-validates the fields when data-if re-mounts the form", () => {
    const inflow = mount(
      `<form data-if="ready" data-v8n="validators">` +
        `<input name="email" value="not-an-email" />` +
        `</form>`,
    );

    inflow.globalContext.validators = {
      email: (value: string) =>
        value.includes("@") ? "" : "Email is invalid.",
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

  // The all-fields pass runs on every update, and it writes to each input
  // through `setCustomValidity`. If that write — or the `data-value` write in
  // the same cycle — fed the directive's own input/change listener, `onEvent`
  // would call `update()` and the page would spin on the debounce interval.
  //
  // A field that is valid on arrival settles in a single pass: nothing changed,
  // so no further update is asked for.
  it("validates a valid field once and stops", () => {
    const validate = vi.fn(() => "");
    const inflow = mount(
      `<form data-v8n="{ email: validate }">` +
        `<input name="email" data-value="email" />` +
        `</form>`,
    );

    inflow.globalContext.validate = validate;
    inflow.globalContext.email = "someone@example.com";

    inflow.requestUpdate();
    vi.runAllTimers();

    expect(validate).toHaveBeenCalledTimes(1);
  });

  // An invalid field costs exactly one extra pass and then stops. The first
  // sets the message — too late for the render that just read it — and asks for
  // one more; the second finds the message unchanged and asks for nothing. That
  // second pass is what puts the error on screen, and two is the floor: a
  // message computed after a render cannot be shown without another one.
  it("validates an invalid field twice and then stops", () => {
    const validate = vi.fn(() => "Email is invalid.");
    const inflow = mount(
      `<form data-v8n="{ email: validate }">` +
        `<input name="email" data-value="email" />` +
        `</form>`,
    );

    inflow.globalContext.validate = validate;
    inflow.globalContext.email = "not-an-email";

    inflow.requestUpdate();
    vi.runAllTimers();

    expect(validate).toHaveBeenCalledTimes(2);
  });

  // A merchant using `data-v8n` has taken over validation messaging, so the
  // browser's bubble is a second, unstyled copy of what their own markup
  // already says. Suppressing it used to be a `data-on-invalid` handler
  // repeated on every input.
  it("suppresses the browser's own validation UI", () => {
    const inflow = mount(
      `<form data-v8n="validators"><input name="email" required value="" /></form>`,
    );

    inflow.globalContext.validators = {};
    inflow.render();

    const input = document.querySelector("input")!;
    const event = new Event("invalid", { cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  // Without a record of which fields the customer has reached, markup gated on
  // `validationMessage` alone shows "required" under every empty field the
  // moment anything triggers a render.
  it("marks a field as touched once it reports invalid", () => {
    const inflow = mount(
      `<form data-v8n="validators"><input name="email" required value="" /></form>`,
    );

    inflow.globalContext.validators = {};
    inflow.render();

    const input = document.querySelector("input")!;
    expect(input.dataset.touched).toBeUndefined();

    input.dispatchEvent(new Event("invalid", { cancelable: true }));

    expect(input.dataset.touched).toBe("true");
  });

  // Marking the field is only useful if the page re-renders to read it.
  it("re-renders so markup gated on touched appears", () => {
    const inflow = mount(
      `<form data-v8n="validators">` +
        `<input name="email" data-ref="email" required value="" />` +
        `<p data-if="refs.email.dataset.touched">Please check this field.</p>` +
        `</form>`,
    );

    inflow.globalContext.validators = {};
    inflow.render();

    expect(document.querySelector("p")).toBeNull();

    document
      .querySelector("input")!
      .dispatchEvent(new Event("invalid", { cancelable: true }));
    vi.runAllTimers();

    expect(document.querySelector("p")?.textContent).toBe(
      "Please check this field.",
    );
  });

  // A form that never asked for `data-v8n` keeps the browser's behaviour.
  it("leaves a form without the directive alone", () => {
    mount(`<form><input name="email" required value="" /></form>`);

    const event = new Event("invalid", { cancelable: true });
    document.querySelector("input")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("warns once per host and validates nothing when the host is not a form", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validate = vi.fn(() => "Email is invalid.");
    const inflow = mount(
      `<input name="email" data-v8n="validate" value="not-an-email" />`,
    );

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
