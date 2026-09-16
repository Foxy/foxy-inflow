import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

/**
 * Replaces the host with an element of the named tag, keeping its attributes
 * and children. Visual builders hand you a `<div>` freely but own their own
 * form elements, so this is how markup authored in one still reaches Inflow as
 * the element it needs to be.
 */
export class AsDirective extends Directive {
  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const { host, value, context, adopt } = params;
    if (!(host instanceof Element)) return;

    // Unlike every other directive, the value is a literal tag name rather than
    // an expression. The tag is structural: re-evaluating it per render would
    // rebuild the element and take focus, typed values and any listener another
    // directive attached down with it.
    if (host.tagName.toLowerCase() === value.trim().toLowerCase()) return;

    let replacement: Element;

    try {
      replacement = document.createElement(value.trim());
    } catch (err) {
      console.warn(
        `Error evaluating 'as' directive: "${value}" is not a valid tag name.`,
        err,
      );
      return;
    }

    for (const { name, value: attributeValue } of Array.from(host.attributes)) {
      replacement.setAttribute(name, attributeValue);
    }

    replacement.append(...Array.from(host.childNodes));
    host.replaceWith(replacement);

    // The replacement carries every other directive the host had, and nothing
    // else in this pass will reach it — the loop is still holding the node that
    // was just detached.
    adopt(replacement, context);

    return { skipChildren: true };
  }
}
