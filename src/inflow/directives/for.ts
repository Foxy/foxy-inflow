import type { DirectiveConfig } from "../types";
import get from "lodash-es/get";

const templateInstances = new WeakMap<ChildNode, WeakSet<ChildNode>>();

const config: DirectiveConfig = {
  render: ({
    context,
    host: template,
    placeholderHost,
    value,
    adopt,
    attributeName,
  }) => {
    const [loop, source] = value.split(" in ");
    const [reference, indexRef = "index"] = loop
      .split(",")
      .map((x) => x.trim());

    const domReference = placeholderHost ?? template;

    const templateSiblings = Array.from(
      domReference.parentElement?.childNodes ?? [domReference]
    );

    const templateIndex = templateSiblings.indexOf(domReference);
    const siblingsAfterTemplate = templateSiblings.slice(templateIndex + 1);

    const instances =
      templateInstances.get(template) ?? new WeakSet<ChildNode>();
    const instancesToRemove: ChildNode[] = [];
    const instancesToAdd: ChildNode[] = [];

    const items = get(context, source) as any[];
    const numberOfSiblingsToProcess = Math.max(
      siblingsAfterTemplate.length,
      items.length
    );

    for (let i = 0; i < numberOfSiblingsToProcess; i++) {
      const sibling = siblingsAfterTemplate[i];

      if (sibling && instances.has(sibling)) {
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

    for (const instance of instancesToRemove) {
      instance.remove();
      instances.delete(instance);
      templateSiblings.splice(templateSiblings.indexOf(instance), 1);
    }

    if (instancesToAdd.length > 0) {
      const reverseSiblings = [...templateSiblings].reverse();
      const reverseInstancesToAdd = [...instancesToAdd].reverse();
      const lastInstance = reverseSiblings.find((sibling) => {
        return templateInstances.has(sibling);
      });

      for (const instance of reverseInstancesToAdd) {
        (lastInstance ?? domReference).after(instance);
        instances.add(instance);
      }
    }

    templateInstances.set(template, instances);

    return { skipChildren: true, isStashed: true };
  },
};

export default config;
