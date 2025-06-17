import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class AttrDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, name, run } = params;
    if (host instanceof Element === false) return;

    const attributeName = name.replace(this.prefix, "");
    const oldValue = host.getAttribute(attributeName);
    const newValue = String(run(value));
    if (newValue !== oldValue) host.setAttribute(attributeName, newValue);
  }
}
