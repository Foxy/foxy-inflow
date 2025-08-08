import { type DirectiveRendererParams, type DirectiveRendererResult, Directive } from "../Directive";

export class V8NDirective extends Directive {
  #initializedForms = new WeakSet<HTMLFormElement>();

  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, run, update } = params;
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
        if (!this.#initializedForms.has(host as HTMLFormElement)) {
          this.#initializedForms.add(host as HTMLFormElement);
          Array.from((host as HTMLFormElement).elements).forEach((element) => {
            if (element instanceof HTMLInputElement) validate(element);
          });
        }
      },
    };
  }
}
