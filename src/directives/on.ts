import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class OnDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, name, run } = params;
    const eventName = name.substring(3);
    const handler = run<(event: Event) => void>(value);
    const listener = (event: Event) => handler(event);

    host.addEventListener(eventName, listener);
    return {
      beforeUpdate: () => host.removeEventListener(eventName, listener),
    };
  }
}
