import {
  type DirectiveRendererParams,
  type DirectiveRendererResult,
  Directive,
} from "../Directive";

import { get } from "lodash-es";

export class ForDirective extends Directive {
  #templateInstances = new WeakMap<ChildNode, WeakSet<ChildNode>>();

  apply(params: DirectiveRendererParams): DirectiveRendererResult | void {
    const {
      context,
      host: template,
      placeholderHost,
      value,
      adopt,
      resolve,
      attributeName,
    } = params;

    const [loop, source] = value.split(" in ");
    const [reference, indexRef = "index"] = loop
      .split(",")
      .map((x) => x.trim());

    const domReference = placeholderHost ?? template;

    const templateSiblings = Array.from(
      domReference.parentElement?.childNodes ?? [domReference],
    );

    const templateIndex = templateSiblings.indexOf(domReference);
    const siblingsAfterTemplate = templateSiblings.slice(templateIndex + 1);

    const instances =
      this.#templateInstances.get(template) ?? new WeakSet<ChildNode>();
    const instancesToRemove: ChildNode[] = [];
    const instancesToAdd: ChildNode[] = [];

    const items = get(context, source) as any[];
    const numberOfSiblingsToProcess = Math.max(
      siblingsAfterTemplate.length,
      items.length,
    );

    for (let i = 0; i < numberOfSiblingsToProcess; i++) {
      const sibling = siblingsAfterTemplate[i];

      // A `data-if` on the same element hides each instance by swapping it for
      // a stash placeholder, so what stands here may be a comment rather than
      // the clone itself. Compare the node it stands in for, or none of these
      // are recognised as ours and a second set gets cloned alongside them.
      // `adopt` and `remove` still take the sibling: `render()` resolves a
      // placeholder on entry, and it is the placeholder that holds the
      // instance's position in the document.
      const instance = sibling && resolve(sibling);

      if (instance && instances.has(instance)) {
        if (i >= items.length) {
          instancesToRemove.push(sibling);
        } else {
          adopt(sibling, { ...context, [reference]: items[i], [indexRef]: i });
        }
      } else if (i < items.length) {
        const instance = template.cloneNode(true) as Element;
        instance.removeAttribute(attributeName);
        adopt(instance, { ...context, [reference]: items[i], [indexRef]: i });
        instancesToAdd.push(instance);
      }
    }

    for (const sibling of instancesToRemove) {
      sibling.remove();
      // Forget the clone, not the placeholder standing in for it — the set is
      // keyed by the clones, so deleting the comment would leave the dropped
      // instance in it to be matched again the next time the list grows.
      instances.delete(resolve(sibling));
    }

    if (instancesToAdd.length > 0) {
      // Read the parent again rather than reusing `templateSiblings`. Adopting
      // an instance can restore it from the stash, which swaps a placeholder in
      // that snapshot for the clone itself, and a removal drops another — so by
      // now the snapshot names nodes that are no longer where it says.
      const currentSiblings = Array.from(
        domReference.parentElement?.childNodes ?? [],
      );

      const reverseSiblings = currentSiblings.reverse();
      const reverseInstancesToAdd = [...instancesToAdd].reverse();
      // The last instance already standing, so additions land behind it rather
      // than between the template and the rows it already produced. This used
      // to search `#templateInstances`, which is keyed by templates, so it
      // never matched and every new row was inserted directly after the
      // placeholder. A first render hid it: the additions go in reversed, which
      // comes out in order when there is nothing for them to sit behind.
      const lastInstance = reverseSiblings.find((sibling) => {
        return instances.has(resolve(sibling));
      });

      for (const instance of reverseInstancesToAdd) {
        (lastInstance ?? domReference).after(instance);
        instances.add(instance);
      }
    }

    this.#templateInstances.set(template, instances);

    return { skipChildren: true, isStashed: true };
  }
}
