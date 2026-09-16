import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class BAttrDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, name, run } = params;
    if (host instanceof Element === false) return;

    const attributeName = name.replace(this.prefix, "");
    const oldValue = host.hasAttribute(attributeName);
    const newValue = Boolean(run(value));
    if (newValue !== oldValue) host.toggleAttribute(attributeName);
  }
}
