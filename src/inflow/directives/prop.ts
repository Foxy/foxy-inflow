import { get, set } from "lodash-es";
import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

export class PropDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, name, run } = params;
    const lowercasePropertyName = name.replace("prop-", "");
    let resolvedPropertyName = lowercasePropertyName;

    for (const propertyName in host) {
      if (propertyName.toLowerCase() === lowercasePropertyName) {
        resolvedPropertyName = propertyName;
        break;
      }
    }

    const oldValue = get(host, resolvedPropertyName);
    const newValue = run(value);
    if (newValue !== oldValue) set(host, resolvedPropertyName, run(value));
  }
}
