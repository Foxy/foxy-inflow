import { DirectiveConfig, type DirectiveRenderer } from "./types";
import { LRUCache } from "lru-cache";
import { debounce } from "lodash-es";

import sourceDirective from "./directives/source";
import cloakDirective from "./directives/cloak";
import battrDirective from "./directives/battr";
import propDirective from "./directives/prop";
import attrDirective from "./directives/attr";
import v8nDirective from "./directives/v8n";
import refDirective from "./directives/ref";
import forDirective from "./directives/for";
import ifDirective from "./directives/if";
import onDirective from "./directives/on";

export type InflowCoreConfig = {
  onTokenExpiry?: () => void;
  getToken?: () => string | null;
  prefix?: string;
  base?: string;
  root?: ChildNode;
};

export class InflowCore {
  #beforeUpdateHandlers: (() => void)[] = [];

  #functionCache = new LRUCache<string, Function>({ max: 1000 });

  #directives: {
    name: string | RegExp;
    handler?: DirectiveRenderer;
    options?: Record<string, unknown>;
  }[] = [];

  #prefix: string;

  #stash = new WeakMap<Comment, ChildNode>();

  #root: ChildNode;

  globalContext: Record<string, unknown> = {};

  storage = localStorage; // TODO scoped local storage

  base: string;

  requestUpdate = debounce(() => {
    this.#beforeUpdateHandlers.forEach((fn) => fn());
    this.#beforeUpdateHandlers.length = 0;
    this.render();
  }, 250);

  constructor(config?: InflowCoreConfig) {
    this.#prefix = config?.prefix ?? "data-";
    this.#root = config?.root ?? document.body;
    this.base = config?.base ?? "";

    this.directive("cloak", cloakDirective);
    this.directive("ref", refDirective);
    this.directive("source", sourceDirective, {
      getToken: config?.getToken,
      onTokenExpiry: config?.onTokenExpiry,
    });

    this.directive("if", ifDirective);
    this.directive("if-not", {
      render: (ctx) => {
        return ifDirective.render?.({
          ...ctx,
          value: `!(${ctx.value})`,
          name: "if",
        });
      },
    });

    this.directive("for", forDirective);
    this.directive(/^prop\-.+$/, propDirective);
    this.directiveAlias("text", "prop-textcontent");

    this.directive(/^attr\-.+$/, attrDirective);
    this.directiveAlias("value", "attr-value");
    this.directiveAlias("href", "attr-href");

    this.directive(/^battr\-.+$/, battrDirective);
    this.directiveAlias("disabled", "battr-disabled");
    this.directiveAlias("readonly", "battr-readonly");
    this.directiveAlias("hidden", "battr-hidden");
    this.directiveAlias("checked", "battr-checked");
    this.directiveAlias("selected", "battr-selected");
    this.directiveAlias("required", "battr-required");
    this.directiveAlias("open", "battr-open");

    this.directive(/^on\-.+$/, onDirective);
    this.directive("v8n", v8nDirective);

    this.globalContext.format = {
      currency: (value: string, lang = navigator.language) => {
        return parseFloat(value.substring(0, value.length - 3)).toLocaleString(
          lang,
          {
            currency: value.substring(value.length - 3).toLowerCase(),
            style: "currency",
          }
        );
      },
      datetime: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleString(lang);
      },
      date: (value: string, lang = navigator.language) => {
        return new Date(value).toLocaleDateString(lang);
      },
    };
  }

  directiveAlias(alias: string, name: string) {
    this.directive(alias, {
      render: (ctx) => propDirective.render?.({ ...ctx, name }),
    });
  }

  directive(
    name: string | RegExp,
    config: DirectiveConfig,
    options?: Record<string, unknown>
  ) {
    this.#directives.push({ name, handler: config.render, options });
    config.create?.(
      this.globalContext,
      this.storage,
      this.requestUpdate,
      options
    );
  }

  render(
    _node: ChildNode = this.#root,
    context: Record<string, any> = this.globalContext,
    processedNodes = new WeakSet<ChildNode>(),
    _lang?: string
  ) {
    const node =
      _node instanceof Comment ? this.#stash.get(_node) ?? _node : _node;

    // Is this truly necessary?
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    const isStashed = node !== _node;
    const lang = _lang ?? this.#getLang(node);

    if (node instanceof Element) {
      for (const directive of this.#directives) {
        const { name, handler, options } = directive;

        const attribute = Array.from(node.attributes).find(({ name: key }) => {
          if (!key.startsWith(this.#prefix)) return false;
          const strippedKey = key.substring(this.#prefix.length);
          return typeof name === "string"
            ? strippedKey === name
            : name.test(strippedKey);
        });

        if (attribute) {
          const handlerContext = Object.assign(context, {
            requestUpdate: this.requestUpdate,
            lang,
          });

          const result = handler?.({
            isStashed,
            context: handlerContext,
            storage: this.storage,
            options,
            value: attribute.value,
            name: attribute.name.substring(this.#prefix.length),
            attributeName: attribute.name,
            placeholderHost: isStashed ? (_node as Comment) : null,
            host: node,
            base: this.base,
            update: this.requestUpdate,
            adopt: (e: ChildNode = document.body, c: Record<string, any>) => {
              this.render(e, c, processedNodes, this.#getLang(e, lang));
            },
            run: this.#createCachedFunction(handlerContext),
          });

          if (result?.beforeUpdate) {
            this.#beforeUpdateHandlers.push(result.beforeUpdate);
          }

          if (!!result?.isStashed !== isStashed) {
            if (result?.isStashed) {
              const comment = document.createComment("");
              this.#stash.set(comment, node);
              node.replaceWith(comment);
            } else {
              _node.replaceWith(node);
              this.#stash.delete(_node as Comment);
            }
          }

          if (result?.skipChildren) return;
        }
      }
    }

    for (const child of node.childNodes) {
      this.render(child, context, processedNodes, this.#getLang(child, lang));
    }
  }

  #getLang(node: ChildNode, defaultValue = navigator.language): string {
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

  #createCachedFunction(context: Record<string, any>) {
    return (value: string, additionalContext = {}) => {
      let cachedFunction = this.#functionCache.get(value);
      const resolvedContext = { ...context, ...additionalContext };

      if (!cachedFunction) {
        const contextKeys = Object.keys(resolvedContext);
        const code = `const{${contextKeys}}=this;return(${value});`;
        cachedFunction = new Function(code);
        this.#functionCache.set(value, cachedFunction);
      }

      return cachedFunction.call(resolvedContext);
    };
  }
}
