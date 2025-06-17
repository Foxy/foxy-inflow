import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class CloakDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, attributeName } = params;
    if (host instanceof Element) host.removeAttribute(attributeName);
  }
}
