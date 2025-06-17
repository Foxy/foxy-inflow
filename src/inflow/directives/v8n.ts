import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class V8NDirective extends Directive {
  #initializedInputs = new WeakSet<HTMLInputElement>();

  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, run, update } = params;
    const validator = run<(value: string) => string>(value);
    const validate = (input: HTMLInputElement) => {
      input.setCustomValidity(validator(input.value));
    };

    ["input", "change"].forEach((eventType) => {
      host.addEventListener(eventType, (event) => {
        validate(event.currentTarget as HTMLInputElement);
        update();
      });
    });

    validate(host as HTMLInputElement);
    if (!this.#initializedInputs.has(host as HTMLInputElement)) {
      this.#initializedInputs.add(host as HTMLInputElement);
      update();
    }
  }
}
