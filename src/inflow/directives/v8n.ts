import { type DirectiveRendererParams, type DirectiveRendererResult, Directive } from "../Directive";

export class V8NDirective extends Directive {
  #initializedForms = new WeakSet<HTMLFormElement>();

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
            `directive only works on a <form>. Move it to the form and key the map by input name.`
        );
      }

      return;
    }

    const validatorCollection = run<Record<string, (value: string) => string>>(value);

    const validate = (input: HTMLInputElement) => {
      const validator = validatorCollection[input.name];
      if (validator) input.setCustomValidity(validator(input.value));
    };

    const onEvent = (event: Event) => {
      validate(event.target as HTMLInputElement);
      update();
    };

    ["input", "change"].forEach((eventType) => {
      host.addEventListener(eventType, onEvent);
    });

    return {
      beforeUpdate: () => {
        ["input", "change"].forEach((eventType) => {
          host.removeEventListener(eventType, onEvent);
        });
      },
      afterUpdate: () => {
        if (!this.#initializedForms.has(host)) {
          this.#initializedForms.add(host);
          Array.from(host.elements).forEach((element) => {
            if (element instanceof HTMLInputElement) validate(element);
          });
        }
      },
    };
  }
}
