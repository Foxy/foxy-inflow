import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class V8NDirective extends Directive {
  #warnedHosts = new WeakSet<ChildNode>();

  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { attributeName, host, value, run, update } = params;

    // The directive is form-level by design: the value is a map of input name
    // to validator, and the first-render pass below needs `host.elements`. On
    // any other host it used to validate nothing and then throw on update, so
    // say so instead — once per host, since `apply` runs on every render.
    if (!(host instanceof HTMLFormElement)) {
      if (!this.#warnedHosts.has(host)) {
        this.#warnedHosts.add(host);
        console.warn(
          `${attributeName}="${value}" is on a <${host.nodeName.toLowerCase()}>, but the ` +
            `directive only works on a <form>. Move it to the form and key the map by input name.`,
        );
      }

      return;
    }

    const validatorCollection =
      run<Record<string, (value: string) => string>>(value);

    const validate = (input: HTMLInputElement) => {
      const validator = validatorCollection[input.name];
      if (validator) input.setCustomValidity(validator(input.value));
    };

    const onEvent = (event: Event) => {
      validate(event.target as HTMLInputElement);
      update();
    };

    // A form carrying this directive has taken over validation messaging, so
    // the browser's bubble is a second, unstyled copy of what the page already
    // says. Suppressing it also records which fields the customer has reached:
    // markup gated on `validationMessage` alone would otherwise announce
    // "required" under every empty field the moment anything renders.
    //
    // Captured, because `invalid` does not bubble — a listener on the form
    // never sees a control's event otherwise.
    const onInvalid = (event: Event) => {
      event.preventDefault();
      if (event.target instanceof HTMLElement)
        event.target.dataset.touched = "true";
      update();
    };

    ["input", "change"].forEach((eventType) => {
      host.addEventListener(eventType, onEvent);
    });

    host.addEventListener("invalid", onInvalid, true);

    return {
      beforeUpdate: () => {
        ["input", "change"].forEach((eventType) => {
          host.removeEventListener(eventType, onEvent);
        });

        host.removeEventListener("invalid", onInvalid, true);
      },
      // Every field, not just the one the customer touched: a value that
      // arrived through `data-value` needs checking too. This used to run only
      // on the form's first render, which skipped the pass whenever `data-if`
      // re-mounted the form. Re-running it is idempotent — a field that is now
      // valid has its custom validity cleared.
      afterUpdate: () => {
        let changed = false;

        Array.from(host.elements).forEach((element) => {
          if (!(element instanceof HTMLInputElement)) return;
          const previous = element.validationMessage;
          validate(element);
          if (element.validationMessage !== previous) changed = true;
        });

        // This runs after the render that read `validationMessage`, so markup
        // gated on it is showing the state from before this pass. A field that
        // arrives invalid therefore painted with its error hidden, and stayed
        // that way until something else happened to request an update.
        //
        // Only when a message actually changed: asking unconditionally would
        // schedule the next update from inside every update, forever. Reading
        // `validationMessage` is safe here where `checkValidity()` is not — it
        // fires no `invalid` event, which is its own render loop.
        //
        // This assumes a validator is pure: same value in, same message out.
        // One that varies its message per call — a timestamp, a counter — never
        // compares equal and so never settles.
        if (changed) update();
      },
    };
  }
}
