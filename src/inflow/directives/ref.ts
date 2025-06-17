import { set } from "lodash-es";
import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class RefDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { context, host, value } = params;
    set(context, `refs.${value}`, {});
    (context.refs as Record<string, ChildNode>)[value] = host;
  }
}
