import type {
  DirectiveRenderer,
  DirectiveConfig,
  PluginConfig,
  Inflow,
} from "./types";

import { LRUCache } from "lru-cache";
import debounce from "lodash-es/debounce";

function inflow(base: string, directivePrefix = "data-"): Inflow {
  const beforeUpdateHandlers: (() => void)[] = [];
  const globalContext: Record<string, unknown> = {};
  const functionCache = new LRUCache<string, Function>({ max: 1000 });
  const directives: {
    name: string | RegExp;
    handler?: DirectiveRenderer;
    options?: Record<string, unknown>;
  }[] = [];

  const requestUpdate = debounce(() => {
    beforeUpdateHandlers.forEach((fn) => fn());
    beforeUpdateHandlers.length = 0;
    render();
  }, 250);

  const storage = localStorage; // TODO scoped local storage
  const stash = new WeakMap<Comment, ChildNode>();

  function getLang(node: ChildNode, defaultValue = navigator.language): string {
    if (node instanceof Element) {
      return (
        node.getAttribute("lang") ||
        node.closest<Element>("[lang]")?.getAttribute("lang") ||
        defaultValue
      );
    } else {
      return defaultValue;
    }
  }

  function render(
    _node: ChildNode = document.body,
    context: Record<string, any> = globalContext,
    processedNodes = new WeakSet<ChildNode>(),
    _lang?: string
  ) {
    const node = _node instanceof Comment ? stash.get(_node) ?? _node : _node;

    // Is this truly necessary?
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    const isStashed = node !== _node;
    const lang = _lang ?? getLang(node);

    if (node instanceof Element) {
      for (const directive of directives) {
        const { name, handler, options } = directive;

        const attribute = Array.from(node.attributes).find(({ name: key }) => {
          if (!key.startsWith(directivePrefix)) return false;
          const strippedKey = key.substring(directivePrefix.length);
          return typeof name === "string"
            ? strippedKey === name
            : name.test(strippedKey);
        });

        if (attribute) {
          const handlerContext = Object.assign(context, {
            requestUpdate,
            lang,
          });

          const result = handler?.({
            isStashed,
            context: handlerContext,
            storage,
            options,
            value: attribute.value,
            name: attribute.name.substring(directivePrefix.length),
            attributeName: attribute.name,
            placeholderHost: isStashed ? (_node as Comment) : null,
            host: node,
            base,
            update: requestUpdate,
            adopt: (e: ChildNode = document.body, c: Record<string, any>) => {
              render(e, c, processedNodes, getLang(e, lang));
            },
            run: createCachedFunction(handlerContext),
          });

          if (result?.beforeUpdate) {
            beforeUpdateHandlers.push(result.beforeUpdate);
          }

          if (!!result?.isStashed !== isStashed) {
            if (result?.isStashed) {
              const comment = document.createComment("");
              stash.set(comment, node);
              node.replaceWith(comment);
            } else {
              _node.replaceWith(node);
              stash.delete(_node as Comment);
            }
          }

          if (result?.skipChildren) return;
        }
      }
    }

    for (const child of node.childNodes) {
      render(child, context, processedNodes, getLang(child, lang));
    }
  }

  function createCachedFunction(context: Record<string, any>) {
    return (value: string, additionalContext = {}) => {
      let cachedFunction = functionCache.get(value);
      const resolvedContext = { ...context, ...additionalContext };

      if (!cachedFunction) {
        const contextKeys = Object.keys(resolvedContext);
        const code = `const{${contextKeys}}=this;return(${value});`;
        cachedFunction = new Function(code);
        functionCache.set(value, cachedFunction);
      }

      return cachedFunction.call(resolvedContext);
    };
  }

  function plugin(
    name: string,
    config: PluginConfig,
    options?: Record<string, unknown>
  ) {
    globalContext[name] = config.create?.(inflow, options) ?? {};
  }

  function directive(
    name: string | RegExp,
    config: DirectiveConfig,
    options?: Record<string, unknown>
  ) {
    directives.push({ name, handler: config.render, options });
    config.create?.(globalContext, storage, requestUpdate, options);
  }

  const inflow: Inflow = {
    globalContext,
    requestUpdate,
    directive,
    storage,
    plugin,
    render,
    base,
  };

  return inflow;
}

export default inflow;
